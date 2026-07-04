export type AgentStatus = "running" | "stopped" | "error";

export interface Repo {
  id: string;
  name: string;
  path: string;
}

export interface Worktree {
  id: string;
  repoId: string;
  branch: string;
  path: string;
  isMain: boolean;
}

export interface Agent {
  id: string;
  worktreeId: string;
  command: string[];
  status: AgentStatus;
  startedAt: number;
}

export interface LogLine {
  agentId: string;
  data: string;
  timestamp: number;
}

export interface GitHubUser {
  login: string;
  name: string | null;
  avatarUrl: string;
}

export interface IpcInvoke {
  "repo:add": { args: void; result: { repo: Repo; worktrees: Worktree[] } };
  "repo:list": { args: void; result: Repo[] };
  "repo:remove": { args: { id: string }; result: void };
  "github:auth-start": { args: void; result: { userCode: string; verificationUri: string } };
  "github:auth-poll": { args: void; result: GitHubUser };
  "github:auth-status": { args: void; result: GitHubUser | null };
  "github:auth-disconnect": { args: void; result: void };
  "worktree:create": { args: { repoId: string; branch: string }; result: Worktree };
  "worktree:list": { args: void; result: Worktree[] };
  "worktree:remove": { args: { id: string }; result: void };
  "worktree:commit-push": { args: { id: string }; result: { commitMessage: string } };
  "agent:spawn": { args: { worktreeId: string; command: string[] }; result: Agent };
  "agent:kill": { args: { id: string }; result: void };
  "agent:list": { args: void; result: Agent[] };
  "agent:input": { args: { id: string; data: string }; result: void };
  "agent:resize": { args: { id: string; cols: number; rows: number }; result: void };
}

export interface IpcEvents {
  "log:line": LogLine;
  "agent:status": { id: string; status: AgentStatus };
}
