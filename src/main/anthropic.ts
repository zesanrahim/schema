import { app, safeStorage } from "electron";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import type { AnthropicAuthStatus } from "../shared/types";

const KEY_FILE = () => path.join(app.getPath("userData"), "anthropic-key.bin");

function shell(cmd: string): string {
  const sh = process.env.SHELL ?? "/bin/zsh";
  const result = spawnSync(sh, ["-lc", cmd], { encoding: "utf8", timeout: 8000 });
  if (result.status !== 0) throw new Error(result.stderr || `exit ${result.status}`);
  return result.stdout.trim();
}

export function getStoredKey(): string | null {
  try {
    const buf = fs.readFileSync(KEY_FILE());
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
}

export function setStoredKey(key: string) {
  const encrypted = safeStorage.encryptString(key);
  fs.writeFileSync(KEY_FILE(), encrypted);
}

export function clearStoredKey() {
  try { fs.unlinkSync(KEY_FILE()); } catch {}
}

export function getMaskedKey(): string | null {
  const key = getStoredKey();
  if (!key) return null;
  return key.slice(0, 7) + "…" + key.slice(-4);
}

export function getAnthropicEnv(): Record<string, string> {
  const key = getStoredKey();
  return key ? { ANTHROPIC_API_KEY: key } : {};
}

export function getAuthStatus(): AnthropicAuthStatus {
  try {
    const out = shell("claude auth status --output-format json 2>/dev/null");
    const data = JSON.parse(out) as { loggedIn?: boolean; authMethod?: string; email?: string };
    return {
      loggedIn: data.loggedIn ?? false,
      authMethod: data.authMethod ?? null,
      email: data.email ?? null,
    };
  } catch {
    return { loggedIn: false, authMethod: null, email: null };
  }
}

export function authLogout() {
  try { shell("claude auth logout"); } catch {}
}
