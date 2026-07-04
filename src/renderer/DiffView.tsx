import { useState, useEffect } from "react";
import type { DiffFile } from "../shared/types";

interface Props {
  worktreeId: string;
}

const STATUS_COLOR: Record<string, string> = {
  M: "#d4a847",
  A: "var(--green)",
  D: "var(--red)",
  R: "#7b9fd4",
  "?": "var(--text-3)",
};

function DiffLine({ line }: { line: string }) {
  let color = "var(--text)";
  if (line.startsWith("+") && !line.startsWith("+++")) color = "var(--green)";
  else if (line.startsWith("-") && !line.startsWith("---")) color = "var(--red)";
  else if (line.startsWith("@@")) color = "#7b9fd4";
  else if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++")) color = "var(--text-3)";

  return (
    <div style={{
      color,
      background: line.startsWith("+") && !line.startsWith("+++")
        ? "rgba(107, 158, 122, 0.08)"
        : line.startsWith("-") && !line.startsWith("---")
          ? "rgba(192, 96, 96, 0.08)"
          : "transparent",
      paddingLeft: 12,
      whiteSpace: "pre",
      lineHeight: 1.5,
    }}>
      {line || " "}
    </div>
  );
}

export function DiffView({ worktreeId }: Props) {
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSelectedPath(null);
    setRaw("");
    load(null);
  }, [worktreeId]);

  async function load(filePath: string | null) {
    setLoading(true);
    try {
      const args = filePath ? { id: worktreeId, filePath } : { id: worktreeId };
      const result = await window.api.invoke("worktree:diff", args);
      setFiles(result.files);
      setRaw(result.raw);
    } finally {
      setLoading(false);
    }
  }

  function selectFile(path: string) {
    setSelectedPath(path);
    load(path);
  }

  const lines = raw.split("\n");

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      <div style={{
        width: 220,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px 6px",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Changed files
          </span>
          <button
            onClick={() => load(selectedPath)}
            style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 11, cursor: "pointer" }}
          >
            ↻
          </button>
        </div>

        {files.length === 0 ? (
          <div style={{ padding: "20px 12px", fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>
            {loading ? "loading…" : "no changes"}
          </div>
        ) : (
          files.map((f) => {
            const isSelected = f.path === selectedPath;
            return (
              <div
                key={f.path}
                onClick={() => selectFile(f.path)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 12px",
                  background: isSelected ? "var(--accent-dim)" : "transparent",
                  borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLOR[f.status] ?? "var(--text-3)", flexShrink: 0, width: 10 }}>
                  {f.status}
                </span>
                <span style={{
                  fontSize: 11,
                  color: isSelected ? "var(--text)" : "var(--text-2)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontFamily: "Menlo, Monaco, 'Courier New', monospace",
                }}>
                  {f.path}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", background: "var(--bg)" }}>
        {!raw && !loading && (
          <div style={{ padding: "40px 20px", fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>
            {files.length === 0 ? "working tree is clean" : "select a file to view diff"}
          </div>
        )}
        {loading && (
          <div style={{ padding: "40px 20px", fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>loading…</div>
        )}
        {raw && !loading && (
          <div style={{ fontSize: 12, fontFamily: "Menlo, Monaco, 'Courier New', monospace", paddingTop: 8, paddingBottom: 8 }}>
            {lines.map((line, i) => <DiffLine key={i} line={line} />)}
          </div>
        )}
      </div>
    </div>
  );
}
