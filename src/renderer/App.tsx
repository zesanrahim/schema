import { useState, useEffect } from "react";
import type { Repo, Worktree, Agent, LogLine } from "../shared/types";
import { Terminal } from "./Terminal";
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
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [selectedWorktreeId, setSelectedWorktreeId] = useState<string | null>(null);
  const [spawnCommand] = useState(() => localStorage.getItem("lastCommand") ?? "claude --dangerously-skip-permissions");

  useEffect(() => {
    window.api.invoke("repo:list").then(setRepos);
    window.api.invoke("worktree:list").then(setWorktrees);
    window.api.invoke("agent:list").then(setAgents);

    const unsubLog = window.api.on("log:line", (line) => setLogs((prev) => [...prev, line]));
    const unsubStatus = window.api.on("agent:status", ({ id, status }) => {
      setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    });

    return () => { unsubLog(); unsubStatus(); };
  }, []);

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
    setWorktrees((prev) => prev.filter((w) => w.repoId !== id));
    if (worktrees.find((w) => w.id === selectedWorktreeId)?.repoId === id) {
      setSelectedWorktreeId(null);
    }
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

  async function spawnAgent(worktreeId: string) {
    localStorage.setItem("lastCommand", spawnCommand);
    const agent = await window.api.invoke("agent:spawn", {
      worktreeId,
      command: spawnCommand.split(" "),
    });
    setAgents((prev) => [...prev, agent]);
  }

  async function killAgent(id: string) {
    await window.api.invoke("agent:kill", { id });
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, status: "stopped" as const } : a)));
  }

  async function commitAndPush(agentId: string) {
    const prompt =
      "Please run git add -A, then write a concise commit message based on the diff and commit, then push to origin. Do not ask for confirmation.";
    await window.api.invoke("agent:input", { id: agentId, data: prompt + "\n" });
  }

  const selectedWorktree = worktrees.find((w) => w.id === selectedWorktreeId) ?? null;
  const activeAgent = agents.find((a) => a.worktreeId === selectedWorktreeId && a.status === "running") ?? null;
  const agentLogs = activeAgent ? logs.filter((l) => l.agentId === activeAgent.id) : [];

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
                    const agent = agents.find((a) => a.worktreeId === wt.id);
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
                        <span className={`status-dot ${agent?.status ?? "idle"}`} />
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
                            title="Remove worktree"
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
        ) : selectedWorktree && !activeAgent ? (
          <div style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>{selectedWorktree.branch}</span>
            <button
              onClick={() => spawnAgent(selectedWorktree.id)}
              style={{
                background: "var(--accent-dim)",
                border: "1px solid var(--accent)",
                color: "var(--accent)",
                padding: "8px 18px",
                fontSize: 13,
              }}
            >
              ▶ Start agent
            </button>
          </div>
        ) : activeAgent ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 14px",
              height: 36,
              borderBottom: "1px solid var(--border)",
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 11, color: "var(--text-2)" }}>{selectedWorktree?.branch}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => commitAndPush(activeAgent.id)}
                  style={{
                    background: "none",
                    border: "1px solid var(--border-2)",
                    color: "var(--accent)",
                    padding: "3px 8px",
                    fontSize: 11,
                  }}
                  title="Ask agent to commit all changes and push"
                >
                  ↑ Commit & Push
                </button>
                <button
                  onClick={() => killAgent(activeAgent.id)}
                  style={{
                    background: "none",
                    border: "1px solid var(--border-2)",
                    color: "var(--red)",
                    padding: "3px 8px",
                    fontSize: 11,
                  }}
                >
                  ■ Kill
                </button>
              </div>
            </div>
            <Terminal agentId={activeAgent.id} logs={agentLogs} />
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>select a worktree</span>
          </div>
        )}
      </div>
    </div>
  );
}
