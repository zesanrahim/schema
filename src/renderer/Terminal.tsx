import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { LogLine } from "../shared/types";

interface Props {
  agentId: string | null;
  logs: LogLine[];
}

export function Terminal({ agentId, logs }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const writtenRef = useRef(0);

  useEffect(() => {
    const term = new XTerm({
      theme: {
        background: "#ffffff",
        foreground: "#2b2b2b",
        cursor: "#2b2b2b",
        selectionBackground: "#d4d4d4",
        black: "#2b2b2b",
        brightBlack: "#6b6b6b",
        white: "#f5f5f5",
        brightWhite: "#ffffff",
      },
      fontFamily: "monospace",
      fontSize: 13,
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current!);
    requestAnimationFrame(() => fit.fit());

    term.onData((data) => {
      if (agentId) {
        window.api.invoke("agent:input", { id: agentId, data });
      }
    });

    xtermRef.current = term;
    fitAddonRef.current = fit;
    writtenRef.current = 0;

    const syncSize = () => {
      fit.fit();
      if (agentId) {
        window.api.invoke("agent:resize", { id: agentId, cols: term.cols, rows: term.rows });
      }
    };

    const observer = new ResizeObserver(syncSize);
    observer.observe(containerRef.current!);

    return () => {
      observer.disconnect();
      term.dispose();
    };
  }, [agentId]);

  useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;
    const newLines = logs.slice(writtenRef.current);
    for (const line of newLines) {
      term.write(line.data);
    }
    writtenRef.current = logs.length;
  }, [logs]);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, padding: 8, overflow: "hidden" }}
    />
  );
}
