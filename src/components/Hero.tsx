import { useState } from 'react';
import NetworkCanvas from './NetworkCanvas';
import { Button } from './ui';

const EXAMPLES = ['https://github.com/python/cpython', 'https://github.com/facebook/react', 'https://github.com/microsoft/vscode'];

export default function Hero({
  repoInput,
  setRepoInput,
  onAnalyze,
  analyzing,
  dark,
}: {
  repoInput: string;
  setRepoInput: (v: string) => void;
  onAnalyze: () => void;
  analyzing: boolean;
  dark: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!/^https?:\/\/github\.com\/[^/]+\/[^/]+/i.test(repoInput.trim())) {
      setError('Paste a GitHub repository link, like https://github.com/owner/repo.');
      return;
    }
    setError(null);
    onAnalyze();
  };

  return (
    <section className="relative overflow-hidden bg-[#10231B] text-[#E8F1EA]">
      <NetworkCanvas dark={dark ? true : true} />
      <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
        <p className="font-mono text-[13px] text-[#4FD08F]">First open-source contribution, planned</p>
        <h1 className="mt-3 max-w-[20ch] text-4xl font-bold leading-[1.05] sm:text-6xl">Contribute with a plan.</h1>
        <p className="reading-width mt-4 max-w-[58ch] text-lg text-[#C6D6CB]">
          Paste a repository. Get one clear first contribution, matched to your level.
        </p>

        <form onSubmit={submit} className="mt-8 max-w-2xl" noValidate>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor="repo-input" className="sr-only">
              GitHub repository URL
            </label>
            <input
              id="repo-input"
              type="url"
              inputMode="url"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="https://github.com/owner/repo"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'repo-error' : undefined}
              className="h-14 flex-1 rounded-[12px] border border-white/15 bg-white/5 px-4 font-mono text-[15px] text-white placeholder:text-[#8FA89A] focus:border-[#4FD08F] focus:outline-none"
            />
            <Button type="submit" size="lg" disabled={analyzing} className="shrink-0">
              {analyzing ? 'Analyzing…' : 'Analyze repository'}
            </Button>
          </div>
          {error && (
            <p id="repo-error" role="alert" className="mt-2 text-sm text-[#F08A80]">
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[#8FA89A]">Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setRepoInput(ex)}
                className="quiet-transition rounded-full border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-[13px] text-[#C6D6CB] hover:border-[#4FD08F] hover:text-white"
              >
                {ex.replace('https://github.com/', '')}
              </button>
            ))}
          </div>
        </form>
      </div>
    </section>
  );
}

export function StepsStrip() {
  const steps = ['Paste a repo', 'Take the short level check', 'Get your plan', 'Ask for the issue'];
  return (
    <section id="how" aria-label="How it works" className="border-b border-[var(--kodiset-border)]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s} className="card-surface flex items-center gap-3 p-4">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1B7A4D]/10 font-display text-sm font-semibold text-[#1B7A4D] dark:text-[#4FD08F]"
              >
                {i + 1}
              </span>
              <span className="text-[15px] font-medium">{s}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function WhyBand() {
  return (
    <section aria-label="Why this exists" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h2 className="font-display text-2xl font-bold">Why this exists</h2>
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card-surface p-6">
          <h3 className="font-display text-lg font-semibold">Starting is hard</h3>
          <p className="reading-width mt-2 text-[15px] text-[var(--kodiset-muted)]">
            No idea where to begin. Issues that are already taken. Projects that stopped responding years ago. Contribution rules
            buried in a file you never find. Kodiset checks all of that before it suggests anything.
          </p>
        </div>
        <div className="card-surface p-6">
          <h3 className="font-display text-lg font-semibold">Understand what you ship</h3>
          <p className="reading-width mt-2 text-[15px] text-[var(--kodiset-muted)]">
            Many new developers rely on AI for code and skip the reasoning. Maintainers can tell. Kodiset explains the why behind
            each step, so your contribution is yours and you can defend it in review.
          </p>
        </div>
      </div>
    </section>
  );
}
