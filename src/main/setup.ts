import fs from "fs";
import path from "path";
import type { Repo } from "../shared/types";

type ShareStrategy =
  | { kind: "symlink"; dir: string }
  | { kind: "none" };

export interface Ecosystem {
  name: string;
  detect: (repoPath: string) => boolean;
  manifests: string[];
  setup: (repoPath: string) => string | null;
  share: ShareStrategy;
}

const has = (repoPath: string, ...files: string[]): boolean =>
  files.some((f) => fs.existsSync(path.join(repoPath, f)));

function nodePackageManager(repoPath: string): string {
  if (has(repoPath, "pnpm-lock.yaml")) return "pnpm";
  if (has(repoPath, "bun.lockb", "bun.lock")) return "bun";
  if (has(repoPath, "yarn.lock")) return "yarn";
  return "npm";
}

export const ECOSYSTEMS: Ecosystem[] = [
  {
    name: "node",
    detect: (p) => has(p, "package.json"),
    manifests: ["pnpm-lock.yaml", "bun.lock", "bun.lockb", "yarn.lock", "package-lock.json", "package.json"],
    setup: (p) => `${nodePackageManager(p)} install`,
    share: { kind: "symlink", dir: "node_modules" },
  },
  {
    name: "go",
    detect: (p) => has(p, "go.mod"),
    manifests: ["go.mod", "go.sum"],
    setup: () => "go mod download",
    share: { kind: "none" },
  },
  {
    name: "rust",
    detect: (p) => has(p, "Cargo.toml"),
    manifests: ["Cargo.toml", "Cargo.lock"],
    setup: () => "cargo fetch",
    share: { kind: "none" },
  },
  {
    name: "python",
    detect: (p) => has(p, "pyproject.toml", "requirements.txt", "Pipfile"),
    manifests: ["uv.lock", "poetry.lock", "Pipfile.lock", "pyproject.toml", "requirements.txt", "Pipfile"],
    setup: (p) =>
      has(p, "uv.lock") ? "uv sync"
      : has(p, "poetry.lock") ? "poetry install"
      : has(p, "Pipfile") ? "pipenv install"
      : has(p, "requirements.txt") ? "pip install -r requirements.txt"
      : "pip install .",
    share: { kind: "none" },
  },
  {
    name: "ruby",
    detect: (p) => has(p, "Gemfile"),
    manifests: ["Gemfile", "Gemfile.lock"],
    setup: () => "bundle install",
    share: { kind: "none" },
  },
  {
    name: "cmake",
    detect: (p) => has(p, "CMakeLists.txt"),
    manifests: ["CMakeLists.txt", "conanfile.txt", "conanfile.py", "vcpkg.json"],
    setup: (p) =>
      has(p, "conanfile.txt", "conanfile.py")
        ? "conan install . --build=missing && cmake -B build"
        : "cmake -B build",
    share: { kind: "none" },
  },
];

export function detectEcosystem(repoPath: string): Ecosystem | null {
  return ECOSYSTEMS.find((e) => e.detect(repoPath)) ?? null;
}

export function manifestsMatch(mainPath: string, worktreePath: string, manifests: string[]): boolean {
  for (const f of manifests) {
    const a = path.join(mainPath, f);
    const b = path.join(worktreePath, f);
    const aExists = fs.existsSync(a);
    if (aExists !== fs.existsSync(b)) return false;
    if (aExists && fs.readFileSync(a, "utf8") !== fs.readFileSync(b, "utf8")) return false;
  }
  return true;
}

export type SetupPlan =
  | { action: "run"; cmd: string }
  | { action: "symlink"; dir: string; fallback: string }
  | { action: "none" };

export function planWorktreeSetup(repo: Repo, worktreePath: string): SetupPlan {
  if (repo.setupCommand) return { action: "run", cmd: repo.setupCommand };

  const eco = detectEcosystem(repo.path);
  if (!eco) return { action: "none" };

  const cmd = eco.setup(repo.path);

  if (eco.share.kind === "symlink") {
    const dir = eco.share.dir;
    if (fs.existsSync(path.join(worktreePath, dir))) return { action: "none" };
    if (fs.existsSync(path.join(repo.path, dir)) && manifestsMatch(repo.path, worktreePath, eco.manifests)) {
      return { action: "symlink", dir, fallback: cmd ?? "" };
    }
  }

  return cmd ? { action: "run", cmd } : { action: "none" };
}
