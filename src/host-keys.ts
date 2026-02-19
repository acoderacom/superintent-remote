import { chmodSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const KEY_DIR = join(homedir(), ".cache", "superintent-remote");
const KEY_PATH = join(KEY_DIR, "host_key");

export async function getHostKey(): Promise<Buffer> {
  // Return existing key if present
  const file = Bun.file(KEY_PATH);
  if (await file.exists()) {
    return Buffer.from(await file.arrayBuffer());
  }

  // Generate new ED25519 key via ssh-keygen
  mkdirSync(KEY_DIR, { recursive: true });

  const result = Bun.spawnSync([
    "ssh-keygen",
    "-t",
    "ed25519",
    "-f",
    KEY_PATH,
    "-N",
    "", // no passphrase
    "-q",
  ]);

  if (!result.success) {
    throw new Error(`Failed to generate host key: ${result.stderr.toString()}`);
  }

  // Ensure correct permissions
  chmodSync(KEY_PATH, 0o600);

  // Remove the public key file (not needed for SSH server)
  const pubKeyPath = `${KEY_PATH}.pub`;
  try {
    unlinkSync(pubKeyPath);
  } catch {}

  return readFileSync(KEY_PATH);
}
