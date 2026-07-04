export type AgentStatus = "idle" | "running" | "stopped" | "error";

export interface Worktree {
  id: string;
  branch: string;
  path: string;
}

export interface Agent {
  id: string;
  worktreeId: string;
  command: string[];
  status: AgentStatus;
  startedAt: number | null;
}

export interface LogLine {
  agentId: string;
  stream: "stdout" | "stderr";
  data: string;
  timestamp: number;
}

export interface IpcInvoke {
  "worktree:create": { args: { branch: string; path: string }; result: Worktree };
  "worktree:list": { args: void; result: Worktree[] };
  "worktree:remove": { args: { id: string }; result: void };
  "agent:spawn": { args: { worktreeId: string; command: string[] }; result: Agent };
  "agent:kill": { args: { id: string }; result: void };
  "agent:list": { args: void; result: Agent[] };
}

export interface IpcEvents {
  "log:line": LogLine;
  "agent:status": { id: string; status: AgentStatus };
}
