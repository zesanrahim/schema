import { useState, useEffect, useRef } from "react";
import type { Chat, Message, ToolCall } from "../shared/types";
import { DebugPanel } from "./DebugPanel";

interface Props {
  chat: Chat;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  chatList: Chat[];
  onSelectChat: (id: string) => void;
}

type PastedBlock = { id: string; content: string; lines: number };
type EditingBlock = { id: string; draft: string };

function toolPreview(tool: ToolCall): string {
  const val = tool.input.file_path ?? tool.input.command ?? tool.input.pattern ?? Object.values(tool.input)[0];
  if (typeof val !== "string") return "";
  return val.length > 50 ? val.slice(0, 50) + "…" : val;
}

function ToolCalls({ toolCalls }: { toolCalls: ToolCall[] }) {
  const [expanded, setExpanded] = useState(false);
  if (toolCalls.length === 0) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          background: "none",
          border: "1px solid var(--border-2)",
          color: "var(--text-2)",
          padding: "3px 8px",
          fontSize: 11,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ fontSize: 9 }}>{expanded ? "▼" : "▸"}</span>
        {toolCalls.length} tool call{toolCalls.length !== 1 ? "s" : ""}
      </button>
      {expanded && (
        <div style={{
          borderLeft: "1px solid var(--border-2)",
          marginTop: 4,
          marginLeft: 4,
          paddingLeft: 10,
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}>
          {toolCalls.map((tc) => {
            const preview = toolPreview(tc);
            return (
              <div key={tc.id} style={{ fontSize: 11, color: "var(--text-2)" }}>
                <span style={{ color: "var(--text)" }}>{tc.name}</span>
                {preview && <span style={{ color: "var(--text-3)", marginLeft: 6 }}>{preview}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: isUser ? "flex-end" : "flex-start",
      marginBottom: 16,
    }}>
      <div style={{
        fontSize: 10,
        color: "var(--text-3)",
        marginBottom: 4,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
      }}>
        {isUser ? "You" : "Claude"}
      </div>
      <div style={{
        maxWidth: "80%",
        background: isUser ? "var(--accent-dim)" : "var(--surface-2)",
        border: `1px solid ${isUser ? "var(--accent)" : "var(--border)"}`,
        padding: "10px 14px",
        fontSize: 13,
        lineHeight: 1.6,
        color: "var(--text)",
      }}>
        {!isUser && <ToolCalls toolCalls={msg.toolCalls} />}
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {msg.content || (!msg.done && <span style={{ color: "var(--text-3)" }}>thinking…</span>)}
        </div>
      </div>
    </div>
  );
}

function PasteEditor({
  editing,
  onSave,
  onCancel,
}: {
  editing: EditingBlock;
  onSave: (id: string, draft: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(editing.draft);
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        height: 40,
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: "var(--text-2)" }}>
          Edit pasted text
          <span style={{ color: "var(--text-3)", marginLeft: 8 }}>{draft.split("\n").length} lines</span>
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onCancel}
            style={{ background: "none", border: "1px solid var(--border-2)", color: "var(--text-3)", padding: "4px 10px", fontSize: 11 }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(editing.id, draft)}
            style={{ background: "var(--accent-dim)", border: "1px solid var(--border-2)", color: "var(--accent)", padding: "4px 10px", fontSize: 11 }}
          >
            Done
          </button>
        </div>
      </div>
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        style={{
          flex: 1,
          background: "var(--surface)",
          border: "none",
          color: "var(--text)",
          padding: "16px",
          fontSize: 12,
          fontFamily: "Menlo, Monaco, 'Courier New', monospace",
          lineHeight: 1.6,
          resize: "none",
          outline: "none",
        }}
      />
    </div>
  );
}

export function ChatView({ chat, onNewChat, onDeleteChat, chatList, onSelectChat }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [allCommands, setAllCommands] = useState<Array<{ name: string; description: string }>>([]);
  const [pastedBlocks, setPastedBlocks] = useState<PastedBlock[]>([]);
  const [pasteCount, setPasteCount] = useState(0);
  const [editingBlock, setEditingBlock] = useState<EditingBlock | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    window.api.invoke("chat:slash-commands").then(setAllCommands);
  }, []);

  const slashFilter = input.startsWith("/") && !input.includes(" ")
    ? allCommands.filter((c) => c.name.startsWith(input.slice(1)))
    : [];
  const showSlash = slashFilter.length > 0;

  useEffect(() => {
    window.api.invoke("chat:messages", { chatId: chat.id }).then(setMessages);
    setSending(false);

    const unsubDelta = window.api.on("chat:delta", ({ chatId, messageId, text }) => {
      if (chatId !== chat.id) return;
      setMessages((prev) => prev.map((m) =>
        m.id === messageId ? { ...m, content: m.content + text } : m
      ));
    });

    const unsubToolStart = window.api.on("chat:tool-start", ({ chatId, messageId, tool }) => {
      if (chatId !== chat.id) return;
      setMessages((prev) => prev.map((m) =>
        m.id === messageId ? { ...m, toolCalls: [...m.toolCalls, tool] } : m
      ));
    });

    const unsubToolDone = window.api.on("chat:tool-done", ({ chatId, messageId, toolId, output }) => {
      if (chatId !== chat.id) return;
      setMessages((prev) => prev.map((m) =>
        m.id === messageId
          ? { ...m, toolCalls: m.toolCalls.map((t) => t.id === toolId ? { ...t, output } : t) }
          : m
      ));
    });

    const unsubDone = window.api.on("chat:done", ({ chatId }) => {
      if (chatId !== chat.id) return;
      setMessages((prev) => prev.map((m) => m.done ? m : { ...m, done: true }));
      setSending(false);
    });

    const unsubError = window.api.on("chat:error", ({ chatId, error }) => {
      if (chatId !== chat.id) return;
      setMessages((prev) => {
        const hasThinking = prev.some((m) => m.role === "assistant" && !m.done);
        if (hasThinking) {
          return prev.map((m) =>
            m.role === "assistant" && !m.done
              ? { ...m, content: `Error: ${error}`, done: true }
              : m
          );
        }
        return [...prev, { id: crypto.randomUUID(), role: "assistant", content: `Error: ${error}`, toolCalls: [], timestamp: Date.now(), done: true }];
      });
      setSending(false);
    });

    return () => { unsubDelta(); unsubToolStart(); unsubToolDone(); unsubDone(); unsubError(); };
  }, [chat.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

function selectSlash(cmd: { name: string; description: string }) {
    setInput("/" + cmd.name + " ");
    setSlashIndex(0);
    inputRef.current?.focus();
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const text = e.clipboardData.getData("text");
    const lineCount = text.split("\n").length;
    if (lineCount > 3 || text.length > 300) {
      e.preventDefault();
      setPasteCount((n) => n + 1);
      setPastedBlocks((prev) => [...prev, { id: crypto.randomUUID(), content: text, lines: lineCount }]);
    }
  }

  function saveBlockEdit(id: string, draft: string) {
    setPastedBlocks((prev) => prev.map((b) =>
      b.id === id ? { ...b, content: draft, lines: draft.split("\n").length } : b
    ));
    setEditingBlock(null);
  }

  async function send() {
    const text = input.trim();
    if (!text && !pastedBlocks.length) return;
    if (sending) return;

    const parts = [...pastedBlocks.map((b) => b.content), text].filter(Boolean);
    const fullMessage = parts.join("\n\n");

    setInput("");
    setSlashIndex(0);
    setPastedBlocks([]);
    if (inputRef.current) inputRef.current.style.height = "auto";
    setSending(true);

    const isSlash = fullMessage.startsWith("/");
    const optimistic: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: fullMessage,
      toolCalls: [],
      timestamp: Date.now(),
      done: true,
    };
    const placeholder: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      toolCalls: [],
      timestamp: Date.now(),
      done: false,
    };
    if (!isSlash) setMessages((prev) => [...prev, optimistic, placeholder]);
    else setMessages((prev) => [...prev, placeholder]);
    await window.api.invoke("chat:send", { chatId: chat.id, message: fullMessage });
  }

  const canSend = !sending && (!!input.trim() || pastedBlocks.length > 0);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      {editingBlock && (
        <PasteEditor
          editing={editingBlock}
          onSave={saveBlockEdit}
          onCancel={() => setEditingBlock(null)}
        />
      )}

      <div style={{
        display: "flex",
        alignItems: "stretch",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        overflowX: "auto",
        background: "var(--surface)",
      }}>
        <div style={{ display: "flex", alignItems: "stretch", flex: 1 }}>
          {chatList.map((c) => {
            const isActive = c.id === chat.id;
            return (
              <div
                key={c.id}
                onClick={() => onSelectChat(c.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "0 12px",
                  height: 40,
                  borderRight: "1px solid var(--border)",
                  background: isActive ? "var(--bg)" : "transparent",
                  borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <span style={{
                  fontSize: 12,
                  color: isActive ? "var(--text)" : "var(--text-2)",
                  whiteSpace: "nowrap",
                  maxWidth: 140,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {c.title}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteChat(c.id); }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-3)",
                    fontSize: 13,
                    padding: "0 2px",
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        <button
          onClick={onNewChat}
          style={{
            background: "none",
            border: "none",
            borderLeft: "1px solid var(--border)",
            color: "var(--text-3)",
            padding: "0 14px",
            fontSize: 16,
            flexShrink: 0,
            height: 40,
          }}
          title="New chat"
        >
          +
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px" }}>
        {messages.length === 0 && (
          <div style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-3)",
            fontSize: 12,
          }}>
            start a conversation
          </div>
        )}
        {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
        <div ref={bottomRef} />
      </div>

      {import.meta.env.DEV && <DebugPanel chatId={chat.id} />}

      <div style={{
        padding: "12px 16px",
        borderTop: "1px solid var(--border)",
        flexShrink: 0,
        position: "relative",
      }}>
        {showSlash && (
          <div style={{
            position: "absolute",
            bottom: "calc(100% - 8px)",
            left: 16,
            right: 16,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "0 -4px 12px rgba(0,0,0,0.3)",
            zIndex: 10,
          }}>
            {slashFilter.map((cmd, i) => (
              <div
                key={cmd.name}
                onMouseDown={(e) => { e.preventDefault(); selectSlash(cmd); }}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  padding: "7px 12px",
                  background: i === slashIndex % slashFilter.length ? "var(--accent-dim)" : "none",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>/{cmd.name}</span>
                <span style={{ fontSize: 11, color: "var(--text-3)" }}>{cmd.description}</span>
              </div>
            ))}
          </div>
        )}
        {pastedBlocks.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {pastedBlocks.map((block, i) => (
              <div
                key={block.id}
                onClick={() => setEditingBlock({ id: block.id, draft: block.content })}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "var(--surface-3)",
                  border: "1px solid var(--border-2)",
                  padding: "3px 8px",
                  fontSize: 11,
                  color: "var(--text-2)",
                  cursor: "pointer",
                }}
              >
                <span style={{ color: "var(--text-3)", marginRight: 2 }}>⎘</span>
                Pasted text #{pasteCount - pastedBlocks.length + i + 1}
                <span style={{ color: "var(--text-3)" }}>+{block.lines} lines</span>
                <button
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setPastedBlocks((prev) => prev.filter((b) => b.id !== block.id)); }}
                  style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 13, padding: "0 2px", lineHeight: 1, cursor: "pointer" }}
                >×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); setSlashIndex(0); }}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (showSlash) {
                if (e.key === "ArrowUp") { e.preventDefault(); setSlashIndex((i) => (i - 1 + slashFilter.length) % slashFilter.length); return; }
                if (e.key === "ArrowDown") { e.preventDefault(); setSlashIndex((i) => (i + 1) % slashFilter.length); return; }
                if (e.key === "Tab" || (e.key === "Enter" && slashFilter.length > 0 && input === "/" + (slashFilter[slashIndex % slashFilter.length]?.name ?? ""))) {
                  e.preventDefault();
                  const cmd = slashFilter[slashIndex % slashFilter.length];
                  if (cmd) selectSlash(cmd);
                  return;
                }
                if (e.key === "Escape") { setInput(""); return; }
              }
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder="Message Claude… (/ for commands)"
            rows={1}
            style={{
              flex: 1,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              padding: "8px 10px",
              fontSize: 12,
              resize: "none",
              outline: "none",
              lineHeight: 1.5,
              fontFamily: "inherit",
              overflow: "hidden",
            }}
            disabled={sending}
          />
          <button
            onClick={send}
            disabled={!canSend}
            style={{
              background: canSend ? "var(--accent-dim)" : "none",
              border: "1px solid var(--border-2)",
              color: canSend ? "var(--accent)" : "var(--text-3)",
              padding: "8px 14px",
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
