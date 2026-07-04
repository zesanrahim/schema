import { useState, useEffect } from "react";
import type { Worktree, Agent, LogLine } from "../shared/types";
import { Terminal } from "./Terminal";

const s: Record<string, React.CSSProperties> = {
  root: { display: "flex", height: "100vh", gap: 1 },
  panel: { display: "flex", flexDirection: "column", gap: 8, padding: 12, background: "#111", minWidth: 260 },
  section: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1 },
  input: { background: "#1a1a1a", border: "1px solid #333", color: "#e0e0e0", padding: "4px 8px", fontFamily: "monospace", fontSize: 13, borderRadius: 3 },
  btn: { background: "#1e3a2f", border: "1px solid #2d5a47", color: "#4ade80", padding: "4px 10px", fontFamily: "monospace", fontSize: 12, cursor: "pointer", borderRadius: 3 },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: "#1a1a1a", borderRadius: 3, fontSize: 12 },
};

function badgeStyle(status: string): React.CSSProperties {
  return {
    fontSize: 10, padding: "1px 6px", borderRadius: 10,
    background: status === "running" ? "#1e3a2f" : status === "error" ? "#3a1e1e" : "#1a1a1a",
    color: status === "running" ? "#4ade80" : status === "error" ? "#f87171" : "#666",
  };
}

export function App() {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const [newBranch, setNewBranch] = useState("");
  const [spawnWorktreeId, setSpawnWorktreeId] = useState(() => localStorage.getItem("lastWorktreeId") ?? "");
  const [spawnCommand, setSpawnCommand] = useState(() => localStorage.getItem("lastCommand") ?? "claude --dangerously-skip-permissions");

  useEffect(() => {
    window.api.invoke("worktree:list", undefined).then(setWorktrees);
    window.api.invoke("agent:list", undefined).then(setAgents);

    const unsubLog = window.api.on("log:line", (line) => {
      setLogs((prev) => [...prev, line]);
    });

    const unsubStatus = window.api.on("agent:status", ({ id, status }) => {
      setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    });

    return () => {
      unsubLog();
      unsubStatus();
    };
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
    <div style={s.root}>
      <div style={s.panel}>
        <div style={s.section}>
          <span style={s.label}>New Worktree</span>
          <input style={s.input} placeholder="branch name" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} />
          <button style={s.btn} onClick={createWorktree}>+ Create</button>
        </div>

        <div style={s.section}>
          <span style={s.label}>Worktrees</span>
          {worktrees.map((wt) => (
            <div key={wt.id} style={s.row}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wt.branch}</span>
              <button style={{ ...s.btn, background: "#3a1e1e", borderColor: "#5a2d2d", color: "#f87171" }} onClick={() => removeWorktree(wt.id)}>×</button>
            </div>
          ))}
        </div>

        <div style={s.section}>
          <span style={s.label}>Spawn Agent</span>
          <select style={s.input} value={spawnWorktreeId} onChange={(e) => setSpawnWorktreeId(e.target.value)}>
            <option value="">select worktree</option>
            {worktrees.map((wt) => (
              <option key={wt.id} value={wt.id}>{wt.branch}</option>
            ))}
          </select>
          <input style={s.input} value={spawnCommand} onChange={(e) => setSpawnCommand(e.target.value)} />
          <button style={s.btn} onClick={spawnAgent}>▶ Spawn</button>
        </div>

        <div style={s.section}>
          <span style={s.label}>Agents</span>
          {agents.map((agent) => (
            <div
              key={agent.id}
              style={{ ...s.row, cursor: "pointer", outline: selectedAgent === agent.id ? "1px solid #2d5a47" : "none" }}
              onClick={() => setSelectedAgent(agent.id === selectedAgent ? null : agent.id)}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                {worktrees.find((w) => w.id === agent.worktreeId)?.branch ?? agent.worktreeId.slice(0, 8)}
              </span>
              <span style={badgeStyle(agent.status)}>{agent.status}</span>
              {agent.status === "running" && (
                <button
                  style={{ ...s.btn, marginLeft: 4, background: "#3a1e1e", borderColor: "#5a2d2d", color: "#f87171" }}
                  onClick={(e) => { e.stopPropagation(); killAgent(agent.id); }}
                >■</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <Terminal agentId={selectedAgent} logs={agentLogs} />
    </div>
  );
}
