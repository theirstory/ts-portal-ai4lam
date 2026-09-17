import 'server-only';

const GITHUB_API = 'https://api.github.com';

export interface CreateIssueInput {
  repository: string;
  title: string;
  body: string;
  labels?: string[];
}

export interface CreatedIssue {
  number: number;
  url: string;
}

/** "owner/name", rejecting anything that could reach a different endpoint. */
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

/**
 * Files an issue through the REST API.
 *
 * Deliberately not the gh CLI or an SDK: one authenticated POST is the whole
 * requirement, and the token must never leave the server.
 */
export const createIssue = async ({ repository, title, body, labels }: CreateIssueInput): Promise<CreatedIssue> => {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  if (!REPO_PATTERN.test(repository)) throw new Error(`Invalid repository: ${repository}`);

  const response = await fetch(`${GITHUB_API}/repos/${repository}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body, ...(labels?.length ? { labels } : {}) }),
    // Nothing about this should be cached or revalidated.
    cache: 'no-store',
  });

  if (!response.ok) {
    // The response body can name the token or the repository, so it is logged
    // for the operator and never returned to the browser.
    const detail = await response.text().catch(() => '');
    throw new Error(`GitHub responded ${response.status}: ${detail.slice(0, 500)}`);
  }

  const issue = (await response.json()) as { number: number; html_url: string };
  return { number: issue.number, url: issue.html_url };
};
