import { NextRequest, NextResponse } from 'next/server';
import { createIssue } from '@/lib/github/createIssue';
import { suggestionsConfig, isSuggestionsEnabled, organizationConfig } from '@/config/organizationConfig';
import { SUGGESTION_KIND_LABELS, SUGGESTION_LIMITS, SuggestionKind, SuggestionSubmission } from '@/types/suggestion';

/**
 * Files a reader's suggested correction as a GitHub issue.
 *
 * Everything a reader sends is untrusted: it is length-capped, stripped of
 * control characters, and placed in the issue as quoted text rather than as
 * anything that could pass for the archive's own words.
 */

const RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };
// Per process, which is all a single container needs. It exists to stop a
// stuck form or a bored visitor filling the tracker, not as a security border.
const recentSubmissions = new Map<string, number[]>();

const isRateLimited = (key: string) => {
  const now = Date.now();
  const hits = (recentSubmissions.get(key) ?? []).filter((at) => now - at < RATE_LIMIT.windowMs);
  if (hits.length >= RATE_LIMIT.max) {
    recentSubmissions.set(key, hits);
    return true;
  }
  hits.push(now);
  recentSubmissions.set(key, hits);
  return false;
};

// Control characters other than newline and tab, which a paste can carry in.
const CONTROL_CHARACTERS = new RegExp('[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f]', 'g');

const clean = (value: unknown, limit: number): string =>
  typeof value === 'string' ? value.replace(CONTROL_CHARACTERS, '').trim().slice(0, limit) : '';

const asKind = (value: unknown): SuggestionKind | null =>
  value === 'transcript' || value === 'entity' || value === 'metadata' || value === 'index' ? value : null;

const formatTimestamp = (seconds?: number) => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  const total = Math.max(0, Math.floor(seconds));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${Math.floor(total / 3600)}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
};

const quote = (text: string) =>
  text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

export async function POST(request: NextRequest) {
  if (!isSuggestionsEnabled) {
    return NextResponse.json({ error: 'Suggestions are not enabled for this portal.' }, { status: 404 });
  }
  if (!process.env.GITHUB_TOKEN?.trim()) {
    console.error('Suggestion received but GITHUB_TOKEN is not set.');
    return NextResponse.json({ error: 'Suggestions are not configured on this server.' }, { status: 503 });
  }

  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many suggestions just now. Please try again shortly.' }, { status: 429 });
  }

  let payload: Partial<SuggestionSubmission>;
  try {
    payload = (await request.json()) as Partial<SuggestionSubmission>;
  } catch {
    return NextResponse.json({ error: 'Could not read the suggestion.' }, { status: 400 });
  }

  const kind = asKind(payload.kind);
  const comment = clean(payload.comment, SUGGESTION_LIMITS.comment);
  if (!kind) return NextResponse.json({ error: 'Unknown suggestion type.' }, { status: 400 });
  if (comment.length < 3) {
    return NextResponse.json({ error: 'Please describe what should change.' }, { status: 400 });
  }

  const quotedText = clean(payload.quotedText, SUGGESTION_LIMITS.quotedText);
  const recordingTitle = clean(payload.recordingTitle, SUGGESTION_LIMITS.text);
  const recordingId = clean(payload.recordingId, SUGGESTION_LIMITS.text);
  const entityLabel = clean(payload.entityLabel, SUGGESTION_LIMITS.text);
  const entityText = clean(payload.entityText, SUGGESTION_LIMITS.text);
  const field = clean(payload.field, SUGGESTION_LIMITS.text);
  const submitter = clean(payload.submitter, SUGGESTION_LIMITS.submitter);
  const pageUrl = clean(payload.pageUrl, SUGGESTION_LIMITS.text);
  const startLabel = formatTimestamp(payload.startTime);

  const subject = recordingTitle || entityText || field || organizationConfig.displayName;
  const title = `${SUGGESTION_KIND_LABELS[kind]} correction: ${subject}`.slice(0, 200);

  const context = [
    recordingTitle && `- **Recording:** ${recordingTitle}${recordingId ? ` (\`${recordingId}\`)` : ''}`,
    startLabel && `- **At:** ${startLabel}`,
    entityText && `- **Entity:** ${entityText}${entityLabel ? ` — labelled \`${entityLabel}\`` : ''}`,
    field && `- **Field:** ${field}`,
    pageUrl && `- **Page:** ${pageUrl}`,
    submitter && `- **From:** ${submitter}`,
  ].filter(Boolean);

  const body = [
    `A reader of **${organizationConfig.displayName}** suggested a correction.`,
    '',
    '### What they say should change',
    '',
    quote(comment),
    ...(quotedText ? ['', '### The text as it stands', '', quote(quotedText)] : []),
    ...(context.length ? ['', '### Context', '', ...context] : []),
    '',
    '---',
    '',
    '_Filed automatically from the portal. Everything quoted above was written by a reader._',
  ].join('\n');

  try {
    const issue = await createIssue({
      repository: suggestionsConfig?.repository?.trim() ?? '',
      title,
      body,
      labels: suggestionsConfig?.labels,
    });
    return NextResponse.json(issue, { status: 201 });
  } catch (error) {
    console.error('Failed to file a suggestion:', error);
    return NextResponse.json({ error: 'Could not file the suggestion. Please try again later.' }, { status: 502 });
  }
}
