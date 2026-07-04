import * as pty from "node-pty";
import type { Sender } from "../shared/types";

const ptys = new Map<string, pty.IPty>();

let globalSend: Sender = () => {};

export function setTerminalSender(send: Sender) {
  globalSend = send;
}

export function createTerminal(terminalId: string, cwd: string) {
  const shell = process.env.SHELL ?? "/bin/zsh";
  const proc = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd,
    env: process.env as Record<string, string>,
  });

  proc.onData((data) => {
    globalSend("terminal:data", { terminalId, data });
  });

  proc.onExit(() => {
    ptys.delete(terminalId);
  });

  ptys.set(terminalId, proc);
}

export function writeTerminal(terminalId: string, data: string) {
  ptys.get(terminalId)?.write(data);
}

export function resizeTerminal(terminalId: string, cols: number, rows: number) {
  ptys.get(terminalId)?.resize(cols, rows);
}

export function destroyTerminal(terminalId: string) {
  ptys.get(terminalId)?.kill();
  ptys.delete(terminalId);
}

export function killAllTerminals() {
  for (const [id] of ptys) destroyTerminal(id);
}
