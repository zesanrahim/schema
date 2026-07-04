import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { app } from "electron";
import type { Chat, Message, ToolCall } from "../shared/types";

export const chats = new Map<string, Chat>();
export const chatMessages = new Map<string, Message[]>();

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
  chats.delete(id);
  chatMessages.delete(id);
  persistChats();
}

export function getMessages(chatId: string): Message[] {
  return chatMessages.get(chatId) ?? [];
}

type Sender = (channel: string, payload: unknown) => void;

function inputPreview(input: Record<string, unknown>): string {
  const val = input.file_path ?? input.command ?? input.pattern ?? Object.values(input)[0];
  if (typeof val !== "string") return "";
  return val.length > 60 ? val.slice(0, 60) + "…" : val;
}

function processEvent(
  chatId: string,
  messageId: string,
  msg: Message,
  event: Record<string, unknown>,
  send: Sender
) {
  if (event.type === "assistant") {
    const content = (event.message as { content?: Array<Record<string, unknown>> }).content ?? [];
    for (const block of content) {
      if (block.type === "text") {
        const text = block.text as string;
        msg.content += text;
        send("chat:delta", { chatId, messageId, text });
      } else if (block.type === "tool_use") {
        const tool: ToolCall = {
          id: block.id as string,
          name: block.name as string,
          input: block.input as Record<string, unknown>,
        };
        msg.toolCalls.push(tool);
        send("chat:tool-start", { chatId, messageId, tool: { ...tool, preview: inputPreview(tool.input) } });
      }
    }
  } else if (event.type === "user") {
    const content = (event.message as { content?: Array<Record<string, unknown>> }).content ?? [];
    for (const block of content) {
      if (block.type === "tool_result") {
        const toolId = block.tool_use_id as string;
        const raw = block.content;
        const output = typeof raw === "string" ? raw : JSON.stringify(raw);
        const tool = msg.toolCalls.find((t) => t.id === toolId);
        if (tool) {
          tool.output = output.slice(0, 2000);
          send("chat:tool-done", { chatId, messageId, toolId, output: tool.output });
        }
      }
    }
  } else if (event.type === "result") {
    const sessionId = event.session_id as string | undefined;
    if (sessionId) {
      const chat = chats.get(chatId);
      if (chat) {
        chat.sessionId = sessionId;
        persistChats();
      }
    }
  }
}

export function sendMessage(chatId: string, userText: string, worktreePath: string, send: Sender) {
  const chat = chats.get(chatId);
  if (!chat) throw new Error(`Chat ${chatId} not found`);

  const msgs = chatMessages.get(chatId) ?? [];

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

  const shell = process.env.SHELL ?? "/bin/zsh";
  const resumeFlag = chat.sessionId ? `--resume "${chat.sessionId}"` : "";
  const script = `claude --output-format stream-json --verbose --dangerously-skip-permissions ${resumeFlag} -p "$CLAUDE_MSG"`;

  const proc = spawn(shell, ["-lc", script], {
    cwd: worktreePath,
    env: { ...process.env, CLAUDE_MSG: userText },
  });

  let buffer = "";

  proc.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        processEvent(chatId, assistantId, assistantMsg, JSON.parse(line), send);
      } catch {}
    }
  });

  proc.on("close", () => {
    assistantMsg.done = true;
    persistChats();
    send("chat:done", { chatId, messageId: assistantId });
  });

  proc.on("error", (err) => {
    send("chat:error", { chatId, error: err.message });
  });
}
