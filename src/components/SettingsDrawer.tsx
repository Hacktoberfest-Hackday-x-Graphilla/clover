import { useEffect, useState } from 'react';
import type { Profile } from '../lib/types';
import { languageDisplay, LEVEL_LABEL } from '../lib/levelCheck';
import { Button, Field } from './ui';

export default function SettingsDrawer({
  open,
  onClose,
  geminiKey,
  githubToken,
  profile,
  onSave,
  onRetake,
}: {
  open: boolean;
  onClose: () => void;
  geminiKey: string;
  githubToken: string;
  profile: Profile | null;
  onSave: (geminiKey: string, githubToken: string) => void;
  onRetake: () => void;
}) {
  const [g, setG] = useState(geminiKey);
  const [t, setT] = useState(githubToken);
  const [showG, setShowG] = useState(false);
  const [showT, setShowT] = useState(false);

  useEffect(() => {
    if (open) {
      setG(geminiKey);
      setT(githubToken);
    }
  }, [open, geminiKey, githubToken]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Settings" className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-[var(--kodiset-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--kodiset-border)] p-5">
          <h2 className="font-display text-lg font-semibold">Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="quiet-transition rounded-lg border border-[var(--kodiset-border)] px-3 py-1.5 text-sm"
          >
            Close
          </button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <Field
            label="Gemini API key"
            hint="Used only in your browser session. Never saved to a server."
          >
            <div className="flex gap-2">
              <input
                type={showG ? 'text' : 'password'}
                value={g}
                onChange={(e) => setG(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="AIza…"
                className="h-11 flex-1 rounded-[10px] border border-[var(--kodiset-border)] bg-transparent px-3 font-mono text-sm"
              />
              <Button variant="secondary" size="sm" onClick={() => setShowG((v) => !v)} aria-pressed={showG}>
                {showG ? 'Hide' : 'Show'}
              </Button>
            </div>
          </Field>

          <Field
            label="GitHub token (optional)"
            hint="Optional. Raises the GitHub limit from about 60 to 5,000 requests per hour. One analysis uses about 12 to 14 requests."
          >
            <div className="flex gap-2">
              <input
                type={showT ? 'text' : 'password'}
                value={t}
                onChange={(e) => setT(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="ghp_…"
                className="h-11 flex-1 rounded-[10px] border border-[var(--kodiset-border)] bg-transparent px-3 font-mono text-sm"
              />
              <Button variant="secondary" size="sm" onClick={() => setShowT((v) => !v)} aria-pressed={showT}>
                {showT ? 'Hide' : 'Show'}
              </Button>
            </div>
          </Field>

          <div className="rounded-[14px] border border-[var(--kodiset-border)] p-4">
            <h3 className="font-display text-[15px] font-semibold">Your level profile</h3>
            {profile ? (
              <div className="mt-2 text-sm text-[var(--kodiset-muted)]">
                <p>
                  Git L{profile.git} · Collab L{profile.collab}
                </p>
                <p className="mt-1">
                  {Object.entries(profile.languages).length === 0
                    ? 'No languages rated yet.'
                    : Object.entries(profile.languages)
                        .map(([k, v]) => `${languageDisplay(k)} L${v} ${LEVEL_LABEL[v]}`)
                        .join(' · ')}
                </p>
                <p className="mt-1">
                  {profile.hours} hrs/week · {profile.interests.join(', ') || 'no interests picked'}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-[var(--kodiset-muted)]">No profile saved yet. Take the level check to tune suggestions.</p>
            )}
            <Button variant="secondary" size="sm" className="mt-3" onClick={onRetake}>
              Retake level check
            </Button>
          </div>
        </div>
        <div className="border-t border-[var(--kodiset-border)] p-5">
          <Button
            className="w-full"
            onClick={() => {
              onSave(g.trim(), t.trim());
              onClose();
            }}
          >
            Save
          </Button>
          <p className="mt-2 text-center text-[13px] text-[var(--kodiset-muted)]">
            Keys stay in memory and this tab only. Only the level profile is kept in local storage.
          </p>
        </div>
      </aside>
    </div>
  );
}
