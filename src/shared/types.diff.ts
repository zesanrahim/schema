export interface DiffFile {
  path: string;
  status: "M" | "A" | "D" | "R" | "?";
}

export interface DiffResult {
  files: DiffFile[];
  raw: string;
}

export interface DiffInvoke {
  "worktree:diff": { args: { id: string; filePath?: string }; result: DiffResult };
}
