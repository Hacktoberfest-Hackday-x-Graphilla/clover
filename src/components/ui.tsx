import React from 'react';
import type { IssueStatus } from '../lib/types';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg' }) {
  const base =
    'quiet-transition inline-flex items-center justify-center gap-2 rounded-[10px] font-medium disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-[15px]', lg: 'px-6 py-3.5 text-base' };
  const variants = {
    primary: 'bg-[#1B7A4D] text-white hover:bg-[#16663F] dark:bg-[#4FD08F] dark:text-[#10231B] dark:hover:bg-[#6bdfa3]',
    secondary: 'bg-transparent border border-[#D5E0D8] dark:border-[#24402F] hover:border-[#1B7A4D] dark:hover:border-[#4FD08F]',
    ghost: 'bg-transparent hover:bg-black/5 dark:hover:bg-white/10 px-2',
    danger: 'bg-transparent border border-[#B42318] text-[#B42318] hover:bg-[#B42318] hover:text-white',
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`card-surface p-5 sm:p-6 ${className}`}>{children}</div>;
}

export function Badge({ children, tone = 'neutral', className = '' }: { children: React.ReactNode; tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'mint'; className?: string }) {
  const tones: Record<string, string> = {
    neutral: 'bg-black/5 text-inherit border-[#D5E0D8] dark:bg-white/10 dark:border-[#24402F]',
    green: 'bg-[#1B7A4D]/10 text-[#16663F] border-[#1B7A4D]/30 dark:text-[#4FD08F]',
    amber: 'bg-[#B7791F]/10 text-[#7A5410] border-[#B7791F]/40 dark:text-[#E8B84B]',
    red: 'bg-[#B42318]/10 text-[#B42318] border-[#B42318]/30 dark:text-[#F08A80]',
    blue: 'bg-[#3d5a73]/10 text-[#3d5a73] border-[#3d5a73]/30 dark:text-[#9DB8CC]',
    mint: 'bg-[#10231B] text-[#4FD08F] border-[#1B7A4D] dark:bg-[#4FD08F] dark:text-[#10231B]',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: IssueStatus }) {
  if (status.kind === 'free')
    return (
      <Badge tone="green">
        <Dot tone="#1B7A4D" /> Free
      </Badge>
    );
  if (status.kind === 'assigned')
    return (
      <Badge tone="amber">
        <Dot tone="#B7791F" /> Assigned to {status.to}
      </Badge>
    );
  return (
    <Badge tone="blue">
      <Dot tone="#3d5a73" /> Open pull request #{status.number} targets it
    </Badge>
  );
}

function Dot({ tone }: { tone: string }) {
  return <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: tone }} />;
}

export function LevelMeter({ level, label }: { level: number; label?: string }) {
  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={label ?? `Level ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="h-1.5 w-6 rounded-full"
          style={{ background: i <= level ? '#1B7A4D' : 'var(--kodiset-border)' }}
        />
      ))}
    </div>
  );
}

export function DifficultyDots({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`Difficulty ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="inline-block h-2 w-2 rounded-full border"
          style={{
            background: i <= level ? '#1B7A4D' : 'transparent',
            borderColor: '#1B7A4D',
            opacity: i <= level ? 1 : 0.4,
          }}
        />
      ))}
    </span>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-black/10 dark:bg-white/10 ${className}`} />;
}

export function SkeletonCard() {
  return (
    <Card>
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-5/6" />
      <Skeleton className="mt-4 h-9 w-32" />
    </Card>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="card-surface p-8 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-[52ch] text-[15px] text-[var(--kodiset-muted)]">{body}</p>
    </div>
  );
}

export function ErrorCard({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  return (
    <div className="rounded-[14px] border border-[#B42318]/40 bg-[#B42318]/5 p-5" role="alert">
      <p className="font-display font-semibold text-[#B42318] dark:text-[#F08A80]">{title}</p>
      <p className="mt-1 text-[15px] text-[var(--kodiset-muted)]">{body}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Retry this section
        </Button>
      )}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[13px] leading-snug text-[var(--kodiset-muted)]">{hint}</span>}
    </label>
  );
}
