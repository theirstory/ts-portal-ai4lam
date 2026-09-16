/**
 * Mux serves a still from any point in a recording, so an excerpt can show the
 * frame at the moment it refers to rather than a generic cover image. Stored
 * thumbnail_url is often empty for these recordings, which is why the video URL
 * is the source of truth here.
 */
const MUX_PLAYBACK_ID = /stream\.mux\.com\/([^/?#]+)/i;

export const getMuxPlaybackId = (videoUrl?: string | null): string | null => {
  if (!videoUrl) return null;
  const match = MUX_PLAYBACK_ID.exec(videoUrl);
  return match?.[1] ?? null;
};

/**
 * Still image for a recording at `timeSeconds`.
 *
 * Returns null rather than a placeholder when the URL isn't a Mux stream, so
 * callers can decide whether to render nothing or fall back to stored art.
 */
export const getMuxThumbnailUrl = (
  videoUrl?: string | null,
  timeSeconds = 0,
  { width = 320, fitMode = 'preserve' }: { width?: number; fitMode?: string } = {},
): string | null => {
  const playbackId = getMuxPlaybackId(videoUrl);
  if (!playbackId) return null;

  const params = new URLSearchParams({
    time: String(Math.max(0, Math.floor(timeSeconds))),
    width: String(width),
    fit_mode: fitMode,
  });
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?${params.toString()}`;
};
