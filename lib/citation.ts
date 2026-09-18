import { Citation } from '@/types/chat';
import { organizationConfig } from '@/config/organizationConfig';
import { buildStoryShareUrl } from '@/lib/share';

/**
 * Chicago-style citations for moments in the archive.
 *
 * A quotation from an oral history is only usable as evidence if a reader can
 * get back to the moment it came from, so every citation carries a link to the
 * passage rather than to the recording's first second.
 */

/** "1:02:03" past an hour, "4:05" below it — as Chicago writes timestamps. */
const timestamp = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const pad = (value: number) => String(value).padStart(2, '0');
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours}:${pad(minutes)}:${pad(total % 60)}` : `${minutes}:${pad(total % 60)}`;
};

const accessedOn = (date = new Date()): string =>
  date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

/**
 * Diarisation gives speakers labels like SPEAKER_S2, not names. Citing that as
 * an author would be a fiction; "unidentified speaker" is what oral history
 * citation uses, with the label kept so the reader can find the same voice.
 */
const speakerName = (speaker?: string): string | null => {
  const value = speaker?.trim();
  if (!value) return null;
  return /^speaker[_\s-]?\w*$/i.test(value) ? `Unidentified speaker (${value})` : value;
};

/**
 * The canonical site where possible: a citation copied while working locally
 * should still point at the archive, not at localhost.
 */
const citationOrigin = (): string => {
  const configured = organizationConfig.siteUrl?.trim();
  if (configured) return configured.replace(/\/$/, '');
  return typeof window !== 'undefined' ? window.location.origin : '';
};

export const buildCitationUrl = (citation: Citation): string =>
  buildStoryShareUrl({
    storyId: citation.theirstoryId,
    startTime: citation.startTime,
    endTime: citation.endTime,
    origin: citationOrigin(),
  });

/**
 * One note, in the order Chicago puts these: who spoke, what the passage is,
 * which recording, which archive, where in it, and how to reach it.
 */
export const buildChicagoCitation = (citation: Citation, accessed = new Date()): string => {
  const archive = organizationConfig.displayName || organizationConfig.name;
  const parts: string[] = [];

  const who = speakerName(citation.speaker);
  if (who) parts.push(who);

  if (citation.sectionTitle?.trim()) {
    parts.push(`"${citation.sectionTitle.trim()}"${citation.isChapterSynopsis ? ' (chapter summary)' : ''}`);
  }

  if (citation.interviewTitle?.trim()) parts.push(`recording of ${citation.interviewTitle.trim()}`);
  if (archive) parts.push(archive);
  parts.push(`at ${timestamp(citation.startTime)}`);
  parts.push(`accessed ${accessedOn(accessed)}`);
  parts.push(buildCitationUrl(citation));

  // Chicago follows American punctuation: the comma after a quoted title sits
  // inside the closing quotation mark. Section titles carry commas of their
  // own, so this matches a quote followed by a comma, not any comma.
  return `${parts.join(', ')}.`.replace(/",(?=\s)/g, ',"');
};

/**
 * The sources block appended to a copied answer.
 *
 * Numbered to match the citation markers left in the text, so a reader pasting
 * this into a document keeps the correspondence between claim and source.
 */
export const buildCitationList = (citations: Citation[], indices: number[], accessed = new Date()): string => {
  const byIndex = new Map(citations.map((citation) => [citation.index, citation]));
  return indices
    .map((index) => {
      const citation = byIndex.get(index);
      return citation ? `${index}. ${buildChicagoCitation(citation, accessed)}` : null;
    })
    .filter(Boolean)
    .join('\n\n');
};
