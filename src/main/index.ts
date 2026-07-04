import { app, BrowserWindow, ipcMain, globalShortcut, dialog } from "electron";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import type { IpcInvoke, IpcEvents, Repo, Worktree } from "../shared/types";

import { clearToken, startDeviceFlow, pollForToken, getAuthStatus } from "./github";
import { chats as chatStore, loadChats, createChat, listChats, deleteChat, getMessages, sendMessage } from "./chat";

const dev = process.env.NODE_ENV !== "production";

const repos = new Map<string, Repo>();
const worktrees = new Map<string, Worktree>();

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

function reposStorePath() {
  return path.join(app.getPath("userData"), "repos.json");
}

function saveRepos() {
  fs.writeFileSync(reposStorePath(), JSON.stringify(Array.from(repos.values())));
}

function loadWorktreesForRepo(repo: Repo): Worktree[] {
  const output = execSync("git worktree list --porcelain", { cwd: repo.path }).toString();
  const blocks = output.split("\n\n").filter(Boolean);
  const result: Worktree[] = [];
  blocks.forEach((block, i) => {
    const lines = block.split("\n");
    const pathLine = lines.find((l) => l.startsWith("worktree "));
    const branchLine = lines.find((l) => l.startsWith("branch "));
    if (!pathLine) return;
    const worktreePath = pathLine.slice("worktree ".length);
    const branch = branchLine ? branchLine.slice("branch refs/heads/".length) : "detached";
    const wt: Worktree = { id: crypto.randomUUID(), repoId: repo.id, branch, path: worktreePath, isMain: i === 0 };
    worktrees.set(wt.id, wt);
    result.push(wt);
  });
  return result;
}

function initRepos() {
  try {
    const stored = JSON.parse(fs.readFileSync(reposStorePath(), "utf8")) as Repo[];
    for (const repo of stored) {
      repos.set(repo.id, repo);
      try { loadWorktreesForRepo(repo); } catch {}
    }
  } catch {
    const repoPath = process.cwd();
    const repo: Repo = { id: crypto.randomUUID(), name: path.basename(repoPath), path: repoPath };
    repos.set(repo.id, repo);
    try { loadWorktreesForRepo(repo); } catch {}
    saveRepos();
  }
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

  mainWindow.on("closed", () => { mainWindow = null; });
}

handle("repo:add", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: "Select Git Repository",
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) throw new Error("Canceled");
  const repoPath = result.filePaths[0];
  try { execSync("git rev-parse --git-dir", { cwd: repoPath, stdio: "ignore" }); } catch {
    throw new Error("Not a git repository");
  }
  const repo: Repo = { id: crypto.randomUUID(), name: path.basename(repoPath), path: repoPath };
  repos.set(repo.id, repo);
  saveRepos();
  const repoWorktrees = loadWorktreesForRepo(repo);
  return { repo, worktrees: repoWorktrees };
});

handle("repo:list", () => Array.from(repos.values()));

handle("repo:remove", ({ id }) => {
  const repoWorktrees = Array.from(worktrees.values()).filter((w) => w.repoId === id);
  for (const wt of repoWorktrees) worktrees.delete(wt.id);
  repos.delete(id);
  saveRepos();
});

handle("worktree:create", ({ repoId, branch }) => {
  const repo = repos.get(repoId);
  if (!repo) throw new Error(`Repo ${repoId} not found`);
  const slug = branch.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  const worktreePath = path.join(path.dirname(repo.path), `${repo.name}-${slug}`);
  const branchExists = execSync(`git branch --list "${branch}"`, { cwd: repo.path }).toString().trim() !== "";
  const cmd = branchExists
    ? `git worktree add "${worktreePath}" "${branch}"`
    : `git worktree add "${worktreePath}" -b "${branch}"`;
  execSync(cmd, { cwd: repo.path });
  const wt: Worktree = { id: crypto.randomUUID(), repoId, branch, path: worktreePath, isMain: false };
  worktrees.set(wt.id, wt);
  return wt;
});

handle("worktree:list", () => Array.from(worktrees.values()));

handle("worktree:remove", ({ id }) => {
  const wt = worktrees.get(id);
  if (!wt) return;
  const repo = repos.get(wt.repoId);
  if (repo) execSync(`git worktree remove "${wt.path}"`, { cwd: repo.path });
  worktrees.delete(id);
});

handle("worktree:commit-push", ({ id }) => {
  const wt = worktrees.get(id);
  if (!wt) throw new Error(`Worktree ${id} not found`);
  execSync("git add -A", { cwd: wt.path });
  const stat = execSync("git diff --cached --stat", { cwd: wt.path }).toString().trim();
  if (!stat) throw new Error("Nothing to commit");
  const lines = stat.split("\n");
  const summary = lines.at(-1)?.trim() ?? "";
  const changed = lines.slice(0, -1).map((l) => l.trim().split(" ")[0]);
  const commitMessage = changed.length === 1
    ? `update ${changed[0]}`
    : `update ${changed.length} files (${summary})`;
  execSync(`git commit -m "${commitMessage}"`, { cwd: wt.path });
  execSync("git push", { cwd: wt.path });
  return { commitMessage };
});

handle("chat:create", ({ worktreeId }) => createChat(worktreeId));
handle("chat:list", ({ worktreeId }) => listChats(worktreeId));
handle("chat:delete", ({ id }) => deleteChat(id));
handle("chat:messages", ({ chatId }) => getMessages(chatId));

handle("chat:send", ({ chatId, message }) => {
  const chat = chatStore.get(chatId);
  if (!chat) throw new Error(`Chat ${chatId} not found`);
  const wt = worktrees.get(chat.worktreeId);
  if (!wt) throw new Error("Worktree not found for chat");
  sendMessage(chatId, message, wt.path, (channel, payload) => {
    mainWindow?.webContents.send(channel, payload);
  });
});

handle("github:auth-start", () => startDeviceFlow());
handle("github:auth-poll", () => pollForToken());
handle("github:auth-status", () => getAuthStatus());
handle("github:auth-disconnect", () => { clearToken(); });

app.whenReady().then(() => {
  initRepos();
  loadChats();
  createWindow();
  globalShortcut.register("CommandOrControl+R", () => {
    app.relaunch();
    app.exit(0);
  });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (mainWindow === null) createWindow(); });
