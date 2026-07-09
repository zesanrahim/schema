import { execFileSync, spawnSync } from "child_process";
import { hasToken, githubFetch } from "./github";
import { LOGIN_SHELL } from "./shell";
import type { GitState, GitAction, CiStatus, PrInfo, ReviewDecision } from "../shared/types.git";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

interface LocalState {
  branch: string;
  dirty: boolean;
  ahead: number;
  hasUpstream: boolean;
  headSha: string;
}

function localState(cwd: string): LocalState {
  const branch = git(cwd, "rev-parse", "--abbrev-ref", "HEAD");
  const dirty = git(cwd, "status", "--porcelain").length > 0;
  const headSha = git(cwd, "rev-parse", "HEAD");
  let ahead = 0;
  let hasUpstream = false;
  try {
    const counts = git(cwd, "rev-list", "--left-right", "--count", "@{upstream}...HEAD");
    ahead = Number(counts.split(/\s+/)[1] ?? 0);
    hasUpstream = true;
  } catch {
    hasUpstream = false;
  }
  return { branch, dirty, ahead, hasUpstream, headSha };
}

function repoSlug(cwd: string): { owner: string; repo: string } | null {
  try {
    const url = git(cwd, "remote", "get-url", "origin");
    const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
    if (!m || !m[1] || !m[2]) return null;
    return { owner: m[1], repo: m[2] };
  } catch {
    return null;
  }
}

async function json(res: Response): Promise<unknown> {
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res.json();
}

interface RepoInfo {
  default_branch: string;
  allow_squash_merge: boolean;
  allow_merge_commit: boolean;
  allow_rebase_merge: boolean;
}

async function getRepoInfo(owner: string, repo: string): Promise<RepoInfo> {
  const d = (await json(await githubFetch(`/repos/${owner}/${repo}`))) as RepoInfo;
  return d;
}

async function getPr(owner: string, repo: string, branch: string): Promise<{ number: number; url: string; draft: boolean; mergeable: boolean; sha: string; merged: boolean } | null> {
  const list = (await json(
    await githubFetch(`/repos/${owner}/${repo}/pulls?head=${owner}:${encodeURIComponent(branch)}&state=all&per_page=10`)
  )) as Array<{ number: number; html_url: string; draft: boolean; state: string; merged_at: string | null; head: { sha: string } }>;
  if (list.length === 0) return null;
  const open = list.find((p) => p.state === "open");
  const chosen = open ?? list[0]!;
  const full = (await json(await githubFetch(`/repos/${owner}/${repo}/pulls/${chosen.number}`))) as {
    number: number; html_url: string; draft: boolean; mergeable: boolean | null; merged: boolean; head: { sha: string };
  };
  return {
    number: full.number,
    url: full.html_url,
    draft: full.draft,
    mergeable: full.mergeable !== false,
    sha: full.head.sha,
    merged: full.merged,
  };
}

async function getReviewDecision(owner: string, repo: string, prNumber: number): Promise<ReviewDecision> {
  const reviews = (await json(
    await githubFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews?per_page=100`)
  )) as Array<{ user: { login: string }; state: string; submitted_at: string }>;
  const latest = new Map<string, string>();
  for (const r of reviews) {
    if (r.state !== "APPROVED" && r.state !== "CHANGES_REQUESTED") continue;
    latest.set(r.user.login, r.state);
  }
  const states = [...latest.values()];
  if (states.includes("CHANGES_REQUESTED")) return "changes_requested";
  if (states.includes("APPROVED")) return "approved";
  return "review_required";
}

async function getCi(owner: string, repo: string, sha: string): Promise<{ status: CiStatus; url: string | null }> {
  const d = (await json(
    await githubFetch(`/repos/${owner}/${repo}/commits/${sha}/check-runs`)
  )) as { check_runs: Array<{ status: string; conclusion: string | null; html_url: string }> };
  const runs = d.check_runs;
  if (runs.length === 0) return { status: "none", url: null };
  const failing = runs.find((r) => r.conclusion && ["failure", "timed_out", "cancelled", "action_required"].includes(r.conclusion));
  if (failing) return { status: "failure", url: failing.html_url };
  if (runs.some((r) => r.status !== "completed")) return { status: "running", url: runs[0]!.html_url };
  const anySuccess = runs.some((r) => r.conclusion === "success");
  return { status: anySuccess ? "success" : "neutral", url: runs[0]!.html_url };
}

const LABELS: Record<GitAction, string> = {
  "connect": "Connect GitHub",
  "up-to-date": "Up to date",
  "commit-push": "Commit & push",
  "push": "Push",
  "create-pr": "Create draft PR",
  "ci-running": "Checks running…",
  "ci-failed": "Checks failing",
  "changes-requested": "Changes requested",
  "awaiting-review": "Awaiting review",
  "merge": "Merge",
  "merged": "Merged",
};

const ENABLED: Record<GitAction, boolean> = {
  "connect": true,
  "up-to-date": false,
  "commit-push": true,
  "push": true,
  "create-pr": true,
  "ci-running": false,
  "ci-failed": false,
  "changes-requested": false,
  "awaiting-review": false,
  "merge": true,
  "merged": false,
};

function state(worktreeId: string, branch: string, isBase: boolean, action: GitAction, pr: PrInfo | null, ci: GitState["ci"], detail: string | null): GitState {
  return { worktreeId, branch, isBase, action, label: LABELS[action], enabled: ENABLED[action], busy: false, detail, pr, ci };
}

export async function computeGitState(worktreeId: string, cwd: string): Promise<GitState> {
  const local = localState(cwd);
  const noCi = { status: "none" as CiStatus, url: null };

  if (!hasToken()) return state(worktreeId, local.branch, false, "connect", null, noCi, null);

  const slug = repoSlug(cwd);
  if (!slug) {
    return state(worktreeId, local.branch, false, local.dirty ? "commit-push" : "up-to-date", null, noCi, "No GitHub remote");
  }

  const repo = await getRepoInfo(slug.owner, slug.repo);
  const isBase = local.branch === repo.default_branch;
  if (isBase) return state(worktreeId, local.branch, true, "up-to-date", null, noCi, `On ${repo.default_branch}`);

  if (local.dirty) return state(worktreeId, local.branch, false, "commit-push", null, noCi, null);

  const prRaw = await getPr(slug.owner, slug.repo, local.branch);

  if (!prRaw) {
    if (local.ahead > 0 || !local.hasUpstream) return state(worktreeId, local.branch, false, "create-pr", null, noCi, null);
    return state(worktreeId, local.branch, false, "up-to-date", null, noCi, null);
  }

  const ci = await getCi(slug.owner, slug.repo, prRaw.sha);
  const reviewDecision = prRaw.merged ? null : await getReviewDecision(slug.owner, slug.repo, prRaw.number);
  const pr: PrInfo = { number: prRaw.number, url: prRaw.url, draft: prRaw.draft, reviewDecision, mergeable: prRaw.mergeable };

  if (prRaw.merged) return state(worktreeId, local.branch, false, "merged", pr, ci, null);
  if (local.ahead > 0 && local.hasUpstream) return state(worktreeId, local.branch, false, "push", pr, ci, null);
  if (ci.status === "running" || ci.status === "queued") return state(worktreeId, local.branch, false, "ci-running", pr, ci, null);
  if (ci.status === "failure") return state(worktreeId, local.branch, false, "ci-failed", pr, ci, "CI checks failed");
  if (reviewDecision === "changes_requested") return state(worktreeId, local.branch, false, "changes-requested", pr, ci, null);
  if (reviewDecision === "approved" && pr.mergeable) return state(worktreeId, local.branch, false, "merge", pr, ci, null);
  return state(worktreeId, local.branch, false, "awaiting-review", pr, ci, null);
}

function aiCommitMessage(cwd: string): string {
  const diff = git(cwd, "diff", "--cached").slice(0, 12000);
  const stat = git(cwd, "diff", "--cached", "--stat");
  const fallback = (() => {
    const lines = stat.split("\n").filter(Boolean);
    const summary = lines.at(-1)?.trim() ?? "";
    const changed = lines.slice(0, -1).map((l) => l.trim().split(" ")[0]);
    return changed.length === 1 ? `update ${changed[0]}` : `update ${changed.length} files (${summary})`;
  })();
  if (!diff) return fallback;
  const prompt = "You are writing a git commit message from the staged diff provided on stdin. Output only the message: a short imperative subject line under 70 characters, optionally followed by a blank line and a brief body. No code fences, no surrounding quotes.";
  try {
    const res = spawnSync(LOGIN_SHELL, ["-lc", `claude -p ${JSON.stringify(prompt)}`], {
      cwd,
      input: diff,
      encoding: "utf8",
      timeout: 60000,
    });
    const out = (res.stdout ?? "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
    return out || fallback;
  } catch {
    return fallback;
  }
}

export function commitPush(cwd: string): void {
  git(cwd, "add", "-A");
  if (!git(cwd, "diff", "--cached", "--stat")) throw new Error("Nothing to commit");
  const message = aiCommitMessage(cwd);
  execFileSync("git", ["commit", "-m", message], { cwd });
  const branch = git(cwd, "rev-parse", "--abbrev-ref", "HEAD");
  let hasUpstream = true;
  try { git(cwd, "rev-parse", "@{upstream}"); } catch { hasUpstream = false; }
  if (hasUpstream) execFileSync("git", ["push"], { cwd });
  else execFileSync("git", ["push", "-u", "origin", branch], { cwd });
}

export function pushOnly(cwd: string): void {
  execFileSync("git", ["push"], { cwd });
}

export async function createDraftPr(cwd: string): Promise<void> {
  const slug = repoSlug(cwd);
  if (!slug) throw new Error("No GitHub remote");
  const branch = git(cwd, "rev-parse", "--abbrev-ref", "HEAD");
  execFileSync("git", ["push", "-u", "origin", branch], { cwd });
  const repo = await getRepoInfo(slug.owner, slug.repo);
  const title = git(cwd, "log", "-1", "--pretty=%s");
  const res = await githubFetch(`/repos/${slug.owner}/${slug.repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({ title, head: branch, base: repo.default_branch, draft: true, body: "" }),
  });
  if (!res.ok) throw new Error(`Failed to create PR: ${res.status} ${await res.text()}`);
}

export async function mergePr(cwd: string): Promise<void> {
  const slug = repoSlug(cwd);
  if (!slug) throw new Error("No GitHub remote");
  const branch = git(cwd, "rev-parse", "--abbrev-ref", "HEAD");
  const pr = await getPr(slug.owner, slug.repo, branch);
  if (!pr) throw new Error("No open PR for this branch");
  const repo = await getRepoInfo(slug.owner, slug.repo);
  const method = repo.allow_squash_merge ? "squash" : repo.allow_merge_commit ? "merge" : "rebase";
  const res = await githubFetch(`/repos/${slug.owner}/${slug.repo}/pulls/${pr.number}/merge`, {
    method: "PUT",
    body: JSON.stringify({ merge_method: method }),
  });
  if (!res.ok) throw new Error(`Failed to merge: ${res.status} ${await res.text()}`);
}
