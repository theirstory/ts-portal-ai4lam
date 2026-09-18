export type ZoteroContextItem = {
  key: string;
  title: string;
  creators: string;
  date: string;
  itemType: string;
  abstractNote: string;
  url: string;
};

/** What the browser knows about an attachment: never its extracted text. */
export type ChatAttachment = {
  id: string;
  kind: 'document' | 'image' | 'webpage';
  name: string;
  sourceUrl?: string;
  /** The document was longer than the context budget and was cut. */
  truncated?: boolean;
  bytes: number;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  zoteroItems?: ZoteroContextItem[];
};

export type Citation = {
  index: number;
  transcription: string;
  speaker: string;
  interviewTitle: string;
  sectionTitle: string;
  startTime: number;
  endTime: number;
  theirstoryId: string;
  videoUrl: string;
  isAudioFile?: boolean;
  score?: number;
  isChapterSynopsis?: boolean;
};

export type ChatRequest = {
  messages: { role: 'user' | 'assistant'; content: string }[];
  query: string;
  responseLanguage?: string;
  includeZoteroContext?: boolean;
  /** Attachments the reader added, held server-side and referenced by id. */
  attachmentIds?: string[];
};

export type ChatStreamChunk =
  | { type: 'status'; status: string }
  | { type: 'citations'; citations: Citation[] }
  | { type: 'text'; content: string }
  | { type: 'zotero_context'; items: ZoteroContextItem[] }
  | { type: 'attachments_expired'; ids: string[] }
  | { type: 'attachment_added'; attachment: ChatAttachment }
  | { type: 'attachment_failed'; url: string; error: string }
  | { type: 'done' };
