import { spawn, spawnSync } from "child_process";
import type { SpawnOptions, ChildProcess } from "child_process";

export const LOGIN_SHELL = process.env.SHELL ?? "/bin/sh";

export function spawnLoginShell(script: string, opts: SpawnOptions): ChildProcess {
  return spawn(LOGIN_SHELL, ["-lc", script], opts);
}

export function runLoginShellSync(cmd: string, timeout = 8000): string {
  const result = spawnSync(LOGIN_SHELL, ["-lc", cmd], { encoding: "utf8", timeout });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `exit ${result.status}`);
  return result.stdout.trim();
}
