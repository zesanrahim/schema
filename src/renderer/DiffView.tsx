import { useState, useEffect } from "react";

interface Props {
  worktreeId: string;
  filePath: string;
  onClose: () => void;
}

function DiffLine({ line }: { line: string }) {
  let color = "var(--text)";
  let bg = "transparent";
  if (line.startsWith("+")) { color = "var(--green)"; bg = "rgba(107,158,122,0.08)"; }
  else if (line.startsWith("-")) { color = "var(--red)"; bg = "rgba(192,96,96,0.08)"; }

  return (
    <div style={{ color, background: bg, paddingLeft: 12, whiteSpace: "pre", lineHeight: 1.5 }}>
      {line || " "}
    </div>
  );
}

export function DiffView({ worktreeId, filePath, onClose }: Props) {
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    window.api.invoke("worktree:diff", { id: worktreeId, filePath }).then((result) => {
      setRaw(result.raw);
      setLoading(false);
    });
  }, [worktreeId, filePath]);

  const lines = raw
    .split("\n")
    .filter((l) => !l.startsWith("diff --git") && !l.startsWith("index ") && !l.startsWith("--- ") && !l.startsWith("+++ ") && !l.startsWith("@@"));

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      zIndex: 30,
      background: "var(--bg)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        height: 40,
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        background: "var(--surface)",
      }}>
        <span style={{ fontSize: 12, fontFamily: "Menlo, Monaco, 'Courier New', monospace", color: "var(--text-2)" }}>
          {filePath}
        </span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 18, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && (
          <div style={{ padding: "40px 20px", fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>loading…</div>
        )}
        {!loading && lines.length === 0 && (
          <div style={{ padding: "40px 20px", fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>no diff for this file</div>
        )}
        {!loading && lines.length > 0 && (
          <div style={{ fontSize: 12, fontFamily: "Menlo, Monaco, 'Courier New', monospace", paddingTop: 8, paddingBottom: 8 }}>
            {lines.map((line, i) => <DiffLine key={i} line={line} />)}
          </div>
        )}
      </div>
    </div>
  );
}
