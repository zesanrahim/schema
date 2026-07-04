import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import fs from "fs";
import path from "path";
import { app } from "electron";
import type { Chat, Message, ToolCall, Sender } from "../shared/types";

export const chats = new Map<string, Chat>();
export const chatMessages = new Map<string, Message[]>();

const processes = new Map<string, ChildProcessWithoutNullStreams>();
const buffers = new Map<string, string>();
const activeMessages = new Map<string, Message>();

let globalSend: Sender = () => {};

export function setSender(send: Sender) {
  globalSend = send;
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
    for (const [id, msgs] of Object.entries(raw.messages)) chatMessages.set(id, msgs);
  } catch {}
}

export function persistChats() {
  fs.writeFileSync(
    storagePath(),
    JSON.stringify({ chats: Array.from(chats.values()), messages: Object.fromEntries(chatMessages) })
  );
}

export function createChat(worktreeId: string): Chat {
  const chat: Chat = {
    id: crypto.randomUUID(),
    worktreeId,
    sessionId: null,
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
  buffers.delete(chatId);
  activeMessages.delete(chatId);
}

function spawnShell(script: string, cwd: string): ChildProcessWithoutNullStreams {
  const shell = process.env.SHELL ?? "/bin/zsh";
  return spawn(shell, ["-lc", script], {
    cwd,
    env: { ...process.env },
  }) as ChildProcessWithoutNullStreams;
}

function contentBlocks(event: Record<string, unknown>): Array<Record<string, unknown>> {
  return (event.message as { content?: Array<Record<string, unknown>> })?.content ?? [];
}

function inputPreview(input: Record<string, unknown>): string {
  const val = input.file_path ?? input.command ?? input.pattern ?? Object.values(input)[0];
  if (typeof val !== "string") return "";
  return val.length > 60 ? val.slice(0, 60) + "…" : val;
}

function processEvent(chatId: string, event: Record<string, unknown>) {
  const msg = activeMessages.get(chatId);

  if (event.type === "assistant" && msg) {
    for (const block of contentBlocks(event)) {
      if (block.type === "text") {
        const text = block.text as string;
        msg.content += text;
        globalSend("chat:delta", { chatId, messageId: msg.id, text });
      } else if (block.type === "tool_use") {
        const tool: ToolCall = {
          id: block.id as string,
          name: block.name as string,
          input: block.input as Record<string, unknown>,
        };
        msg.toolCalls.push(tool);
        globalSend("chat:tool-start", { chatId, messageId: msg.id, tool: { ...tool, preview: inputPreview(tool.input) } });
      }
    }
  } else if (event.type === "user" && msg) {
    for (const block of contentBlocks(event)) {
      if (block.type === "tool_result") {
        const toolId = block.tool_use_id as string;
        const raw = block.content;
        const output = typeof raw === "string" ? raw : JSON.stringify(raw);
        const tool = msg.toolCalls.find((t) => t.id === toolId);
        if (tool) {
          tool.output = output.slice(0, 2000);
          globalSend("chat:tool-done", { chatId, messageId: msg.id, toolId, output: tool.output });
        }
      }
    }
  } else if (event.type === "result") {
    const sessionId = event.session_id as string | undefined;
    if (sessionId) {
      const chat = chats.get(chatId);
      if (chat) { chat.sessionId = sessionId; }
    }
    if (msg) {
      msg.done = true;
      activeMessages.delete(chatId);
      persistChats();
      globalSend("chat:done", { chatId, messageId: msg.id });
    }
  } else if (event.type === "system" && (event.subtype === "error" || event.subtype === "error_during_tool")) {
    globalSend("chat:error", { chatId, error: String(event.error ?? "Unknown error") });
    if (msg) { msg.done = true; activeMessages.delete(chatId); }
  }
}

function ensureProcess(chatId: string, worktreePath: string): ChildProcessWithoutNullStreams {
  const existing = processes.get(chatId);
  if (existing) return existing;

  const chat = chats.get(chatId);
  const resumeFlag = chat?.sessionId ? `--resume "${chat.sessionId}"` : "";
  const script = `claude --output-format stream-json --verbose --dangerously-skip-permissions ${resumeFlag}`;
  const proc = spawnShell(script, worktreePath);

  buffers.set(chatId, "");

  proc.stdout.on("data", (chunk: Buffer) => {
    const buf = (buffers.get(chatId) ?? "") + chunk.toString();
    const lines = buf.split("\n");
    buffers.set(chatId, lines.pop() ?? "");
    for (const line of lines) {
      if (!line.trim()) continue;
      try { processEvent(chatId, JSON.parse(line)); } catch {}
    }
  });

  proc.on("close", () => {
    processes.delete(chatId);
    buffers.delete(chatId);
    const msg = activeMessages.get(chatId);
    if (msg) {
      msg.done = true;
      activeMessages.delete(chatId);
      globalSend("chat:done", { chatId, messageId: msg.id });
    }
  });

  proc.on("error", (err) => {
    globalSend("chat:error", { chatId, error: err.message });
    processes.delete(chatId);
  });

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

  const proc = ensureProcess(chatId, worktreePath);
  proc.stdin.write(userText + "\n");
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
