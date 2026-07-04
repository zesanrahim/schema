import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { spawn } from "child_process";
import { execSync } from "child_process";
import type { IpcInvoke, IpcEvents, Worktree, Agent, AgentStatus } from "../shared/types";

const dev = process.env.NODE_ENV !== "production";

const worktrees = new Map<string, Worktree>();
const agents = new Map<string, Agent>();
const processes = new Map<string, ReturnType<typeof spawn>>();

let mainWindow: BrowserWindow | null = null;

function send<K extends keyof IpcEvents>(channel: K, payload: IpcEvents[K]) {
  mainWindow?.webContents.send(channel, payload);
}

function handle<K extends keyof IpcInvoke>(
  channel: K,
  handler: (args: IpcInvoke[K]["args"]) => IpcInvoke[K]["result"] | Promise<IpcInvoke[K]["result"]>
) {
  ipcMain.handle(channel as string, (_event, args: IpcInvoke[K]["args"]) => handler(args));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (dev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

handle("worktree:create", ({ branch, path: worktreePath }) => {
  execSync(`git worktree add "${worktreePath}" -b "${branch}"`);
  const worktree: Worktree = {
    id: crypto.randomUUID(),
    branch,
    path: worktreePath,
  };
  worktrees.set(worktree.id, worktree);
  return worktree;
});

handle("worktree:list", (_args) => Array.from(worktrees.values()));

handle("worktree:remove", ({ id }) => {
  const worktree = worktrees.get(id);
  if (worktree) {
    execSync(`git worktree remove "${worktree.path}"`);
    worktrees.delete(id);
  }
});

handle("agent:spawn", ({ worktreeId, command }) => {
  const worktree = worktrees.get(worktreeId);
  if (!worktree) throw new Error(`Worktree ${worktreeId} not found`);

  const agent: Agent = {
    id: crypto.randomUUID(),
    worktreeId,
    command,
    status: "running",
    startedAt: Date.now(),
  };

  const [cmd, ...cmdArgs] = command;
  const proc = spawn(cmd!, cmdArgs, { cwd: worktree.path });

  processes.set(agent.id, proc);
  agents.set(agent.id, agent);

  const pipeStream = (stream: "stdout" | "stderr") => (data: Buffer) => {
    send("log:line", {
      agentId: agent.id,
      stream,
      data: data.toString(),
      timestamp: Date.now(),
    });
  };

  proc.stdout?.on("data", pipeStream("stdout"));
  proc.stderr?.on("data", pipeStream("stderr"));

  proc.on("close", (code) => {
    const status: AgentStatus = code === 0 ? "stopped" : "error";
    const a = agents.get(agent.id);
    if (a) a.status = status;
    send("agent:status", { id: agent.id, status });
    processes.delete(agent.id);
  });

  return agent;
});

handle("agent:kill", ({ id }) => {
  processes.get(id)?.kill();
  processes.delete(id);
  const agent = agents.get(id);
  if (agent) agent.status = "stopped";
});

handle("agent:list", (_args) => Array.from(agents.values()));

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});
