import { useState, useEffect, useRef } from "react";

interface Props {
  chatId: string;
}

export function DebugPanel({ chatId }: Props) {
  const [log, setLog] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLog([]);
    return window.api.on("chat:debug", ({ chatId: id, message }) => {
      if (id !== chatId) return;
      setLog((prev) => {
        const next = [...prev, message];
        return next.length > 200 ? next.slice(-200) : next;
      });
    });
  }, [chatId]);

  useEffect(() => {
    if (open && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log, open]);

  return (
    <div style={{ flexShrink: 0, borderTop: "1px solid var(--border)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          borderBottom: open ? "1px solid var(--border)" : "none",
          color: "var(--text-3)",
          padding: "3px 12px",
          fontSize: 10,
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        <span>{open ? "▾" : "▸"}</span>
        debug
        {log.length > 0 && (
          <span style={{ color: "var(--accent)", marginLeft: "auto" }}>{log.length} lines</span>
        )}
      </button>
      {open && (
        <div
          ref={ref}
          style={{
            height: 160,
            overflowY: "auto",
            background: "var(--surface)",
            padding: "6px 12px",
            fontFamily: "Menlo, Monaco, 'Courier New', monospace",
            fontSize: 10,
            color: "var(--text-2)",
            lineHeight: 1.6,
          }}
        >
          {log.length === 0
            ? <span style={{ color: "var(--text-3)" }}>no events yet</span>
            : log.map((line, i) => (
              <div key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{line}</div>
            ))
          }
        </div>
      )}
    </div>
  );
}
