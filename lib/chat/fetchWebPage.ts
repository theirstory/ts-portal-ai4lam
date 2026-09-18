import 'server-only';
import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * Reads a public web page a reader pasted.
 *
 * The server does the fetching, so a pasted link is a request this machine
 * makes: without a guard it could be pointed at the droplet's own network —
 * the Weaviate instance on the private interface, a cloud metadata endpoint —
 * and the answer returned to the reader. Every host is resolved and checked
 * before the request goes out, and redirects are followed by hand so each new
 * hop is checked too.
 */

const MAX_REDIRECTS = 4;
const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

const isPrivateAddress = (address: string): boolean => {
  const version = isIP(address);
  if (version === 4) return PRIVATE_V4.some((pattern) => pattern.test(address));
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    // Unique-local and link-local, plus IPv4-mapped addresses of private space.
    if (/^f[cd]/.test(lower) || lower.startsWith('fe80')) return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
  }
  return false;
};

export class UnreadableUrlError extends Error {}

const assertPublicHost = async (hostname: string) => {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host === 'metadata') {
    throw new UnreadableUrlError('That address is not a public web page.');
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new UnreadableUrlError('That address is not a public web page.');
    return;
  }
  let records;
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new UnreadableUrlError('Could not find that address.');
  }
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) {
    throw new UnreadableUrlError('That address is not a public web page.');
  }
};

/**
 * Google Docs shared as "anyone with the link" will not serve their text to a
 * plain fetch, but the same document has a plain-text export that will.
 */
const asReadableUrl = (url: URL): URL => {
  const docs = url.hostname === 'docs.google.com' ? url.pathname.match(/^\/document\/d\/([^/]+)/) : null;
  if (docs) return new URL(`https://docs.google.com/document/d/${docs[1]}/export?format=txt`);

  const sheets = url.hostname === 'docs.google.com' ? url.pathname.match(/^\/spreadsheets\/d\/([^/]+)/) : null;
  if (sheets) return new URL(`https://docs.google.com/spreadsheets/d/${sheets[1]}/export?format=csv`);

  return url;
};

/** Tags out, entities decoded, blank lines collapsed. */
export const htmlToText = (html: string): { title?: string; text: string } => {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const title = withoutNoise.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();

  const text = withoutNoise
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();

  return { title: title || undefined, text };
};

export interface FetchedPage {
  finalUrl: string;
  title?: string;
  text: string;
  bytes: number;
}

export const fetchWebPage = async (rawUrl: string): Promise<FetchedPage> => {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new UnreadableUrlError('That does not look like a web address.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnreadableUrlError('Only http and https addresses can be read.');
  }

  let target = asReadableUrl(url);
  let response: Response | null = null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicHost(target.hostname);

    response = await fetch(target, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        // Named honestly: a site that blocks this can block it deliberately.
        'User-Agent': 'TheirStoryPortal/1.0 (+attachment reader)',
        Accept: 'text/html,text/plain,text/csv;q=0.9,*/*;q=0.5',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) break;
      // Re-checked on the next pass: a public URL can redirect to a private one.
      target = new URL(location, target);
      continue;
    }
    break;
  }

  if (!response || !response.ok) {
    throw new UnreadableUrlError(
      response?.status === 401 || response?.status === 403
        ? 'That page is not public — the portal could not read it.'
        : `Could not read that page (status ${response?.status ?? 'unknown'}).`,
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    throw new UnreadableUrlError('That page is too large to read.');
  }
  const body = new TextDecoder('utf-8').decode(buffer);

  if (contentType.includes('text/html')) {
    const { title, text } = htmlToText(body);
    return { finalUrl: target.toString(), title, text, bytes: buffer.byteLength };
  }

  if (contentType.includes('text/') || contentType.includes('json') || contentType.includes('csv')) {
    return { finalUrl: target.toString(), text: body.trim(), bytes: buffer.byteLength };
  }

  throw new UnreadableUrlError('That link is not a readable page. Upload the file instead.');
};

/**
 * Links a reader wrote into their message.
 *
 * A pasted link is a request to read it — that is what pasting a link into a
 * chat has always meant — so the portal follows them rather than offering a
 * separate control for the same act. Capped, because a message could contain
 * a dozen and each one is a request this server makes.
 */
export const MAX_LINKS_PER_MESSAGE = 3;

export const extractUrls = (text: string): string[] => {
  const found = text.match(/https?:\/\/[^\s<>"'`)\]]+/gi) ?? [];
  const cleaned = found.map((url) => url.replace(/[.,;:!?]+$/, ''));
  return [...new Set(cleaned)].slice(0, MAX_LINKS_PER_MESSAGE);
};
