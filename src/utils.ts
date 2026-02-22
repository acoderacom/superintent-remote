import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { basename, join } from "node:path";

export const SSH_PORT = 2222;
export const CACHE_DIR = join(homedir(), ".cache", "superintent-remote");
export const LOG_DIR = join(CACHE_DIR, "logs");

export function createTmuxSessionName(cwd: string): string {
  const folder = basename(cwd).replace(/[^a-zA-Z0-9_-]/g, "-");
  const suffix = randomBytes(3).toString("hex");
  return `${folder}-${suffix}-remote`;
}

export function hasTmuxSession(name: string): boolean {
  const tmux = findBinary("tmux");
  if (!tmux) return false;
  const result = Bun.spawnSync([tmux, "has-session", "-t", name]);
  return result.exitCode === 0;
}

const FALLBACK_PATHS: Record<string, string[]> = {
  tailscale: ["/opt/homebrew/bin/tailscale", "/usr/local/bin/tailscale"],
  tmux: ["/opt/homebrew/bin/tmux", "/usr/local/bin/tmux"],
};

export function findBinary(name: string): string | null {
  const found = Bun.which(name);
  if (found) return found;
  const fallbacks = FALLBACK_PATHS[name];
  if (!fallbacks) return null;
  for (const p of fallbacks) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function getTailscaleIp(): string | null {
  const tailscale = findBinary("tailscale");
  if (!tailscale) return null;

  // Check that Tailscale is actually running (not just returning cached IP)
  const status = Bun.spawnSync([tailscale, "status", "--json"]);
  if (!status.success) return null;
  try {
    const json = JSON.parse(status.stdout.toString());
    if (json.BackendState !== "Running") return null;
  } catch {
    return null;
  }

  const result = Bun.spawnSync([tailscale, "ip", "-4"]);
  if (!result.success) return null;
  return result.stdout.toString().trim() || null;
}

export function getLocalIp(): string | null {
  const interfaces = networkInterfaces();
  for (const addrs of Object.values(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal) {
        return addr.address;
      }
    }
  }
  return null;
}

export function ensureCacheDir(): void {
  mkdirSync(LOG_DIR, { recursive: true });
}

export function pidPath(name: string): string {
  return join(LOG_DIR, `${name}.pid`);
}

export async function writePid(name: string, pid: number): Promise<void> {
  await Bun.write(pidPath(name), String(pid));
}

export async function readPid(name: string): Promise<number | null> {
  const file = Bun.file(pidPath(name));
  if (!(await file.exists())) return null;
  const content = await file.text();
  const pid = parseInt(content.trim(), 10);
  return Number.isNaN(pid) ? null : pid;
}

export async function removePid(name: string): Promise<void> {
  try {
    unlinkSync(pidPath(name));
  } catch {
    // ignore if file doesn't exist
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
