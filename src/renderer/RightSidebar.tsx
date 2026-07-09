import { useState, useEffect, useRef, useCallback } from "react";
import { TerminalView } from "./TerminalView";
import type { Repo, Worktree, Workspace, DiffFile } from "../shared/types";

interface Props {
  worktree: Worktree;
  repo: Repo;
  onUpdateRepo: (repo: Repo) => void;
  onOpenDiff: (filePath: string) => void;
}

const STATUS_COLOR: Record<string, string> = {
  M: "#d4a847", A: "var(--green)", D: "var(--red)", R: "#7b9fd4", "?": "var(--text-3)",
};

function StatusDot({ status }: { status: Workspace["status"] }) {
  const colors: Record<Workspace["status"], string> = {
    stopped: "var(--text-3)", starting: "#d4a847", running: "var(--green)", error: "var(--red)",
  };
  return (
    <span style={{
      display: "inline-block", width: 7, height: 7, borderRadius: "50%",
      background: colors[status], flexShrink: 0,
      ...(status === "starting" ? { animation: "pulse 1s ease-in-out infinite" } : {}),
    }} />
  );
}

function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-2)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {children}
      </span>
      {action}
    </div>
  );
}

export function RightSidebar({ worktree, repo, onUpdateRepo, onOpenDiff }: Props) {
  const [splitPct, setSplitPct] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.min(85, Math.max(15, ((e.clientY - rect.top) / rect.height) * 100));
    setSplitPct(pct);
  }, []);
  const onMouseUp = useCallback(() => { dragging.current = false; }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const [workspace, setWorkspace] = useState<Workspace>({ worktreeId: worktree.id, status: "stopped", port: null, url: null });
  const [editingCommand, setEditingCommand] = useState(false);
  const [commandDraft, setCommandDraft] = useState(repo.devCommand ?? "");
  const [editingSetup, setEditingSetup] = useState(false);
  const [setupDraft, setSetupDraft] = useState(repo.setupCommand ?? "");
  const [diffFiles, setDiffFiles] = useState<DiffFile[]>([]);

  useEffect(() => {
    window.api.invoke("workspace:get", { worktreeId: worktree.id }).then(setWorkspace);
    const unsub = window.api.on("workspace:update", ({ workspace: ws }) => {
      if (ws.worktreeId === worktree.id) setWorkspace(ws);
    });
    return unsub;
  }, [worktree.id]);

  useEffect(() => { setCommandDraft(repo.devCommand ?? ""); }, [repo.devCommand]);
  useEffect(() => { setSetupDraft(repo.setupCommand ?? ""); }, [repo.setupCommand]);

  useEffect(() => {
    loadDiff();
  }, [worktree.id]);

  async function loadDiff() {
    const result = await window.api.invoke("worktree:diff", { id: worktree.id });
    setDiffFiles(result.files);
  }

  async function saveCommand() {
    const cmd = commandDraft.trim();
    await window.api.invoke("repo:set-dev-command", { id: repo.id, command: cmd });
    onUpdateRepo(cmd ? { ...repo, devCommand: cmd } : { ...repo });
    setEditingCommand(false);
  }

  async function saveSetupCommand() {
    const cmd = setupDraft.trim();
    await window.api.invoke("repo:set-setup-command", { id: repo.id, command: cmd });
    const next = { ...repo };
    if (cmd) next.setupCommand = cmd;
    else delete next.setupCommand;
    onUpdateRepo(next);
    setEditingSetup(false);
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
    <div style={{ width: 300, flexShrink: 0, borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)" }} ref={containerRef}>

      <div style={{ height: `${splitPct}%`, flexShrink: 0, overflow: "auto", background: "var(--surface)" }}>

        <div style={{ padding: "10px 12px 0" }}>
          <SectionLabel action={
            <button onClick={loadDiff} style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 11, cursor: "pointer" }}>↻</button>
          }>
            Changed
          </SectionLabel>
        </div>
        {diffFiles.length === 0 ? (
          <div style={{ padding: "4px 12px 10px", fontSize: 11, color: "var(--text-3)" }}>no changes</div>
        ) : (
          <div style={{ paddingBottom: 4 }}>
            {diffFiles.map((f) => (
              <div
                key={f.path}
                onClick={() => onOpenDiff(f.path)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 12px", cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLOR[f.status] ?? "var(--text-3)", flexShrink: 0, width: 10 }}>{f.status}</span>
                <span style={{ fontSize: 11, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "Menlo, Monaco, 'Courier New', monospace" }}>
                  {f.path}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />

        <div style={{ padding: "8px 12px 12px" }}>
          <SectionLabel>Workspace</SectionLabel>

          {editingCommand ? (
            <div style={{ display: "flex", gap: 6 }}>
              <input
                autoFocus
                value={commandDraft}
                onChange={(e) => setCommandDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveCommand(); if (e.key === "Escape") setEditingCommand(false); }}
                placeholder="e.g. npm run dev"
                style={{ flex: 1, background: "var(--surface-2)", border: "1px solid var(--border-2)", color: "var(--text)", padding: "4px 8px", fontSize: 11, fontFamily: "Menlo, Monaco, 'Courier New', monospace", outline: "none" }}
              />
              <button onClick={saveCommand} style={{ background: "var(--accent-dim)", border: "1px solid var(--border-2)", color: "var(--accent)", padding: "4px 8px", fontSize: 11 }}>Save</button>
              <button onClick={() => setEditingCommand(false)} style={{ background: "none", border: "1px solid var(--border-2)", color: "var(--text-3)", padding: "4px 8px", fontSize: 11 }}>✕</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {repo.devCommand ? (
                  <span onClick={() => setEditingCommand(true)} style={{ fontSize: 11, fontFamily: "Menlo, Monaco, 'Courier New', monospace", color: "var(--text-2)", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }} title="Click to edit">
                    {repo.devCommand}
                  </span>
                ) : (
                  <span onClick={() => setEditingCommand(true)} style={{ fontSize: 11, color: "var(--text-3)", cursor: "pointer" }}>+ set dev command</span>
                )}
              </div>
              {repo.devCommand && (
                <button
                  onClick={toggleWorkspace}
                  style={{ background: isRunning ? "rgba(192,96,96,0.1)" : "var(--accent-dim)", border: `1px solid ${isRunning ? "var(--red)" : "var(--border-2)"}`, color: isRunning ? "var(--red)" : "var(--accent)", padding: "3px 10px", fontSize: 11, flexShrink: 0 }}
                >
                  {isRunning ? "Stop" : "Run"}
                </button>
              )}
            </div>
          )}

          {workspace.status !== "stopped" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
              <StatusDot status={workspace.status} />
              <span style={{ fontSize: 11, color: "var(--text-3)", textTransform: "capitalize" }}>{workspace.status}</span>
              {workspace.port && (
                <span style={{ fontSize: 11, color: "var(--text-2)", fontFamily: "Menlo, Monaco, 'Courier New', monospace" }}>
                  :{workspace.port}
                </span>
              )}
              {workspace.url && (
                <a href="#" onClick={(e) => { e.preventDefault(); window.open(workspace.url!, "_blank"); }}
                  style={{ marginLeft: "auto", fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>
                  ↗
                </a>
              )}
            </div>
          )}
        </div>

        <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />

        <div style={{ padding: "8px 12px 12px" }}>
          <SectionLabel>Setup</SectionLabel>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, lineHeight: 1.5 }}>
            Runs once after each new worktree is created. Overrides auto-detect.
          </div>
          {editingSetup ? (
            <div style={{ display: "flex", gap: 6 }}>
              <input
                autoFocus
                value={setupDraft}
                onChange={(e) => setSetupDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveSetupCommand(); if (e.key === "Escape") setEditingSetup(false); }}
                placeholder="e.g. cmake -B build"
                style={{ flex: 1, background: "var(--surface-2)", border: "1px solid var(--border-2)", color: "var(--text)", padding: "4px 8px", fontSize: 11, fontFamily: "Menlo, Monaco, 'Courier New', monospace", outline: "none" }}
              />
              <button onClick={saveSetupCommand} style={{ background: "var(--accent-dim)", border: "1px solid var(--border-2)", color: "var(--accent)", padding: "4px 8px", fontSize: 11 }}>Save</button>
              <button onClick={() => setEditingSetup(false)} style={{ background: "none", border: "1px solid var(--border-2)", color: "var(--text-3)", padding: "4px 8px", fontSize: 11 }}>✕</button>
            </div>
          ) : (
            <div>
              {repo.setupCommand ? (
                <span onClick={() => setEditingSetup(true)} style={{ fontSize: 11, fontFamily: "Menlo, Monaco, 'Courier New', monospace", color: "var(--text-2)", cursor: "pointer", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title="Click to edit">
                  {repo.setupCommand}
                </span>
              ) : (
                <span onClick={() => setEditingSetup(true)} style={{ fontSize: 11, color: "var(--text-3)", cursor: "pointer" }}>+ set setup command</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div
        onMouseDown={() => { dragging.current = true; }}
        style={{ height: 4, flexShrink: 0, cursor: "row-resize", background: "transparent", borderTop: "1px solid var(--border)" }}
      />

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", padding: "8px 12px 4px", flexShrink: 0 }}>
          Terminal
        </div>
        <TerminalView worktreeId={worktree.id} />
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}
