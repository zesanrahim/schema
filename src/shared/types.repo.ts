export interface Repo {
  id: string;
  name: string;
  path: string;
}

export interface RepoInvoke {
  "repo:add": { args: void; result: { repo: Repo; worktrees: import("./types.worktree").Worktree[] } };
  "repo:list": { args: void; result: Repo[] };
  "repo:remove": { args: { id: string }; result: void };
}
