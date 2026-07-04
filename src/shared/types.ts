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

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: ToolCall[];
  timestamp: number;
  done: boolean;
}

export interface Chat {
  id: string;
  worktreeId: string;
  sessionId: string | null;
  title: string;
  createdAt: number;
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
  "chat:slash-commands": { args: void; result: Array<{ name: string; description: string }> };
  "chat:create": { args: { worktreeId: string }; result: Chat };
  "chat:list": { args: { worktreeId: string }; result: Chat[] };
  "chat:delete": { args: { id: string }; result: void };
  "chat:messages": { args: { chatId: string }; result: Message[] };
  "chat:send": { args: { chatId: string; message: string }; result: void };
}

export interface IpcEvents {
  "chat:delta": { chatId: string; messageId: string; text: string };
  "chat:tool-start": { chatId: string; messageId: string; tool: Omit<ToolCall, "output"> };
  "chat:tool-done": { chatId: string; messageId: string; toolId: string; output: string };
  "chat:done": { chatId: string; messageId: string };
  "chat:error": { chatId: string; error: string };
}
