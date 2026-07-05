import type { ProviderId, NormalizedEvent } from "../../shared/types.provider";

export interface Provider {
  id: ProviderId;
  spawnScript(sessionId: string | null): string;
  parseEvent(event: Record<string, unknown>): NormalizedEvent[];
}
