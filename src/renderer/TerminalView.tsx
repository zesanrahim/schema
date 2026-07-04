import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface Props {
  worktreeId: string;
}

export function TerminalView({ worktreeId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#000000",
        foreground: "#d1d0d0",
        cursor: "#988686",
        selectionBackground: "rgba(152,134,134,0.3)",
        black: "#000000",
        brightBlack: "#3d3333",
      },
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      fontSize: 12,
      lineHeight: 1.0,
      letterSpacing: 0,
      cursorBlink: true,
      allowTransparency: false,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    let unsub: (() => void) | null = null;

    window.api.invoke("terminal:create", { worktreeId }).then(({ terminalId }) => {
      terminalIdRef.current = terminalId;

      term.onData((data) => {
        window.api.invoke("terminal:input", { terminalId, data });
      });

      term.onResize(({ cols, rows }) => {
        window.api.invoke("terminal:resize", { terminalId, cols, rows });
      });

      unsub = window.api.on("terminal:data", ({ terminalId: id, data }) => {
        if (id === terminalId) term.write(data);
      });

      fit.fit();
      window.api.invoke("terminal:resize", { terminalId, cols: term.cols, rows: term.rows });
    });

    const observer = new ResizeObserver(() => {
      fit.fit();
      if (terminalIdRef.current) {
        window.api.invoke("terminal:resize", {
          terminalId: terminalIdRef.current,
          cols: term.cols,
          rows: term.rows,
        });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      unsub?.();
      term.dispose();
      if (terminalIdRef.current) {
        window.api.invoke("terminal:destroy", { terminalId: terminalIdRef.current });
      }
    };
  }, [worktreeId]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflow: "hidden",
        padding: "8px 4px",
        background: "#000000",
      }}
    />
  );
}
