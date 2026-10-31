import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, RefObject } from 'react';
import gsap from 'gsap';
import {
  Activity,
  ArrowClockwise,
  ArrowCounterClockwise,
  Check,
  CheckCircle,
  Clock,
  ClockCounterClockwise,
  CodeBlock,
  Command,
  CopySimple,
  Cube,
  DownloadSimple,
  Eye,
  EyeSlash,
  FileText,
  FolderOpen,
  Gauge,
  GearSix,
  Info,
  Key,
  List,
  LockKey,
  PaperPlaneRight,
  Plus,
  Question,
  SignOut,
  SlidersHorizontal,
  Sparkle,
  TerminalWindow,
  Trash,
  UserCircle,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import {
  extractCodeBlocks,
  fetchGeminiModels,
  generateGeminiReply,
  type GeminiModel,
  type GeminiTurn,
} from './lib/gemini';
import {
  getHistory,
  getLocalSnippets,
  getSettings,
  getTokenStats,
  saveHistory,
  saveLocalSnippets,
  saveSettings,
  saveTokenStats,
  type CodexSettings,
  type TerminalEntry,
  type ThemeName,
  type TokenStats,
} from './lib/storage';
import {
  isFirebaseConfigured,
  loginAccount,
  logoutAccount,
  registerAccount,
  restoreSession,
  type SignedInUser,
} from './lib/auth';
import './styles.css';

type Stage = 'boot' | 'login' | 'welcome' | 'terminal';
type AuthMode = 'login' | 'register';
type Panel = 'overview' | 'console' | 'usage' | 'models' | 'status' | 'settings' | 'config' | 'history' | 'files' | 'snippets' | 'help';
type SavedFile = { name: string; code: string; language: string; updatedAt: number };
type SavedSnippet = { name: string; code: string; updatedAt: number };
type AppStyle = CSSProperties & { '--font-scale': number };

const NAV_ITEMS: Array<{ id: Panel; label: string; icon: typeof TerminalWindow; group: string }> = [
  { id: 'overview', label: 'Overview', icon: Gauge, group: 'WORKSPACE' },
  { id: 'console', label: 'Console', icon: TerminalWindow, group: 'WORKSPACE' },
  { id: 'usage', label: 'Usage', icon: Activity, group: 'INSPECT' },
  { id: 'models', label: 'Models', icon: Cube, group: 'INSPECT' },
  { id: 'status', label: 'Status', icon: List, group: 'INSPECT' },
  { id: 'history', label: 'History', icon: ClockCounterClockwise, group: 'TOOLS' },
  { id: 'files', label: 'Files', icon: FolderOpen, group: 'TOOLS' },
  { id: 'snippets', label: 'Snippets', icon: CodeBlock, group: 'TOOLS' },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal, group: 'SYSTEM' },
  { id: 'config', label: 'Config', icon: GearSix, group: 'SYSTEM' },
  { id: 'help', label: 'Help', icon: Question, group: 'SYSTEM' },
];

const SYSTEM_GREETING: TerminalEntry = {
  id: 'codex-start',
  role: 'system',
  text: 'CodEX AI terminal ready. Type `help` to view available commands.\nGemini connection is waiting for an API key.',
  timestamp: Date.now(),
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-GB', { hour12: false });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest].map((value) => String(value).padStart(2, '0')).join(':');
}

function downloadText(name: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

async function copyText(value: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // Continue to the selection-based fallback for older browser shells.
  }
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand('copy');
  area.remove();
  if (!copied) throw new Error('Clipboard access is unavailable in this browser.');
}

function parseMessage(text: string): Array<{ type: 'text' | 'code'; value: string; language: string; filename: string }> {
  const parts: Array<{ type: 'text' | 'code'; value: string; language: string; filename: string }> = [];
  const inferredFiles = extractCodeBlocks(text);
  const expression = /```([\w+#.-]*)(?:\s+filename=["']([^"']+)["'])?\s*\n([\s\S]*?)```/g;
  let cursor = 0;
  let index = 1;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(text)) !== null) {
    if (match.index > cursor) parts.push({ type: 'text', value: text.slice(cursor, match.index), language: '', filename: '' });
    parts.push({ type: 'code', value: match[3].replace(/\n$/, ''), language: match[1] || 'text', filename: match[2] || inferredFiles[index - 1]?.filename || `codex-output-${index}.txt` });
    cursor = expression.lastIndex;
    index += 1;
  }
  if (cursor < text.length) parts.push({ type: 'text', value: text.slice(cursor), language: '', filename: '' });
  return parts.length ? parts : [{ type: 'text', value: text, language: '', filename: '' }];
}

function BootScreen({ onComplete }: { onComplete: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const timeline = gsap.timeline({ onComplete });
    timeline
      .fromTo('.boot-symbol', { opacity: 0, scale: 0.74, rotate: -12, filter: 'blur(12px)' }, { opacity: 1, scale: 1, rotate: 0, filter: 'blur(0px)', duration: 1.15, ease: 'power3.out' })
      .fromTo('.boot-title', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.85, ease: 'power3.out' }, '-=0.35')
      .fromTo('.boot-subtitle', { opacity: 0 }, { opacity: 1, duration: 0.7 }, '-=0.1')
      .fromTo('.boot-progress-fill', { scaleX: 0 }, { scaleX: 1, duration: 4.4, ease: 'power1.inOut' }, '-=0.1')
      .to('.boot-status', { opacity: 0.42, duration: 0.4 }, '-=0.3')
      .to('.boot-content', { opacity: 0, y: -12, duration: 0.45, ease: 'power2.in' }, '+=0.15')
      .to('.boot-status', { opacity: 0.12, duration: 0.75 });
    return () => { timeline.kill(); };
  }, [onComplete]);

  return (
    <div className="boot-screen" ref={rootRef}>
      <div className="boot-grid" />
      <div className="boot-content">
        <div className="boot-symbol"><span> C<span className="boot-cross">×</span></span><i /></div>
        <div className="boot-title">CodEX <span>AI</span></div>
        <div className="boot-subtitle">Welcome to CodEX ai</div>
        <div className="boot-progress"><span className="boot-progress-fill" /></div>
        <div className="boot-status"><span className="pulse-dot" /> INITIALIZING TERMINAL ENVIRONMENT</div>
        <div className="boot-version">BUILD 1.0.0 / GEMINI INTERFACE</div>
      </div>
      <div className="boot-corner boot-corner-top">CDEX / SYS</div>
      <div className="boot-corner boot-corner-bottom">STARTUP SEQUENCE</div>
    </div>
  );
}

function LoginScreen({ onLogin, onRegister, cloudMode }: {
  onLogin: (name: string, password: string) => Promise<void>;
  onRegister: (name: string, password: string) => Promise<void>;
  cloudMode: boolean;
}) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await onLogin(name, password);
      else await onRegister(name, password);
    } catch (value) {
      const message = value instanceof Error ? value.message : 'Something went wrong.';
      setError(message);
      gsap.fromTo(formRef.current, { x: -7 }, { x: 0, duration: 0.52, ease: 'elastic.out(1, 0.3)', clearProps: 'x' });
      gsap.fromTo('.login-panel', { borderColor: 'rgba(255, 73, 83, .92)', boxShadow: '0 0 0 1px rgba(255, 73, 83, .25), 0 0 30px rgba(255, 73, 83, .12)' }, { borderColor: 'rgba(125, 163, 135, .19)', boxShadow: '0 0 0 1px rgba(125, 163, 135, .05)', duration: 1.1, ease: 'power2.out' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-screen">
      <div className="login-ambient" />
      <div className="login-topline"><span>CODEX / AUTH GATE</span><span>SECURE SESSION</span></div>
      <section className="login-layout">
        <div className="login-intro">
          <div className="mini-mark">C<span>×</span></div>
          <div className="eyebrow"><span className="pulse-dot" /> TERMINAL ACCESS</div>
          <h1>Welcome to<br /><span>CodEX ai</span></h1>
          <p>A quiet workspace for code, systems and ideas.</p>
          <div className="intro-rule"><span /> <small>EST. 2026 / BUILD 01</small></div>
        </div>
        <div className="login-panel">
          <div className="panel-top"><span>AUTHENTICATION</span><span className="panel-code">0x01</span></div>
          <div className="auth-switch" role="tablist" aria-label="Account mode">
            <button type="button" className={mode === 'login' ? 'selected' : ''} onClick={() => { setMode('login'); setError(''); }}>LOGIN</button>
            <button type="button" className={mode === 'register' ? 'selected' : ''} onClick={() => { setMode('register'); setError(''); }}>CREATE ACCOUNT</button>
          </div>
          <form ref={formRef} onSubmit={submit}>
            <label htmlFor="account-name">NAME</label>
            <div className="login-input-wrap"><UserCircle size={17} weight="light" /><input id="account-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="your_name" autoComplete="username" required minLength={3} maxLength={20} /></div>
            <label htmlFor="account-password">PASSWORD</label>
            <div className="login-input-wrap"><LockKey size={17} weight="light" /><input id="account-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={6} /><button className="reveal-button" type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeSlash size={17} /> : <Eye size={17} />}</button></div>
            {error && <div className="login-error" role="alert"><WarningCircle size={16} /> <span>{error}</span></div>}
            <button className="enter-button" type="submit" disabled={busy}>
              <span>{busy ? 'PLEASE WAIT' : mode === 'login' ? 'ENTER TERMINAL' : 'CREATE ACCOUNT'}</span>
              <span className="enter-arrow">{busy ? <span className="mini-loader" /> : '↗'}</span>
            </button>
          </form>
          <div className="auth-foot"><span>{cloudMode ? 'FIREBASE CLOUD AUTH' : 'LOCAL DEVICE AUTH'}</span><span><i /> {cloudMode ? 'CLOUD READY' : 'DEVICE ONLY'}</span></div>
        </div>
      </section>
      <div className="login-bottom"><span>CODEx AI TERMINAL</span><span>NO EMAIL REQUIRED / NAME + PASSWORD</span></div>
    </main>
  );
}

function WelcomeScreen({ name }: { name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    gsap.fromTo(ref.current, { opacity: 0, y: 24, filter: 'blur(9px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.85, ease: 'power3.out' });
  }, []);
  return (
    <div className="welcome-screen" ref={ref}>
      <div className="welcome-mark">C<span>×</span></div>
      <div className="welcome-line">SESSION ESTABLISHED</div>
      <h1>Welcome, <span>{name}</span></h1>
      <p>Preparing your terminal environment</p>
      <div className="welcome-loader"><span /></div>
    </div>
  );
}

function ClockBlock({ now }: { now: Date }) {
  return (
    <div className="clock-block" aria-label={`Current time ${formatTime(now)}`}>
      <div className="clock-time">{formatTime(now)}</div>
      <div className="clock-date">{formatDate(now)}</div>
    </div>
  );
}

function MessageBody({ text, onSaveFile }: { text: string; onSaveFile: (name: string, code: string, language: string) => void }) {
  const segments = useMemo(() => parseMessage(text), [text]);
  return (
    <div className="message-body">
      {segments.map((segment, index) => segment.type === 'code' ? (
        <div className="code-window" key={`${index}-${segment.filename}`}>
          <div className="code-window-head"><span className="code-file"><CodeBlock size={14} /> {segment.filename}</span><span className="code-lang">{segment.language}</span></div>
          <pre><code>{segment.value}</code></pre>
          <div className="code-window-actions">
            <button type="button" onClick={() => void copyText(segment.value)}><CopySimple size={14} /> COPY CODE</button>
            <button type="button" onClick={() => onSaveFile(segment.filename, segment.value, segment.language)}><DownloadSimple size={14} /> SAVE FILE</button>
          </div>
        </div>
      ) : <p className="message-text" key={index}>{segment.value}</p>)}
    </div>
  );
}

function ConsolePanel({
  entries,
  busy,
  prompt,
  setPrompt,
  onSubmit,
  onSaveFile,
  model,
  apiReady,
  inputRef,
  onHistoryKey,
}: {
  entries: TerminalEntry[];
  busy: boolean;
  prompt: string;
  setPrompt: (value: string) => void;
  onSubmit: () => void;
  onSaveFile: (name: string, code: string, language: string) => void;
  model: string;
  apiReady: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onHistoryKey: (key: 'ArrowUp' | 'ArrowDown') => string | null;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [entries, busy]);
  const promptSuggestions = ['Create a responsive landing page', 'Explain this JavaScript error', 'Build a Python file organizer'];

  return (
    <section className="console-panel">
      <div className="console-toolbar">
        <div className="console-tab"><span className="window-dot red" /><span className="window-dot amber" /><span className="window-dot green" /><span className="tab-divider" /> <TerminalWindow size={15} /> <span>codex-console</span></div>
        <div className="console-toolbar-right"><span className="model-chip">{model || 'NO MODEL'}</span><span className={`connection-chip ${apiReady ? 'online' : 'offline'}`}><i /> {apiReady ? 'LINK READY' : 'KEY REQUIRED'}</span></div>
      </div>
      <div className="terminal-log" ref={logRef}>
        <div className="terminal-welcome-line"><span className="prompt-symbol">$</span> codex --initialize</div>
        {entries.map((entry) => (
          <article className={`terminal-entry ${entry.role}`} key={entry.id}>
            <div className="entry-meta"><span className="entry-role">{entry.role === 'user' ? 'YOU' : entry.role === 'assistant' ? 'CODEX AI' : 'SYSTEM'}</span><span>{new Date(entry.timestamp).toLocaleTimeString('en-GB', { hour12: false })}</span>{entry.model && <span className="entry-model">{entry.model}</span>}</div>
            {entry.role === 'user' ? <p className="user-command"><span className="prompt-symbol">›</span> {entry.text}</p> : <MessageBody text={entry.text} onSaveFile={onSaveFile} />}
            {entry.role === 'assistant' && entry.text && <div className="entry-actions"><button type="button" onClick={() => void copyText(entry.text)}><CopySimple size={13} /> COPY RESPONSE</button>{typeof entry.inputTokens === 'number' && <span>{formatNumber(entry.inputTokens + (entry.outputTokens ?? 0))} TOKENS</span>}</div>}
          </article>
        ))}
        {busy && <div className="thinking-row"><span className="thinking-mark">[ AI ]</span><span className="thinking-text">Thinking<span>.</span><span>.</span><span>.</span></span><span className="thinking-cursor" /> </div>}
        {entries.length <= 1 && !busy && <div className="console-suggestions"><div className="suggestion-heading">QUICK START</div>{promptSuggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => setPrompt(suggestion)}><span>↳</span>{suggestion}</button>)}</div>}
      </div>
      <div className="console-input-area">
        <div className="input-hint"><span>INPUT</span><span>ENTER TO SEND <kbd>CTRL</kbd> + <kbd>ENTER</kbd> ALSO WORKS</span></div>
        <div className="terminal-input-box">
          <span className="input-prefix">{busy ? '…' : '›'}</span>
          <textarea
            ref={inputRef}
            rows={1}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                const recalled = onHistoryKey(event.key);
                if (recalled !== null) { event.preventDefault(); setPrompt(recalled); }
                return;
              }
              if (event.key === 'Enter' && (event.ctrlKey || !event.shiftKey)) {
                event.preventDefault();
                onSubmit();
              }
            }}
            placeholder="Enter a command or ask CodEX AI..."
            disabled={busy}
            aria-label="Terminal command input"
          />
          <button type="button" className="send-button" onClick={onSubmit} disabled={busy || !prompt.trim()} aria-label="Send command"><PaperPlaneRight size={18} weight="regular" /></button>
        </div>
        <div className="input-footer"><span><kbd>↑</kbd><kbd>↓</kbd> COMMAND HISTORY</span><span>SHIFT + ENTER FOR NEW LINE</span></div>
      </div>
    </section>
  );
}

function StatBlock({ label, value, suffix, detail }: { label: string; value: string; suffix?: string; detail?: string }) {
  return <div className="stat-block"><div className="stat-label">{label}</div><div className="stat-value">{value}{suffix && <small>{suffix}</small>}</div>{detail && <div className="stat-detail">{detail}</div>}</div>;
}

function App() {
  const [settings, setSettings] = useState<CodexSettings>(() => getSettings());
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [stage, setStage] = useState<Stage>('boot');
  const [panel, setPanel] = useState<Panel>('overview');
  const [entries, setEntries] = useState<TerminalEntry[]>([SYSTEM_GREETING]);
  const [stats, setStats] = useState<TokenStats>({ total: 0, input: 0, output: 0, requests: 0, updatedAt: Date.now(), cooldownUntil: 0 });
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());
  const [models, setModels] = useState<GeminiModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelError, setModelError] = useState('');
  const [files, setFiles] = useState<SavedFile[]>([]);
  const [snippets, setSnippets] = useState<SavedSnippet[]>([]);
  const [snippetName, setSnippetName] = useState('');
  const [toast, setToast] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [keyVisible, setKeyVisible] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [resetCountdown, setResetCountdown] = useState(0);
  const [bootDone, setBootDone] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const apiReady = settings.apiKey.trim().length > 10;
  const cloudMode = isFirebaseConfigured(settings.firebaseConfig);
  const usagePercent = settings.tokenBudget > 0 ? Math.min(100, (stats.total / settings.tokenBudget) * 100) : 0;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      const restored = await restoreSession(settings.firebaseConfig);
      if (!active) return;
      if (restored) {
        setUser(restored);
        setEntries(getHistory(restored.username).length ? getHistory(restored.username) : [SYSTEM_GREETING]);
        setStats(getTokenStats(restored.username));
        setSnippets(getLocalSnippets(restored.username));
        setStage('terminal');
        setPanel(settings.apiKey.trim() ? 'overview' : 'settings');
      } else {
        setStage('boot');
      }
      setBootDone(true);
    };
    void restore();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (stage !== 'terminal' || !user || busy) return;
    saveHistory(user.username, entries);
    saveTokenStats(user.username, stats);
    saveLocalSnippets(user.username, snippets);
  }, [entries, stats, snippets, stage, user, busy]);

  useEffect(() => {
    if (stats.cooldownUntil <= Date.now()) {
      setResetCountdown(0);
      if (stats.cooldownUntil > 0 && stats.total >= settings.tokenBudget) {
        setStats((current) => ({ ...current, total: 0, input: 0, output: 0, requests: 0, cooldownUntil: 0, updatedAt: Date.now() }));
      }
      return;
    }
    const tick = () => {
      const remaining = stats.cooldownUntil - Date.now();
      if (remaining <= 0) {
        window.clearInterval(interval);
        setResetCountdown(0);
        setStats((current) => current.cooldownUntil === stats.cooldownUntil
          ? { ...current, total: 0, input: 0, output: 0, requests: 0, cooldownUntil: 0, updatedAt: Date.now() }
          : current);
      } else {
        setResetCountdown(remaining);
      }
    };
    const interval = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(interval);
  }, [stats.cooldownUntil, stats.total, settings.tokenBudget]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const finishBoot = useCallback(() => setStage('login'), []);

  const updateSettings = useCallback((next: CodexSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const enterTerminal = useCallback((signedIn: SignedInUser) => {
    setUser(signedIn);
    setEntries(getHistory(signedIn.username).length ? getHistory(signedIn.username) : [
      { ...SYSTEM_GREETING, timestamp: Date.now() },
      { id: crypto.randomUUID(), role: 'system', text: `Welcome back, ${signedIn.username}. Session restored.`, timestamp: Date.now() }
    ]);
    setStats(getTokenStats(signedIn.username));
    setSnippets(getLocalSnippets(signedIn.username));
    setPanel(settings.apiKey.trim() ? 'overview' : 'settings');
    setStage('welcome');
    window.setTimeout(() => setStage('terminal'), 1450);
  }, [settings.apiKey]);

  const handleLogin = useCallback(async (name: string, password: string) => {
    const signedIn = await loginAccount(name, password, settings.firebaseConfig);
    enterTerminal(signedIn);
  }, [settings.firebaseConfig, enterTerminal]);

  const handleRegister = useCallback(async (name: string, password: string) => {
    const signedIn = await registerAccount(name, password, settings.firebaseConfig);
    enterTerminal(signedIn);
  }, [settings.firebaseConfig, enterTerminal]);

  const saveGeneratedFile = useCallback((name: string, code: string, language: string) => {
    const safeName = name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 90) || 'codex-output.txt';
    setFiles((current) => {
      const next = [{ name: safeName, code, language, updatedAt: Date.now() }, ...current.filter((file) => file.name !== safeName)].slice(0, 60);
      if (user) localStorage.setItem(`codex.files.${user.username.toLowerCase()}`, JSON.stringify(next));
      return next;
    });
    downloadText(safeName, code);
    setToast(`Saved ${safeName}`);
  }, [user]);

  const reloadFiles = useCallback((username: string) => {
    try {
      setFiles(JSON.parse(localStorage.getItem(`codex.files.${username.toLowerCase()}`) ?? '[]') as SavedFile[]);
    } catch {
      setFiles([]);
    }
  }, []);

  useEffect(() => {
    if (user) reloadFiles(user.username);
  }, [user, reloadFiles]);

  const sendToAI = async (rawPrompt: string) => {
    if (!user || busy) return;
    if (!apiReady) {
      setPanel('settings');
      setToast('Add your Gemini API key in Settings first.');
      return;
    }
    let currentStats = stats;
    if (currentStats.cooldownUntil && currentStats.cooldownUntil <= Date.now()) {
      currentStats = { ...currentStats, total: 0, input: 0, output: 0, requests: 0, cooldownUntil: 0 };
    }
    if (currentStats.total >= settings.tokenBudget || currentStats.cooldownUntil > Date.now()) {
      setToast('Local token budget reached. Wait for the reset timer.');
      setStats(currentStats);
      setPanel('usage');
      return;
    }
    const cleanPrompt = rawPrompt.trim();
    if (!cleanPrompt) return;
    setCommandHistory((current) => [cleanPrompt, ...current].slice(0, 60));
    setHistoryIndex(-1);
    const userEntry: TerminalEntry = { id: crypto.randomUUID(), role: 'user', text: cleanPrompt, timestamp: Date.now() };
    const previousEntries = entries;
    const nextEntries = [...previousEntries, userEntry];
    setEntries(nextEntries);
    setPrompt('');
    setBusy(true);
    try {
      const history: GeminiTurn[] = previousEntries
        .filter((entry) => entry.role === 'user' || entry.role === 'assistant')
        .slice(-20)
        .map((entry) => ({ role: entry.role === 'assistant' ? 'model' : 'user', text: entry.text }));
      const reply = await generateGeminiReply(settings.apiKey.trim(), settings.model, history, cleanPrompt);
      const assistantEntry: TerminalEntry = {
        id: crypto.randomUUID(), role: 'assistant', text: '', timestamp: Date.now(),
        inputTokens: reply.inputTokens, outputTokens: reply.outputTokens, model: settings.model
      };
      setEntries([...nextEntries, assistantEntry]);
      const step = Math.max(1, Math.ceil(reply.text.length / 620));
      for (let index = 0; index < reply.text.length; index += step) {
        const visible = reply.text.slice(0, index + step);
        setEntries([...nextEntries, { ...assistantEntry, text: visible }]);
        await new Promise((resolve) => window.setTimeout(resolve, 9));
      }
      const completed = [...nextEntries, { ...assistantEntry, text: reply.text }];
      setEntries(completed);
      const updatedStats: TokenStats = {
        ...currentStats,
        total: currentStats.total + reply.totalTokens,
        input: currentStats.input + reply.inputTokens,
        output: currentStats.output + reply.outputTokens,
        requests: currentStats.requests + 1,
        updatedAt: Date.now(),
        cooldownUntil: 0
      };
      if (updatedStats.total >= settings.tokenBudget) {
        const cooldownMinutes = 15 + Math.floor(Math.random() * 76);
        updatedStats.cooldownUntil = Date.now() + cooldownMinutes * 60 * 1000;
        setToast(`Local budget reached. Reset scheduled in ${cooldownMinutes} minutes.`);
      }
      setStats(updatedStats);
      const detected = extractCodeBlocks(reply.text);
      if (detected.length) {
        setFiles((current) => {
          const next = [...detected.map((file) => ({ name: file.filename, code: file.code, language: file.language, updatedAt: Date.now() })), ...current]
            .filter((file, index, all) => all.findIndex((item) => item.name === file.name) === index)
            .slice(0, 60);
          localStorage.setItem(`codex.files.${user.username.toLowerCase()}`, JSON.stringify(next));
          return next;
        });
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unknown Gemini error.';
      setEntries((current) => [...current, { id: crypto.randomUUID(), role: 'system', text: `Request failed: ${text}`, timestamp: Date.now() }]);
    } finally {
      setBusy(false);
      window.setTimeout(() => inputRef.current?.focus(), 60);
    }
  };

  const runLocalCommand = (raw: string): boolean => {
    const [command, ...args] = raw.trim().split(/\s+/);
    const value = command?.toLowerCase().replace(/^\//, '');
    const argument = args.join(' ');
    const nowText = formatTime(now);
    const output = (text: string) => setEntries((current) => [...current, { id: crypto.randomUUID(), role: 'system', text, timestamp: Date.now() }]);
    switch (value) {
      case 'overview': setPanel('overview'); output('Opening workspace overview.'); return true;
      case 'console': setPanel('console'); output('Opening AI console.'); return true;
      case 'help':
        output('CODEX COMMAND REFERENCE\n\nhelp                 Show this command list\noverview             Open workspace overview\nconsole              Open AI console\nclear                Clear the current console\nusage                Show token usage\nmodels               Open model manager\nmodels refresh       Fetch available Gemini models\nstatus               Show connection and account status\nsettings             Open settings\nconfig               Open cloud configuration\nhistory              Open session history\nfiles                Open generated files\nsnippets             Open saved snippets\ntime                 Show current time\ndate                 Show current date\nwhoami               Show signed-in account\ntheme [name]         Set phosphor, amber or ice theme\nexport               Download the console transcript\nnew                  Start a fresh conversation\nlogout               Sign out of CodEX AI\n\nAny other input is sent to Gemini.');
        return true;
      case 'clear':
        setEntries([{ id: crypto.randomUUID(), role: 'system', text: 'Console cleared. Type `help` for commands.', timestamp: Date.now() }]);
        return true;
      case 'usage':
        output(`TOKEN USAGE\n${formatNumber(stats.total)} / ${formatNumber(settings.tokenBudget)} tokens (${usagePercent.toFixed(1)}%)\nInput: ${formatNumber(stats.input)}\nOutput: ${formatNumber(stats.output)}\nRequests: ${stats.requests}`);
        return true;
      case 'models':
        setPanel('models');
        if (argument === 'refresh') void loadModels();
        output(argument === 'refresh' ? 'Opening model manager and refreshing the model catalogue.' : `Selected model: ${settings.model}\nOpening model manager.`);
        return true;
      case 'status':
        setPanel('status');
        output(`CODEX STATUS\nAccount: ${user?.username ?? 'unknown'}\nAuth: ${user?.mode.toUpperCase() ?? 'OFFLINE'}\nGemini key: ${apiReady ? 'CONFIGURED' : 'MISSING'}\nModel: ${settings.model}\nLocal budget: ${usagePercent.toFixed(1)}%`);
        return true;
      case 'settings': setPanel('settings'); output('Opening settings.'); return true;
      case 'config': setPanel('config'); output('Opening configuration.'); return true;
      case 'history': setPanel('history'); output('Opening command history.'); return true;
      case 'files': setPanel('files'); output('Opening generated files.'); return true;
      case 'snippets': setPanel('snippets'); output('Opening snippets.'); return true;
      case 'time': output(`LOCAL TIME  ${nowText}`); return true;
      case 'date': output(`LOCAL DATE  ${formatDate(now)}`); return true;
      case 'whoami': output(`SIGNED IN AS  ${user?.username ?? 'unknown'}\nAUTH MODE  ${user?.mode.toUpperCase() ?? 'UNKNOWN'}`); return true;
      case 'theme': {
        const allowed = ['phosphor', 'amber', 'ice'];
        if (!argument) output(`Current theme: ${settings.theme}\nAvailable: ${allowed.join(', ')}`);
        else if (allowed.includes(argument)) {
          updateSettings({ ...settings, theme: argument as ThemeName });
          output(`Theme changed to ${argument}.`);
        } else output(`Unknown theme. Choose: ${allowed.join(', ')}`);
        return true;
      }
      case 'export': {
        const transcript = entries.map((entry) => `[${new Date(entry.timestamp).toISOString()}] ${entry.role.toUpperCase()}\n${entry.text}`).join('\n\n');
        downloadText(`codex-session-${Date.now()}.txt`, transcript);
        output('Transcript exported to a text file.');
        return true;
      }
      case 'new':
        setEntries([{ id: crypto.randomUUID(), role: 'system', text: 'New conversation started. This console now has a fresh context.', timestamp: Date.now() }]);
        output('Fresh context ready.');
        return true;
      case 'logout': void handleLogout(); return true;
      default: return false;
    }
  };

  async function submitPrompt() {
    const value = prompt.trim();
    if (!value || busy) return;
    setPrompt('');
    if (!runLocalCommand(value)) await sendToAI(value);
    else setCommandHistory((current) => [value, ...current].slice(0, 60));
  }

  async function loadModels() {
    if (!apiReady) {
      setModelError('Add a Gemini API key in Settings before loading models.');
      return;
    }
    setModelsLoading(true);
    setModelError('');
    try {
      const result = await fetchGeminiModels(settings.apiKey.trim());
      setModels(result);
      if (result.length && !result.some((model) => model.name.replace(/^models\//, '') === settings.model)) {
        const recommended = result.find((model) => /flash/i.test(model.name)) ?? result[0];
        updateSettings({ ...settings, model: recommended.name.replace(/^models\//, '') });
      }
      setToast(`${result.length} Gemini models loaded.`);
    } catch (error) {
      setModelError(error instanceof Error ? error.message : 'Could not load models.');
    } finally {
      setModelsLoading(false);
    }
  }

  async function handleLogout() {
    await logoutAccount(user, settings.firebaseConfig);
    setUser(null);
    setPanel('overview');
    setPrompt('');
    setStage('login');
  }

  function changePanel(next: Panel) {
    setPanel(next);
    setMenuOpen(false);
  }

  function onHistoryKey(key: 'ArrowUp' | 'ArrowDown'): string | null {
    if (!commandHistory.length) return null;
    const nextIndex = key === 'ArrowUp'
      ? Math.min(historyIndex + 1, commandHistory.length - 1)
      : Math.max(historyIndex - 1, -1);
    setHistoryIndex(nextIndex);
    return nextIndex === -1 ? '' : commandHistory[nextIndex] ?? '';
  }

  function updateConfigField(field: keyof CodexSettings['firebaseConfig'], value: string) {
    updateSettings({ ...settings, firebaseConfig: { ...settings.firebaseConfig, [field]: value } });
  }

  if (!bootDone) return <div className="boot-screen"><div className="boot-content"><div className="boot-symbol">C<span className="boot-cross">×</span></div><div className="boot-status">RESTORING SESSION</div></div></div>;
  if (stage === 'boot') return <BootScreen onComplete={finishBoot} />;
  if (stage === 'login') return <LoginScreen onLogin={handleLogin} onRegister={handleRegister} cloudMode={cloudMode} />;
  if (stage === 'welcome') return <WelcomeScreen name={user?.username ?? 'user'} />;

  const userName = user?.username ?? 'user';
  const cooldownActive = stats.cooldownUntil > Date.now();
  const currentModel = settings.model;

  return (
    <div className={`app-shell theme-${settings.theme}`} style={{ '--font-scale': settings.fontScale } as AppStyle}>
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand-lockup"><div className="brand-mark">C<span>×</span></div><div className="brand-name">CodEX <b>AI</b><small>TERMINAL ENVIRONMENT</small></div><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={19} /></button></div>
        <div className="sidebar-account"><div className="account-avatar">{userName.slice(0, 1).toUpperCase()}</div><div className="account-copy"><strong>{userName}</strong><span>{user?.mode === 'firebase' ? 'CLOUD ACCOUNT' : 'LOCAL ACCOUNT'}</span></div><span className="account-state" /> </div>
        <nav className="side-nav" aria-label="Main navigation">
          {(['WORKSPACE', 'INSPECT', 'TOOLS', 'SYSTEM'] as const).map((group) => (
            <div className="nav-group" key={group}><div className="nav-group-label">{group}</div>{NAV_ITEMS.filter((item) => item.group === group).map((item) => {
              const Icon = item.icon;
              return <button className={`nav-item ${panel === item.id ? 'active' : ''}`} key={item.id} onClick={() => changePanel(item.id)}><Icon size={18} weight={panel === item.id ? 'fill' : 'light'} /><span>{item.label}</span>{panel === item.id && <i />}</button>;
            })}</div>
          ))}
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-version"><span>CORE</span><b>v1.0.0</b></div><button className="logout-button" onClick={() => void handleLogout()}><SignOut size={17} /> <span>Sign out</span></button></div>
      </aside>
      {menuOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <main className="main-shell">
        <header className="topbar">
          <div className="topbar-left"><button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><List size={20} /></button><div className="breadcrumb"><span>CODEX</span><b>/</b>{panel.toUpperCase()}</div></div>
          <div className="topbar-right"><div className="top-status"><i /> SYSTEM OPERATIONAL</div><div className="topbar-divider" /><Clock size={15} weight="light" /><span className="topbar-clock">{formatTime(now)}</span><button className="topbar-avatar" title={userName}>{userName.slice(0, 1).toUpperCase()}</button></div>
        </header>
        <div className="content-scroll">
          <div className="page-heading"><div><div className="page-kicker"><span className="pulse-dot" /> TERMINAL / {panel.toUpperCase()}</div><h1>{NAV_ITEMS.find((item) => item.id === panel)?.label ?? 'Terminal'}</h1><p>{panel === 'overview' ? 'Your workspace, at a glance.' : panel === 'console' ? 'Run commands and work with CodEX AI.' : panel === 'usage' ? 'Track token consumption in this local workspace.' : panel === 'models' ? 'Choose the Gemini model for your session.' : panel === 'status' ? 'Live diagnostics for your terminal environment.' : panel === 'settings' ? 'Personal preferences and Gemini connection.' : panel === 'config' ? 'Connect cloud identity and manage app configuration.' : panel === 'history' ? 'Your recent terminal conversation.' : panel === 'files' ? 'Code files generated during this session.' : panel === 'snippets' ? 'Keep useful code close at hand.' : 'Commands, shortcuts and terminal reference.'}</p></div><div className="page-clock"><ClockBlock now={now} /></div></div>

          {panel === 'overview' && <>
            <section className="overview-hero">
              <div className="hero-scan" />
              <div className="hero-copy"><div className="hero-overline"><span>SESSION ACTIVE</span><b>01 / READY</b></div><h2>Welcome back,<br /><span>{userName}.</span></h2><p>CodEX is standing by. Enter a command, build something, or explore your workspace.</p><button onClick={() => changePanel('console')} className="hero-cta">OPEN CONSOLE <span>↗</span></button></div>
              <div className="hero-terminal-art"><div className="art-window-top"><span /> <span /> <span /> <b>codex://session</b></div><div className="art-code"><span className="muted">$</span> codex status<br /><em>●</em> core ............... ready<br /><em>●</em> gemini ............. {apiReady ? 'connected' : 'waiting'}<br /><em>●</em> session ............ active<br /><span className="muted">$</span> <i className="art-cursor" /></div><div className="art-footer">LOCAL ENVIRONMENT / {user?.mode.toUpperCase()}</div></div>
            </section>
            <section className="overview-stats"><StatBlock label="TOKENS USED" value={formatNumber(stats.total)} suffix="TOK" detail={`${usagePercent.toFixed(1)}% of local budget`} /><StatBlock label="REQUESTS" value={formatNumber(stats.requests)} detail="Gemini completions" /><StatBlock label="MODEL" value={currentModel.replace('gemini-', '')} detail="Current generation target" /><StatBlock label="LOCAL CLOCK" value={formatTime(now)} detail="Device time / live" /></section>
            <section className="overview-lower"><div className="overview-block recent-block"><div className="block-heading"><div><span>ACTIVITY</span><h3>Recent output</h3></div><button onClick={() => changePanel('history')}>VIEW HISTORY ↗</button></div>{entries.filter((entry) => entry.role !== 'system').slice(-4).reverse().length ? entries.filter((entry) => entry.role !== 'system').slice(-4).reverse().map((entry) => <div className="recent-row" key={entry.id}><span className={`recent-indicator ${entry.role}`} /> <div><strong>{entry.role === 'user' ? 'Command' : 'CodEX response'}</strong><p>{entry.text.slice(0, 95).replace(/\n/g, ' ') || 'Response is being typed...'}</p></div><time>{new Date(entry.timestamp).toLocaleTimeString('en-GB', { hour12: false })}</time></div>) : <div className="empty-line">No activity yet. Open Console to begin.</div>}</div><div className="overview-block budget-block"><div className="block-heading"><div><span>RESOURCE METER</span><h3>Token budget</h3></div><button onClick={() => changePanel('usage')}>DETAILS ↗</button></div><div className="budget-number">{usagePercent.toFixed(1)}<small>%</small></div><div className="budget-track"><span style={{ width: `${usagePercent}%` }} /></div><div className="budget-caption"><span>{formatNumber(stats.total)} used</span><span>{formatNumber(settings.tokenBudget)} limit</span></div><div className="budget-note"><Info size={14} /> Local estimate, not Google's account quota.</div></div></section>
          </>}

          {panel === 'console' && <ConsolePanel entries={entries} busy={busy} prompt={prompt} setPrompt={setPrompt} onSubmit={() => void submitPrompt()} onSaveFile={saveGeneratedFile} model={currentModel} apiReady={apiReady} inputRef={inputRef} onHistoryKey={onHistoryKey} />}

          {panel === 'usage' && <section className="panel-grid usage-layout"><div className="panel-card usage-main"><div className="panel-card-heading"><div><span>LOCAL TOKEN METER</span><h2>Usage overview</h2></div><Activity size={20} /></div><div className="usage-big-number">{usagePercent.toFixed(1)}<small>%</small></div><div className="usage-progress"><span style={{ width: `${usagePercent}%` }} /></div><div className="usage-scale"><span>{formatNumber(stats.total)} tokens consumed</span><span>{formatNumber(settings.tokenBudget)} token budget</span></div><div className="usage-split"><div><label>INPUT TOKENS</label><strong>{formatNumber(stats.input)}</strong></div><div><label>OUTPUT TOKENS</label><strong>{formatNumber(stats.output)}</strong></div><div><label>REQUESTS</label><strong>{formatNumber(stats.requests)}</strong></div></div>{cooldownActive && <div className="cooldown-banner"><Clock size={18} /><div><strong>Local budget paused</strong><span>New requests unlock in {formatDuration(resetCountdown)}</span></div></div>}<div className="usage-disclaimer">This meter totals token counts reported by Gemini responses and compares them with your own local budget. It does not read Google's project quota or billing dashboard.</div></div><div className="panel-card"><div className="panel-card-heading"><div><span>RESOURCE CONTROL</span><h2>Budget settings</h2></div><SlidersHorizontal size={20} /></div><label className="field-label" htmlFor="token-budget">LOCAL TOKEN BUDGET</label><input id="token-budget" className="text-field" type="number" min="1000" max="10000000" step="1000" value={settings.tokenBudget} onChange={(event) => updateSettings({ ...settings, tokenBudget: Math.max(1000, Number(event.target.value) || 1000) })} /><p className="field-help">Reaching 100% pauses CodEX locally for a randomized 15–90 minute interval, then resets this meter.</p><button className="secondary-button full-button" onClick={() => { setStats({ total: 0, input: 0, output: 0, requests: 0, updatedAt: Date.now(), cooldownUntil: 0 }); setToast('Local usage meter reset.'); }}> <ArrowCounterClockwise size={16} /> RESET LOCAL METER</button></div></section>}

          {panel === 'models' && <section className="panel-grid models-layout"><div className="panel-card model-card"><div className="panel-card-heading"><div><span>GENERATION ENGINE</span><h2>Model selection</h2></div><Cube size={20} /></div><div className="active-model"><div className="model-orbit"><Sparkle size={24} /></div><div><small>ACTIVE MODEL</small><strong>{currentModel}</strong><span>{models.length ? `${models.length} available models found` : 'Default selection / refresh catalogue to verify'}</span></div></div><button className="secondary-button full-button" onClick={() => void loadModels()} disabled={modelsLoading}>{modelsLoading ? <span className="mini-loader" /> : <ArrowClockwise size={16} />} REFRESH MODEL CATALOGUE</button>{modelError && <div className="inline-error"><WarningCircle size={15} />{modelError}</div>}</div><div className="panel-card model-list-card"><div className="panel-card-heading"><div><span>AVAILABLE MODELS</span><h2>Catalogue</h2></div><span className="count-tag">{models.length || '—'}</span></div>{models.length ? <div className="model-list">{models.map((model) => { const id = model.name.replace(/^models\//, ''); return <button className={`model-row ${settings.model === id ? 'selected' : ''}`} key={model.name} onClick={() => { updateSettings({ ...settings, model: id }); setToast(`Model set to ${id}`); }}><span className="model-radio" /><span className="model-row-copy"><strong>{model.displayName || id}</strong><small>{id} {model.inputTokenLimit ? `· ${formatNumber(model.inputTokenLimit)} input tokens` : ''}</small></span>{settings.model === id && <Check size={17} />}</button>; })}</div> : <div className="empty-state"><Cube size={26} /><strong>No catalogue loaded</strong><p>Connect your Gemini API key, then refresh the model catalogue.</p></div>}</div></section>}

          {panel === 'status' && <section className="panel-card status-card"><div className="panel-card-heading"><div><span>SYSTEM DIAGNOSTICS</span><h2>Environment status</h2></div><Activity size={20} /></div><div className="diagnostic-list">{[
            ['Authentication', user?.mode === 'firebase' ? 'Firebase cloud session' : 'Local device session', true],
            ['Gemini API key', apiReady ? 'Configured on this device' : 'Not configured', apiReady],
            ['Model target', currentModel, Boolean(currentModel)],
            ['Cloud identity', cloudMode ? 'Firebase config detected' : 'Local account mode', cloudMode],
            ['Token meter', cooldownActive ? `Paused / ${formatDuration(resetCountdown)}` : `${usagePercent.toFixed(1)}% used`, !cooldownActive],
            ['Service worker', 'PWA support enabled', 'serviceWorker' in navigator],
            ['Local storage', 'Session and preferences available', true],
            ['Device clock', formatTime(now), true]
          ].map(([label, detail, ok]) => <div className="diagnostic-row" key={String(label)}><div className="diagnostic-name"><span className={`diagnostic-dot ${ok ? 'ok' : 'warn'}`} />{label}</div><span className="diagnostic-detail">{detail}</span><span className={`diagnostic-state ${ok ? 'ok' : 'warn'}`}>{ok ? 'READY' : 'CHECK'}</span></div>)}</div><div className="status-footnote">This page reports browser-side configuration and local state. It cannot inspect Google billing or project-wide quota.</div></section>}

          {panel === 'settings' && <section className="settings-layout"><div className="panel-card"><div className="panel-card-heading"><div><span>GEMINI CONNECTION</span><h2>API access</h2></div><Key size={20} /></div><label className="field-label" htmlFor="gemini-key">GEMINI API KEY</label><div className="secret-field"><input id="gemini-key" className="text-field" type={keyVisible ? 'text' : 'password'} value={settings.apiKey} onChange={(event) => updateSettings({ ...settings, apiKey: event.target.value })} placeholder="Paste your Gemini API key" autoComplete="off" /><button onClick={() => setKeyVisible((value) => !value)} aria-label={keyVisible ? 'Hide API key' : 'Show API key'}>{keyVisible ? <EyeSlash size={17} /> : <Eye size={17} />}</button></div><p className="field-help">Stored in this browser or app on this device. It is not uploaded to CodEX accounts or included in the project source. <a className="text-link" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Get a Gemini key ↗</a></p><div className="key-state"><span className={`diagnostic-dot ${apiReady ? 'ok' : 'warn'}`} />{apiReady ? 'API key is set' : 'API key is missing'}</div><div className="field-divider" /><label className="field-label" htmlFor="default-model">DEFAULT MODEL</label><select id="default-model" className="text-field select-field" value={settings.model} onChange={(event) => updateSettings({ ...settings, model: event.target.value })}>{[settings.model, 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'].filter((value, index, all) => all.indexOf(value) === index).map((model) => <option value={model} key={model}>{model}</option>)}</select><button className="secondary-button" onClick={() => void loadModels()} disabled={modelsLoading}>{modelsLoading ? 'CHECKING…' : 'CHECK AVAILABLE MODELS'}</button></div><div className="panel-card"><div className="panel-card-heading"><div><span>APPEARANCE</span><h2>Terminal display</h2></div><SlidersHorizontal size={20} /></div><label className="field-label">COLOR PROFILE</label><div className="theme-options">{([{ id: 'phosphor', label: 'PHOSPHOR', color: '#52ed9d' }, { id: 'amber', label: 'AMBER', color: '#e3b35e' }, { id: 'ice', label: 'ICE', color: '#73cfff' }] as const).map((theme) => <button className={`theme-option ${settings.theme === theme.id ? 'active' : ''}`} key={theme.id} onClick={() => updateSettings({ ...settings, theme: theme.id })}><span style={{ background: theme.color }} />{theme.label}{settings.theme === theme.id && <Check size={14} />}</button>)}</div><div className="field-divider" /><div className="range-heading"><label className="field-label" htmlFor="font-scale">TERMINAL TEXT SIZE</label><span>{Math.round(settings.fontScale * 100)}%</span></div><input id="font-scale" className="range-field" type="range" min="0.85" max="1.2" step="0.05" value={settings.fontScale} onChange={(event) => updateSettings({ ...settings, fontScale: Number(event.target.value) })} /><p className="field-help">Adjust text scale for mobile and desktop comfort.</p></div></section>}

          {panel === 'config' && <section className="config-layout"><div className="panel-card"><div className="panel-card-heading"><div><span>IDENTITY BACKEND</span><h2>Firebase configuration</h2></div><GearSix size={20} /></div><div className="config-notice"><Info size={18} /><p>Firebase enables cross-device accounts and globally unique usernames. Without it, accounts work only in this browser. Add a Firebase Web App configuration below, enable Email/Password Authentication, and apply the included Firestore rules.</p></div><div className="config-fields">{([
            ['apiKey', 'API KEY', 'Firebase web API key'],
            ['authDomain', 'AUTH DOMAIN', 'your-project.firebaseapp.com'],
            ['projectId', 'PROJECT ID', 'your-project-id'],
            ['appId', 'APP ID', '1:000000000:web:...'],
            ['messagingSenderId', 'MESSAGING SENDER ID', 'Optional numeric sender ID']
          ] as const).map(([field, label, placeholder]) => <div key={field}><label className="field-label" htmlFor={`firebase-${field}`}>{label}</label><input id={`firebase-${field}`} className="text-field" value={settings.firebaseConfig[field]} onChange={(event) => updateConfigField(field, event.target.value)} placeholder={placeholder} autoComplete="off" /></div>)}</div><div className="config-actions"><span className={`config-state ${cloudMode ? 'ready' : ''}`}><i /> {cloudMode ? 'CONFIGURATION DETECTED' : 'LOCAL MODE ACTIVE'}</span><button className="secondary-button" onClick={() => { updateSettings({ ...settings, firebaseConfig: { apiKey: '', authDomain: '', projectId: '', appId: '', messagingSenderId: '' } }); setToast('Firebase configuration cleared. Sign in again to use local mode.'); }}>CLEAR CONFIG</button></div><div className="field-help config-warning">Changing cloud configuration does not migrate local accounts. Sign out and create a new cloud account after setup.</div></div></section>}

          {panel === 'history' && <section className="panel-card history-card"><div className="panel-card-heading"><div><span>SESSION LOG</span><h2>Conversation history</h2></div><button className="icon-button" onClick={() => { if (user) saveHistory(user.username, entries); setToast('History saved locally.'); }} aria-label="Save history"><DownloadSimple size={17} /></button></div>{entries.length ? <div className="history-list">{[...entries].reverse().map((entry) => <div className="history-row" key={entry.id}><span className={`history-role ${entry.role}`}>{entry.role.toUpperCase()}</span><div><p>{entry.text.slice(0, 180) || 'Response is being typed...'}</p><time>{new Date(entry.timestamp).toLocaleString()}</time></div><button onClick={() => { setPanel('console'); setPrompt(entry.role === 'user' ? entry.text : `Continue from this response:\n${entry.text}`); }} title="Reuse text"><ArrowCounterClockwise size={16} /></button></div>)}</div> : <div className="empty-state"><ClockCounterClockwise size={27} /><strong>No history yet</strong><p>Requests and replies will appear here.</p></div>}</section>}

          {panel === 'files' && <section className="panel-card files-card"><div className="panel-card-heading"><div><span>GENERATED OUTPUT</span><h2>Code files</h2></div><FolderOpen size={20} /></div>{files.length ? <div className="file-grid">{files.map((file) => <div className="file-card" key={`${file.name}-${file.updatedAt}`}><div className="file-card-icon"><FileText size={22} /></div><div className="file-card-copy"><strong>{file.name}</strong><span>{file.language} · {formatNumber(file.code.length)} chars</span><small>{new Date(file.updatedAt).toLocaleString()}</small></div><div className="file-card-actions"><button onClick={() => void copyText(file.code)} aria-label={`Copy ${file.name}`}><CopySimple size={16} /></button><button onClick={() => downloadText(file.name, file.code)} aria-label={`Download ${file.name}`}><DownloadSimple size={16} /></button></div></div>)}</div> : <div className="empty-state"><FolderOpen size={28} /><strong>No generated files</strong><p>Ask CodEX to create code in Console. Use SAVE FILE under a code block to store it here.</p><button className="secondary-button" onClick={() => changePanel('console')}>OPEN CONSOLE</button></div>}</section>}

          {panel === 'snippets' && <section className="snippets-layout"><div className="panel-card snippet-create"><div className="panel-card-heading"><div><span>QUICK STORAGE</span><h2>Save a snippet</h2></div><Plus size={20} /></div><label className="field-label" htmlFor="snippet-name">SNIPPET NAME</label><input id="snippet-name" className="text-field" value={snippetName} onChange={(event) => setSnippetName(event.target.value)} placeholder="useful-function" /><label className="field-label" htmlFor="snippet-code">CODE</label><textarea id="snippet-code" className="snippet-textarea" placeholder="Paste a short code snippet..." rows={7} /><button className="secondary-button full-button" onClick={() => { const code = (document.getElementById('snippet-code') as HTMLTextAreaElement | null)?.value ?? ''; if (!snippetName.trim() || !code.trim()) { setToast('Add a name and code first.'); return; } const next = [{ name: snippetName.trim(), code, updatedAt: Date.now() }, ...snippets].slice(0, 80); setSnippets(next); setSnippetName(''); (document.getElementById('snippet-code') as HTMLTextAreaElement).value = ''; setToast('Snippet saved locally.'); }}><Plus size={16} /> SAVE SNIPPET</button></div><div className="panel-card snippets-list-card"><div className="panel-card-heading"><div><span>PERSONAL LIBRARY</span><h2>Saved snippets</h2></div><CodeBlock size={20} /></div>{snippets.length ? snippets.map((snippet, index) => <div className="snippet-row" key={`${snippet.name}-${snippet.updatedAt}`}><div><strong>{snippet.name}</strong><small>{formatNumber(snippet.code.length)} characters</small></div><div><button onClick={() => void copyText(snippet.code)}><CopySimple size={15} /></button><button onClick={() => downloadText(`${snippet.name.replace(/[^a-zA-Z0-9._-]/g, '-')}.txt`, snippet.code)}><DownloadSimple size={15} /></button><button onClick={() => { setSnippets((current) => current.filter((_, itemIndex) => itemIndex !== index)); setToast('Snippet removed.'); }}><Trash size={15} /></button></div></div>) : <div className="empty-state compact-empty"><CodeBlock size={25} /><strong>Your snippet library is empty</strong><p>Save reusable code fragments here.</p></div>}</div></section>}

          {panel === 'help' && <section className="help-layout"><div className="panel-card"><div className="panel-card-heading"><div><span>TERMINAL MANUAL</span><h2>Command reference</h2></div><Question size={20} /></div><div className="command-table">{[
            ['help', 'Show all available commands'], ['overview', 'Open workspace overview'], ['console', 'Open the AI console'], ['clear', 'Clear the visible console'], ['usage', 'View local token consumption'], ['models', 'Open the Gemini model catalogue'], ['models refresh', 'Fetch models using your API key'], ['status', 'Show environment diagnostics'], ['settings', 'Open preferences and Gemini key'], ['config', 'Open Firebase configuration'], ['history', 'Review the current conversation'], ['files', 'Browse generated code files'], ['snippets', 'Open your snippet library'], ['theme amber', 'Switch to amber terminal colors'], ['export', 'Download the current transcript'], ['new', 'Start a fresh conversation'], ['logout', 'Sign out of the current account']
          ].map(([name, description]) => <div className="command-row" key={name}><code>{name}</code><span>{description}</span><button onClick={() => { setPrompt(name); setPanel('console'); }} title={`Use ${name}`}><ArrowCounterClockwise size={15} /></button></div>)}</div></div><div className="panel-card shortcut-card"><div className="panel-card-heading"><div><span>KEYBOARD</span><h2>Shortcuts</h2></div><Command size={20} /></div><div className="shortcut-row"><span>Send command</span><kbd>ENTER</kbd></div><div className="shortcut-row"><span>New line</span><kbd>SHIFT + ENTER</kbd></div><div className="shortcut-row"><span>Send command alternative</span><kbd>CTRL + ENTER</kbd></div><div className="shortcut-row"><span>Command history</span><kbd>↑ / ↓</kbd></div><div className="help-note">CodEX AI runs in your browser. It does not execute shell commands on your phone or computer; generated code can be copied or downloaded as files.</div></div></section>}

          <footer className="app-footer"><span>CODEX AI / TERMINAL ENVIRONMENT</span><span>LOCAL TIME {formatTime(now)} <b>·</b> BUILD 1.0.0</span></footer>
        </div>
      </main>
      {toast && <div className="toast-message" role="status"><CheckCircle size={17} />{toast}</div>}
    </div>
  );
}

export default App;
