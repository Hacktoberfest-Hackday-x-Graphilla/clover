export type Level = 1 | 2 | 3 | 4 | 5;

export interface Profile {
  git: Level;
  collab: Level;
  languages: Record<string, Level>;
  hours: '<2' | '2-5' | '5+';
  interests: string[];
}

export type IssueStatus =
  | { kind: 'free' }
  | { kind: 'assigned'; to: string }
  | { kind: 'pr'; number: number };

export interface Issue {
  number: number;
  title: string;
  url: string;
  labels: string[];
  body: string;
  status: IssueStatus;
  language?: string;
  difficulty: Level;
  difficultyWhy?: string;
  updatedAt?: string;
}

export interface SolvedItem {
  issueNumber: number;
  issueTitle: string;
  prNumber: number;
  prUrl: string;
  author: string;
  explanation: string;
}

export interface Health {
  verdict: 'Active' | 'Slow' | 'Looks inactive' | 'Archived' | 'Unknown';
  facts: string[];
}

export interface Contributor {
  login: string;
  avatarUrl: string;
  commits: number;
}

export interface Commit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface HelpArea {
  title: string;
  why: string;
  issueNumbers: number[];
}

export interface PlanFile {
  path: string;
  verified: boolean;
}

export interface Plan {
  markdown: string;
  files: PlanFile[];
}

export interface AnalysisResult {
  owner: string;
  repo: string;
  profile: Profile;
  health: Health;
  issues: Issue[];
  solved: SolvedItem[];
  contributors: Contributor[];
  branches: string[];
  commits: Commit[];
  areas: HelpArea[];
  checklist: string[];
  plan: Plan;
}

export interface Settings {
  geminiKey: string;
  githubToken: string;
}

export const LEVEL_LABELS: Record<Level, string> = {
  1: 'Starting',
  2: 'Basic',
  3: 'Comfortable',
  4: 'Strong',
  5: 'Advanced',
};
