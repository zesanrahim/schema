import { useState, useEffect } from "react";
import type { Worktree, Agent, LogLine } from "../shared/types";
import { Terminal } from "./Terminal";
import { Settings } from "./Settings";

type View = "main" | "settings";

const label: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--text-3)",
  marginBottom: 6,
};

const input: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  padding: "6px 10px",
  fontSize: 12,
  width: "100%",
  outline: "none",
};

const btnPrimary: React.CSSProperties = {
  background: "var(--accent-dim)",
  border: "1px solid var(--accent)",
  color: "var(--accent)",
  padding: "6px 12px",
  fontSize: 12,
  width: "100%",
};

const btnDanger: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text-3)",
  padding: "2px 6px",
  fontSize: 12,
  lineHeight: 1,
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
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const [newBranch, setNewBranch] = useState("");
  const [spawnWorktreeId, setSpawnWorktreeId] = useState(() => localStorage.getItem("lastWorktreeId") ?? "");
  const [spawnCommand, setSpawnCommand] = useState(() => localStorage.getItem("lastCommand") ?? "claude --dangerously-skip-permissions");

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

  async function createWorktree() {
    if (!newBranch) return;
    const wt = await window.api.invoke("worktree:create", { branch: newBranch });
    setWorktrees((prev) => [...prev, wt]);
    setNewBranch("");
  }

  async function removeWorktree(id: string) {
    await window.api.invoke("worktree:remove", { id });
    setWorktrees((prev) => prev.filter((w) => w.id !== id));
  }

  async function spawnAgent() {
    if (!spawnWorktreeId || !spawnCommand) return;
    localStorage.setItem("lastWorktreeId", spawnWorktreeId);
    localStorage.setItem("lastCommand", spawnCommand);
    const agent = await window.api.invoke("agent:spawn", {
      worktreeId: spawnWorktreeId,
      command: spawnCommand.split(" "),
    });
    setAgents((prev) => [...prev, agent]);
    setSelectedAgent(agent.id);
  }

  async function killAgent(id: string) {
    await window.api.invoke("agent:kill", { id });
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, status: "stopped" as const } : a)));
  }

  const agentLogs = selectedAgent ? logs.filter((l) => l.agentId === selectedAgent) : [];

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
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", letterSpacing: "0.04em" }}>
          schema
        </span>
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
          padding: "16px 0",
          gap: 24,
        }}>
          <div style={{ padding: "0 14px" }}>
            <div style={label}>Worktrees</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {worktrees.map((wt) => (
                <div key={wt.id} style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "5px 8px",
                  background: "var(--surface-2)",
                  gap: 6,
                }}>
                  <span style={{ fontSize: 12, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {wt.branch}
                  </span>
                  <button style={btnDanger} onClick={() => removeWorktree(wt.id)} title="Remove">×</button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input
                style={{ ...input, flex: 1 }}
                placeholder="branch name"
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createWorktree()}
              />
              <button style={{ ...btnPrimary, width: "auto", padding: "6px 10px" }} onClick={createWorktree}>+</button>
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border)" }} />

          <div style={{ padding: "0 14px" }}>
            <div style={label}>Spawn Agent</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <select style={input} value={spawnWorktreeId} onChange={(e) => setSpawnWorktreeId(e.target.value)}>
                <option value="">select worktree</option>
                {worktrees.map((wt) => (
                  <option key={wt.id} value={wt.id}>{wt.branch}</option>
                ))}
              </select>
              <input
                style={input}
                value={spawnCommand}
                onChange={(e) => setSpawnCommand(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && spawnAgent()}
              />
              <button style={btnPrimary} onClick={spawnAgent}>▶ Spawn</button>
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border)" }} />

          <div style={{ padding: "0 14px" }}>
            <div style={label}>Agents</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent.id === selectedAgent ? null : agent.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 8px",
                    background: selectedAgent === agent.id ? "var(--accent-dim)" : "var(--surface-2)",
                    cursor: "pointer",
                    borderLeft: selectedAgent === agent.id ? "2px solid var(--accent)" : "2px solid transparent",
                  }}
                >
                  <span className={`status-dot ${agent.status}`} />
                  <span style={{ fontSize: 12, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {worktrees.find((w) => w.id === agent.worktreeId)?.branch ?? "unknown"}
                  </span>
                  {agent.status === "running" && (
                    <button
                      style={{ ...btnDanger, color: "var(--red)" }}
                      onClick={(e) => { e.stopPropagation(); killAgent(agent.id); }}
                      title="Kill"
                    >■</button>
                  )}
                </div>
              ))}
              {agents.length === 0 && (
                <span style={{ fontSize: 11, color: "var(--text-3)", padding: "4px 8px" }}>no agents</span>
              )}
            </div>
          </div>
        </div>

        {view === "settings"
          ? <Settings onBack={() => setView("main")} />
          : <Terminal agentId={selectedAgent} logs={agentLogs} />
        }
      </div>
    </div>
  );
}
