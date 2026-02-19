import { timingSafeEqual } from "node:crypto";
import type { AuthContext, Connection, Session } from "ssh2";
import { Server } from "ssh2";
import { getHostKey } from "./host-keys.ts";
import { addClient, removeClient, resizeTerminal, type TerminalClient, writeToTerminal } from "./terminal.ts";

interface SSHServerOptions {
  port: number;
  host: string;
  password: string | null; // null = no auth
  maxConnections?: number;
  idleTimeoutMs?: number;
}

const MAX_AUTH_FAILURES = 5;
const AUTH_LOCKOUT_MS = 60_000; // 1 minute lockout after max failures
const DEFAULT_MAX_CONNECTIONS = 10;
const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Per-IP auth failure tracking
const authFailures = new Map<string, { count: number; lockedUntil: number }>();

function recordAuthFailure(ip: string): boolean {
  const now = Date.now();
  const record = authFailures.get(ip) ?? { count: 0, lockedUntil: 0 };

  // Reset if lockout expired
  if (now > record.lockedUntil && record.lockedUntil > 0) {
    record.count = 0;
    record.lockedUntil = 0;
  }

  record.count++;
  if (record.count >= MAX_AUTH_FAILURES) {
    record.lockedUntil = now + AUTH_LOCKOUT_MS;
    authFailures.set(ip, record);
    return true; // locked out
  }

  authFailures.set(ip, record);
  return false;
}

function isLockedOut(ip: string): boolean {
  const record = authFailures.get(ip);
  if (!record) return false;
  if (Date.now() > record.lockedUntil && record.lockedUntil > 0) {
    authFailures.delete(ip);
    return false;
  }
  return record.count >= MAX_AUTH_FAILURES;
}

function clearAuthFailures(ip: string): void {
  authFailures.delete(ip);
}

export async function startSSHServer(opts: SSHServerOptions): Promise<Server> {
  const hostKey = await getHostKey();
  const maxConnections = opts.maxConnections ?? DEFAULT_MAX_CONNECTIONS;
  const idleTimeoutMs = opts.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  let activeConnections = 0;

  const server = new Server({ hostKeys: [hostKey] }, (client: Connection) => {
    // biome-ignore lint/suspicious/noExplicitAny: ssh2 does not expose socket type
    const clientIp = (client as any)._sock?.remoteAddress ?? "unknown";

    // Max connection limit
    if (activeConnections >= maxConnections) {
      log(`Connection rejected (limit ${maxConnections}): ${clientIp}`);
      client.end();
      return;
    }
    activeConnections++;
    log(`Connection opened: ${clientIp} (${activeConnections} active)`);

    // Idle timeout — reset on any data activity
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    function resetIdleTimer() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        log(`Idle timeout: ${clientIp} (${idleTimeoutMs / 1000}s)`);
        client.end();
      }, idleTimeoutMs);
    }

    resetIdleTimer();

    const expectedPassword = opts.password;

    client.on("authentication", (ctx: AuthContext) => {
      // No auth mode
      if (expectedPassword === null) {
        log(`Auth accepted (no-auth mode): ${clientIp}`);
        ctx.accept();
        return;
      }

      // Rate limiting — reject if locked out
      if (isLockedOut(clientIp)) {
        log(`Auth rejected (locked out): ${clientIp}`);
        ctx.reject(["password"]);
        return;
      }

      if (ctx.method === "password") {
        const input = Buffer.from(ctx.password);
        const expected = Buffer.from(expectedPassword);
        if (input.length === expected.length && timingSafeEqual(input, expected)) {
          clearAuthFailures(clientIp);
          log(`Auth accepted: ${clientIp}`);
          ctx.accept();
        } else {
          const locked = recordAuthFailure(clientIp);
          log(`Auth failed: ${clientIp}${locked ? ` (locked out for ${AUTH_LOCKOUT_MS / 1000}s)` : ""}`);
          ctx.reject(["password"]);
        }
      } else {
        ctx.reject(["password"]);
      }
    });

    client.on("ready", () => {
      client.on("session", (accept: () => Session) => {
        const session = accept();
        let _channel: TerminalClient | null = null;

        session.on("pty", (accept) => {
          accept?.();
        });

        session.on("shell", (accept) => {
          const stream = accept();

          // Wrap the SSH stream as a TerminalClient
          const termClient: TerminalClient = {
            write(data: Buffer | Uint8Array | string) {
              if (!stream.destroyed) {
                stream.write(data);
              }
            },
          };
          _channel = termClient;

          addClient(termClient);

          // Pipe SSH input to PTY — reset idle timer on activity
          stream.on("data", (data: Buffer) => {
            resetIdleTimer();
            writeToTerminal(data);
          });

          stream.on("close", () => {
            removeClient(termClient);
            _channel = null;
          });

          stream.on("error", () => {
            removeClient(termClient);
            _channel = null;
          });
        });

        session.on("window-change", (accept, _reject, info) => {
          accept?.();
          resizeTerminal(info.cols, info.rows);
        });
      });
    });

    client.on("close", () => {
      if (idleTimer) clearTimeout(idleTimer);
      activeConnections--;
      log(`Connection closed: ${clientIp} (${activeConnections} active)`);
    });

    client.on("error", () => {
      if (idleTimer) clearTimeout(idleTimer);
      activeConnections--;
    });
  });

  server.listen(opts.port, opts.host, () => {
    // Server is listening
  });

  return server;
}
