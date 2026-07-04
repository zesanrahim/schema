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

export interface ChatInvoke {
  "chat:slash-commands": { args: void; result: Array<{ name: string; description: string }> };
  "chat:create": { args: { worktreeId: string }; result: Chat };
  "chat:list": { args: { worktreeId: string }; result: Chat[] };
  "chat:delete": { args: { id: string }; result: void };
  "chat:messages": { args: { chatId: string }; result: Message[] };
  "chat:send": { args: { chatId: string; message: string }; result: void };
}

export interface ChatEvents {
  "chat:delta": { chatId: string; messageId: string; text: string };
  "chat:tool-start": { chatId: string; messageId: string; tool: Omit<ToolCall, "output"> };
  "chat:tool-done": { chatId: string; messageId: string; toolId: string; output: string };
  "chat:done": { chatId: string; messageId: string };
  "chat:error": { chatId: string; error: string };
}
