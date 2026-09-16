import { useMemo } from 'react';
import type { Section } from '@/types/transcription';

export type MuxCaptionsTrack = {
  key: string;
  src: string;
};

const MAX_WORDS_PER_CUE = 12;

const formatVttTime = (seconds: number) => {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  return new Date(milliseconds).toISOString().slice(11, 23);
};

// VTT cue text can't contain a bare "-->" or unescaped angle brackets.
const sanitizeCueText = (text: string) => text.replace(/-->/g, '—>').replace(/[<>]/g, '');

// The track's identity is used as a React key and folded into the player's key,
// so it has to be cheap to compare. Hashing keeps that a short string instead of
// the whole VTT document, which runs to tens of KB on a long interview.
const hashVtt = (vtt: string) => {
  let hash = 5381;
  for (let i = 0; i < vtt.length; i++) {
    hash = ((hash << 5) + hash + vtt.charCodeAt(i)) | 0;
  }
  return `vtt-${(hash >>> 0).toString(36)}-${vtt.length}`;
};

/** Exported for testing; components should use the hook below. */
export const buildCaptionsTrack = (sections?: Section[]): MuxCaptionsTrack | null => {
  if (!sections?.length) return null;

  const cues: string[] = [];
  // End of the last cue emitted. Stored transcripts repeat the word(s) sitting
  // on a speaker-turn boundary, so the same phrase closes one paragraph and
  // opens the next. Emitting both yields overlapping cues that show the words
  // twice, so anything a previous cue already covered is skipped.
  //
  // This assumes sections and paragraphs arrive in chronological order, which
  // is how the chunker emits them; a section that started before the previous
  // one ended would be dropped rather than reordered.
  let lastEnd = -Infinity;

  for (const section of sections) {
    for (const paragraph of section.paragraphs ?? []) {
      const words = (paragraph.words ?? []).filter(
        (word) => Number.isFinite(word?.start) && Number.isFinite(word?.end) && word.start >= lastEnd,
      );
      if (!words.length) continue;

      for (let i = 0; i < words.length; i += MAX_WORDS_PER_CUE) {
        const chunk = words.slice(i, i + MAX_WORDS_PER_CUE);
        const start = chunk[0]?.start;
        const end = chunk[chunk.length - 1]?.end;
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < lastEnd) continue;

        // Only the first cue of a paragraph carries the speaker label — like
        // the transcript panel itself, which shows it once per paragraph
        // turn rather than repeating it on every line.
        const speakerPrefix = i === 0 && paragraph.speaker ? `${paragraph.speaker}: ` : '';
        const text = sanitizeCueText(`${speakerPrefix}${chunk.map((word) => word.text).join(' ')}`);
        if (!text.trim()) continue;

        cues.push(`${formatVttTime(start)} --> ${formatVttTime(end)}\n${text}`);
        lastEnd = end;
      }
    }
  }

  if (!cues.length) return null;

  const vtt = `WEBVTT\n\n${cues.join('\n\n')}`;
  return {
    key: hashVtt(vtt),
    src: `data:text/vtt;charset=utf-8,${encodeURIComponent(vtt)}`,
  };
};

/**
 * Builds a WebVTT captions track from transcript sections.
 *
 * Recordings carry word-level timings already, so captions cost nothing extra
 * to produce — and without them the player fails WCAG 2.1 SC 1.2.2 (Captions,
 * prerecorded), which is a Level A requirement for an archive of recorded
 * interviews. Returns null when there is nothing to caption, so callers can
 * omit the <track> entirely rather than attach an empty one.
 */
export const useStoryMuxCaptions = (sections?: Section[]) =>
  useMemo(() => buildCaptionsTrack(sections), [sections]);
