import { findBinary } from "./utils.ts";

export interface TerminalClient {
  write(data: Buffer | Uint8Array | string): void;
}

type Terminal = NonNullable<Awaited<ReturnType<typeof Bun.spawn>>["terminal"]>;

let terminal: Terminal | null = null;
let shellProc: ReturnType<typeof Bun.spawn> | null = null;
const clients = new Set<TerminalClient>();

// Scrollback buffer for reconnect initial state
const MAX_SCROLLBACK = 512 * 1024; // 512KB
const scrollbackChunks: Buffer[] = [];
let scrollbackSize = 0;

// Wait for tmux shell to be ready before launching Claude CLI
const CLAUDE_LAUNCH_DELAY_MS = 500;

function appendScrollback(data: Buffer | Uint8Array): void {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  scrollbackChunks.push(buf);
  scrollbackSize += buf.length;

  // Trim from front when over limit
  while (scrollbackSize > MAX_SCROLLBACK && scrollbackChunks.length > 1) {
    const removed = scrollbackChunks.shift();
    if (removed) scrollbackSize -= removed.length;
  }
}

function getScrollbackBuffer(): Buffer {
  return Buffer.concat(scrollbackChunks);
}

export function getScrollback(): string {
  return getScrollbackBuffer().toString();
}

export function writeToTerminal(data: string | Uint8Array): void {
  if (terminal) terminal.write(data);
}

export function addClient(client: TerminalClient): void {
  clients.add(client);

  // Send scrollback so new connections see existing output
  if (scrollbackSize > 0) {
    client.write(getScrollbackBuffer());
  }
}

export function removeClient(client: TerminalClient): void {
  clients.delete(client);
}

const MIN_COLS = 1;
const MAX_COLS = 500;
const MIN_ROWS = 1;
const MAX_ROWS = 200;

export function resizeTerminal(cols: number, rows: number): void {
  if (!terminal) return;
  const clampedCols = Math.max(MIN_COLS, Math.min(MAX_COLS, Math.floor(cols)));
  const clampedRows = Math.max(MIN_ROWS, Math.min(MAX_ROWS, Math.floor(rows)));
  terminal.resize(clampedCols, clampedRows);
}

let tmuxSession: string | null = null;

export function getTmuxSession(): string | null {
  return tmuxSession;
}

export function spawnTerminal(sessionName: string, cwd?: string): ReturnType<typeof Bun.spawn> {
  const tmux = findBinary("tmux");
  if (!tmux) {
    throw new Error("tmux is required but not found. Install it: brew install tmux");
  }

  // Clean env: remove Claude Code vars, set locale
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  delete env.CLAUDE_CODE_ENTRY_VERSION;
  delete env.CLAUDE_CODE_ENV_VERSION;
  env.LANG = "en_US.UTF-8";
  env.LC_ALL = "en_US.UTF-8";
  env.TERM = "xterm-256color";

  const projectDir = cwd || process.cwd();

  // Kill any leftover session from a previous run
  Bun.spawnSync([tmux, "kill-session", "-t", sessionName], { env });

  // tmux new-session in the project directory
  const proc = Bun.spawn([tmux, "new-session", "-s", sessionName], {
    env,
    cwd: projectDir,
    terminal: {
      cols: 80,
      rows: 24,
      data(_term, data) {
        appendScrollback(data);
        for (const client of clients) {
          client.write(data);
        }
      },
    },
  });

  terminal = proc.terminal ?? null;
  shellProc = proc;
  tmuxSession = sessionName;
  scrollbackChunks.length = 0;
  scrollbackSize = 0;

  // Launch Claude Code CLI after tmux shell is ready
  setTimeout(() => {
    if (terminal) terminal.write("claude\r");
  }, CLAUDE_LAUNCH_DELAY_MS);

  return proc;
}

export function attachTerminal(sessionName: string): ReturnType<typeof Bun.spawn> {
  const tmux = findBinary("tmux");
  if (!tmux) {
    throw new Error("tmux is required but not found. Install it: brew install tmux");
  }

  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  delete env.CLAUDE_CODE_ENTRY_VERSION;
  delete env.CLAUDE_CODE_ENV_VERSION;
  env.LANG = "en_US.UTF-8";
  env.LC_ALL = "en_US.UTF-8";
  env.TERM = "xterm-256color";

  const proc = Bun.spawn([tmux, "attach-session", "-t", sessionName], {
    env,
    terminal: {
      cols: 80,
      rows: 24,
      data(_term, data) {
        appendScrollback(data);
        for (const client of clients) {
          client.write(data);
        }
      },
    },
  });

  terminal = proc.terminal ?? null;
  shellProc = proc;
  tmuxSession = sessionName;
  scrollbackChunks.length = 0;
  scrollbackSize = 0;

  return proc;
}

export function getProc(): ReturnType<typeof Bun.spawn> | null {
  return shellProc;
}

export function killTerminal(opts?: { keepSession?: boolean }): void {
  if (!opts?.keepSession) {
    const tmux = findBinary("tmux");
    if (tmux && tmuxSession) {
      Bun.spawnSync([tmux, "kill-session", "-t", tmuxSession]);
    }
  }

  if (shellProc && !shellProc.killed) {
    shellProc.kill("SIGTERM");
  }
  terminal = null;
  shellProc = null;
}
