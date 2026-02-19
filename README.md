# superintent-remote

Remote control for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI from your phone over [Tailscale](https://tailscale.com) or your local network.

SSH into a shared terminal session running Claude Code on your Mac — from any device on your Tailscale network or local WiFi.

## Why

- Work from your desk, then switch to your phone when you walk away
- Lie in bed and dictate code using your phone's voice keyboard — Claude codes, you review
- Pick up exactly where you left off — the shared tmux session keeps full context

## How it works

```
Phone (SSH client)  →  Tailscale VPN  →  Mac:2222  →  tmux session  →  Claude Code CLI
```

All connected clients share a single terminal session. A 512KB scrollback buffer is replayed to new connections so you never lose context.

## Prerequisites

- [Bun](https://bun.sh) runtime
- [tmux](https://github.com/tmux/tmux) — `brew install tmux`
- [Tailscale](https://tailscale.com/download) — installed and running (or use `--local` for LAN mode)

## Install

```bash
# Run directly (no install needed)
bunx superintent-remote

# Or install globally
bun add -g superintent-remote
```

## Usage

### Tailscale (default)

Binds to your Tailscale IP — only devices on your Tailnet can connect.

```bash
superintent-remote
```

### Local network

No Tailscale needed. Binds to your LAN IP (e.g. `192.168.x.x`). Password is always required in this mode.

```bash
superintent-remote --local
```

### More examples

```bash
# Custom port
superintent-remote --port 3000

# No password (Tailscale only — not allowed with --local)
superintent-remote --no-auth

# Attach to an existing tmux session
superintent-remote --attach my-session

# Suppress QR code in banner
superintent-remote --no-qr
```

### From source

```bash
bun install
bun start
```

On startup you'll see:

```
=== Superintent Remote v1.0.0 (SSH) ===
Project:   /path/to/your/project
Tmux:      project-a1b2c3
Connect:   ssh user@100.x.x.x -p 2222
Password:  e4f7a1b2c3d4e5f6

Scan to connect:
████  ██  ████  ████  ██  ██  ██
██    ████  ██    ██  ████    ██
████  ██    ████  ██    ██  ████
      ██  ██    ████  ██  ██
████████████  ██  ██  ██  ██████
████      ██    ████      ██  ██
████ ████ ██  ██  ██  ██  ██  ██
████ ████ ██    ████  ██      ██
████ ████ ██  ██    ██  ██  ████
████      ██  ████  ████      ██
████████████  ██  ██  ██  ██████
  ...
```

A QR code is rendered in the terminal for easy mobile scanning (e.g. tap in Termius to auto-fill the SSH connection). Use `--no-qr` to suppress it.

Connect from your phone using any SSH client (e.g. [Termius](https://termius.com)):

```bash
ssh user@100.x.x.x -p 2222
```

## CLI Options

| Flag | Description |
|------|-------------|
| `--port <n>` | SSH port (default: `2222`) |
| `--local` | Bind to local network IP instead of Tailscale (password required) |
| `--no-auth` | Disable password authentication (not allowed with `--local`) |
| `--attach <name>` | Attach to an existing tmux session instead of creating a new one |
| `--no-qr` | Suppress the QR code in the startup banner |
| `-h, --help` | Show help |

## Environment Variables

Set in `.superintent/.env` (recommended) or as shell env vars:

| Variable | Description |
|----------|-------------|
| `SUPERINTENT_REMOTE_PASSWORD` | Set a fixed password instead of auto-generating one |

## Security

By default, the SSH server binds exclusively to your Tailscale IP — it is not exposed to the public internet.

With `--local`, the server binds to your LAN IP (e.g. `192.168.x.x`). This means anyone on the same WiFi network can attempt to connect. Password authentication is enforced in this mode (`--no-auth` is blocked), and a warning banner is displayed on startup.

Additional hardening:

- **Password**: 16-character random hex (or custom via env var)
- **Timing-safe comparison**: Prevents timing side-channel attacks
- **Rate limiting**: 5 failed auth attempts per IP triggers a 60-second lockout
- **Connection cap**: Max 10 concurrent connections
- **Idle timeout**: 30-minute inactivity timeout per connection
- **Audit logging**: All connections, disconnections, and auth events are logged
- **Host keys**: ED25519 keys generated on first run, stored at `~/.cache/superintent-remote/host_key`

## Development

```bash
# Run in watch mode
bun run dev

# Type check
bun run typecheck

# Run tests
bun test

# Lint
bun run lint

# Format
bun run format
```

## License

MIT
