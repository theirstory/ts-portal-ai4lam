import 'server-only';
import { ATTACHMENT_LIMITS, AttachmentKind } from './attachmentStore';

/**
 * Turns an uploaded file into something a model can read.
 *
 * Text is extracted here rather than handed to the provider as a document,
 * because config lets a portal point at Anthropic, OpenAI or anything
 * OpenAI-shaped, and only some of those read PDFs natively. Images are the
 * exception: they go to the model as images, since there is nothing to extract.
 */

export class UnreadableFileError extends Error {}

export interface ExtractedFile {
  kind: AttachmentKind;
  text?: string;
  truncated?: boolean;
  imageBase64?: string;
  mediaType?: string;
}

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const PLAIN_TEXT_EXTENSIONS = ['.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.rtf'];

const normalizeWhitespace = (text: string) =>
  text
    .replace(/\r\n?/g, '\n')
    // pdf extraction in particular returns runs of spaces between glyph groups
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const capText = (text: string): { text: string; truncated: boolean } => {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= ATTACHMENT_LIMITS.maxTextChars) return { text: normalized, truncated: false };
  return { text: normalized.slice(0, ATTACHMENT_LIMITS.maxTextChars), truncated: true };
};

/**
 * pdf.js 6 calls Promise.withResolvers, which exists from Node 22. The portal's
 * image is Node 20, where a PDF would otherwise fail with "not a function" —
 * in production as well as here. The shim is the spec's own definition.
 */
const ensurePromiseWithResolvers = () => {
  const target = Promise as typeof Promise & { withResolvers?: unknown };
  if (typeof target.withResolvers === 'function') return;
  target.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
};

const extractPdf = async (bytes: Uint8Array): Promise<string> => {
  ensurePromiseWithResolvers();
  // The legacy build is the one that runs outside a browser; the import is
  // inside the function so a portal that never sees a PDF never loads it.
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: bytes, useSystemFonts: false });
  const doc = await task.promise;

  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    pages.push(text);
    // Stop reading once there is more than the budget allows anyway.
    if (pages.join('\n').length > ATTACHMENT_LIMITS.maxTextChars * 1.5) break;
  }
  // Releases the worker this task started; the process is long-lived and reads
  // one document after another.
  await task.destroy();

  const joined = pages.join('\n\n');
  if (!joined.trim()) {
    throw new UnreadableFileError(
      'No text could be read from that PDF. If it is a scan, it would need to be run through OCR first.',
    );
  }
  return joined;
};

const extractDocx = async (bytes: Uint8Array): Promise<string> => {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  if (!value.trim()) throw new UnreadableFileError('That document appears to be empty.');
  return value;
};

export const extractFile = async (file: {
  name: string;
  type: string;
  bytes: Uint8Array;
}): Promise<ExtractedFile> => {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  if (type.startsWith('image/')) {
    if (!SUPPORTED_IMAGE_TYPES.includes(type)) {
      throw new UnreadableFileError('Images can be JPEG, PNG, GIF or WebP.');
    }
    if (file.bytes.byteLength > ATTACHMENT_LIMITS.maxImageBytes) {
      throw new UnreadableFileError('That image is too large — 5MB is the limit.');
    }
    return {
      kind: 'image',
      imageBase64: Buffer.from(file.bytes).toString('base64'),
      mediaType: type,
    };
  }

  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    const { text, truncated } = capText(await extractPdf(file.bytes));
    return { kind: 'document', text, truncated };
  }

  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    const { text, truncated } = capText(await extractDocx(file.bytes));
    return { kind: 'document', text, truncated };
  }

  if (name.endsWith('.doc')) {
    throw new UnreadableFileError('Old .doc files cannot be read — save it as .docx or PDF and try again.');
  }

  if (type.startsWith('text/') || PLAIN_TEXT_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    const { text, truncated } = capText(new TextDecoder('utf-8').decode(file.bytes));
    if (!text) throw new UnreadableFileError('That file appears to be empty.');
    return { kind: 'document', text, truncated };
  }

  throw new UnreadableFileError('That file type cannot be read. Try a PDF, Word document, image or plain text.');
};
