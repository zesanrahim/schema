import { ChildProcess } from "child_process";
import { shell } from "electron";
import type { Sender, Workspace } from "../shared/types";
import { spawnLoginShell } from "./shell";

const workspaces = new Map<string, Workspace>();
const processes = new Map<string, ChildProcess>();

let globalSend: Sender = () => {};

export function setWorkspaceSender(send: Sender) {
  globalSend = send;
}

function emit(ws: Workspace) {
  globalSend("workspace:update", { workspace: { ...ws } });
}

export function getWorkspace(worktreeId: string): Workspace {
  return workspaces.get(worktreeId) ?? { worktreeId, status: "stopped", port: null, url: null };
}

const portPatterns = [
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})/i,
  /(?:^|[\s,])(?:localhost|0\.0\.0\.0|127\.0\.0\.1):(\d{4,5})/im,
  /\bport[:\s]+(\d{4,5})\b/i,
  /:(\d{4,5})(?:\/|\s|$)/m,
];

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

function detectPort(text: string): number | null {
  for (const re of portPatterns) {
    const match = text.match(re);
    if (match?.[1]) {
      const port = parseInt(match[1], 10);
      if (port >= 1024 && port <= 65535) return port;
    }
  }
  return null;
}

export function startWorkspace(worktreeId: string, cwd: string, command: string, branch: string) {
  if (processes.has(worktreeId)) return;

  const ws: Workspace = { worktreeId, status: "starting", port: null, url: null };
  workspaces.set(worktreeId, ws);
  emit(ws);

  const proc = spawnLoginShell(command, {
    cwd,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  processes.set(worktreeId, proc);

  let gotOutput = false;
  let outputBuffer = "";

  function onData(chunk: Buffer) {
    if (!gotOutput) {
      gotOutput = true;
      ws.status = "running";
      emit(ws);
    }

    if (!ws.url) {
      outputBuffer += stripAnsi(chunk.toString());
      if (outputBuffer.length > 8192) outputBuffer = outputBuffer.slice(-8192);
      const port = detectPort(outputBuffer);
      if (port) {
        ws.port = port;
        const slug = branch.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-|-$/g, "");
        ws.url = `http://${slug}.localhost:${port}`;
        emit(ws);
      }
    }
  }

  proc.stdout?.on("data", onData);
  proc.stderr?.on("data", onData);

  proc.on("close", (code) => {
    processes.delete(worktreeId);
    ws.status = code === 0 || code === null ? "stopped" : "error";
    ws.url = null;
    ws.port = null;
    emit(ws);
  });

  proc.on("error", () => {
    processes.delete(worktreeId);
    ws.status = "error";
    ws.url = null;
    ws.port = null;
    emit(ws);
  });
}

export function stopWorkspace(worktreeId: string) {
  const proc = processes.get(worktreeId);
  if (proc) {
    proc.kill("SIGTERM");
    processes.delete(worktreeId);
  }
  const ws = workspaces.get(worktreeId);
  if (ws) {
    ws.status = "stopped";
    ws.url = null;
    ws.port = null;
    emit(ws);
  }
}

export function openWorkspaceUrl(worktreeId: string) {
  const ws = workspaces.get(worktreeId);
  if (ws?.url) shell.openExternal(ws.url);
}

export function killAllWorkspaces() {
  for (const [id] of processes) stopWorkspace(id);
}
