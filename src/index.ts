#!/usr/bin/env bun

import { startServices } from "./process-manager.ts";
import { findBinary, getLocalIp, getTailscaleIp, isProcessAlive, readPid, SSH_PORT } from "./utils.ts";

const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
  const pkg = await import("../package.json");
  console.log(pkg.version);
  process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: superintent-remote [options]");
  console.log("");
  console.log("Options:");
  console.log("  --port <n>          SSH port (default: 2222)");
  console.log("  --local             Bind to local network IP (no Tailscale needed)");
  console.log("  --attach <session>  Attach to an existing tmux session");
  console.log("  --no-auth           Disable password authentication");
  console.log("  --no-qr             Disable QR code in startup banner");
  console.log("  -v, --version       Show version number");
  console.log("  -h, --help          Show this help");
  process.exit(0);
}

const noAuth = args.includes("--no-auth");
const noQr = args.includes("--no-qr");
const local = args.includes("--local");

if (local && noAuth) {
  console.error("ERROR: --local --no-auth is not allowed.");
  console.error("Password authentication is required when binding to the local network.");
  process.exitCode = 1;
  process.exit();
}
const portFlag = args.indexOf("--port");
const rawPort = portFlag !== -1 && args[portFlag + 1] ? parseInt(args[portFlag + 1], 10) : SSH_PORT;

const attachFlag = args.indexOf("--attach");
const attachSession = attachFlag !== -1 ? args[attachFlag + 1] : undefined;
if (attachFlag !== -1 && !attachSession) {
  console.error("ERROR: --attach requires a session name.");
  console.error("Usage: superintent-remote --attach <session-name>");
  process.exit(1);
}

if (Number.isNaN(rawPort) || rawPort < 1 || rawPort > 65535) {
  console.error(`ERROR: Invalid port number: ${args[portFlag + 1]}`);
  process.exit(1);
}
const port = rawPort;

// Check for already-running instance (write our PID atomically, then verify)
const existingPid = await readPid(`wrapper-${port}`);
if (existingPid && isProcessAlive(existingPid) && existingPid !== process.pid) {
  console.error("ERROR: Superintent Remote is already running on port %d (PID: %d).", port, existingPid);
  console.error("Kill it with Ctrl+C first.");
  process.exit(1);
}

if (!findBinary("tmux")) {
  console.error("ERROR: tmux is required but not found.");
  console.error("Install it: brew install tmux");
  process.exit(1);
}

let ip: string;
if (local) {
  const localIp = getLocalIp();
  if (!localIp) {
    console.error("ERROR: No local network interface found.");
    console.error("Make sure you are connected to a WiFi or Ethernet network.");
    process.exit(1);
  }
  ip = localIp;
} else {
  const tailscaleIp = getTailscaleIp();
  if (!tailscaleIp) {
    console.error("ERROR: Tailscale is not available or not running.");
    console.error("Install Tailscale: https://tailscale.com/download");
    console.error("Or use --local to bind to your local network instead.");
    process.exit(1);
  }
  ip = tailscaleIp;
}

await startServices({ ip, port, noAuth, attachSession, noQr, local });
