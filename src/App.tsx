import { useCallback, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TopBar from './components/TopBar';
import Hero, { StepsStrip, WhyBand } from './components/Hero';
import SettingsDrawer from './components/SettingsDrawer';
import LevelCheck from './components/LevelCheck';
import ResultsView from './components/ResultsView';
import NetworkCanvas from './components/NetworkCanvas';
import type { Profile } from './lib/types';
import { loadProfile, loadSessionSettings, saveProfile, saveSessionSettings } from './lib/settings';
import { parseRepoUrl } from './lib/api';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

type Phase = 'landing' | 'levelcheck' | 'results';

export default function App() {
  const [dark, setDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(loadSessionSettings);
  const [profile, setProfile] = useState<Profile | null>(() => loadProfile());
  const [phase, setPhase] = useState<Phase>('landing');
  const [repoInput, setRepoInput] = useState('');
  const [target, setTarget] = useState<{ owner: string; repo: string } | null>(null);
  const [pendingAnalysis, setPendingAnalysis] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const startAnalysis = useCallback(() => {
    let parsed;
    try {
      parsed = parseRepoUrl(repoInput);
    } catch {
      return;
    }
    if (!profile) {
      setPendingAnalysis(true);
      setTarget(parsed);
      setPhase('levelcheck');
    } else {
      setTarget(parsed);
      setPhase('results');
    }
  }, [repoInput, profile]);

  const handleLevelComplete = useCallback(
    (p: Profile) => {
      const withLangs = Object.keys(p.languages).length === 0 ? { ...p } : p;
      setProfile(withLangs);
      saveProfile(withLangs);
      if (pendingAnalysis || target) {
        setPendingAnalysis(false);
        setPhase('results');
      } else {
        setPhase('landing');
      }
    },
    [pendingAnalysis, target],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen">
        <TopBar dark={dark} onToggleDark={() => setDark((d) => !d)} onOpenSettings={() => setSettingsOpen(true)} />
        <main id="main">
          {phase === 'results' && target && profile ? (
            <ResultsView
              owner={target.owner}
              repo={target.repo}
              profile={profile}
              geminiKey={settings.geminiKey}
              githubToken={settings.githubToken}
              onNewAnalysis={() => setPhase('landing')}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          ) : phase === 'levelcheck' ? (
            <LevelCheck
              geminiKey={settings.geminiKey}
              onComplete={handleLevelComplete}
              onOpenSettings={() => setSettingsOpen(true)}
              onCancel={() => {
                setPendingAnalysis(false);
                setPhase('landing');
              }}
            />
          ) : (
            <>
              <Hero repoInput={repoInput} setRepoInput={setRepoInput} onAnalyze={startAnalysis} analyzing={false} dark={dark} />
              <StepsStrip />
              <LevelCheckTeaser
                hasProfile={Boolean(profile)}
                onStart={() => setPhase('levelcheck')}
                profile={profile}
              />
              <WhyBand />
            </>
          )}
        </main>
        <footer className="border-t border-[var(--kodiset-border)]">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-sm text-[var(--kodiset-muted)] sm:flex-row sm:items-center sm:px-6">
            <span>Kodiset by Team Clover</span>
            <a href="https://github.com" target="_blank" rel="noreferrer" className="underline underline-offset-2 sm:ml-4">
              GitHub repository
            </a>
            <span className="sm:ml-auto">Gemma can be wrong. Always read the real code.</span>
          </div>
        </footer>
        <SettingsDrawer
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          geminiKey={settings.geminiKey}
          githubToken={settings.githubToken}
          profile={profile}
          onSave={(geminiKey, githubToken) => {
            const next = { geminiKey, githubToken };
            setSettings(next);
            saveSessionSettings(next);
          }}
          onRetake={() => {
            setSettingsOpen(false);
            setPhase('levelcheck');
          }}
        />
      </div>
    </QueryClientProvider>
  );
}

function LevelCheckTeaser({ hasProfile, onStart, profile }: { hasProfile: boolean; onStart: () => void; profile: Profile | null }) {
  return (
    <section aria-label="Level check" className="relative overflow-hidden border-y border-[var(--kodiset-border)]">
      <div className="absolute inset-0" aria-hidden="true">
        <NetworkCanvas dimmed />
      </div>
      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="card-surface max-w-2xl p-6">
          <h2 className="font-display text-xl font-bold">Check your level first</h2>
          <p className="reading-width mt-2 text-[15px] text-[var(--kodiset-muted)]">
            {hasProfile && profile
              ? `Saved: Git L${profile.git}, teamwork L${profile.collab}. Kodiset uses this to explain at the right depth and to filter issues.`
              : 'Nine quick questions about Git, languages, and time. Kodiset uses your answers to explain at the right depth and to filter issues.'}
          </p>
          <button
            onClick={onStart}
            className="quiet-transition mt-4 inline-flex items-center rounded-[10px] bg-[#1B7A4D] px-5 py-2.5 text-[15px] font-medium text-white hover:bg-[#16663F] dark:bg-[#4FD08F] dark:text-[#10231B]"
          >
            {hasProfile ? 'Retake the level check' : 'Take the 2-minute level check'}
          </button>
        </div>
      </div>
    </section>
  );
}
