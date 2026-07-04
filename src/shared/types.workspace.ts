export interface Workspace {
  worktreeId: string;
  status: "stopped" | "starting" | "running" | "error";
  port: number | null;
  url: string | null;
}

export interface WorkspaceInvoke {
  "workspace:start": { args: { worktreeId: string }; result: void };
  "workspace:stop": { args: { worktreeId: string }; result: void };
  "workspace:get": { args: { worktreeId: string }; result: Workspace };
}

export interface WorkspaceEvents {
  "workspace:update": { workspace: Workspace };
}
