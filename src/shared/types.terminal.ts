export interface TerminalInvoke {
  "terminal:create": { args: { worktreeId: string }; result: { terminalId: string } };
  "terminal:input": { args: { terminalId: string; data: string }; result: void };
  "terminal:resize": { args: { terminalId: string; cols: number; rows: number }; result: void };
  "terminal:destroy": { args: { terminalId: string }; result: void };
}

export interface TerminalEvents {
  "terminal:data": { terminalId: string; data: string };
}
