import { ChildProcessWithoutNullStreams } from "child_process";
import fs from "fs";
import path from "path";
import { app } from "electron";
import type { Chat, Message, ToolCall, Sender } from "../shared/types";
import type { ProviderId } from "../shared/types.provider";
import { toolInputPreview } from "../shared/toolPreview";
import { getAnthropicEnv } from "./anthropic";
import { getProvider } from "./providers";
import { spawnLoginShell } from "./shell";

export const chats = new Map<string, Chat>();
export const chatMessages = new Map<string, Message[]>();

const processes = new Map<string, ChildProcessWithoutNullStreams>();
const buffers = new Map<string, string>();
const activeMessages = new Map<string, Message>();
const armers = new Map<string, () => void>();
const disarmers = new Map<string, () => void>();

let globalSend: Sender = () => {};

export function setSender(send: Sender) {
  globalSend = send;
}

function dbg(chatId: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[chat:${chatId.slice(0, 6)}] ${ts} ${msg}`);
  globalSend("chat:debug", { chatId, message: `${ts} ${msg}` });
}

function storagePath() {
  return path.join(app.getPath("userData"), "chats.json");
}

export function loadChats() {
  try {
    const raw = JSON.parse(fs.readFileSync(storagePath(), "utf8")) as {
      chats: Chat[];
      messages: Record<string, Message[]>;
    };
    for (const c of raw.chats) chats.set(c.id, c);
    for (const [id, msgs] of Object.entries(raw.messages)) {
      for (const m of msgs) if (!m.done) m.done = true;
      chatMessages.set(id, msgs);
    }
  } catch {}
}

export function persistChats() {
  fs.writeFileSync(
    storagePath(),
    JSON.stringify({ chats: Array.from(chats.values()), messages: Object.fromEntries(chatMessages) })
  );
}

export function createChat(worktreeId: string, providerId: ProviderId = "claude"): Chat {
  const chat: Chat = {
    id: crypto.randomUUID(),
    worktreeId,
    sessionId: null,
    providerId,
    title: "New chat",
    createdAt: Date.now(),
  };
  chats.set(chat.id, chat);
  chatMessages.set(chat.id, []);
  persistChats();
  return chat;
}

export function listChats(worktreeId: string): Chat[] {
  return Array.from(chats.values())
    .filter((c) => c.worktreeId === worktreeId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteChat(id: string) {
  stopProcess(id);
  chats.delete(id);
  chatMessages.delete(id);
  persistChats();
}

export function getMessages(chatId: string): Message[] {
  return chatMessages.get(chatId) ?? [];
}

function stopProcess(chatId: string) {
  processes.get(chatId)?.kill("SIGTERM");
  processes.delete(chatId);
  armers.delete(chatId);
  disarmers.delete(chatId);
  buffers.delete(chatId);
  activeMessages.delete(chatId);
}

function spawnShell(script: string, cwd: string): ChildProcessWithoutNullStreams {
  return spawnLoginShell(script, {
    cwd,
    env: { ...process.env, ...getAnthropicEnv() },
    stdio: ["pipe", "pipe", "pipe"],
  }) as ChildProcessWithoutNullStreams;
}

function dispatchEvents(chatId: string, rawEvent: Record<string, unknown>) {
  const chat = chats.get(chatId);
  const provider = getProvider((chat?.providerId ?? "claude") as ProviderId);
  const normalized = provider.parseEvent(rawEvent);
  const msg = activeMessages.get(chatId);

  for (const ev of normalized) {
    if (ev.type === "text" && msg) {
      msg.content += ev.text;
      globalSend("chat:delta", { chatId, messageId: msg.id, text: ev.text });
    } else if (ev.type === "tool_start" && msg) {
      const tool: ToolCall = { id: ev.toolId, name: ev.toolName, input: ev.input };
      msg.toolCalls.push(tool);
      globalSend("chat:tool-start", { chatId, messageId: msg.id, tool: { ...tool, preview: toolInputPreview(tool.input, 60) } });
    } else if (ev.type === "tool_done" && msg) {
      const tool = msg.toolCalls.find((t) => t.id === ev.toolId);
      if (tool) {
        tool.output = ev.output;
        globalSend("chat:tool-done", { chatId, messageId: msg.id, toolId: ev.toolId, output: ev.output });
      }
    } else if (ev.type === "done") {
      dbg(chatId, `done — disarming timeout, sessionId=${ev.sessionId.slice(0, 12)}`);
      disarmers.get(chatId)?.();
      if (ev.sessionId && chat) chat.sessionId = ev.sessionId;
      if (msg) {
        msg.done = true;
        activeMessages.delete(chatId);
        persistChats();
        globalSend("chat:done", { chatId, messageId: msg.id });
      }
    } else if (ev.type === "error") {
      globalSend("chat:error", { chatId, error: ev.error });
      if (msg) { msg.done = true; activeMessages.delete(chatId); }
    }
  }
}

function ensureProcess(chatId: string, worktreePath: string): ChildProcessWithoutNullStreams {
  const existing = processes.get(chatId);
  if (existing) { dbg(chatId, "reusing existing process"); return existing; }

  const chat = chats.get(chatId);
  const provider = getProvider((chat?.providerId ?? "claude") as ProviderId);
  const script = provider.spawnScript(chat?.sessionId ?? null);
  const cwdExists = fs.existsSync(worktreePath);
  dbg(chatId, `cwd exists=${cwdExists} path=${worktreePath}`);
  if (!cwdExists) {
    globalSend("chat:error", { chatId, error: `Worktree path does not exist: ${worktreePath}` });
    throw new Error(`Worktree path does not exist: ${worktreePath}`);
  }
  dbg(chatId, `SHELL=${process.env.SHELL} PATH=${(process.env.PATH ?? "").slice(0, 120)}`);
  dbg(chatId, `spawning: ${script.slice(0, 80)} cwd=${worktreePath}`);
  const proc = spawnShell(script, worktreePath);
  dbg(chatId, `pid=${proc.pid} stdout=${proc.stdout ? "pipe" : "NULL"} stderr=${proc.stderr ? "pipe" : "NULL"}`);

  buffers.set(chatId, "");

  const stderrChunks: string[] = [];
  let responseTimeout: ReturnType<typeof setTimeout> | null = null;

  function armTimeout() {
    if (responseTimeout) clearTimeout(responseTimeout);
    dbg(chatId, "timeout armed (30s)");
    responseTimeout = setTimeout(() => {
      dbg(chatId, "TIMEOUT fired — killing process");
      const msg = activeMessages.get(chatId);
      if (msg) {
        msg.done = true;
        activeMessages.delete(chatId);
        const stderrText = stderrChunks.join("").trim();
        globalSend("chat:error", { chatId, error: stderrText || "No response from Claude (timeout)" });
      }
      proc.kill("SIGTERM");
      processes.delete(chatId);
    }, 30000);
  }

  proc.stdout.on("data", (chunk: Buffer) => {
    const raw = chunk.toString();
    dbg(chatId, `stdout ${raw.length}b: ${raw.slice(0, 120).replace(/\n/g, "↵")}`);
    armTimeout();
    const buf = (buffers.get(chatId) ?? "") + raw;
    const lines = buf.split("\n");
    buffers.set(chatId, lines.pop() ?? "");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        dbg(chatId, `event type=${event.type} subtype=${event.subtype ?? "-"}`);
        dispatchEvents(chatId, event);
      } catch {
        const text = line.trim();
        dbg(chatId, `non-JSON stdout: ${text.slice(0, 100)}`);
        if (text && !text.startsWith("{")) {
          const msg = activeMessages.get(chatId);
          if (msg) globalSend("chat:error", { chatId, error: text });
        }
      }
    }
  });

  proc.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    dbg(chatId, `STDERR: ${text.trim().slice(0, 200)}`);
    // Accumulate for diagnostics only. The Claude CLI writes non-fatal noise to
    // stderr; the real completion/failure signals come via stdout `result`
    // events and the `close` handler, so we don't kill on stderr here.
    stderrChunks.push(text);
  });

  proc.on("close", (code) => {
    dbg(chatId, `process closed code=${code}`);
    if (responseTimeout) clearTimeout(responseTimeout);
    processes.delete(chatId);
    armers.delete(chatId);
    disarmers.delete(chatId);
    buffers.delete(chatId);
    const msg = activeMessages.get(chatId);
    if (msg) {
      msg.done = true;
      activeMessages.delete(chatId);
      if (code !== 0 && stderrChunks.length > 0) {
        globalSend("chat:error", { chatId, error: stderrChunks.join("").trim() });
      } else {
        globalSend("chat:done", { chatId, messageId: msg.id });
      }
    }
  });

  proc.on("error", (err) => {
    dbg(chatId, `process error: ${err.message}`);
    if (responseTimeout) clearTimeout(responseTimeout);
    globalSend("chat:error", { chatId, error: err.message });
    processes.delete(chatId);
    armers.delete(chatId);
    disarmers.delete(chatId);
  });

  function disarmTimeout() {
    if (responseTimeout) { clearTimeout(responseTimeout); responseTimeout = null; }
  }

  armers.set(chatId, armTimeout);
  disarmers.set(chatId, disarmTimeout);
  processes.set(chatId, proc);
  return proc;
}

export function sendMessage(chatId: string, userText: string, worktreePath: string) {
  const chat = chats.get(chatId);
  if (!chat) throw new Error(`Chat ${chatId} not found`);

  const msgs = chatMessages.get(chatId) ?? [];

  const isSlashCommand = userText.startsWith("/");

  if (!isSlashCommand) {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: userText,
      toolCalls: [],
      timestamp: Date.now(),
      done: true,
    };
    msgs.push(userMsg);
    if (chat.title === "New chat") {
      chat.title = userText.length > 40 ? userText.slice(0, 40) + "…" : userText;
    }
  }

  const assistantId = crypto.randomUUID();
  const assistantMsg: Message = {
    id: assistantId,
    role: "assistant",
    content: "",
    toolCalls: [],
    timestamp: Date.now(),
    done: false,
  };
  msgs.push(assistantMsg);
  chatMessages.set(chatId, msgs);
  activeMessages.set(chatId, assistantMsg);
  persistChats();

  dbg(chatId, `sending message: ${userText.slice(0, 60)}`);
  const provider = getProvider(chat.providerId as ProviderId);
  const proc = ensureProcess(chatId, worktreePath);
  proc.stdin.write(provider.formatInput(userText));
  armers.get(chatId)?.();
}

export function killAllProcesses() {
  for (const [id] of processes) stopProcess(id);
}

let cachedCommands: Array<{ name: string; description: string }> | null = null;

export function fetchSlashCommands(worktreePath: string): Promise<Array<{ name: string; description: string }>> {
  if (cachedCommands) return Promise.resolve(cachedCommands);

  return new Promise((resolve) => {
    const proc = spawnShell("claude --output-format stream-json --dangerously-skip-permissions", worktreePath);

    let buf = "";
    let helpText = "";
    let sent = false;

    proc.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as Record<string, unknown>;
          if (event.type === "system" && !sent) {
            sent = true;
            proc.stdin.write("/help\n");
          }
          if (event.type === "assistant") {
            const content = (event.message as { content?: Array<Record<string, unknown>> }).content ?? [];
            for (const block of content) {
              if (block.type === "text") helpText += block.text as string;
            }
          }
          if (event.type === "result") {
            proc.kill();
            const parsed = parseHelpOutput(helpText);
            cachedCommands = parsed;
            resolve(parsed);
          }
        } catch {}
      }
    });

    const timeout = setTimeout(() => {
      proc.kill();
      resolve(parseHelpOutput(helpText));
    }, 15000);

    proc.on("close", () => {
      clearTimeout(timeout);
      const parsed = parseHelpOutput(helpText);
      cachedCommands = parsed;
      resolve(parsed);
    });

    proc.on("error", () => { clearTimeout(timeout); resolve([]); });
  });
}

function parseHelpOutput(text: string): Array<{ name: string; description: string }> {
  const commands: Array<{ name: string; description: string }> = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*\*?\*?`?(\/[a-z][a-z0-9_-]*)`?\*?\*?\s+[-–]?\s*(.*)/);
    if (match && match[1] && match[2]) {
      commands.push({ name: match[1].slice(1), description: match[2].trim() });
    }
  }
  return commands;
}
