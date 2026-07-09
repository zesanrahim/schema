export interface Repo {
  id: string;
  name: string;
  path: string;
  devCommand?: string;
  setupCommand?: string;
}

export interface RepoInvoke {
  "repo:add": { args: void; result: { repo: Repo; worktrees: import("./types.worktree").Worktree[] } };
  "repo:list": { args: void; result: Repo[] };
  "repo:remove": { args: { id: string }; result: void };
  "repo:set-dev-command": { args: { id: string; command: string }; result: void };
  "repo:set-setup-command": { args: { id: string; command: string }; result: void };
}
