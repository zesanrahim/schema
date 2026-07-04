import { useState, useEffect, useRef } from "react";
import path from "path-browserify";
import type { Worktree, Agent, LogLine } from "../shared/types";
import { Terminal } from "./Terminal";
import { Settings } from "./Settings";

type View = "main" | "settings";

const input: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  padding: "5px 8px",
  fontSize: 12,
  width: "100%",
  outline: "none",
};

function IconSettings() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 9.5a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M2.6 2.6l1.1 1.1M11.3 11.3l1.1 1.1M2.6 12.4l1.1-1.1M11.3 3.7l1.1-1.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

export function App() {
  const [view, setView] = useState<View>("main");
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [selectedWorktreeId, setSelectedWorktreeId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newBranch, setNewBranch] = useState("");
  const [spawnCommand] = useState(() => localStorage.getItem("lastCommand") ?? "claude --dangerously-skip-permissions");
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.api.invoke("worktree:list").then(setWorktrees);
    window.api.invoke("agent:list").then(setAgents);

    const unsubLog = window.api.on("log:line", (line) => {
      setLogs((prev) => [...prev, line]);
    });
    const unsubStatus = window.api.on("agent:status", ({ id, status }) => {
      setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    });

    return () => { unsubLog(); unsubStatus(); };
  }, []);

  useEffect(() => {
    if (adding) addInputRef.current?.focus();
  }, [adding]);

  const mainWorktree = worktrees.find((w) => w.isMain);
  const repoName = mainWorktree ? path.basename(mainWorktree.path) : "repo";

  async function createWorktree() {
    if (!newBranch.trim()) return;
    const wt = await window.api.invoke("worktree:create", { branch: newBranch.trim() });
    setWorktrees((prev) => [...prev, wt]);
    setNewBranch("");
    setAdding(false);
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
          <div style={{ padding: "12px 14px 6px" }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", letterSpacing: "0.02em" }}>
                {repoName}
              </span>
              <button
                onClick={() => setAdding(true)}
                style={{
                  background: "none",
                  border: "1px solid var(--border-2)",
                  color: "var(--text-2)",
                  width: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  lineHeight: 1,
                  flexShrink: 0,
                }}
                title="New worktree"
              >
                +
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {worktrees.map((wt) => {
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
                      padding: "5px 8px",
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
                      {wt.isMain ? `${wt.branch} (main)` : wt.branch}
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
                        title="Remove"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}

              {adding && (
                <div style={{ padding: "4px 8px 4px 18px" }}>
                  <input
                    ref={addInputRef}
                    style={input}
                    placeholder="branch name"
                    value={newBranch}
                    onChange={(e) => setNewBranch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createWorktree();
                      if (e.key === "Escape") { setAdding(false); setNewBranch(""); }
                    }}
                    onBlur={() => { if (!newBranch.trim()) { setAdding(false); } }}
                  />
                </div>
              )}
            </div>
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
