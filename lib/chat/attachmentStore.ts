import 'server-only';
import { randomUUID } from 'crypto';

/**
 * Holds what a reader attached to a conversation, for as long as that
 * conversation lasts.
 *
 * In memory, deliberately: an attachment is context for a sitting, not an
 * archive record, and reader-uploaded material — an unpublished draft, a
 * document with third parties in it — should not accumulate on the server. The
 * consequence is that a redeploy drops them, which the UI has to say rather
 * than quietly answering without them.
 *
 * Single container assumed. Behind more than one replica this needs a shared
 * store or sticky sessions.
 */

export type AttachmentKind = 'document' | 'image' | 'webpage';

export interface StoredAttachment {
  id: string;
  kind: AttachmentKind;
  /** What to call it in the UI and in the model's context. */
  name: string;
  /** Where a webpage came from, so an answer can point back at it. */
  sourceUrl?: string;
  /** Extracted text, for everything but images. */
  text?: string;
  /** True when the text was cut to fit the context budget. */
  truncated?: boolean;
  /** Base64 data and media type, for images the model looks at directly. */
  imageBase64?: string;
  mediaType?: string;
  bytes: number;
  createdAt: number;
}

export const ATTACHMENT_LIMITS = {
  /** Two hours: long enough for a research sitting, short enough to forget. */
  ttlMs: 2 * 60 * 60 * 1000,
  maxFileBytes: 10 * 1024 * 1024,
  /** What the vision APIs accept per image. */
  maxImageBytes: 5 * 1024 * 1024,
  /** Roughly ten thousand tokens — a long chapter, not a whole book. */
  maxTextChars: 40_000,
  /** Per conversation, enforced by the client; the store caps the process. */
  maxPerRequest: 6,
  maxStoredBytes: 120 * 1024 * 1024,
} as const;

const attachments = new Map<string, StoredAttachment>();

const isExpired = (item: StoredAttachment, now: number) => now - item.createdAt > ATTACHMENT_LIMITS.ttlMs;

const sweep = () => {
  const now = Date.now();
  for (const [id, item] of attachments) {
    if (isExpired(item, now)) attachments.delete(id);
  }
};

const totalBytes = () => {
  let total = 0;
  for (const item of attachments.values()) total += item.bytes;
  return total;
};

export const putAttachment = (attachment: Omit<StoredAttachment, 'id' | 'createdAt'>): StoredAttachment => {
  sweep();

  // Oldest out first if the process is holding too much. Anything evicted
  // reports as expired to the reader, which is what it is.
  while (totalBytes() + attachment.bytes > ATTACHMENT_LIMITS.maxStoredBytes && attachments.size > 0) {
    const oldest = [...attachments.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    attachments.delete(oldest.id);
  }

  // A random id is also the only thing guarding one reader's attachment from
  // another's, so it has to be unguessable rather than sequential.
  const stored: StoredAttachment = { ...attachment, id: randomUUID(), createdAt: Date.now() };
  attachments.set(stored.id, stored);
  return stored;
};

export const getAttachment = (id: string): StoredAttachment | null => {
  const item = attachments.get(id);
  if (!item) return null;
  if (isExpired(item, Date.now())) {
    attachments.delete(id);
    return null;
  }
  return item;
};

export const deleteAttachment = (id: string): boolean => attachments.delete(id);
