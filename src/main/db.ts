import path from "path";
import { app } from "electron";
import { DatabaseSync } from "node:sqlite";
import type { Chat, Message } from "../shared/types";

let handle: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (handle) return handle;
  handle = new DatabaseSync(path.join(app.getPath("userData"), "chats.db"));
  handle.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      worktree_id TEXT NOT NULL,
      session_id TEXT,
      provider_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT UNIQUE NOT NULL,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      done INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chats_worktree ON chats(worktree_id);
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, seq);
  `);
  return handle;
}

interface ChatRow {
  id: string;
  worktree_id: string;
  session_id: string | null;
  provider_id: string;
  title: string;
  created_at: number;
}

interface MessageRow {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  tool_calls: string;
  timestamp: number;
  done: number;
}

function toChat(r: ChatRow): Chat {
  return {
    id: r.id,
    worktreeId: r.worktree_id,
    sessionId: r.session_id,
    providerId: r.provider_id,
    title: r.title,
    createdAt: r.created_at,
  };
}

function toMessage(r: MessageRow): Message {
  return {
    id: r.id,
    role: r.role as Message["role"],
    content: r.content,
    toolCalls: JSON.parse(r.tool_calls) as Message["toolCalls"],
    timestamp: r.timestamp,
    done: r.done === 1,
  };
}

export function loadAll(): { chats: Chat[]; messages: Map<string, Message[]> } {
  const chats = (db().prepare("SELECT * FROM chats").all() as unknown as ChatRow[]).map(toChat);
  const messages = new Map<string, Message[]>();
  for (const r of db().prepare("SELECT * FROM messages ORDER BY seq").all() as unknown as MessageRow[]) {
    const list = messages.get(r.chat_id) ?? [];
    list.push(toMessage(r));
    messages.set(r.chat_id, list);
  }
  return { chats, messages };
}

export function insertChat(c: Chat): void {
  db()
    .prepare(
      "INSERT INTO chats (id, worktree_id, session_id, provider_id, title, created_at) VALUES (?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(id) DO UPDATE SET worktree_id = excluded.worktree_id, session_id = excluded.session_id, provider_id = excluded.provider_id, title = excluded.title"
    )
    .run(c.id, c.worktreeId, c.sessionId, c.providerId, c.title, c.createdAt);
}

export function updateChat(c: Chat): void {
  db().prepare("UPDATE chats SET session_id = ?, title = ? WHERE id = ?").run(c.sessionId, c.title, c.id);
}

export function deleteChat(id: string): void {
  db().prepare("DELETE FROM messages WHERE chat_id = ?").run(id);
  db().prepare("DELETE FROM chats WHERE id = ?").run(id);
}

export function upsertMessage(chatId: string, m: Message): void {
  db()
    .prepare(
      "INSERT INTO messages (id, chat_id, role, content, tool_calls, timestamp, done) VALUES (?, ?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(id) DO UPDATE SET content = excluded.content, tool_calls = excluded.tool_calls, done = excluded.done"
    )
    .run(m.id, chatId, m.role, m.content, JSON.stringify(m.toolCalls), m.timestamp, m.done ? 1 : 0);
}
