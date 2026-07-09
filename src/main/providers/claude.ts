import type { NormalizedEvent } from "../../shared/types.provider";
import type { Provider } from "./base";

export const claudeProvider: Provider = {
  id: "claude",

  spawnScript(sessionId) {
    const resume = sessionId ? `--resume "${sessionId}"` : "";
    return `claude --input-format stream-json --output-format stream-json --verbose --dangerously-skip-permissions ${resume}`.trim();
  },

  formatInput(text) {
    return JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text }] } }) + "\n";
  },

  parseEvent(event): NormalizedEvent[] {
    if (event.type === "assistant") {
      const content = (event.message as { content?: Array<Record<string, unknown>> })?.content ?? [];
      const out: NormalizedEvent[] = [];
      for (const block of content) {
        if (block.type === "text") {
          out.push({ type: "text", text: block.text as string });
        } else if (block.type === "tool_use") {
          out.push({
            type: "tool_start",
            toolId: block.id as string,
            toolName: block.name as string,
            input: block.input as Record<string, unknown>,
          });
        }
      }
      return out;
    }

    if (event.type === "user") {
      const content = (event.message as { content?: Array<Record<string, unknown>> })?.content ?? [];
      for (const block of content) {
        if (block.type === "tool_result") {
          const raw = block.content;
          return [{
            type: "tool_done",
            toolId: block.tool_use_id as string,
            output: (typeof raw === "string" ? raw : JSON.stringify(raw)).slice(0, 2000),
          }];
        }
      }
      return [];
    }

    if (event.type === "result") {
      return [{ type: "done", sessionId: (event.session_id as string | undefined) ?? "" }];
    }

    if (event.type === "system" && (event.subtype === "error" || event.subtype === "error_during_tool")) {
      return [{ type: "error", error: String(event.error ?? "Unknown error") }];
    }

    return [];
  },
};
