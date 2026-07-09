import { useState, useEffect, useRef, useCallback } from "react";
import type { GitState, GitAction, CiStatus } from "../shared/types";

const ACTION_CHANNEL: Partial<Record<GitAction, "git:commit-push" | "git:push" | "git:create-pr" | "git:merge">> = {
  "commit-push": "git:commit-push",
  "push": "git:push",
  "create-pr": "git:create-pr",
  "merge": "git:merge",
};

const ACCENT_ACTIONS: GitAction[] = ["commit-push", "push", "create-pr", "merge", "connect"];
const DANGER_ACTIONS: GitAction[] = ["ci-failed", "changes-requested"];

function ciColor(status: CiStatus): string {
  if (status === "success") return "var(--green)";
  if (status === "failure") return "var(--red)";
  if (status === "running" || status === "queued") return "#d4a847";
  return "var(--text-3)";
}

export function GitButton({ worktreeId, onConnect }: { worktreeId: string; onConnect: () => void }) {
  const [state, setState] = useState<GitState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await window.api.invoke("git:state", { worktreeId });
      setState(s);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("git:state failed", msg);
      setError(msg);
      setState(null);
    }
  }, [worktreeId]);

  useEffect(() => {
    setState(null);
    setError(null);
    refresh();
  }, [worktreeId, refresh]);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (state?.ci.status === "running" || state?.ci.status === "queued") {
      timer.current = setInterval(refresh, 15000);
    }
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [state, refresh]);

  if (error) {
    if (!import.meta.env.DEV) return null;
    return <span style={{ fontSize: 11, color: "var(--red)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={error}>git: {error}</span>;
  }
  if (!state || state.action === "up-to-date") return null;

  async function runAction() {
    if (!state) return;
    if (state.action === "connect") { onConnect(); return; }
    const channel = ACTION_CHANNEL[state.action];
    if (!channel) return;
    setBusy(true);
    setError(null);
    try {
      setState(await window.api.invoke(channel, { worktreeId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const actionable = state.enabled && !busy;
  const accent = ACCENT_ACTIONS.includes(state.action);
  const danger = DANGER_ACTIONS.includes(state.action);
  const color = danger ? "var(--red)" : accent ? "var(--accent)" : "var(--text-3)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {state.pr && (
        <a
          href={state.pr.url}
          onClick={(e) => { e.preventDefault(); window.open(state.pr!.url, "_blank"); }}
          title={`Open PR #${state.pr.number} on GitHub${state.ci.url ? " · CI: " + state.ci.status : ""}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            color: "var(--accent)",
            textDecoration: "underline",
            textUnderlineOffset: 2,
            cursor: "pointer",
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: ciColor(state.ci.status), flexShrink: 0 }} />
          #{state.pr.number}{state.pr.draft ? " (draft)" : ""}
          <span style={{ fontSize: 9, opacity: 0.8 }}>↗</span>
        </a>
      )}
      <button
        onClick={runAction}
        disabled={!actionable}
        title={state.detail ?? undefined}
        style={{
          background: actionable ? (danger ? "var(--red-dim, rgba(220,80,80,0.15))" : "var(--accent-dim)") : "none",
          border: `1px solid ${actionable ? (danger ? "var(--red)" : "var(--accent)") : "var(--border-2)"}`,
          color: actionable ? color : "var(--text-3)",
          padding: "4px 10px",
          fontSize: 11,
          opacity: busy ? 0.6 : 1,
          cursor: actionable ? "pointer" : "default",
        }}
      >
        {busy ? "…" : state.label}
      </button>
    </div>
  );
}
