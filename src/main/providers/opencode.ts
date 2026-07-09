import type { NormalizedEvent } from "../../shared/types.provider";
import type { Provider } from "./base";

// opencode event stream (newline-delimited JSON):
// {"type":"step_start", "sessionID":"ses_...", "part":{...}}
// {"type":"text", "part":{"type":"text","text":"...",...}}
// {"type":"tool_use", "part":{"type":"tool-use","toolUseId":"...","toolName":"...","input":{...}}}
// {"type":"tool_result", "part":{"type":"tool-result","toolUseId":"...","content":"..."}}
// {"type":"step_finish", "part":{"type":"step-finish","reason":"stop","tokens":{...},"cost":0}}

export const opencodeProvider: Provider = {
  id: "opencode",

  spawnScript(sessionId) {
    const session = sessionId ? `--session "${sessionId}"` : "";
    return `opencode run --format json --dangerously-skip-permissions ${session}`.trim();
  },

  formatInput(text) {
    return text + "\n";
  },

  parseEvent(event): NormalizedEvent[] {
    const sessionId = event.sessionID as string | undefined;

    if (event.type === "text") {
      const part = event.part as { text?: string } | undefined;
      const text = part?.text ?? "";
      return text ? [{ type: "text", text }] : [];
    }

    if (event.type === "tool_use") {
      const part = event.part as { toolUseId?: string; toolName?: string; input?: Record<string, unknown> } | undefined;
      if (!part?.toolUseId) return [];
      return [{
        type: "tool_start",
        toolId: part.toolUseId,
        toolName: part.toolName ?? "tool",
        input: part.input ?? {},
      }];
    }

    if (event.type === "tool_result") {
      const part = event.part as { toolUseId?: string; content?: unknown } | undefined;
      if (!part?.toolUseId) return [];
      const raw = part.content;
      return [{
        type: "tool_done",
        toolId: part.toolUseId,
        output: (typeof raw === "string" ? raw : JSON.stringify(raw)).slice(0, 2000),
      }];
    }

    if (event.type === "step_finish" && sessionId) {
      return [{ type: "done", sessionId }];
    }

    return [];
  },
};
