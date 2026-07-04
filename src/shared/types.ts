export type { Sender } from "./types.ipc";
export type { Repo, RepoInvoke } from "./types.repo";
export type { Worktree, WorktreeInvoke } from "./types.worktree";
export type { ToolCall, Message, Chat, ChatInvoke, ChatEvents } from "./types.chat";
export type { TerminalInvoke, TerminalEvents } from "./types.terminal";
export type { GitHubUser, GithubInvoke } from "./types.github";

import type { RepoInvoke } from "./types.repo";
import type { WorktreeInvoke } from "./types.worktree";
import type { ChatInvoke, ChatEvents } from "./types.chat";
import type { TerminalInvoke, TerminalEvents } from "./types.terminal";
import type { GithubInvoke } from "./types.github";

export type IpcInvoke = RepoInvoke & WorktreeInvoke & ChatInvoke & TerminalInvoke & GithubInvoke;
export type IpcEvents = ChatEvents & TerminalEvents;
