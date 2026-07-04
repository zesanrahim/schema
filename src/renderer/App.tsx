import { useState, useEffect, useRef } from "react";
import type { Worktree, Agent, LogLine } from "../shared/types";

const s: Record<string, React.CSSProperties> = {
  root: { display: "flex", height: "100vh", gap: 1 },
  panel: { display: "flex", flexDirection: "column", gap: 8, padding: 12, background: "#111", minWidth: 260 },
  section: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1 },
  input: { background: "#1a1a1a", border: "1px solid #333", color: "#e0e0e0", padding: "4px 8px", fontFamily: "monospace", fontSize: 13, borderRadius: 3 },
  btn: { background: "#1e3a2f", border: "1px solid #2d5a47", color: "#4ade80", padding: "4px 10px", fontFamily: "monospace", fontSize: 12, cursor: "pointer", borderRadius: 3 },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: "#1a1a1a", borderRadius: 3, fontSize: 12 },
  logs: { flex: 1, padding: 12, overflowY: "auto", fontSize: 12, lineHeight: 1.6 },
};

function badgeStyle(status: string): React.CSSProperties {
  return {
    fontSize: 10, padding: "1px 6px", borderRadius: 10,
    background: status === "running" ? "#1e3a2f" : status === "error" ? "#3a1e1e" : "#1a1a1a",
    color: status === "running" ? "#4ade80" : status === "error" ? "#f87171" : "#666",
  };
}

function logLineStyle(stream: string): React.CSSProperties {
  return { color: stream === "stderr" ? "#f87171" : "#a3e635", whiteSpace: "pre-wrap", wordBreak: "break-all" };
}

export function App() {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const [newBranch, setNewBranch] = useState("");
  const [newPath, setNewPath] = useState("");
  const [spawnWorktreeId, setSpawnWorktreeId] = useState("");
  const [spawnCommand, setSpawnCommand] = useState("claude --dangerously-skip-permissions");

  const logsRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  async function createWorktree() {
    if (!newBranch || !newPath) return;
    const wt = await window.api.invoke("worktree:create", { branch: newBranch, path: newPath });
    setWorktrees((prev) => [...prev, wt]);
    setNewBranch("");
    setNewPath("");
  }

  async function removeWorktree(id: string) {
    await window.api.invoke("worktree:remove", { id });
    setWorktrees((prev) => prev.filter((w) => w.id !== id));
  }

  async function spawnAgent() {
    if (!spawnWorktreeId || !spawnCommand) return;
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

  const visibleLogs = selectedAgent ? logs.filter((l) => l.agentId === selectedAgent) : logs;

  return (
    <div style={s["root"]}>
      <div style={s["panel"]}>
        <div style={s["section"]}>
          <span style={s["label"]}>New Worktree</span>
          <input style={s["input"]} placeholder="branch" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} />
          <input style={s["input"]} placeholder="/path/to/worktree" value={newPath} onChange={(e) => setNewPath(e.target.value)} />
          <button style={s["btn"]} onClick={createWorktree}>+ Create</button>
        </div>

        <div style={s["section"]}>
          <span style={s["label"]}>Worktrees</span>
          {worktrees.map((wt) => (
            <div key={wt.id} style={s["row"]}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wt.branch}</span>
              <button style={{ ...s["btn"], background: "#3a1e1e", borderColor: "#5a2d2d", color: "#f87171" }} onClick={() => removeWorktree(wt.id)}>×</button>
            </div>
          ))}
        </div>

        <div style={s["section"]}>
          <span style={s["label"]}>Spawn Agent</span>
          <select style={s["input"]} value={spawnWorktreeId} onChange={(e) => setSpawnWorktreeId(e.target.value)}>
            <option value="">select worktree</option>
            {worktrees.map((wt) => (
              <option key={wt.id} value={wt.id}>{wt.branch}</option>
            ))}
          </select>
          <input style={s["input"]} value={spawnCommand} onChange={(e) => setSpawnCommand(e.target.value)} />
          <button style={s["btn"]} onClick={spawnAgent}>▶ Spawn</button>
        </div>

        <div style={s["section"]}>
          <span style={s["label"]}>Agents</span>
          {agents.map((agent) => (
            <div
              key={agent.id}
              style={{ ...s["row"], cursor: "pointer", outline: selectedAgent === agent.id ? "1px solid #2d5a47" : "none" }}
              onClick={() => setSelectedAgent(agent.id === selectedAgent ? null : agent.id)}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                {worktrees.find((w) => w.id === agent.worktreeId)?.branch ?? agent.worktreeId.slice(0, 8)}
              </span>
              <span style={badgeStyle(agent.status)}>{agent.status}</span>
              {agent.status === "running" && (
                <button
                  style={{ ...s["btn"], marginLeft: 4, background: "#3a1e1e", borderColor: "#5a2d2d", color: "#f87171" }}
                  onClick={(e) => { e.stopPropagation(); killAgent(agent.id); }}
                >■</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div ref={logsRef} style={s["logs"]}>
        {visibleLogs.length === 0 && (
          <span style={{ color: "#444" }}>no output{selectedAgent ? " for selected agent" : ""}</span>
        )}
        {visibleLogs.map((line, i) => (
          <div key={i} style={logLineStyle(line.stream)}>{line.data}</div>
        ))}
      </div>
    </div>
  );
}
