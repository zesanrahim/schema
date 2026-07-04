import { useState, useEffect } from "react";
import { TerminalView } from "./TerminalView";
import type { Repo, Worktree, Workspace } from "../shared/types";

interface Props {
  worktree: Worktree;
  repo: Repo;
  onUpdateRepo: (repo: Repo) => void;
}

function StatusDot({ status }: { status: Workspace["status"] }) {
  const colors: Record<Workspace["status"], string> = {
    stopped: "var(--text-3)",
    starting: "#d4a847",
    running: "var(--green)",
    error: "var(--red)",
  };
  return (
    <span style={{
      display: "inline-block",
      width: 7,
      height: 7,
      borderRadius: "50%",
      background: colors[status],
      flexShrink: 0,
      ...(status === "starting" ? { animation: "pulse 1s ease-in-out infinite" } : {}),
    }} />
  );
}

export function RightSidebar({ worktree, repo, onUpdateRepo }: Props) {
  const [workspace, setWorkspace] = useState<Workspace>({
    worktreeId: worktree.id,
    status: "stopped",
    port: null,
    url: null,
  });
  const [editingCommand, setEditingCommand] = useState(false);
  const [commandDraft, setCommandDraft] = useState(repo.devCommand ?? "");

  useEffect(() => {
    window.api.invoke("workspace:get", { worktreeId: worktree.id }).then(setWorkspace);

    const unsub = window.api.on("workspace:update", ({ workspace: ws }) => {
      if (ws.worktreeId === worktree.id) setWorkspace(ws);
    });
    return unsub;
  }, [worktree.id]);

  useEffect(() => {
    setCommandDraft(repo.devCommand ?? "");
  }, [repo.devCommand]);

  async function saveCommand() {
    const cmd = commandDraft.trim();
    await window.api.invoke("repo:set-dev-command", { id: repo.id, command: cmd });
    onUpdateRepo(cmd ? { ...repo, devCommand: cmd } : { ...repo });
    setEditingCommand(false);
  }

  function toggleWorkspace() {
    if (workspace.status === "stopped" || workspace.status === "error") {
      window.api.invoke("workspace:start", { worktreeId: worktree.id });
    } else {
      window.api.invoke("workspace:stop", { worktreeId: worktree.id });
    }
  }

  const isRunning = workspace.status === "running" || workspace.status === "starting";

  return (
    <div style={{
      width: 300,
      flexShrink: 0,
      borderLeft: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      background: "var(--bg)",
    }}>
      <div style={{
        flexShrink: 0,
        borderBottom: "1px solid var(--border)",
        padding: "10px 12px",
        background: "var(--surface)",
      }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-2)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
          Workspace
        </div>

        {editingCommand ? (
          <div style={{ display: "flex", gap: 6 }}>
            <input
              autoFocus
              value={commandDraft}
              onChange={(e) => setCommandDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveCommand(); if (e.key === "Escape") setEditingCommand(false); }}
              placeholder="e.g. npm run dev"
              style={{
                flex: 1,
                background: "var(--surface-2)",
                border: "1px solid var(--border-2)",
                color: "var(--text)",
                padding: "4px 8px",
                fontSize: 11,
                fontFamily: "Menlo, Monaco, 'Courier New', monospace",
                outline: "none",
              }}
            />
            <button onClick={saveCommand} style={{ background: "var(--accent-dim)", border: "1px solid var(--border-2)", color: "var(--accent)", padding: "4px 8px", fontSize: 11 }}>Save</button>
            <button onClick={() => setEditingCommand(false)} style={{ background: "none", border: "1px solid var(--border-2)", color: "var(--text-3)", padding: "4px 8px", fontSize: 11 }}>✕</button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {repo.devCommand ? (
                <span
                  onClick={() => setEditingCommand(true)}
                  style={{
                    fontSize: 11,
                    fontFamily: "Menlo, Monaco, 'Courier New', monospace",
                    color: "var(--text-2)",
                    cursor: "pointer",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    display: "block",
                  }}
                  title="Click to edit"
                >
                  {repo.devCommand}
                </span>
              ) : (
                <span
                  onClick={() => setEditingCommand(true)}
                  style={{ fontSize: 11, color: "var(--text-3)", cursor: "pointer" }}
                >
                  + set dev command
                </span>
              )}
            </div>

            {repo.devCommand && (
              <button
                onClick={toggleWorkspace}
                style={{
                  background: isRunning ? "rgba(192,96,96,0.1)" : "var(--accent-dim)",
                  border: `1px solid ${isRunning ? "var(--red)" : "var(--border-2)"}`,
                  color: isRunning ? "var(--red)" : "var(--accent)",
                  padding: "3px 10px",
                  fontSize: 11,
                  flexShrink: 0,
                }}
              >
                {isRunning ? "Stop" : "Run"}
              </button>
            )}
          </div>
        )}

        {workspace.status !== "stopped" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
            <StatusDot status={workspace.status} />
            <span style={{ fontSize: 11, color: "var(--text-3)", textTransform: "capitalize" }}>
              {workspace.status}
            </span>
            {workspace.url && (
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); window.open(workspace.url!, "_blank"); }}
                style={{
                  marginLeft: "auto",
                  fontSize: 11,
                  color: "var(--accent)",
                  textDecoration: "none",
                  fontFamily: "Menlo, Monaco, 'Courier New', monospace",
                }}
              >
                :{workspace.port} ↗
              </a>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", padding: "8px 12px 4px", flexShrink: 0 }}>
          Terminal
        </div>
        <TerminalView worktreeId={worktree.id} />
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
