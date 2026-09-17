/**
 * Links to a moment in a recording.
 *
 * A citation has to point at the passage, not at the hour it sits in, so a
 * shared link carries the start and end of what the reader selected — the
 * story page already seeks to `start` and marks the range up to `end`.
 */

export interface StoryShareParams {
  storyId: string;
  startTime?: number;
  endTime?: number;
  /** Defaults to where the reader is standing, which is the site they trust. */
  origin?: string;
}

const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export const buildStoryShareUrl = ({ storyId, startTime, endTime, origin }: StoryShareParams): string => {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const params = new URLSearchParams();
  // Whole seconds: a shared citation should read as a timestamp, and the
  // player cannot honour more precision than that anyway.
  if (isTime(startTime)) params.set('start', String(Math.floor(startTime)));
  if (isTime(endTime)) params.set('end', String(Math.ceil(endTime)));
  const query = params.toString();
  return `${base}/story/${storyId}${query ? `?${query}` : ''}`;
};

/**
 * Copies text, falling back to the old execCommand path.
 *
 * navigator.clipboard exists only in a secure context, and a portal served
 * over plain HTTP on a local network is a real deployment of this software.
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path rather than reporting failure yet.
  }

  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(field);
    return copied;
  } catch {
    return false;
  }
};

/**
 * Where each network wants a share sent.
 *
 * None of them reliably carry the text you hand them — X drops it for some
 * accounts, LinkedIn ignores it outright — so callers copy the link as well,
 * and say they have.
 */
export const socialShareUrls = {
  linkedin: (url: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  x: (url: string, text: string) =>
    `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  facebook: (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
};

export const openShareWindow = (url: string) => {
  window.open(url, '_blank', 'noopener,noreferrer,width=600,height=640');
};

/** "1:02:03" or "4:05" — matches how timestamps read elsewhere in the portal. */
export const formatShareTimestamp = (seconds?: number): string | null => {
  if (!isTime(seconds)) return null;
  const total = Math.floor(seconds);
  const pad = (value: number) => String(value).padStart(2, '0');
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours}:${pad(minutes)}:${pad(total % 60)}` : `${minutes}:${pad(total % 60)}`;
};
