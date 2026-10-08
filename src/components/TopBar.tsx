import { Button } from './ui';

export default function TopBar({
  dark,
  onToggleDark,
  onOpenSettings,
}: {
  dark: boolean;
  onToggleDark: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--kodiset-border)] bg-[var(--kodiset-page)]/95 backdrop-blur">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <a href="#" className="font-display text-xl font-bold tracking-tight" aria-label="Kodiset home">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#10231B] font-mono text-sm font-bold text-[#4FD08F]">
              K
            </span>
            Kodiset
          </span>
        </a>
        <nav className="ml-4 hidden items-center gap-5 text-[15px] sm:flex" aria-label="Primary">
          <a href="#how" className="quiet-transition text-[var(--kodiset-muted)] hover:text-[var(--kodiset-text)]">
            How it works
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="quiet-transition text-[var(--kodiset-muted)] hover:text-[var(--kodiset-text)]"
          >
            GitHub
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleDark}
            aria-pressed={dark}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="quiet-transition inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[var(--kodiset-border)]"
          >
            {dark ? (
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.6" />
                <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M3.9 3.9l1.4 1.4M14.7 14.7l1.4 1.4M16.1 3.9l-1.4 1.4M5.3 14.7l-1.4 1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M16.5 12.5A7 7 0 1 1 7.5 3.5a5.5 5.5 0 0 0 9 9Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          <Button variant="secondary" size="sm" onClick={onOpenSettings}>
            Settings
          </Button>
        </div>
      </div>
    </header>
  );
}
