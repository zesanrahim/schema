export interface AnthropicAuthStatus {
  loggedIn: boolean;
  authMethod: string | null;
  email: string | null;
}

export interface AnthropicInvoke {
  "anthropic:auth-status": { args: void; result: AnthropicAuthStatus };
  "anthropic:auth-login": { args: void; result: { terminalId: string } };
  "anthropic:auth-logout": { args: void; result: void };
  "anthropic:key-get": { args: void; result: { masked: string | null } };
  "anthropic:key-set": { args: { key: string }; result: void };
  "anthropic:key-clear": { args: void; result: void };
}
