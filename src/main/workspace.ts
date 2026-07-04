import { spawn, ChildProcess } from "child_process";
import { shell } from "electron";
import type { Sender, Workspace } from "../shared/types";

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

export function startWorkspace(worktreeId: string, cwd: string, command: string) {
  if (processes.has(worktreeId)) return;

  const ws: Workspace = { worktreeId, status: "starting", port: null, url: null };
  workspaces.set(worktreeId, ws);
  emit(ws);

  const userShell = process.env.SHELL ?? "/bin/zsh";
  const proc = spawn(userShell, ["-lc", command], {
    cwd,
    env: { ...process.env },
  });
  processes.set(worktreeId, proc);

  const urlRe = /https?:\/\/localhost:(\d+)/i;
  let gotOutput = false;

  function onData(chunk: Buffer) {
    const text = chunk.toString();
    if (!gotOutput) {
      gotOutput = true;
      if (ws.status === "starting") {
        ws.status = "running";
        emit(ws);
      }
    }
    const match = text.match(urlRe);
    if (match && match[0] && match[1] && !ws.url) {
      ws.url = match[0].replace(/\/$/, "");
      ws.port = parseInt(match[1], 10);
      emit(ws);
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
