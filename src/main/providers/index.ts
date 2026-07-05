import type { ProviderId } from "../../shared/types.provider";
import type { Provider } from "./base";
import { claudeProvider } from "./claude";
import { opencodeProvider } from "./opencode";

const registry = new Map<ProviderId, Provider>([
  ["claude", claudeProvider],
  ["opencode", opencodeProvider],
]);

export function getProvider(id: ProviderId): Provider {
  return registry.get(id) ?? claudeProvider;
}
