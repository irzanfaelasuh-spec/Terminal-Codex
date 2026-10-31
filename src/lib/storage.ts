export type ThemeName = 'phosphor' | 'amber' | 'ice';

export interface CodexSettings {
  apiKey: string;
  model: string;
  tokenBudget: number;
  theme: ThemeName;
  fontScale: number;
  firebaseConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
    messagingSenderId: string;
  };
}

export interface TokenStats {
  total: number;
  input: number;
  output: number;
  requests: number;
  updatedAt: number;
  cooldownUntil: number;
}

export interface TerminalEntry {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
}

const SETTINGS_KEY = 'codex.settings.v1';
const DEFAULT_SETTINGS: CodexSettings = {
  apiKey: '',
  model: 'gemini-2.5-flash',
  tokenBudget: 100000,
  theme: 'phosphor',
  fontScale: 1,
  firebaseConfig: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? ''
  }
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function getSettings(): CodexSettings {
  const value = readJson<CodexSettings>(SETTINGS_KEY, DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    firebaseConfig: {
      ...DEFAULT_SETTINGS.firebaseConfig,
      ...(value.firebaseConfig ?? {})
    }
  };
}

export function saveSettings(settings: CodexSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function statsKey(username: string): string {
  return `codex.stats.${username.toLowerCase()}`;
}

export function getTokenStats(username: string): TokenStats {
  return readJson<TokenStats>(statsKey(username), {
    total: 0,
    input: 0,
    output: 0,
    requests: 0,
    updatedAt: Date.now(),
    cooldownUntil: 0
  });
}

export function saveTokenStats(username: string, stats: TokenStats): void {
  localStorage.setItem(statsKey(username), JSON.stringify(stats));
}

export function historyKey(username: string): string {
  return `codex.history.${username.toLowerCase()}`;
}

export function getHistory(username: string): TerminalEntry[] {
  try {
    const raw = localStorage.getItem(historyKey(username));
    return raw ? JSON.parse(raw) as TerminalEntry[] : [];
  } catch {
    return [];
  }
}

export function saveHistory(username: string, entries: TerminalEntry[]): void {
  localStorage.setItem(historyKey(username), JSON.stringify(entries.slice(-160)));
}

export function getLocalSnippets(username: string): Array<{ name: string; code: string; updatedAt: number }> {
  try {
    return JSON.parse(localStorage.getItem(`codex.snippets.${username.toLowerCase()}`) ?? '[]') as Array<{ name: string; code: string; updatedAt: number }>;
  } catch {
    return [];
  }
}

export function saveLocalSnippets(username: string, snippets: Array<{ name: string; code: string; updatedAt: number }>): void {
  localStorage.setItem(`codex.snippets.${username.toLowerCase()}`, JSON.stringify(snippets));
}

export function clearLocalHistory(username: string): void {
  localStorage.removeItem(historyKey(username));
}
