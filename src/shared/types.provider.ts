export type ProviderId = "claude" | "opencode";

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  description: string;
}

export const PROVIDERS: ProviderInfo[] = [
  { id: "claude", name: "Claude Code", description: "Anthropic's Claude Code CLI" },
  { id: "opencode", name: "opencode", description: "Open-source AI coding agent" },
];

export interface NormalizedTextEvent {
  type: "text";
  text: string;
}

export interface NormalizedToolStartEvent {
  type: "tool_start";
  toolId: string;
  toolName: string;
  input: Record<string, unknown>;
}

export interface NormalizedToolDoneEvent {
  type: "tool_done";
  toolId: string;
  output: string;
}

export interface NormalizedDoneEvent {
  type: "done";
  sessionId: string;
}

export interface NormalizedErrorEvent {
  type: "error";
  error: string;
}

export type NormalizedEvent =
  | NormalizedTextEvent
  | NormalizedToolStartEvent
  | NormalizedToolDoneEvent
  | NormalizedDoneEvent
  | NormalizedErrorEvent;
