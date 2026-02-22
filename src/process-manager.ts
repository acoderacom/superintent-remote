import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { Server } from "ssh2";
import { qrToTerminal } from "./qr.ts";
import { startSSHServer } from "./ssh-server.ts";
import { attachTerminal, getProc, killTerminal, spawnTerminal } from "./terminal.ts";
import { createTmuxSessionName, ensureCacheDir, hasTmuxSession, removePid, writePid } from "./utils.ts";

// Load .superintent/.env if it exists
function loadEnvFile(): void {
  const envPath = join(process.cwd(), ".superintent", ".env");
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed
        .slice(eqIndex + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      // Don't override existing env vars
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // File doesn't exist — that's fine
  }
}

loadEnvFile();

const pkg = await Bun.file(join(import.meta.dir, "../package.json")).json();

const MAX_RESTARTS = 10;

let shutdownRequested = false;
let sshServer: Server | null = null;
let currentSessionName = "";
let currentCwd = "";
let currentPort = 0;
let isAttachMode = false;

function generatePassword(): string {
  return randomBytes(8).toString("hex"); // 16-char hex
}

async function watchdog(): Promise<void> {
  let restartCount = 0;

  while (!shutdownRequested) {
    const proc = getProc();
    if (!proc) break;
    await proc.exited;

    if (shutdownRequested) break;

    restartCount++;
    if (restartCount > MAX_RESTARTS) {
      console.error(`[${new Date().toISOString()}] Terminal exceeded ${MAX_RESTARTS} restarts, giving up`);
      break;
    }

    const delay = Math.min(1000 * 2 ** restartCount, 60000);
    console.log(
      `[${new Date().toISOString()}] Terminal exited, restarting in ${delay / 1000}s... (attempt ${restartCount}/${MAX_RESTARTS})`,
    );
    await Bun.sleep(delay);

    if (shutdownRequested) break;

    if (isAttachMode && hasTmuxSession(currentSessionName)) {
      attachTerminal(currentSessionName);
    } else {
      spawnTerminal(currentSessionName, currentCwd);
    }
    console.log(`[${new Date().toISOString()}] Terminal restarted`);
  }
}

const SHUTDOWN_GRACE_MS = 3000;

async function shutdown(): Promise<void> {
  if (shutdownRequested) return;
  shutdownRequested = true;

  console.log("\nShutting down...");

  console.log("Stopping SSH server (waiting for active connections)...");
  if (sshServer) {
    // close() stops accepting new connections; existing connections drain
    await new Promise<void>((resolve) => {
      sshServer?.close(() => resolve());
      // Force close after grace period
      setTimeout(resolve, SHUTDOWN_GRACE_MS);
    });
    sshServer = null;
  }

  let keepSession = isAttachMode;
  if (!isAttachMode) {
    keepSession = !(await promptUser("Kill tmux session? [y/N] "));
  }

  if (keepSession) {
    console.log("Detaching from tmux session (session kept alive)...");
  } else {
    console.log("Killing tmux session...");
  }
  killTerminal({ keepSession });

  console.log("Cleaning up PID file...");
  await removePid(`wrapper-${currentPort}`);

  console.log("Done.");
  process.exit(0);
}

export interface StartOptions {
  ip: string;
  port: number;
  noAuth: boolean;
  attachSession?: string;
  noQr?: boolean;
  local?: boolean;
}

function promptUser(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes");
    });
  });
}

export async function startServices(opts: StartOptions): Promise<void> {
  ensureCacheDir();

  currentPort = opts.port;
  currentCwd = process.cwd();

  if (opts.attachSession) {
    if (hasTmuxSession(opts.attachSession)) {
      isAttachMode = true;
      currentSessionName = opts.attachSession;
      attachTerminal(currentSessionName);
    } else {
      console.error(`Session "${opts.attachSession}" not found.`);
      const create = await promptUser("Create a new session instead? [y/N] ");
      if (!create) {
        console.error("Aborted.");
        process.exit(0);
      }
      currentSessionName = createTmuxSessionName(currentCwd);
      spawnTerminal(currentSessionName, currentCwd);
    }
  } else {
    currentSessionName = createTmuxSessionName(currentCwd);
    spawnTerminal(currentSessionName, currentCwd);
  }

  // Determine password
  const password = opts.noAuth ? null : process.env.SUPERINTENT_REMOTE_PASSWORD || generatePassword();

  // Start SSH server
  sshServer = await startSSHServer({
    port: opts.port,
    host: opts.ip,
    password,
  });

  await writePid(`wrapper-${currentPort}`, process.pid);

  console.error("");
  if (opts.local) {
    console.error("WARNING: Binding to local network. Anyone on this WiFi can attempt to connect.");
    console.error("");
  }
  console.error(`=== Superintent Remote v${pkg.version} (SSH) ===`);
  console.error(`Project:   ${process.cwd()}`);
  console.error(`Tmux:      ${currentSessionName}`);
  console.error(`Connect:   ssh user@${opts.ip} -p ${opts.port}`);
  if (password) {
    console.error(`Password:  ${password}`);
  } else {
    console.error("Auth:      disabled (--no-auth)");
  }
  if (!opts.noQr) {
    const sshUri = `ssh://user@${opts.ip}:${opts.port}`;
    const qr = await qrToTerminal(sshUri);
    console.error("");
    console.error("Scan to connect:");
    for (const line of qr.trimEnd().split("\n")) {
      console.error(`  ${line}`);
    }
  }
  console.error("");
  console.error("Press Ctrl+C to stop.");

  // Signal handlers
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Watchdog loop (blocks until shutdown)
  await watchdog();
}
