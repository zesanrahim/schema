import type { ProviderId } from "./types.provider";

export interface AppSettings {
  defaultProviderId: ProviderId;
}

export interface SettingsInvoke {
  "settings:get": { args: void; result: AppSettings };
  "settings:set": { args: Partial<AppSettings>; result: void };
}
