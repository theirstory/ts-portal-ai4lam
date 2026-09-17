/** What the reader is correcting — shapes the issue's title and its context. */
export type SuggestionKind = 'transcript' | 'entity' | 'metadata' | 'index';

export const SUGGESTION_KIND_LABELS: Record<SuggestionKind, string> = {
  transcript: 'Transcript',
  entity: 'Named entity',
  metadata: 'Description or metadata',
  index: 'Index entry',
};

export interface SuggestionContext {
  kind: SuggestionKind;
  /** The exact text being questioned, as the reader saw it. */
  quotedText?: string;
  /** Which recording it came from, when it came from one. */
  recordingId?: string;
  recordingTitle?: string;
  /** Seconds into the recording, for a transcript selection. */
  startTime?: number;
  endTime?: number;
  /** For an entity: the text it was found on and the label it was given. */
  entityText?: string;
  entityLabel?: string;
  /** Which field is wrong, for metadata and index suggestions. */
  field?: string;
  /** Where the reader was standing when they raised it. */
  pageUrl?: string;
}

export interface SuggestionSubmission extends SuggestionContext {
  /** What the reader says is wrong, and what it should be. Required. */
  comment: string;
  /** Optional, so the archivists can follow up. */
  submitter?: string;
}

export const SUGGESTION_LIMITS = {
  comment: 2000,
  quotedText: 1200,
  submitter: 120,
  text: 300,
} as const;
