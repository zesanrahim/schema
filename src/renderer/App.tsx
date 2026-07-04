import { useState, useEffect } from "react";
import type { Repo, Worktree, Chat } from "../shared/types";
import { ChatView } from "./ChatView";
import { Settings } from "./Settings";

type View = "main" | "settings";

function generateBranch() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 5);
  return `wt-${mm}${dd}-${rand}`;
}

function IconSettings() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 9.5a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M2.6 2.6l1.1 1.1M11.3 11.3l1.1 1.1M2.6 12.4l1.1-1.1M11.3 3.7l1.1-1.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

export function App() {
  const [view, setView] = useState<View>("main");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [selectedWorktreeId, setSelectedWorktreeId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [pushing, setPushing] = useState<string | null>(null);

  useEffect(() => {
    window.api.invoke("repo:list").then(setRepos);
    window.api.invoke("worktree:list").then(setWorktrees);
  }, []);

  useEffect(() => {
    if (!selectedWorktreeId) return;
    window.api.invoke("chat:list", { worktreeId: selectedWorktreeId }).then((list) => {
      setChats(list);
      if (list.length > 0 && list[0]) {
        setActiveChatId(list[0].id);
      } else {
        createChat(selectedWorktreeId);
      }
    });
  }, [selectedWorktreeId]);

  async function createChat(worktreeId: string) {
    const chat = await window.api.invoke("chat:create", { worktreeId });
    setChats((prev) => [chat, ...prev]);
    setActiveChatId(chat.id);
  }

  async function deleteChat(id: string) {
    await window.api.invoke("chat:delete", { id });
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (activeChatId === id) {
        setActiveChatId(next[0]?.id ?? null);
        if (next.length === 0 && selectedWorktreeId) createChat(selectedWorktreeId);
      }
      return next;
    });
  }

  async function addRepo() {
    try {
      const { repo, worktrees: wts } = await window.api.invoke("repo:add");
      setRepos((prev) => [...prev, repo]);
      setWorktrees((prev) => [...prev, ...wts]);
    } catch {}
  }

  async function removeRepo(id: string) {
    await window.api.invoke("repo:remove", { id });
    setRepos((prev) => prev.filter((r) => r.id !== id));
    const removed = worktrees.filter((w) => w.repoId === id).map((w) => w.id);
    setWorktrees((prev) => prev.filter((w) => w.repoId !== id));
    if (removed.includes(selectedWorktreeId ?? "")) setSelectedWorktreeId(null);
  }

  async function createWorktree(repoId: string) {
    const branch = generateBranch();
    const wt = await window.api.invoke("worktree:create", { repoId, branch });
    setWorktrees((prev) => [...prev, wt]);
    setSelectedWorktreeId(wt.id);
  }

  async function removeWorktree(id: string) {
    await window.api.invoke("worktree:remove", { id });
    setWorktrees((prev) => prev.filter((w) => w.id !== id));
    if (selectedWorktreeId === id) setSelectedWorktreeId(null);
  }

  async function commitAndPush(worktreeId: string) {
    setPushing(worktreeId);
    try {
      await window.api.invoke("worktree:commit-push", { id: worktreeId });
    } finally {
      setPushing(null);
    }
  }

  const selectedWorktree = worktrees.find((w) => w.id === selectedWorktreeId) ?? null;
  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        height: 44,
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        background: "var(--surface)",
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", letterSpacing: "0.04em" }}>schema</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {selectedWorktreeId && (
            <button
              onClick={() => commitAndPush(selectedWorktreeId)}
              disabled={pushing === selectedWorktreeId}
              style={{
                background: "none",
                border: "1px solid var(--border-2)",
                color: pushing === selectedWorktreeId ? "var(--text-3)" : "var(--text-2)",
                padding: "4px 10px",
                fontSize: 11,
                opacity: pushing === selectedWorktreeId ? 0.5 : 1,
              }}
            >
              {pushing === selectedWorktreeId ? "Pushing…" : "↑ Commit & Push"}
            </button>
          )}
          <button
            onClick={() => setView(view === "settings" ? "main" : "settings")}
            style={{
              background: view === "settings" ? "var(--accent-dim)" : "none",
              border: view === "settings" ? "1px solid var(--accent)" : "1px solid transparent",
              color: view === "settings" ? "var(--accent)" : "var(--text-2)",
              padding: "5px 7px",
              display: "flex",
              alignItems: "center",
            }}
            title="Settings"
          >
            <IconSettings />
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{
          width: 220,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          background: "var(--surface)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}>
          <div style={{ flex: 1 }}>
            {repos.map((repo) => {
              const repoWorktrees = worktrees.filter((w) => w.repoId === repo.id);
              return (
                <div key={repo.id} style={{ padding: "10px 0 6px" }}>
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 12px 4px",
                  }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-2)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {repo.name}
                    </span>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => createWorktree(repo.id)}
                        style={{
                          background: "none",
                          border: "1px solid var(--border-2)",
                          color: "var(--text-2)",
                          width: 18,
                          height: 18,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        title="New worktree"
                      >
                        <IconPlus />
                      </button>
                      <button
                        onClick={() => removeRepo(repo.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-3)",
                          width: 18,
                          height: 18,
                          fontSize: 14,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        title="Remove repo"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {repoWorktrees.map((wt) => {
                    const isSelected = selectedWorktreeId === wt.id;
                    return (
                      <div
                        key={wt.id}
                        onClick={() => setSelectedWorktreeId(isSelected ? null : wt.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          padding: "5px 12px 5px 20px",
                          background: isSelected ? "var(--accent-dim)" : "transparent",
                          borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
                          cursor: "pointer",
                        }}
                      >
                        <span style={{
                          fontSize: 12,
                          color: isSelected ? "var(--text)" : "var(--text-2)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: 1,
                        }}>
                          {wt.branch}
                          {wt.isMain && <span style={{ color: "var(--text-3)", marginLeft: 4 }}>(main)</span>}
                        </span>
                        {!wt.isMain && (
                          <button
                            onClick={(e) => { e.stopPropagation(); removeWorktree(wt.id); }}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--text-3)",
                              padding: "0 2px",
                              fontSize: 13,
                              lineHeight: 1,
                              opacity: isSelected ? 1 : 0,
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
            <button
              onClick={addRepo}
              style={{
                background: "none",
                border: "1px solid var(--border-2)",
                color: "var(--text-2)",
                padding: "6px 10px",
                fontSize: 11,
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <IconPlus /> Add repo
            </button>
          </div>
        </div>

        {view === "settings" ? (
          <Settings onBack={() => setView("main")} />
        ) : selectedWorktree && activeChat ? (
          <ChatView
            chat={activeChat}
            chatList={chats}
            onNewChat={() => createChat(selectedWorktree.id)}
            onDeleteChat={deleteChat}
            onSelectChat={setActiveChatId}
          />
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>select a worktree</span>
          </div>
        )}
      </div>
    </div>
  );
}
