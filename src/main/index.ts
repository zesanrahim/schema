import { app, BrowserWindow, ipcMain, globalShortcut } from "electron";
import path from "path";
import { execSync } from "child_process";
import * as pty from "node-pty";
import type { IpcInvoke, IpcEvents, Worktree, Agent, AgentStatus } from "../shared/types";
import { clearToken, startDeviceFlow, pollForToken, getAuthStatus } from "./github";

const dev = process.env.NODE_ENV !== "production";
const repoRoot = process.cwd();

const worktrees = new Map<string, Worktree>();
const agents = new Map<string, Agent>();
const processes = new Map<string, pty.IPty>();

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

function loadWorktreesFromGit() {
  const output = execSync("git worktree list --porcelain", { cwd: repoRoot }).toString();
  const blocks = output.split("\n\n").filter(Boolean);
  blocks.forEach((block, i) => {
    const lines = block.split("\n");
    const pathLine = lines.find((l) => l.startsWith("worktree "));
    const branchLine = lines.find((l) => l.startsWith("branch "));
    if (!pathLine) return;
    const worktreePath = pathLine.slice("worktree ".length);
    const branch = branchLine ? branchLine.slice("branch refs/heads/".length) : "detached";
    const worktree: Worktree = { id: crypto.randomUUID(), branch, path: worktreePath, isMain: i === 0 };
    worktrees.set(worktree.id, worktree);
  });
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

handle("worktree:create", ({ branch }) => {
  const repoName = path.basename(repoRoot);
  const slug = branch.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  const worktreePath = path.join(path.dirname(repoRoot), `${repoName}-${slug}`);
  const branchExists = execSync(`git branch --list "${branch}"`, { cwd: repoRoot }).toString().trim() !== "";
  const cmd = branchExists
    ? `git worktree add "${worktreePath}" "${branch}"`
    : `git worktree add "${worktreePath}" -b "${branch}"`;
  execSync(cmd, { cwd: repoRoot });
  const worktree: Worktree = { id: crypto.randomUUID(), branch, path: worktreePath, isMain: false };
  worktrees.set(worktree.id, worktree);
  return worktree;
});

handle("worktree:list", () => Array.from(worktrees.values()));

handle("worktree:remove", ({ id }) => {
  const worktree = worktrees.get(id);
  if (worktree) {
    execSync(`git worktree remove "${worktree.path}"`, { cwd: repoRoot });
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

  const shell = process.env.SHELL ?? "/bin/zsh";
  const proc = pty.spawn(shell, ["-lc", command.join(" ")], {
    cwd: worktree.path,
    env: { ...process.env },
    cols: 220,
    rows: 50,
  });

  processes.set(agent.id, proc);
  agents.set(agent.id, agent);

  proc.onData((data) => {
    send("log:line", {
      agentId: agent.id,
      data,
      timestamp: Date.now(),
    });
  });

  proc.onExit(({ exitCode }) => {
    const status: AgentStatus = exitCode === 0 ? "stopped" : "error";
    const a = agents.get(agent.id);
    if (a) a.status = status;
    send("agent:status", { id: agent.id, status });
    processes.delete(agent.id);
  });

  return agent;
});

handle("agent:kill", ({ id }) => {
  processes.get(id)?.kill("SIGTERM");
  processes.delete(id);
  const agent = agents.get(id);
  if (agent) agent.status = "stopped";
});

handle("agent:list", () => Array.from(agents.values()));

handle("agent:input", ({ id, data }) => {
  processes.get(id)?.write(data);
});

handle("agent:resize", ({ id, cols, rows }) => {
  processes.get(id)?.resize(cols, rows);
});

handle("github:auth-start", () => startDeviceFlow());
handle("github:auth-poll", () => pollForToken());
handle("github:auth-status", () => getAuthStatus());
handle("github:auth-disconnect", () => { clearToken(); });

app.whenReady().then(() => {
  loadWorktreesFromGit();
  createWindow();
  globalShortcut.register("CommandOrControl+R", () => {
    app.relaunch();
    app.exit(0);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});
