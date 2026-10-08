import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Level, Profile } from '../lib/types';
import {
  HOURS_STEP,
  INTERESTS_STEP,
  LANGUAGE_PICK_STEP,
  PART_A_STEPS,
  SKIP_PROFILE,
  collabBand,
  getSnippet,
  gitBand,
  l1Step,
  l2Step,
  l3Step,
  languageBand,
  languageDisplay,
  languageKey,
  LEVEL_LABEL,
  validateGraderOutput,
  type GraderResult,
  type LevelStep,
} from '../lib/levelCheck';
import { gradeL3 } from '../lib/api';
import { Badge, Button, Card, LevelMeter } from './ui';
import NetworkCanvas from './NetworkCanvas';

interface Props {
  geminiKey: string;
  onComplete: (p: Profile) => void;
  onOpenSettings: () => void;
  onCancel: () => void;
}

type Answers = Record<string, number | number[] | string[]>;

export default function LevelCheck({ geminiKey, onComplete, onOpenSettings, onCancel }: Props) {
  const [answers, setAnswers] = useState<Answers>({});
  const [l3Text, setL3Text] = useState<Record<string, string>>({});
  const [l3Grades, setL3Grades] = useState<Record<string, GraderResult>>({});
  const [l3Grading, setL3Grading] = useState<Record<string, boolean>>({});
  const [l3Error, setL3Error] = useState<Record<string, string>>({});
  const [l3Skipped, setL3Skipped] = useState<Record<string, boolean>>({});
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);

  const pickedLangs: string[] = useMemo(() => {
    const raw = answers['LANG_PICK'];
    if (!Array.isArray(raw)) return [];
    return (raw as string[]).slice(0, 2).map(languageKey);
  }, [answers]);

  const steps: LevelStep[] = useMemo(() => {
    const list: LevelStep[] = [...PART_A_STEPS, LANGUAGE_PICK_STEP];
    for (const lang of pickedLangs) {
      list.push(l1Step(lang), l2Step(lang), l3Step(lang));
    }
    list.push(HOURS_STEP, INTERESTS_STEP);
    return list;
  }, [pickedLangs]);

  const step = steps[Math.min(index, steps.length - 1)];
  const total = steps.length;

  const canContinue = useCallback((): boolean => {
    if (!step) return false;
    if (step.kind === 'code-grade' && step.language) {
      return Boolean(l3Grades[step.language] || l3Skipped[step.language]);
    }
    const a = answers[step.id];
    if (step.kind === 'single' || step.kind === 'hours') return typeof a === 'number';
    if (step.kind === 'multi-max') return Array.isArray(a);
    if (step.kind === 'language-pick') return Array.isArray(a) && (a as string[]).length > 0;
    if (step.kind === 'interests') return true;
    return false;
  }, [answers, l3Grades, l3Skipped, step]);

  const goNext = useCallback(() => {
    if (index >= total - 1) {
      setFinished(true);
    } else {
      setIndex((i) => Math.min(i + 1, total - 1));
    }
  }, [index, total]);

  const goBack = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  // keyboard support
  useEffect(() => {
    if (finished) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (e.key >= '1' && e.key <= '4' && step && (step.kind === 'single' || step.kind === 'hours')) {
        const idx = Number(e.key) - 1;
        const opts = step.options as { label: string; points: number }[];
        if (opts[idx]) {
          setAnswers((a) => ({ ...a, [step.id]: opts[idx].points, [`${step.id}:idx`]: idx }));
        }
      } else if (e.key === 'Enter' && canContinue()) {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowRight' && canContinue()) {
        goNext();
      } else if (e.key === 'ArrowLeft') {
        goBack();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [finished, step, canContinue, goNext, goBack]);

  const buildProfile = useCallback((): Profile => {
    const g1 = (answers['G1'] as number) ?? 0;
    const g2 = (answers['G2'] as number) ?? 0;
    const c1 = (answers['C1'] as number) ?? 0;
    const c2arr = (answers['C2'] as number[]) ?? [];
    const git = gitBand(g1 + g2);
    const collab = collabBand(c1 + Math.min(c2arr.length, 3));
    const languages: Record<string, Level> = {};
    for (const lang of pickedLangs) {
      const l1 = (answers[`L1:${lang}`] as number) ?? 0;
      const l2arr = (answers[`L2:${lang}`] as number[]) ?? [];
      const l3 = l3Skipped[lang] ? 0 : l3Grades[lang]?.score ?? 0;
      languages[lang] = languageBand(l1 + Math.min(l2arr.length, 4) + l3);
    }
    const hoursIdx = (answers['T1'] as number) ?? 1;
    const hours: Profile['hours'] = hoursIdx === 0 ? '<2' : hoursIdx === 2 ? '5+' : '2-5';
    const interests = ((answers['T2'] as number[]) ?? []).map((i) => {
      const opts = INTERESTS_STEP.options as string[];
      return opts[i]?.toLowerCase() ?? '';
    }).filter(Boolean);
    return { git, collab, languages, hours, interests };
  }, [answers, pickedLangs, l3Grades, l3Skipped]);

  const profile = useMemo(() => (finished ? buildProfile() : null), [finished, buildProfile]);

  const doGrade = async (lang: string) => {
    const text = (l3Text[lang] ?? '').trim();
    if (!geminiKey) {
      setL3Error((e) => ({ ...e, [lang]: 'Add your Gemini API key in Settings to grade this answer, or skip the question.' }));
      return;
    }
    if (!text) {
      setL3Error((e) => ({ ...e, [lang]: 'Write a sentence or two first, or use Skip this question.' }));
      return;
    }
    setL3Grading((g) => ({ ...g, [lang]: true }));
    setL3Error((e) => ({ ...e, [lang]: '' }));
    try {
      const r = await gradeL3(text, lang, geminiKey);
      const v = validateGraderOutput(JSON.stringify(r)) ?? r;
      setL3Grades((g) => ({ ...g, [lang]: v }));
    } catch (err) {
      setL3Error((e) => ({ ...e, [lang]: err instanceof Error ? err.message : 'Grading failed. Try again or skip.' }));
    } finally {
      setL3Grading((g) => ({ ...g, [lang]: false }));
    }
  };

  if (finished && profile) {
    return <ProfileResult profile={profile} onRetake={() => { setFinished(false); setIndex(0); }} onContinue={() => onComplete(profile)} />;
  }

  if (!step) return null;

  return (
    <div className="relative overflow-hidden border-b border-[var(--kodiset-border)] bg-[#F5F7F6] dark:bg-[#0d1a14]">
      <div className="absolute inset-0" aria-hidden="true">
        <NetworkCanvas dimmed />
      </div>
      <div className="relative mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="flex items-center justify-between text-sm text-[var(--kodiset-muted)]">
          <span className="font-medium">{step.group}</span>
          <span aria-live="polite">
            Step {index + 1} of {total}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10" role="progressbar" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={total} aria-label="Level check progress">
          <div className="h-full rounded-full bg-[#1B7A4D] dark:bg-[#4FD08F]" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>

        <Card className="mt-4">
          <h2 className="font-display text-xl font-semibold">{step.question}</h2>
          {step.sub && <p className="mt-1 text-[15px] text-[var(--kodiset-muted)]">{step.sub}</p>}

          <div className="mt-5">
            <StepBody
              step={step}
              answers={answers}
              setAnswers={setAnswers}
              l3Text={l3Text}
              setL3Text={setL3Text}
              l3Grades={l3Grades}
              l3Grading={l3Grading}
              l3Error={l3Error}
              l3Skipped={l3Skipped}
              setL3Skipped={setL3Skipped}
              geminiKey={geminiKey}
              onGrade={doGrade}
              onOpenSettings={onOpenSettings}
            />
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <Button variant="secondary" size="sm" onClick={goBack} disabled={index === 0}>
              Back
            </Button>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => onComplete({ ...SKIP_PROFILE })} className="text-sm text-[var(--kodiset-muted)] underline underline-offset-2">
                Skip for now
              </button>
              <Button size="sm" onClick={goNext} disabled={!canContinue()}>
                {index >= total - 1 ? 'See my profile' : 'Continue'}
              </Button>
            </div>
          </div>
          <p className="mt-3 text-[13px] text-[var(--kodiset-muted)]">
            Keys 1 to 4 pick an option. Enter continues. Left and right arrows go back and forward.
          </p>
          <button type="button" onClick={onCancel} className="mt-1 text-[13px] text-[var(--kodiset-muted)] underline underline-offset-2">
            Cancel level check
          </button>
        </Card>
      </div>
    </div>
  );
}

/* ---------- per-step bodies ---------- */

function StepBody(props: {
  step: LevelStep;
  answers: Answers;
  setAnswers: React.Dispatch<React.SetStateAction<Answers>>;
  l3Text: Record<string, string>;
  setL3Text: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  l3Grades: Record<string, GraderResult>;
  l3Grading: Record<string, boolean>;
  l3Error: Record<string, string>;
  l3Skipped: Record<string, boolean>;
  setL3Skipped: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  geminiKey: string;
  onGrade: (lang: string) => void;
  onOpenSettings: () => void;
}) {
  const { step, answers, setAnswers } = props;

  if (step.kind === 'single' || step.kind === 'hours') {
    const opts = step.options as { label: string; points: number }[];
    return (
      <div role="radiogroup" aria-label={step.question} className="grid gap-2.5">
        {opts.map((o, i) => {
          const isActive = selectedIndex(step, answers) === i;
          return (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setAnswers((a) => ({ ...a, [step.id]: o.points, [`${step.id}:idx`]: i }))}
              className={`quiet-transition rounded-[12px] border p-4 text-left text-[15px] ${
                isActive
                  ? 'border-[#1B7A4D] bg-[#1B7A4D]/5 dark:border-[#4FD08F]'
                  : 'border-[var(--kodiset-border)] hover:border-[#1B7A4D] dark:hover:border-[#4FD08F]'
              }`}
            >
              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-md bg-black/5 font-mono text-xs dark:bg-white/10" aria-hidden="true">
                {i + 1}
              </span>
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (step.kind === 'multi-max') {
    const opts = step.options as { label: string }[];
    const sel = (answers[step.id] as number[]) ?? [];
    return (
      <div className="grid gap-2.5">
        {opts.map((o, i) => {
          const on = sel.includes(i);
          return (
            <button
              key={o.label}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() =>
                setAnswers((a) => {
                  const cur = ((a[step.id] as number[]) ?? []).slice();
                  const at = cur.indexOf(i);
                  if (at >= 0) cur.splice(at, 1);
                  else cur.push(i);
                  return { ...a, [step.id]: cur };
                })
              }
              className={`quiet-transition flex items-center gap-3 rounded-[12px] border p-4 text-left text-[15px] ${
                on ? 'border-[#1B7A4D] bg-[#1B7A4D]/5 dark:border-[#4FD08F]' : 'border-[var(--kodiset-border)] hover:border-[#1B7A4D]'
              }`}
            >
              <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded-md border ${on ? 'border-[#1B7A4D] bg-[#1B7A4D] text-white dark:bg-[#4FD08F] dark:text-[#10231B]' : 'border-[var(--kodiset-border)]'}`}>
                {on ? '✓' : ''}
              </span>
              {o.label}
            </button>
          );
        })}
        <p className="text-[13px] text-[var(--kodiset-muted)]">Each is worth 1 point, up to {step.maxPoints}.</p>
      </div>
    );
  }

  if (step.kind === 'language-pick') {
    const opts = LANGUAGE_PICK_STEP.options as unknown as string[];
    const sel = (answers['LANG_PICK'] as string[]) ?? [];
    return (
      <div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={step.question}>
          {opts.map((lang) => {
            const on = sel.includes(lang);
            return (
              <button
                key={lang}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setAnswers((a) => {
                    const cur = ((a['LANG_PICK'] as string[]) ?? []).slice();
                    const at = cur.indexOf(lang);
                    if (at >= 0) cur.splice(at, 1);
                    else cur.push(lang);
                    return { ...a, ['LANG_PICK']: cur };
                  })
                }
                className={`quiet-transition rounded-full border px-4 py-2 text-[15px] ${
                  on ? 'border-[#1B7A4D] bg-[#1B7A4D] text-white dark:bg-[#4FD08F] dark:text-[#10231B]' : 'border-[var(--kodiset-border)]'
                }`}
              >
                {lang}
              </button>
            );
          })}
        </div>
        {sel.length > 2 && (
          <p role="alert" className="mt-2 text-sm text-[#B7791F]">
            Pick your top 2. Only the first 2 will be used.
          </p>
        )}
      </div>
    );
  }

  if (step.kind === 'interests') {
    const opts = INTERESTS_STEP.options as string[];
    const sel = (answers['T2'] as number[]) ?? [];
    return (
      <div className="flex flex-wrap gap-2" role="group" aria-label={step.question}>
        {opts.map((label, i) => {
          const on = sel.includes(i);
          return (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setAnswers((a) => {
                  const cur = ((a['T2'] as number[]) ?? []).slice();
                  const at = cur.indexOf(i);
                  if (at >= 0) cur.splice(at, 1);
                  else cur.push(i);
                  return { ...a, ['T2']: cur };
                })
              }
              className={`quiet-transition rounded-full border px-4 py-2 text-[15px] ${
                on ? 'border-[#1B7A4D] bg-[#1B7A4D] text-white dark:bg-[#4FD08F] dark:text-[#10231B]' : 'border-[var(--kodiset-border)]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  if (step.kind === 'code-grade' && step.language) {
    const lang = step.language;
    const snippet = getSnippet(lang);
    const grade = props.l3Grades[lang];
    const grading = props.l3Grading[lang];
    const err = props.l3Error[lang];
    const skipped = props.l3Skipped[lang];
    return (
      <div>
        <div className="overflow-x-auto rounded-[12px] bg-[#10231B] p-4">
          <p className="mb-2 font-mono text-xs text-[#8FA89A]">{snippet.fileName}</p>
          <pre className="font-mono text-[13.5px] leading-relaxed text-[#E8F1EA]">
            <code>{snippet.code}</code>
          </pre>
        </div>
        <label htmlFor={`l3-${lang}`} className="mt-4 block text-sm font-medium">
          What is wrong with this code, and how would you fix it?
        </label>
        <textarea
          id={`l3-${lang}`}
          rows={4}
          value={props.l3Text[lang] ?? ''}
          onChange={(e) => props.setL3Text((t) => ({ ...t, [lang]: e.target.value }))}
          disabled={Boolean(grade) || skipped}
          placeholder="Example: it crashes when the list is empty because… I would fix it by…"
          className="mt-1.5 w-full rounded-[10px] border border-[var(--kodiset-border)] bg-transparent p-3 text-[15px] disabled:opacity-60"
        />
        {err && (
          <p role="alert" className="mt-2 text-sm text-[#B42318] dark:text-[#F08A80]">
            {err}{' '}
            {!props.geminiKey && (
              <button type="button" onClick={props.onOpenSettings} className="underline underline-offset-2">
                Open settings
              </button>
            )}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {!grade && !skipped && (
            <Button size="sm" onClick={() => props.onGrade(lang)} disabled={grading}>
              {grading ? (
                <>
                  <span aria-hidden="true" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Grading…
                </>
              ) : (
                'Grade my answer'
              )}
            </Button>
          )}
          {!grade && !skipped && (
            <button
              type="button"
              onClick={() => props.setL3Skipped((s) => ({ ...s, [lang]: true }))}
              className="text-sm text-[var(--kodiset-muted)] underline underline-offset-2"
            >
              Skip this question
            </button>
          )}
          {grade && (
            <span className="inline-flex items-center gap-2 rounded-full border border-[#1B7A4D]/40 bg-[#1B7A4D]/10 px-3 py-1.5 text-sm" role="status">
              Score {grade.score} of 3 — {grade.reason}
            </span>
          )}
          {skipped && (
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--kodiset-border)] px-3 py-1.5 text-sm text-[var(--kodiset-muted)]" role="status">
              Skipped — scored 0
            </span>
          )}
        </div>
      </div>
    );
  }

  return null;
}

function selectedIndex(step: LevelStep, answers: Answers): number {
  const idx = answers[`${step.id}:idx`];
  return typeof idx === 'number' ? idx : -1;
}

/* ---------- result ---------- */

function ProfileResult({ profile, onRetake, onContinue }: { profile: Profile; onRetake: () => void; onContinue: () => void }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Card>
        <h2 className="font-display text-2xl font-bold">Your profile</h2>
        <div className="mt-4 grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">Git <Badge tone="mint" className="ml-1">L{profile.git} {LEVEL_LABEL[profile.git]}</Badge></p>
              <div className="mt-1.5"><LevelMeter level={profile.git} label={`Git level ${profile.git} of 5`} /></div>
            </div>
            <div>
              <p className="font-medium">Teamwork <Badge tone="mint" className="ml-1">L{profile.collab} {LEVEL_LABEL[profile.collab]}</Badge></p>
              <div className="mt-1.5"><LevelMeter level={profile.collab} label={`Teamwork level ${profile.collab} of 5`} /></div>
            </div>
          </div>
          <div>
            {Object.entries(profile.languages).length === 0 ? (
              <p className="text-[15px] text-[var(--kodiset-muted)]">No languages rated. Retake and pick up to 2 languages.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {Object.entries(profile.languages).map(([k, v]) => (
                  <Badge key={k} tone="green">L{v} {languageDisplay(k)} · {LEVEL_LABEL[v]}</Badge>
                ))}
              </div>
            )}
          </div>
          <p className="text-[15px] text-[var(--kodiset-muted)]">
            {profile.hours} hours per week · {profile.interests.join(', ') || 'no interests picked'}
          </p>
          <p className="rounded-[10px] bg-black/5 p-3 text-[14px] text-[var(--kodiset-muted)] dark:bg-white/5">
            This is self-reported, except for the bug question. It only tunes how Kodiset explains things and which issues it
            suggests.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={onRetake}>Retake</Button>
            <Button onClick={onContinue}>Looks right, continue</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
