import { NextRequest, NextResponse } from 'next/server';
import { isChatAttachmentsEnabled } from '@/config/organizationConfig';
import { ATTACHMENT_LIMITS, deleteAttachment, putAttachment } from '@/lib/chat/attachmentStore';
import { extractFile, UnreadableFileError, capText } from '@/lib/chat/extractAttachment';
import { fetchWebPage, UnreadableUrlError } from '@/lib/chat/fetchWebPage';
import { ChatAttachment } from '@/types/chat';

/**
 * Reads a file or a public link so the chat can use it as context.
 *
 * Everything is extracted here and kept in the server's memory for the sitting:
 * the browser gets back a name and a size, never the extracted text, so a large
 * document is not carried through the conversation on every message.
 */

const toResponse = (attachment: ChatAttachment) => NextResponse.json(attachment, { status: 201 });

const failure = (error: unknown, fallback: string) => {
  if (error instanceof UnreadableFileError || error instanceof UnreadableUrlError) {
    // These are written for the reader and say what to do instead.
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  console.error('Attachment failed:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
};

export async function POST(request: NextRequest) {
  if (!isChatAttachmentsEnabled) {
    return NextResponse.json({ error: 'Attachments are not enabled for this portal.' }, { status: 404 });
  }

  const contentType = request.headers.get('content-type') ?? '';

  // --- a link the reader pasted ----------------------------------------
  if (contentType.includes('application/json')) {
    try {
      const { url } = (await request.json()) as { url?: string };
      if (!url?.trim()) return NextResponse.json({ error: 'No address was given.' }, { status: 400 });

      const page = await fetchWebPage(url);
      const { text, truncated } = capText(page.text);
      if (!text) {
        return NextResponse.json(
          { error: 'Nothing readable was found at that address.' },
          { status: 422 },
        );
      }

      const stored = putAttachment({
        kind: 'webpage',
        name: page.title || new URL(page.finalUrl).hostname,
        sourceUrl: page.finalUrl,
        text,
        truncated,
        bytes: page.bytes,
      });

      return toResponse({
        id: stored.id,
        kind: stored.kind,
        name: stored.name,
        sourceUrl: stored.sourceUrl,
        truncated: stored.truncated,
        bytes: stored.bytes,
      });
    } catch (error) {
      return failure(error, 'Could not read that address.');
    }
  }

  // --- an uploaded file -------------------------------------------------
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file was uploaded.' }, { status: 400 });
    }
    if (file.size > ATTACHMENT_LIMITS.maxFileBytes) {
      return NextResponse.json(
        { error: `That file is larger than ${Math.round(ATTACHMENT_LIMITS.maxFileBytes / (1024 * 1024))}MB.` },
        { status: 413 },
      );
    }

    const extracted = await extractFile({
      name: file.name,
      type: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });

    const stored = putAttachment({
      kind: extracted.kind,
      name: file.name,
      text: extracted.text,
      truncated: extracted.truncated,
      imageBase64: extracted.imageBase64,
      mediaType: extracted.mediaType,
      bytes: file.size,
    });

    return toResponse({
      id: stored.id,
      kind: stored.kind,
      name: stored.name,
      truncated: stored.truncated,
      bytes: stored.bytes,
    });
  } catch (error) {
    return failure(error, 'Could not read that file.');
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'No attachment was named.' }, { status: 400 });
  deleteAttachment(id);
  // Idempotent: removing something already gone is the outcome the caller wanted.
  return NextResponse.json({ ok: true });
}
