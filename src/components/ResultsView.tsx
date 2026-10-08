import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { Issue, Profile } from '../lib/types';
import { LEVEL_LABEL, effectiveLevel, isEligible, languageDisplay } from '../lib/levelCheck';
import {
  draftIssueComment,
  fetchAiAreas,
  fetchAiChecklist,
  fetchAiPlan,
  fetchAiSolved,
  fetchGithubBundle,
  freeCount,
  rankShortlist,
  MissingKeyError,
  NotFoundError,
  RateLimitError,
} from '../lib/api';
import { Badge, Button, Card, DifficultyDots, EmptyState, ErrorCard, LevelMeter, Skeleton, SkeletonCard, StatusPill } from './ui';
import NetworkCanvas from './NetworkCanvas';

const TABS = ['Your first contribution', 'Solved problems', 'People and branches', 'Areas that need help', 'Repo check'] as const;

export default function ResultsView({
  owner,
  repo,
  profile,
  geminiKey,
  githubToken,
  onNewAnalysis,
  onOpenSettings,
}: {
  owner: string;
  repo: string;
  profile: Profile;
  geminiKey: string;
  githubToken: string;
  onNewAnalysis: () => void;
  onOpenSettings: () => void;
}) {
  const [tab, setTab] = useState(0);
  const [activeIssue, setActiveIssue] = useState<number | null>(null);
  const [freeOnly, setFreeOnly] = useState(false);
  const [copied, setCopied] = useState(false);

  const bundleQuery = useQuery({
    queryKey: ['bundle', owner, repo, githubToken ? 'tok' : 'anon'],
    queryFn: () => fetchGithubBundle(owner, repo, githubToken || undefined),
    retry: 1,
    staleTime: 1000 * 60 * 5,
  });

  const bundle = bundleQuery.data ?? null;
  const hasKey = Boolean(geminiKey);

  const [planQ, solvedQ, areasQ, checklistQ] = useQueries({
    queries: [
      {
        queryKey: ['plan', owner, repo, JSON.stringify(profile)],
        queryFn: () => fetchAiPlan(bundle!, profile, geminiKey),
        enabled: Boolean(bundle) && hasKey,
        retry: 1,
        staleTime: 1000 * 60 * 10,
      },
      {
        queryKey: ['solved', owner, repo],
        queryFn: () => fetchAiSolved(bundle!, profile, geminiKey),
        enabled: Boolean(bundle) && hasKey && (bundle?.mergedPRs.length ?? 0) > 0,
        retry: 1,
        staleTime: 1000 * 60 * 10,
      },
      {
        queryKey: ['areas', owner, repo],
        queryFn: () => fetchAiAreas(bundle!, profile, geminiKey),
        enabled: Boolean(bundle) && hasKey,
        retry: 1,
        staleTime: 1000 * 60 * 10,
      },
      {
        queryKey: ['checklist', owner, repo],
        queryFn: () => fetchAiChecklist(bundle!, profile, geminiKey),
        enabled: Boolean(bundle) && hasKey,
        retry: 1,
        staleTime: 1000 * 60 * 10,
      },
    ],
  });

  const shortlist = useMemo(() => {
    if (!bundle) return [];
    const eligible = bundle.openIssues.filter((i) => isEligible(i.difficulty, i.language, profile));
    const sizeCap = profile.hours === '<2' ? 2 : profile.hours === '2-5' ? 3 : 5;
    const sized = eligible.filter((i) => i.difficulty <= sizeCap);
    const base = sized.length > 0 ? sized : eligible;
    return rankShortlist(base, profile).slice(0, 5);
  }, [bundle, profile]);

  useEffect(() => {
    if (activeIssue == null && shortlist.length > 0) setActiveIssue(shortlist[0].number);
  }, [shortlist, activeIssue]);

  const active = bundle?.openIssues.find((i) => i.number === activeIssue) ?? shortlist[0] ?? null;

  const copySummary = async () => {
    const lines = [
      `Kodiset summary for ${owner}/${repo}`,
      `Profile: Git L${profile.git}, Collab L${profile.collab}, ` +
        Object.entries(profile.languages).map(([k, v]) => `${languageDisplay(k)} L${v}`).join(', '),
      bundle ? `Health: ${bundle.repoHealth.verdict} — ${bundle.repoHealth.facts[0] ?? ''}` : 'Health: loading',
      bundle ? `Open issues: ${bundle.openIssueCount} (${freeCount(bundle.openIssues)} free in first 60)` : '',
      active ? `Suggested: #${active.number} ${active.title} (${active.url})` : 'Suggested: none found',
      'Note: Gemma can be wrong. Always read the real code.',
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="relative">
      <div className="absolute inset-x-0 top-0 h-[280px] overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 opacity-100">
          <NetworkCanvas dimmed />
        </div>
      </div>

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        {/* sticky strip */}
        <div className="sticky top-16 z-20 -mx-4 border-b border-[var(--kodiset-border)] bg-[var(--kodiset-page)]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[15px] font-medium">
              {owner}/{repo}
            </span>
            <Badge tone="neutral">Git L{profile.git}</Badge>
            {Object.entries(profile.languages).map(([k, v]) => (
              <Badge key={k} tone="green">
                {languageDisplay(k)} L{v}
              </Badge>
            ))}
            <span className="ml-auto flex gap-2">
              <Button variant="secondary" size="sm" onClick={onNewAnalysis}>
                New analysis
              </Button>
              <Button variant="secondary" size="sm" onClick={copySummary}>
                {copied ? 'Copied' : 'Copy summary'}
              </Button>
            </span>
          </div>
        </div>

        {/* bundle states */}
        {bundleQuery.isPending && <LoadingProgress />}
        {bundleQuery.isError && (
          <div className="py-8">
            {bundleQuery.error instanceof RateLimitError ? (
              <ErrorCard
                title="GitHub limit reached."
                body="Add a token in Settings. One analysis uses about 12 to 14 requests, and a token raises the limit from about 60 to 5,000 per hour."
              />
            ) : bundleQuery.error instanceof NotFoundError ? (
              <ErrorCard title="Repository not found." body="The repository was not found or is private. Check the link and try again." />
            ) : (
              <ErrorCard
                title="Could not read the repository."
                body={bundleQuery.error instanceof Error ? bundleQuery.error.message : 'Something went wrong.'}
                onRetry={() => bundleQuery.refetch()}
              />
            )}
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" size="sm" onClick={onOpenSettings}>
                Open settings
              </Button>
              <Button variant="secondary" size="sm" onClick={onNewAnalysis}>
                Try another repo
              </Button>
            </div>
          </div>
        )}

        {bundle && (
          <>
            {/* stat cards */}
            <div className="grid grid-cols-1 gap-3 py-6 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Project health" value={bundle.repoHealth.verdict} sub={bundle.repoHealth.facts[0] ?? ''} tone={healthTone(bundle.repoHealth.verdict)} />
              <StatCard
                label="Open issues"
                value={String(bundle.openIssueCount)}
                sub={`${freeCount(bundle.openIssues)} free in the first ${bundle.openIssues.length} checked`}
              />
              <StatCard
                label="Solved problems"
                value={solvedQ.data ? String(solvedQ.data.length) : bundle.mergedPRs.length > 0 ? `${bundle.mergedPRs.length} merged PRs` : '0'}
                sub={solvedQ.data ? 'linked to their fixes' : 'merged pull requests found'}
              />
              <StatCard label="Contributors" value={String(bundle.contributors.length)} sub={bundle.contributors.length >= 30 ? 'top 30 shown' : 'in this view'} />
            </div>

            {/* tabs */}
            <div className="tab-scroll -mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6" role="tablist" aria-label="Analysis sections">
              <div className="flex min-w-max gap-1 border-b border-[var(--kodiset-border)]">
                {TABS.map((t, i) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === i}
                    aria-controls={`panel-${i}`}
                    id={`tab-${i}`}
                    tabIndex={tab === i ? 0 : -1}
                    onClick={() => setTab(i)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowRight') setTab((i + 1) % TABS.length);
                      if (e.key === 'ArrowLeft') setTab((i - 1 + TABS.length) % TABS.length);
                    }}
                    className={`quiet-transition whitespace-nowrap px-4 py-2.5 text-[15px] font-medium ${
                      tab === i
                        ? 'border-b-2 border-[#1B7A4D] text-[var(--kodiset-text)] dark:border-[#4FD08F]'
                        : 'text-[var(--kodiset-muted)] hover:text-[var(--kodiset-text)]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="py-6">
              {tab === 0 && (
                <div role="tabpanel" id="panel-0" aria-labelledby="tab-0">
                  <FirstContributionTab
                    bundleOwner={owner}
                    bundleRepo={repo}
                    profile={profile}
                    shortlist={shortlist}
                    allIssues={bundle.openIssues}
                    active={active}
                    setActive={setActiveIssue}
                    planQ={planQ}
                    checklistQ={checklistQ}
                    geminiKey={geminiKey}
                    onOpenSettings={onOpenSettings}
                    defaultBranch={bundle.defaultBranch}
                  />
                </div>
              )}
              {tab === 1 && (
                <div role="tabpanel" id="panel-1" aria-labelledby="tab-1">
                  <SolvedTab solvedQ={solvedQ} hasKey={hasKey} onOpenSettings={onOpenSettings} mergedCount={bundle.mergedPRs.length} />
                </div>
              )}
              {tab === 2 && (
                <div role="tabpanel" id="panel-2" aria-labelledby="tab-2">
                  <PeopleTab bundle={bundle} />
                </div>
              )}
              {tab === 3 && (
                <div role="tabpanel" id="panel-3" aria-labelledby="tab-3">
                  <HelpAreasTab areasQ={areasQ} hasKey={hasKey} onOpenSettings={onOpenSettings} issues={bundle.openIssues} freeOnly={freeOnly} setFreeOnly={setFreeOnly} />
                </div>
              )}
              {tab === 4 && (
                <div role="tabpanel" id="panel-4" aria-labelledby="tab-4">
                  <RepoCheckTab bundle={bundle} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function healthTone(v: string): 'green' | 'amber' | 'red' | 'neutral' {
  if (v === 'Active') return 'green';
  if (v === 'Slow') return 'amber';
  if (v === 'Looks inactive' || v === 'Archived') return 'red';
  return 'neutral';
}

function StatCard({ label, value, sub, tone = 'neutral' }: { label: string; value: string; sub: string; tone?: 'green' | 'amber' | 'red' | 'neutral' }) {
  const colors: Record<string, string> = {
    green: 'text-[#16663F] dark:text-[#4FD08F]',
    amber: 'text-[#7A5410] dark:text-[#E8B84B]',
    red: 'text-[#B42318] dark:text-[#F08A80]',
    neutral: '',
  };
  return (
    <Card className="p-4">
      <p className="text-[13px] font-medium text-[var(--kodiset-muted)]">{label}</p>
      <p className={`font-display text-xl font-bold ${colors[tone]}`}>{value}</p>
      <p className="mt-1 text-[13px] text-[var(--kodiset-muted)]">{sub}</p>
    </Card>
  );
}

function LoadingProgress() {
  const rows = ['Reading repository', 'Checking which issues are taken', 'Checking project health', 'Writing your plan with Gemma'];
  return (
    <div className="grid gap-3 py-6">
      <Card>
        <ul className="space-y-2.5">
          {rows.map((r, i) => (
            <li key={r} className="flex items-center gap-3 text-[15px]">
              <span aria-hidden="true" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#1B7A4D] border-t-transparent" style={{ animationDelay: `${i * 120}ms` }} />
              {r}
              {i < 3 ? <Badge tone="neutral">GitHub</Badge> : <Badge tone="mint">Gemma</Badge>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-[var(--kodiset-muted)]">The largest model can take 1 to 2 minutes.</p>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

/* ---------- Tab 1 ---------- */

function FirstContributionTab(props: {
  bundleOwner: string;
  bundleRepo: string;
  profile: Profile;
  shortlist: Issue[];
  allIssues: Issue[];
  active: Issue | null;
  setActive: (n: number) => void;
  planQ: { data?: { markdown: string; files: { path: string; verified: boolean }[] }; isPending: boolean; isError: boolean; error?: unknown; refetch: () => void };
  checklistQ: { data?: string[]; isPending: boolean; isError: boolean; refetch: () => void };
  geminiKey: string;
  onOpenSettings: () => void;
  defaultBranch: string;
}) {
  const { profile, shortlist, active } = props;
  return (
    <div className="grid gap-4">
      {profile.git <= 2 && <FirstPrGuide />}

      {shortlist.length === 0 ? (
        <EmptyState
          title="No eligible issues found"
          body="Nothing free matches your languages and level right now. Try adding a language in Settings, or pick a repository with beginner-labelled issues."
        />
      ) : (
        <Card>
          <h2 className="font-display text-lg font-semibold">Shortlist</h2>
          <p className="mt-1 text-sm text-[var(--kodiset-muted)]">
            Up to 5 eligible issues, ranked by your interests and hours. Difficulty shown as an estimate.
          </p>
          <ul className="mt-4 grid gap-2">
            {shortlist.map((issue, i) => (
              <li key={issue.number}>
                <button
                  onClick={() => props.setActive(issue.number)}
                  aria-pressed={active?.number === issue.number}
                  className={`quiet-transition flex w-full flex-col gap-1.5 rounded-[12px] border p-3.5 text-left sm:flex-row sm:items-center ${
                    active?.number === issue.number ? 'border-[#1B7A4D] bg-[#1B7A4D]/5 dark:border-[#4FD08F]' : 'border-[var(--kodiset-border)] hover:border-[#1B7A4D]'
                  }`}
                >
                  <span className="font-mono text-sm text-[var(--kodiset-muted)]">#{issue.number}</span>
                  <span className="flex-1 text-[15px] font-medium">{i === 0 ? `Suggested — ${issue.title}` : issue.title}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {issue.language && <Badge tone="neutral">{languageDisplay(issue.language)}</Badge>}
                    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--kodiset-muted)]">
                      <DifficultyDots level={issue.difficulty} /> d{issue.difficulty}
                    </span>
                    <StatusPill status={issue.status} />
                  </span>
                </button>
                <p className="mt-1 pl-1 text-[13px] text-[var(--kodiset-muted)]">{matchWhy(issue, profile)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {active && (
        <SuggestedIssueCard
          issue={active}
          profile={profile}
          owner={props.bundleOwner}
          repo={props.bundleRepo}
          planQ={props.planQ}
          geminiKey={props.geminiKey}
          onOpenSettings={props.onOpenSettings}
          defaultBranch={props.defaultBranch}
        />
      )}

      <ChecklistCard checklistQ={props.checklistQ} geminiKey={props.geminiKey} onOpenSettings={props.onOpenSettings} />
    </div>
  );
}

function matchWhy(issue: Issue, profile: Profile): string {
  const bits: string[] = [];
  const langLevel = issue.language ? profile.languages[issue.language] : undefined;
  if (langLevel) {
    const eff = effectiveLevel(langLevel, profile.git);
    bits.push(`${issue.language ? languageDisplay(issue.language) : ''} L${langLevel} covers difficulty ${issue.difficulty} (effective L${eff})`);
  }
  if (issue.status.kind === 'free') bits.push('free to claim');
  if (issue.difficultyWhy) bits.push(issue.difficultyWhy.toLowerCase());
  return `Why it matched: ${bits.join(' · ')}.`;
}

function FirstPrGuide() {
  const [open, setOpen] = useState(true);
  const steps = [
    ['Fork', 'Create your own copy of the repository on GitHub. You will push to the fork, never directly to the project.'],
    ['Clone', 'Download your fork to your machine so you can edit and test locally.'],
    ['Branch', 'Create a small branch with a plain name, like fix-issue-123. Keep the change on that branch only.'],
    ['Commit and push', 'Commit with a clear message that explains what changed and why. Push the branch to your fork.'],
    ['Open the pull request', 'Open a pull request from your branch to the project. Link the issue with Fixes #N. Expect questions — review is normal and not personal.'],
  ];
  return (
    <Card className="border-[#1B7A4D]/40">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="font-display text-lg font-semibold">Your first PR — how it works</span>
        <span aria-hidden="true" className="text-[var(--kodiset-muted)]">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <ol className="mt-3 space-y-2.5">
          {steps.map(([t, d], i) => (
            <li key={t} className="flex gap-3 text-[15px]">
              <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1B7A4D]/10 text-sm font-semibold text-[#1B7A4D] dark:text-[#4FD08F]">{i + 1}</span>
              <span><strong className="font-semibold">{t}.</strong> <span className="text-[var(--kodiset-muted)]">{d}</span></span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function SuggestedIssueCard(props: {
  issue: Issue;
  profile: Profile;
  owner: string;
  repo: string;
  planQ: { data?: { markdown: string; files: { path: string; verified: boolean }[] }; isPending: boolean; isError: boolean; error?: unknown; refetch: () => void };
  geminiKey: string;
  onOpenSettings: () => void;
  defaultBranch: string;
}) {
  const { issue, profile, owner, repo } = props;
  const [draft, setDraft] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [doneSteps, setDoneSteps] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(`kodiset.steps.${owner}.${repo}.${issue.number}`) ?? '{}');
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(`kodiset.steps.${owner}.${repo}.${issue.number}`, JSON.stringify(doneSteps));
    } catch { /* ignore */ }
  }, [doneSteps, owner, repo, issue.number]);

  useEffect(() => {
    setDraft('');
    setDraftError(null);
  }, [issue.number]);

  const againstDraft = async () => {
    if (!props.geminiKey) {
      setDraftError('Add your Gemini API key in Settings first.');
      return;
    }
    setDrafting(true);
    setDraftError(null);
    try {
      const text = await draftIssueComment(issue, owner, repo, profile, props.geminiKey);
      setDraft(text);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : 'Could not draft a comment.');
    } finally {
      setDrafting(false);
    }
  };

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(draft);
    } catch { /* ignore */ }
  };

  const guideSteps: [string, string][] = [
    ['Fork', `Fork ${owner}/${repo} on GitHub, then clone your fork. You need push access to your own copy only.`],
    ['Branch', `Create a branch named fix-${issue.number}-short-name from ${props.defaultBranch}. Keep every change for this issue on that branch.`],
    ['Change', `Reproduce issue #${issue.number} first, then make the smallest change that fixes it. Read the files listed below before editing.`],
    ['Test', 'Run the project checks the same way the maintainers do. If there are no tests for this area, explain what you ran by hand.'],
    ['Pull request', `Push your branch and open a pull request with Fixes #${issue.number} in the body. Describe what changed, why, and how you tested it.`],
  ];

  return (
    <Card>
      <p className="font-mono text-[13px] text-[var(--kodiset-muted)]">
        Issue #{issue.number}
      </p>
      <h2 className="font-display text-xl font-bold">
        <a href={issue.url} target="_blank" rel="noreferrer" className="quiet-transition underline-offset-4 hover:underline">
          {issue.title}
        </a>
      </h2>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {issue.labels.map((l) => (
          <Badge key={l} tone="neutral">{l}</Badge>
        ))}
        <StatusPill status={issue.status} />
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--kodiset-muted)]">
          <DifficultyDots level={issue.difficulty} /> Difficulty {issue.difficulty} of 5 (estimate)
        </span>
      </div>

      <p className="reading-width mt-3 text-[15px]">
        <strong className="font-semibold">Why this fits you.</strong>{' '}
        {whyFits(issue, profile)}
      </p>

      {props.planQ.isPending && (
        <div className="mt-4 rounded-[12px] border border-[var(--kodiset-border)] p-4" aria-live="polite">
          <p className="flex items-center gap-2 text-[15px]">
            <span aria-hidden="true" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#1B7A4D] border-t-transparent" />
            Writing your plan with Gemma…
          </p>
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-5/6" />
        </div>
      )}
      {props.planQ.isError && (
        <div className="mt-4">
          {props.planQ.error instanceof MissingKeyError ? (
            <MissingKeyCard onOpenSettings={props.onOpenSettings} />
          ) : (
            <ErrorCard title="Could not write the plan." body="The code facts above still stand. The explanation failed to load." onRetry={props.planQ.refetch} />
          )}
        </div>
      )}
      {!props.geminiKey && !props.planQ.isPending && (
        <div className="mt-4">
          <MissingKeyCard onOpenSettings={props.onOpenSettings} />
        </div>
      )}
      {props.planQ.data && (
        <div className="mt-4">
          <h3 className="font-display text-base font-semibold">Your plan</h3>
          <MarkdownLite text={props.planQ.data.markdown} />
          <h3 className="mt-4 font-display text-base font-semibold">Files to read and change</h3>
          {props.planQ.data.files.length === 0 ? (
            <p className="mt-1 text-sm text-[var(--kodiset-muted)]">The plan named no file paths. Read the issue thread and the repository tree before editing.</p>
          ) : (
            <ul className="mt-2 grid gap-1.5">
              {props.planQ.data.files.map((f) => (
                <li key={f.path} className="flex items-start gap-2 font-mono text-[13.5px]">
                  {f.verified ? (
                    <span className="inline-flex items-center gap-1.5 text-[#16663F] dark:text-[#4FD08F]">
                      <CheckIcon /> <span>{f.path}</span>
                      <span className="font-body text-xs text-[var(--kodiset-muted)]">exists in the repository</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[#7A5410] dark:text-[#E8B84B]">
                      <WarnIcon /> <span>{f.path}</span>
                      <span className="font-body text-xs">not found in the repository, double check</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <h3 className="mt-5 font-display text-base font-semibold">Your steps</h3>
      <StepList steps={guideSteps} doneSteps={doneSteps} setDoneSteps={setDoneSteps} />

      <h3 className="mt-5 font-display text-base font-semibold">Draft my comment</h3>
      <div className="mt-2 rounded-[12px] border border-[var(--kodiset-border)] p-4">
        <Button size="sm" onClick={againstDraft} disabled={drafting}>
          {drafting ? 'Drafting…' : 'Draft a comment to ask for this issue'}
        </Button>
        {draftError && (
          <p role="alert" className="mt-2 text-sm text-[#B42318] dark:text-[#F08A80]">
            {draftError}{' '}
            <button onClick={props.onOpenSettings} className="underline underline-offset-2">Open settings</button>
          </p>
        )}
        {draft && (
          <div className="mt-3">
            <label htmlFor="draft-comment" className="sr-only">Draft comment</label>
            <textarea id="draft-comment" rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} className="w-full rounded-[10px] border border-[var(--kodiset-border)] bg-transparent p-3 text-[15px]" />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={copyDraft}>Copy</Button>
              <a href={issue.url} target="_blank" rel="noreferrer" className="quiet-transition inline-flex items-center rounded-[10px] border border-[var(--kodiset-border)] px-3 py-1.5 text-sm hover:border-[#1B7A4D]">
                Open issue on GitHub
              </a>
            </div>
            <p className="mt-2 text-[13px] text-[var(--kodiset-muted)]">Edit it so it sounds like you. Post it yourself.</p>
          </div>
        )}
      </div>
    </Card>
  );
}

function StepList({
  steps,
  doneSteps,
  setDoneSteps,
}: {
  steps: [string, string][];
  doneSteps: Record<string, boolean>;
  setDoneSteps: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({ '0:Fork': true });
  return (
    <ol className="mt-2 grid gap-2">
      {steps.map(([t, d], i) => {
        const key = `${i}:${t}`;
        const done = Boolean(doneSteps[key]);
        const isOpen = Boolean(open[key]);
        return (
          <li key={key} className="rounded-[12px] border border-[var(--kodiset-border)] p-3.5">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1B7A4D]/10 text-sm font-semibold text-[#1B7A4D] dark:text-[#4FD08F]">
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                aria-expanded={isOpen}
                className="flex-1 text-left font-medium"
              >
                {t}
                <span aria-hidden="true" className="ml-2 text-[var(--kodiset-muted)]">{isOpen ? '−' : '+'}</span>
              </button>
              <label className="flex cursor-pointer items-center gap-1.5 text-sm text-[var(--kodiset-muted)]" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={done} onChange={() => setDoneSteps((s) => ({ ...s, [key]: !s[key] }))} className="h-4 w-4 accent-[#1B7A4D]" />
                Mark done
              </label>
            </div>
            {isOpen && <p className={`mt-1.5 text-[14px] text-[var(--kodiset-muted)] ${done ? 'line-through opacity-70' : ''}`}>{d}</p>}
          </li>
        );
      })}
    </ol>
  );
}

function whyFits(issue: Issue, profile: Profile): string {
  const lang = issue.language ? languageDisplay(issue.language) : 'this language';
  const lvl = issue.language ? profile.languages[issue.language] : undefined;
  const lvlText = lvl ? `You are ${lang} L${lvl} ${LEVEL_LABEL[lvl]}.` : '';
  const free = issue.status.kind === 'free' ? 'It looks free to claim.' : issue.status.kind === 'assigned' ? 'Note: someone is already assigned, so ask before starting.' : 'Note: an open pull request already targets it, so confirm it is still needed.';
  const size = profile.hours === '<2' ? 'It is sized for under 2 hours a week.' : profile.hours === '2-5' ? 'It fits a few hours a week.' : 'It can use a larger time budget.';
  return `${lvlText} Difficulty is estimated at ${issue.difficulty} of 5${issue.difficultyWhy ? ` (${issue.difficultyWhy.toLowerCase()})` : ''}. ${free} ${size}`;
}

function ChecklistCard(props: {
  checklistQ: { data?: string[]; isPending: boolean; isError: boolean; refetch: () => void };
  geminiKey: string;
  onOpenSettings: () => void;
}) {
  const [done, setDone] = useState<Record<number, boolean>>({});
  if (props.checklistQ.isPending) return <Card><Skeleton className="h-5 w-1/3" /><Skeleton className="mt-2 h-4 w-full" /></Card>;
  if (!props.geminiKey) return null;
  if (props.checklistQ.isError) return <ErrorCard title="Could not load the checklist." body="Contribution rules failed to load." onRetry={props.checklistQ.refetch} />;
  const items = props.checklistQ.data ?? [];
  if (items.length === 0) return null;
  return (
    <Card>
      <h2 className="font-display text-lg font-semibold">Contributing checklist</h2>
      <ul className="mt-3 grid gap-2">
        {items.map((item, i) => (
          <li key={i}>
            <label className="flex cursor-pointer items-start gap-2.5 text-[15px]">
              <input type="checkbox" checked={Boolean(done[i])} onChange={() => setDone((d) => ({ ...d, [i]: !d[i] }))} className="mt-1 h-4 w-4 accent-[#1B7A4D]" />
              <span className={done[i] ? 'text-[var(--kodiset-muted)] line-through' : ''}>{item}</span>
            </label>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MissingKeyCard({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="rounded-[12px] border border-[var(--kodiset-border)] bg-black/[0.02] p-4 dark:bg-white/5">
      <p className="font-medium">Add your Gemini API key to generate this section.</p>
      <p className="mt-1 text-sm text-[var(--kodiset-muted)]">GitHub facts above work without a key. Explanations need Gemma.</p>
      <Button variant="secondary" size="sm" className="mt-3" onClick={onOpenSettings}>
        Open settings
      </Button>
    </div>
  );
}

/* ---------- Tab 2 ---------- */

function SolvedTab(props: {
  solvedQ: { data?: { issueNumber: number; issueTitle: string; prNumber: number; prUrl: string; author: string; explanation: string }[]; isPending: boolean; isError: boolean; refetch: () => void };
  hasKey: boolean;
  onOpenSettings: () => void;
  mergedCount: number;
}) {
  if (props.solvedQ.isPending && props.hasKey) return <div className="grid gap-3 sm:grid-cols-2"><SkeletonCard /><SkeletonCard /></div>;
  if (!props.hasKey) return <MissingKeyCard onOpenSettings={props.onOpenSettings} />;
  if (props.solvedQ.isError) return <ErrorCard title="Could not load solved problems." body="The fixed-issue explanations failed to load." onRetry={props.solvedQ.refetch} />;
  const items = props.solvedQ.data ?? [];
  if (items.length === 0)
    return <EmptyState title="No linked fixes found" body="No issues here were closed with 'fixes #N' in a pull request, so Kodiset cannot link fixes in this project." />;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((s) => (
        <li key={s.prNumber}>
          <Card>
            <p className="font-mono text-[13px] text-[var(--kodiset-muted)]">Issue #{s.issueNumber} · PR #{s.prNumber}</p>
            <p className="mt-1 font-medium">{s.issueTitle}</p>
            <p className="mt-2 text-[15px] text-[var(--kodiset-muted)]">{s.explanation}</p>
            <p className="mt-3 text-sm">
              <a href={s.prUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">View pull request #{s.prNumber}</a>
              <span className="text-[var(--kodiset-muted)]"> by {s.author}</span>
            </p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Tab 3 ---------- */

function PeopleTab({ bundle }: { bundle: NonNullable<ReturnType<typeof useBundle>> }) {
  const max = Math.max(1, ...bundle.contributors.map((c) => c.commits));
  return (
    <div className="grid gap-4">
      <Card>
        <h2 className="font-display text-lg font-semibold">Contributors</h2>
        {bundle.contributors.length === 0 ? (
          <p className="mt-2 text-[15px] text-[var(--kodiset-muted)]">No contributor data returned.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bundle.contributors.map((c) => (
              <li key={c.login} className="flex items-center gap-3 rounded-[12px] border border-[var(--kodiset-border)] p-3">
                <img src={c.avatarUrl} alt="" width={36} height={36} className="h-9 w-9 rounded-full" loading="lazy" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[13.5px] font-medium">{c.login}</p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10" role="img" aria-label={`${c.commits} commits by ${c.login}`}>
                    <div className="h-full rounded-full bg-[#1B7A4D] dark:bg-[#4FD08F]" style={{ width: `${(c.commits / max) * 100}%` }} />
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--kodiset-muted)]">{c.commits} commits</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="font-display text-lg font-semibold">Recent commits</h2>
        {bundle.commits.length === 0 ? (
          <p className="mt-2 text-[15px] text-[var(--kodiset-muted)]">No commits returned.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--kodiset-border)]">
            {bundle.commits.map((c) => (
              <li key={c.sha} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-3">
                <span className="font-mono text-[13px] text-[#1B7A4D] dark:text-[#4FD08F]">{c.sha}</span>
                <span className="flex-1 text-[15px]">{c.message}</span>
                <span className="text-[13px] text-[var(--kodiset-muted)]">{c.author} · {new Date(c.date).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="font-display text-lg font-semibold">Branches</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {bundle.branches.map((b) => (
            <Badge key={b} tone="neutral"><span className="font-mono">{b}</span></Badge>
          ))}
        </div>
        <p className="mt-3 text-sm">
          <a href={`https://github.com/${bundle.owner}/${bundle.repo}/graphs/commit-activity`} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            View the commit graph on GitHub
          </a>
        </p>
      </Card>
    </div>
  );
}

// helper type only
function useBundle(): import('../lib/api').GithubBundle | null {
  return null;
}

/* ---------- Tab 4 ---------- */

function HelpAreasTab(props: {
  areasQ: { data?: { title: string; why: string; issueNumbers: number[] }[]; isPending: boolean; isError: boolean; refetch: () => void };
  hasKey: boolean;
  onOpenSettings: () => void;
  issues: Issue[];
  freeOnly: boolean;
  setFreeOnly: (v: boolean) => void;
}) {
  const byNum = new Map(props.issues.map((i) => [i.number, i]));
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-[15px]">
          <input type="checkbox" checked={props.freeOnly} onChange={(e) => props.setFreeOnly(e.target.checked)} className="h-4 w-4 accent-[#1B7A4D]" />
          Show only free issues
        </label>
      </div>
      {props.areasQ.isPending && props.hasKey && (
        <div className="grid gap-3 sm:grid-cols-2"><SkeletonCard /><SkeletonCard /></div>
      )}
      {!props.hasKey && <MissingKeyCard onOpenSettings={props.onOpenSettings} />}
      {props.hasKey && props.areasQ.isError && <ErrorCard title="Could not load help areas." body="Grouping failed to load." onRetry={props.areasQ.refetch} />}
      {props.hasKey && !props.areasQ.isPending && !props.areasQ.isError && (props.areasQ.data ?? []).length === 0 && (
        <EmptyState title="No help areas found" body="Not enough labelled issues to group into areas. Browse the open issues directly." />
      )}
      {(props.areasQ.data ?? []).map((a, i) => {
        const nums = a.issueNumbers.filter((n) => {
          const issue = byNum.get(n);
          if (!issue) return false;
          if (props.freeOnly && issue.status.kind !== 'free') return false;
          return true;
        });
        if (nums.length === 0 && props.freeOnly) return null;
        return (
          <Card key={i}>
            <h3 className="font-display text-lg font-semibold">{a.title}</h3>
            <p className="mt-1 text-[15px] text-[var(--kodiset-muted)]">{a.why}</p>
            <ul className="mt-3 grid gap-2">
              {nums.map((n) => {
                const issue = byNum.get(n);
                if (!issue) return null;
                return (
                  <li key={n} className="flex flex-wrap items-center gap-2 text-[15px]">
                    <a href={issue.url} target="_blank" rel="noreferrer" className="font-mono text-[13.5px] underline-offset-2 hover:underline">#{n}</a>
                    <span className="flex-1">{issue.title}</span>
                    <StatusPill status={issue.status} />
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

/* ---------- Tab 5 ---------- */

function RepoCheckTab({ bundle }: { bundle: import('../lib/api').GithubBundle }) {
  const tone = healthTone(bundle.repoHealth.verdict);
  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={tone === 'neutral' ? 'neutral' : tone === 'green' ? 'green' : tone === 'amber' ? 'amber' : 'red'} className="text-sm">
            {bundle.repoHealth.verdict}
          </Badge>
          <h2 className="font-display text-lg font-semibold">Is this project worth contributing to right now?</h2>
        </div>
        <p className="reading-width mt-2 text-[15px] text-[var(--kodiset-muted)]">
          {bundle.repoHealth.verdict === 'Active'
            ? 'Yes — it was pushed recently, so maintainers are likely around to review.'
            : bundle.repoHealth.verdict === 'Slow'
              ? 'Probably — it moves slowly, so expect review to take a while.'
              : bundle.repoHealth.verdict === 'Archived'
                ? 'No — it is archived and read-only. Pick another repository.'
                : bundle.repoHealth.verdict === 'Looks inactive'
                  ? 'Risky — it has been quiet for a long time. Confirm a maintainer is active before starting.'
                  : 'Unclear — there was not enough signal to judge.'}
        </p>
        <ul className="mt-4 divide-y divide-[var(--kodiset-border)]">
          {bundle.repoHealth.facts.map((f, i) => (
            <li key={i} className="flex items-start gap-2.5 py-2 text-[15px]">
              <span aria-hidden="true" className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-[#1B7A4D] dark:bg-[#4FD08F]" />
              {f}
            </li>
          ))}
          <li className="flex items-start gap-2.5 py-2 font-mono text-[13.5px]">
            <span aria-hidden="true" className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-[#1B7A4D] dark:bg-[#4FD08F]" />
            main language: {bundle.mainLanguage ?? 'unknown'} · {Object.keys(bundle.languages).length} languages detected
          </li>
        </ul>
      </Card>
    </div>
  );
}

/* ---------- small markdown renderer + icons ---------- */

function MarkdownLite({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="prose-plan reading-width mt-2 text-[15px]">
      {blocks.map((b, i) => {
        const t = b.trim();
        if (!t) return null;
        if (t.startsWith('```')) {
          return (
            <pre key={i}>
              <code>{t.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '')}</code>
            </pre>
          );
        }
        if (/^#{1,3}\s/.test(t)) {
          const level = t.match(/^#+/)![0].length;
          const content = t.replace(/^#+\s*/, '');
          if (level <= 2) return <h2 key={i}>{inline(content)}</h2>;
          return <h3 key={i}>{inline(content)}</h3>;
        }
        if (/^(\s*[-*]\s)/m.test(t)) {
          const items = t.split('\n').filter((l) => l.trim());
          return (
            <ul key={i}>
              {items.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-*]\s*/, ''))}</li>
              ))}
            </ul>
          );
        }
        if (/^\s*\d+\.\s/m.test(t)) {
          const items = t.split('\n').filter((l) => l.trim());
          return (
            <ol key={i}>
              {items.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*\d+\.\s*/, ''))}</li>
              ))}
            </ol>
          );
        }
        return <p key={i}>{inline(t)}</p>;
      })}
    </div>
  );
}

function inline(s: string): React.ReactNode {
  const parts = s.split(/(`[^`]+`)/g);
  return parts.map((p, i) =>
    p.startsWith('`') && p.endsWith('`') ? <code key={i}>{p.slice(1, -1)}</code> : <span key={i}>{p}</span>,
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="none">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="m5.5 8.2 1.8 1.8 3.2-3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="none">
      <path d="M8 1.8 15 14H1L8 1.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6v3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.6" r="0.9" fill="currentColor" />
    </svg>
  );
}
