export interface Worktree {
  id: string;
  repoId: string;
  branch: string;
  path: string;
  isMain: boolean;
}

export interface WorktreeInvoke {
  "worktree:create": { args: { repoId: string; branch?: string }; result: Worktree };
  "worktree:list": { args: void; result: Worktree[] };
  "worktree:remove": { args: { id: string }; result: void };
  "worktree:commit-push": { args: { id: string }; result: { commitMessage: string } };
}
