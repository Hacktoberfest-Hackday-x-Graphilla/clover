import type {
  Commit,
  Contributor,
  Health,
  HelpArea,
  Issue,
  IssueStatus,
  Level,
  Plan,
  Profile,
  SolvedItem,
} from './types';
import { languageKey, getSnippet, validateGraderOutput } from './levelCheck';

export const PLAN_MODEL = 'gemma-4-31b-it';
export const GRADER_MODEL = 'gemma-4-e4b-it';

export class RateLimitError extends Error {
  constructor(msg = 'GitHub limit reached.') {
    super(msg);
    this.name = 'RateLimitError';
  }
}
export class NotFoundError extends Error {
  constructor(msg = 'Repository not found.') {
    super(msg);
    this.name = 'NotFoundError';
  }
}
export class MissingKeyError extends Error {
  constructor(msg = 'Gemini API key is missing.') {
    super(msg);
    this.name = 'MissingKeyError';
  }
}

/* ---------- repo URL ---------- */

export function parseRepoUrl(input: string): { owner: string; repo: string } {
  const t = input.trim().replace(/\/+$/, '');
  const m = t.match(/^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/i);
  if (!m) throw new Error('That does not look like a GitHub repository link. Use https://github.com/owner/repo.');
  return { owner: m[1], repo: m[2] };
}

/* ---------- github plumbing ---------- */

const GH = 'https://api.github.com';

function ghHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function gh<T>(path: string, token?: string): Promise<T> {
  const res = await fetch(`${GH}${path}`, { headers: ghHeaders(token) });
  if (res.status === 404) throw new NotFoundError('Repository not found or private. Check the link and try again.');
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining === '0' || res.status === 429) throw new RateLimitError();
    const body = await res.text();
    if (/rate limit/i.test(body)) throw new RateLimitError();
    throw new Error(`GitHub request failed (${res.status}).`);
  }
  if (!res.ok) throw new Error(`GitHub request failed (${res.status}).`);
  return (await res.json()) as T;
}

async function ghText(path: string, token?: string): Promise<string | null> {
  const res = await fetch(`${GH}${path}`, {
    headers: { ...ghHeaders(token), Accept: 'application/vnd.github.raw' },
  });
  if (res.status === 404) return null;
  if (res.status === 403 || res.status === 429) throw new RateLimitError();
  if (!res.ok) return null;
  return await res.text();
}

interface GhIssue {
  number: number;
  title: string;
  html_url: string;
  labels: { name: string }[];
  body: string | null;
  assignees: { login: string }[];
  pull_request?: unknown;
  updated_at: string;
}

interface GhPR {
  number: number;
  title: string;
  html_url: string;
  body: string | null;
  merged_at: string | null;
  user: { login: string } | null;
}

const FIX_RE = /\b(fix(?:es|ed)?|clos(?:es|ed)?|resolv(?:es|ed)?)\s+#(\d+)/i;

function prTargets(pr: { title: string; body: string }): number[] {
  const out: number[] = [];
  const re = new RegExp(FIX_RE.source, 'gi');
  for (const text of [pr.title, pr.body]) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) out.push(Number(m[2]));
  }
  return [...new Set(out)];
}

export function heuristicDifficulty(labels: string[]): { level: Level; why: string } {
  const ls = labels.map((l) => l.toLowerCase());
  const has = (...xs: string[]) => xs.some((x) => ls.some((l) => l.includes(x)));
  if (has('good first', 'beginner', 'easy', 'starter', 'docs', 'documentation', 'trivial')) {
    return { level: 1, why: 'Labelled as a good first issue.' };
  }
  if (has('help wanted', 'up-for-grabs', 'hacktoberfest')) {
    return { level: 2, why: 'Labelled as help wanted.' };
  }
  if (has('complex', 'core', 'architect', 'security', 'breaking', 'performance', 'perf')) {
    return { level: 4, why: 'Label suggests deeper work.' };
  }
  if (has('enhancement', 'feature')) return { level: 3, why: 'Feature work, medium scope.' };
  if (has('bug')) return { level: 3, why: 'Bug report, needs reproducing first.' };
  return { level: 3, why: 'No difficulty label, estimated as medium.' };
}

const EXT_TO_LANG: [RegExp, string][] = [
  [/\.py\b/i, 'python'],
  [/\.[jt]sx?\b/i, 'typescript'],
  [/\.js\b/i, 'javascript'],
  [/\.ts\b/i, 'typescript'],
  [/\.(c|h)\b/i, 'c'],
  [/\.cpp\b|\.cc\b|\.hpp\b/i, 'cpp'],
  [/\.java\b/i, 'java'],
  [/\.go\b/i, 'go'],
  [/\.rs\b/i, 'rust'],
  [/\.php\b/i, 'php'],
  [/\.(html|css)\b/i, 'html'],
  [/\.(sql)\b/i, 'sql'],
];

export function guessIssueLanguage(
  title: string,
  body: string,
  labels: string[],
  repoMainLanguage: string | null,
): string | undefined {
  const text = `${title}\n${body}\n${labels.join(' ')}`;
  for (const [re, lang] of EXT_TO_LANG) {
    if (re.test(text)) return lang;
  }
  const low = text.toLowerCase();
  for (const name of ['python', 'javascript', 'typescript', 'java', 'go', 'rust', 'php', 'sql', 'c++', 'c']) {
    if (low.includes(name)) {
      if (name === 'c++') return 'cpp';
      if (name === 'c' && /\bc\b/.test(low)) return 'c';
      return name;
    }
  }
  if (repoMainLanguage) return languageKey(repoMainLanguage) === repoMainLanguage.toLowerCase() ? repoMainLanguage.toLowerCase() : languageKey(repoMainLanguage);
  return undefined;
}

/* ---------- bundle ---------- */

export interface GithubBundle {
  owner: string;
  repo: string;
  defaultBranch: string;
  description: string | null;
  stars: number;
  license: string | null;
  archived: boolean;
  pushedAt: string;
  openIssues: Issue[];
  openIssueCount: number;
  mergedPRs: GhPR[];
  openPRs: GhPR[];
  tree: string[];
  treeCapped: boolean;
  languages: Record<string, number>;
  mainLanguage: string | null;
  contributors: Contributor[];
  branches: string[];
  commits: Commit[];
  readme: string | null;
  contributing: string | null;
  repoHealth: Health;
}

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

function verdictFromPush(pushedAt: string, archived: boolean): Health['verdict'] {
  if (archived) return 'Archived';
  if (!pushedAt) return 'Unknown';
  const d = daysSince(pushedAt);
  if (d <= 30) return 'Active';
  if (d <= 180) return 'Slow';
  return 'Looks inactive';
}

export async function fetchGithubBundle(owner: string, repo: string, token?: string): Promise<GithubBundle> {
  const tok = token || undefined;
  const meta = await gh<{
    default_branch: string;
    description: string | null;
    stargazers_count: number;
    license: { name: string } | null;
    archived: boolean;
    pushed_at: string;
  }>(`/repos/${owner}/${repo}`, tok);

  const defaultBranch = meta.default_branch ?? 'main';

  const [issuesRaw, openPRsRaw, mergedRaw, langs, contributorsRaw, branchesRaw, commitsRaw, treeRaw, readme, contributing] =
    await Promise.all([
      gh<GhIssue[]>(`/repos/${owner}/${repo}/issues?state=open&per_page=100`, tok).catch(() => [] as GhIssue[]),
      gh<GhPR[]>(`/repos/${owner}/${repo}/pulls?state=open&per_page=50`, tok).catch(() => [] as GhPR[]),
      gh<GhPR[]>(`/repos/${owner}/${repo}/pulls?state=closed&per_page=50`, tok).catch(() => [] as GhPR[]),
      gh<Record<string, number>>(`/repos/${owner}/${repo}/languages`, tok).catch(() => ({})),
      gh<{ login: string; avatar_url: string; contributions: number }[]>(
        `/repos/${owner}/${repo}/contributors?per_page=30`,
        tok,
      ).catch(() => []),
      gh<{ name: string }[]>(`/repos/${owner}/${repo}/branches?per_page=50`, tok).catch(() => []),
      gh<{ sha: string; commit: { message: string; author: { name: string; date: string } } }[]>(
        `/repos/${owner}/${repo}/commits?per_page=20`,
        tok,
      ).catch(() => []),
      gh<{ tree?: { path: string }[]; truncated?: boolean }>(
        `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`,
        tok,
      ).catch(() => ({ tree: [] })),
      ghText(`/repos/${owner}/${repo}/readme`, tok).catch(() => null),
      ghText(`/repos/${owner}/${repo}/contents/CONTRIBUTING.md`, tok).catch(() => null),
    ]);

  const realIssues = issuesRaw.filter((i) => !i.pull_request);
  const openPRTargets = new Map<number, number>();
  for (const pr of openPRsRaw) {
    for (const n of prTargets({ title: pr.title, body: pr.body ?? '' })) {
      if (!openPRTargets.has(n)) openPRTargets.set(n, pr.number);
    }
  }

  const mainLanguage = Object.entries(langs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const openIssues: Issue[] = realIssues.slice(0, 60).map((i) => {
    const labels = i.labels.map((l) => l.name);
    const h = heuristicDifficulty(labels);
    let status: IssueStatus = { kind: 'free' };
    if (i.assignees.length > 0) status = { kind: 'assigned', to: i.assignees[0].login };
    else if (openPRTargets.has(i.number)) status = { kind: 'pr', number: openPRTargets.get(i.number)! };
    return {
      number: i.number,
      title: i.title,
      url: i.html_url,
      labels,
      body: (i.body ?? '').slice(0, 2000),
      status,
      language: guessIssueLanguage(i.title, i.body ?? '', labels, mainLanguage),
      difficulty: h.level,
      difficultyWhy: h.why,
      updatedAt: i.updated_at,
    };
  });

  const mergedPRs = mergedRaw.filter((p) => p.merged_at);

  const tree = (treeRaw.tree ?? []).map((t) => t.path).slice(0, 800);

  const recentMerges = mergedPRs.filter((p) => p.merged_at && daysSince(p.merged_at) <= 30).length;
  const verdict = verdictFromPush(meta.pushed_at, meta.archived);
  const facts = [
    `Last push ${new Date(meta.pushed_at).toLocaleDateString()}.`,
    `${recentMerges} pull request(s) merged in the last 30 days.`,
    contributing ? 'CONTRIBUTING file is present.' : 'No CONTRIBUTING file found in the repository root.',
    meta.license ? `Licensed under ${meta.license.name}.` : 'No license detected on GitHub.',
    `${meta.stargazers_count.toLocaleString()} stars.`,
  ];
  const repoHealth: Health = { verdict, facts };

  return {
    owner,
    repo,
    defaultBranch,
    description: meta.description,
    stars: meta.stargazers_count,
    license: meta.license?.name ?? null,
    archived: meta.archived,
    pushedAt: meta.pushed_at,
    openIssues,
    openIssueCount: realIssues.length,
    mergedPRs,
    openPRs: openPRsRaw,
    tree,
    treeCapped: (treeRaw.tree ?? []).length > 800,
    languages: langs,
    mainLanguage,
    contributors: contributorsRaw.slice(0, 24).map((c) => ({ login: c.login, avatarUrl: c.avatar_url, commits: c.contributions })),
    branches: branchesRaw.map((b) => b.name).slice(0, 30),
    commits: commitsRaw.map((c) => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split('\n')[0].slice(0, 120),
      author: c.commit.author.name,
      date: c.commit.author.date,
    })),
    readme: readme?.slice(0, 6000) ?? null,
    contributing: contributing?.slice(0, 6000) ?? null,
    repoHealth,
  };
}

/* ---------- shortlist ranking (plain code) ---------- */

export function rankShortlist(issues: Issue[], profile: Profile): Issue[] {
  const interestWords = profile.interests.map((s) => s.toLowerCase());
  const sizePref = profile.hours === '<2' ? [1, 2] : profile.hours === '2-5' ? [1, 2, 3] : [1, 2, 3, 4, 5];
  const scored = issues.map((issue) => {
    let s = 0;
    if (issue.status.kind === 'free') s += 10;
    else if (issue.status.kind === 'assigned') s -= 5;
    else s -= 8;
    if (sizePref.includes(issue.difficulty)) s += 4;
    else s -= 3;
    const hay = `${issue.title} ${issue.labels.join(' ')}`.toLowerCase();
    for (const w of interestWords) {
      if (w && hay.includes(w)) s += 3;
    }
    if (issue.labels.some((l) => /good first|beginner|docs/i.test(l))) s += 2;
    s -= issue.difficulty;
    return { issue, s };
  });
  return scored.sort((a, b) => b.s - a.s).map((x) => x.issue);
}

/* ---------- gemini ---------- */

async function geminiGenerate(opts: {
  model: string;
  system: string;
  user: string;
  key: string;
  temperature?: number;
}): Promise<string> {
  if (!opts.key) throw new MissingKeyError();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(opts.key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: opts.system }] },
      contents: [{ role: 'user', parts: [{ text: opts.user }] }],
      generationConfig: { temperature: opts.temperature ?? 0.4, maxOutputTokens: 2048 },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Gemma request failed (${res.status}). ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p: { text?: string }) => p.text ?? '').join('').trim();
  if (!text) throw new Error('Gemma returned an empty response.');
  return text;
}

function profileLine(profile: Profile): string {
  const langs = Object.entries(profile.languages)
    .map(([k, v]) => `${k} L${v}`)
    .join(', ');
  const levelHint =
    Math.max(0, ...Object.values(profile.languages)) <= 2
      ? 'Use simple words. Define terms like fork, branch, pull request.'
      : 'Be concise and technical.';
  return `User profile: git L${profile.git}, collab L${profile.collab}, languages {${langs || 'none'}}, hours ${profile.hours}, interests ${profile.interests.join(', ') || 'none'}. ${levelHint}`;
}

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json|markdown)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function extractPaths(markdown: string): string[] {
  const out = new Set<string>();
  const re = /`([^`\n]{1,160})`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const p = m[1].trim();
    if (/^[A-Za-z0-9_.\-/]+(\.[A-Za-z0-9]{1,8})?$/.test(p) && p.includes('.') && !p.includes(' ')) {
      out.add(p.replace(/^\.\//, ''));
    }
  }
  return [...out].slice(0, 20);
}

function verifyPaths(paths: string[], tree: string[]): { path: string; verified: boolean }[] {
  const set = new Set(tree);
  return paths.map((p) => {
    if (set.has(p)) return { path: p, verified: true };
    const suffix = tree.some((t) => t === p || t.endsWith('/' + p) || t.endsWith(p));
    return { path: p, verified: suffix };
  });
}

/* ---------- AI sections ---------- */

export async function gradeL3(answer: string, langKeyInput: string, geminiKey: string): Promise<{ score: 0 | 1 | 2 | 3; reason: string }> {
  const snippet = getSnippet(langKeyInput);
  const wrapped = `<untrusted>\n${answer.slice(0, 1500)}\n</untrusted>`;
  const tryOnce = async (): Promise<{ score: 0 | 1 | 2 | 3; reason: string } | null> => {
    const raw = await geminiGenerate({
      model: GRADER_MODEL,
      system: snippet.graderPrompt,
      user: wrapped,
      key: geminiKey,
      temperature: 0.1,
    });
    return validateGraderOutput(raw);
  };
  try {
    const first = await tryOnce();
    if (first) return first;
    const second = await tryOnce();
    if (second) return second;
  } catch (e) {
    throw e;
  }
  return { score: 1, reason: 'Could not grade automatically, counted as a partial answer.' };
}

export async function fetchAiPlan(bundle: GithubBundle, profile: Profile, geminiKey: string): Promise<Plan> {
  const shortlist = rankShortlist(bundle.openIssues, profile).slice(0, 8);
  const digest = shortlist
    .map((i) => `#${i.number} [${i.status.kind}] lang=${i.language ?? '?'} d=${i.difficulty} :: ${i.title} :: labels: ${i.labels.join(', ')}`)
    .join('\n');
  const system =
    'You are Kodiset, a coding assistant for open-source beginners. Write a first-contribution plan. ' +
    'Only cite file paths, issue numbers, and facts from the context. If unsure, say so. Keep it honest and plain.';
  const user = `${profileLine(profile)}\n\nRepository: ${bundle.owner}/${bundle.repo} — ${bundle.description ?? ''}\n` +
    `Health: ${bundle.repoHealth.verdict}. Facts: ${bundle.repoHealth.facts.join(' ')}\n` +
    `File tree (capped at 800):\n${bundle.tree.slice(0, 300).join('\n')}\n\n` +
    `Candidate issues:\n${digest || 'No open issues found.'}\n\n` +
    `Pick the single best free issue for this profile. Write markdown with sections: ` +
    `## Suggested issue (with issue number and why it fits), ## What the problem is, ` +
    `## Files to read and change (list paths in backticks, only from the tree above), ` +
    `## Your steps (Fork, Branch, Change, Test, Pull request, each with 1-2 sentences). ` +
    `Adjust difficulty by at most one step from the given d values. Mention the difficulty estimate.`;
  const markdown = await geminiGenerate({ model: PLAN_MODEL, system, user, key: geminiKey, temperature: 0.5 });
  const paths = extractPaths(markdown);
  const files = verifyPaths(paths, bundle.tree);
  return { markdown, files };
}

export async function fetchAiSolved(bundle: GithubBundle, profile: Profile, geminiKey: string): Promise<SolvedItem[]> {
  const linked: { pr: (typeof bundle.mergedPRs)[number]; issue: number }[] = [];
  for (const pr of bundle.mergedPRs.slice(0, 20)) {
    for (const n of prTargets({ title: pr.title, body: pr.body ?? '' })) {
      linked.push({ pr, issue: n });
      if (linked.length >= 8) break;
    }
    if (linked.length >= 8) break;
  }
  if (linked.length === 0) return [];
  const ctx = linked.map((l) => `PR #${l.pr.number} by ${l.pr.user?.login ?? 'unknown'} fixes #${l.issue}: ${l.pr.title}`).join('\n');
  const system = 'You summarize how merged pull requests fixed their issues in one or two plain sentences for a beginner. Output ONLY JSON: [{"pr":0,"issue":0,"how_fixed":""}].';
  const user = `${profileLine(profile)}\n\n${ctx}`;
  const raw = await geminiGenerate({ model: PLAN_MODEL, system, user, key: geminiKey, temperature: 0.3 });
  try {
    const arr = JSON.parse(stripFences(raw));
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, 8).map((o: { pr?: number; issue?: number; how_fixed?: string }, idx: number) => {
      const l = linked[idx] ?? linked[0];
      return {
        issueNumber: Number(o.issue ?? l.issue),
        issueTitle: `Issue #${o.issue ?? l.issue}`,
        prNumber: Number(o.pr ?? l.pr.number),
        prUrl: l.pr.html_url,
        author: l.pr.user?.login ?? 'unknown',
        explanation: String(o.how_fixed ?? 'Merged and closed the linked issue.').slice(0, 300),
      };
    });
  } catch {
    return linked.slice(0, 6).map((l) => ({
      issueNumber: l.issue,
      issueTitle: `Issue #${l.issue}`,
      prNumber: l.pr.number,
      prUrl: l.pr.html_url,
      author: l.pr.user?.login ?? 'unknown',
      explanation: l.pr.title.slice(0, 200),
    }));
  }
}

export async function fetchAiAreas(bundle: GithubBundle, profile: Profile, geminiKey: string): Promise<HelpArea[]> {
  const ctx = bundle.openIssues.slice(0, 30).map((i) => `#${i.number} [${i.status.kind}] ${i.title} (${i.labels.join(', ')})`).join('\n');
  const system = 'You cluster open issues into 2-3 areas that need help. Output ONLY JSON: [{"area":"","why":"","example_issues":[0]}]. Every area must cite a real issue number from context.';
  const user = `${profileLine(profile)}\n\nOpen issues for ${bundle.owner}/${bundle.repo}:\n${ctx || 'none'}`;
  const raw = await geminiGenerate({ model: PLAN_MODEL, system, user, key: geminiKey, temperature: 0.5 });
  try {
    const arr = JSON.parse(stripFences(raw));
    if (!Array.isArray(arr)) throw new Error('bad shape');
    const validNums = new Set(bundle.openIssues.map((i) => i.number));
    return arr.slice(0, 3).map((o: { area?: string; why?: string; example_issues?: number[] }) => ({
      title: String(o.area ?? 'Needs help').slice(0, 120),
      why: String(o.why ?? '').slice(0, 300),
      issueNumbers: (o.example_issues ?? []).filter((n) => validNums.has(n)).slice(0, 6),
    })).filter((a: HelpArea) => a.issueNumbers.length > 0);
  } catch {
    return [];
  }
}

export async function fetchAiChecklist(bundle: GithubBundle, profile: Profile, geminiKey: string): Promise<string[]> {
  const ctx = `CONTRIBUTING:\n${(bundle.contributing ?? 'not found').slice(0, 3000)}\n\nREADME setup:\n${(bundle.readme ?? 'not found').slice(0, 2000)}`;
  const system = 'Turn project contribution docs into a checklist. Output ONLY JSON: {"checklist":[{"item":""}]}. If no CONTRIBUTING found, emit a generic checklist (setup, branch, tests, lint, PR template).';
  const user = `${profileLine(profile)}\n\n${ctx}`;
  const raw = await geminiGenerate({ model: PLAN_MODEL, system, user, key: geminiKey, temperature: 0.2 });
  try {
    const obj = JSON.parse(stripFences(raw));
    const list = obj.checklist ?? obj;
    if (Array.isArray(list)) return list.slice(0, 10).map((x: string | { item?: string }) => (typeof x === 'string' ? x : String(x.item ?? '')).slice(0, 200)).filter(Boolean);
    return [];
  } catch {
    return ['Set up the project locally and run the tests.', 'Create a branch from the default branch.', 'Keep the change small and focused.', 'Run lint and tests before pushing.', 'Describe what changed and why in the pull request.'];
  }
}

export async function draftIssueComment(
  issue: Issue,
  owner: string,
  repo: string,
  profile: Profile,
  geminiKey: string,
): Promise<string> {
  const system = 'Draft a polite assignment request. Plain text only, no JSON. 2-4 sentences. Include: greeting, issue number and title, user level and stack, one relevant strength, ask to be assigned, confirm approach first. Humble, no overclaim. Leave a [Your Name] placeholder.';
  const user = `${profileLine(profile)}\n\nRepository ${owner}/${repo}, issue #${issue.number}: ${issue.title}\nLabels: ${issue.labels.join(', ')}`;
  return await geminiGenerate({ model: PLAN_MODEL, system, user, key: geminiKey, temperature: 0.5 });
}

export function freeCount(issues: Issue[]): number {
  return issues.filter((i) => i.status.kind === 'free').length;
}
