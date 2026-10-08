export interface StoredSettings {
  geminiKey: string;
  githubToken: string;
}

const MEM: StoredSettings = { geminiKey: '', githubToken: '' };

export function loadSessionSettings(): StoredSettings {
  try {
    const g = sessionStorage.getItem('kodiset.geminiKey') ?? '';
    const t = sessionStorage.getItem('kodiset.githubToken') ?? '';
    if (g) MEM.geminiKey = g;
    if (t) MEM.githubToken = t;
  } catch {
    /* storage unavailable */
  }
  return { ...MEM };
}

export function saveSessionSettings(s: StoredSettings): void {
  MEM.geminiKey = s.geminiKey;
  MEM.githubToken = s.githubToken;
  try {
    if (s.geminiKey) sessionStorage.setItem('kodiset.geminiKey', s.geminiKey);
    else sessionStorage.removeItem('kodiset.geminiKey');
    if (s.githubToken) sessionStorage.setItem('kodiset.githubToken', s.githubToken);
    else sessionStorage.removeItem('kodiset.githubToken');
  } catch {
    /* ignore */
  }
}

const PROFILE_KEY = 'kodiset.profile.v1';

export function loadProfile(): import('./types').Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p.git !== 'number' || typeof p.collab !== 'number') return null;
    return p;
  } catch {
    return null;
  }
}

export function saveProfile(p: import('./types').Profile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function clearProfile(): void {
  try {
    localStorage.removeItem(PROFILE_KEY);
  } catch {
    /* ignore */
  }
}
