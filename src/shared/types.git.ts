export type CiStatus = "none" | "queued" | "running" | "success" | "failure" | "neutral";

export type GitAction =
  | "connect"
  | "up-to-date"
  | "commit-push"
  | "push"
  | "create-pr"
  | "ci-running"
  | "ci-failed"
  | "changes-requested"
  | "awaiting-review"
  | "merge"
  | "merged";

export type ReviewDecision = "approved" | "changes_requested" | "review_required" | null;

export interface PrInfo {
  number: number;
  url: string;
  draft: boolean;
  reviewDecision: ReviewDecision;
  mergeable: boolean;
}

export interface GitState {
  worktreeId: string;
  branch: string;
  isBase: boolean;
  action: GitAction;
  label: string;
  enabled: boolean;
  busy: boolean;
  detail: string | null;
  pr: PrInfo | null;
  ci: { status: CiStatus; url: string | null };
}

export interface GitInvoke {
  "git:state": { args: { worktreeId: string }; result: GitState };
  "git:commit-push": { args: { worktreeId: string }; result: GitState };
  "git:push": { args: { worktreeId: string }; result: GitState };
  "git:create-pr": { args: { worktreeId: string }; result: GitState };
  "git:merge": { args: { worktreeId: string }; result: GitState };
}
