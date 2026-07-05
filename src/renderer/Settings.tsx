import { useState, useEffect, useRef } from "react";
import type { GitHubUser, AnthropicAuthStatus, ProviderId } from "../shared/types";
import { PROVIDERS } from "../shared/types";
import { TerminalView } from "./TerminalView";

interface Props {
  onBack: () => void;
}

const sectionLabel: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--text-3)",
  marginBottom: 12,
};

const btn: React.CSSProperties = {
  background: "var(--accent-dim)",
  border: "1px solid var(--accent)",
  color: "var(--accent)",
  padding: "7px 14px",
  fontSize: 12,
};

const btnGhost: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border-2)",
  color: "var(--text-2)",
  padding: "7px 14px",
  fontSize: 12,
};

const btnDanger: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border-2)",
  color: "var(--red)",
  padding: "7px 14px",
  fontSize: 12,
};

type GhAuthState = "idle" | "waiting" | "polling" | "done" | "error";

export function Settings({ onBack }: Props) {
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [ghAuthState, setGhAuthState] = useState<GhAuthState>("idle");
  const [userCode, setUserCode] = useState<string | null>(null);
  const [ghError, setGhError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [defaultProvider, setDefaultProvider] = useState<ProviderId>("claude");

  const [anthropicStatus, setAnthropicStatus] = useState<AnthropicAuthStatus | null>(null);
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [loginTerminalId, setLoginTerminalId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    window.api.invoke("github:auth-status").then(setUser);
    window.api.invoke("settings:get").then((s) => setDefaultProvider(s.defaultProviderId));
    refreshAnthropicStatus();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function setProvider(id: ProviderId) {
    setDefaultProvider(id);
    await window.api.invoke("settings:set", { defaultProviderId: id });
  }

  async function refreshAnthropicStatus() {
    const [status, { masked }] = await Promise.all([
      window.api.invoke("anthropic:auth-status"),
      window.api.invoke("anthropic:key-get"),
    ]);
    setAnthropicStatus(status);
    setMaskedKey(masked);
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function ghConnect() {
    setGhAuthState("waiting");
    setGhError(null);
    try {
      const { userCode: code } = await window.api.invoke("github:auth-start");
      setUserCode(code);
      setGhAuthState("polling");
      const u = await window.api.invoke("github:auth-poll");
      setUser(u);
      setGhAuthState("done");
      setUserCode(null);
    } catch (e) {
      setGhError(e instanceof Error ? e.message : "Authorization failed");
      setGhAuthState("error");
      setUserCode(null);
    }
  }

  async function ghDisconnect() {
    await window.api.invoke("github:auth-disconnect");
    setUser(null);
    setGhAuthState("idle");
  }

  async function anthropicLogin() {
    const { terminalId } = await window.api.invoke("anthropic:auth-login");
    setLoginTerminalId(terminalId);
    pollRef.current = setInterval(async () => {
      const status = await window.api.invoke("anthropic:auth-status");
      if (status.loggedIn) {
        setAnthropicStatus(status);
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    }, 2000);
  }

  function closLoginTerminal() {
    setLoginTerminalId(null);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    refreshAnthropicStatus();
  }

  async function anthropicLogout() {
    await window.api.invoke("anthropic:auth-logout");
    await refreshAnthropicStatus();
  }

  async function saveKey() {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    await window.api.invoke("anthropic:key-set", { key: trimmed });
    setKeyInput("");
    setShowKeyInput(false);
    await refreshAnthropicStatus();
  }

  async function clearKey() {
    await window.api.invoke("anthropic:key-clear");
    await refreshAnthropicStatus();
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 20px",
        height: 44,
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{ background: "none", border: "none", color: "var(--text-2)", padding: "4px 0", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>
        <span style={{ color: "var(--text-3)", fontSize: 12 }}>/</span>
        <span style={{ color: "var(--text)", fontSize: 13 }}>Settings</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
        <div style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 40 }}>

          <div>
            <div style={sectionLabel}>Provider</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {PROVIDERS.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    background: defaultProvider === p.id ? "var(--accent-dim)" : "var(--surface)",
                    border: `1px solid ${defaultProvider === p.id ? "var(--accent)" : "var(--border)"}`,
                    cursor: "pointer",
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: defaultProvider === p.id ? "var(--accent)" : "var(--text-3)",
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: defaultProvider === p.id ? "var(--accent)" : "var(--text)" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{p.description}</div>
                  </div>
                  {defaultProvider === p.id && (
                    <span style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.05em", textTransform: "uppercase" }}>default</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={sectionLabel}>Anthropic</div>

            {loginTerminalId ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 12, color: "var(--text-2)" }}>
                  Complete sign-in in the terminal below, then close it when done.
                </div>
                <div style={{ height: 220, border: "1px solid var(--border)", overflow: "hidden" }}>
                  <TerminalView worktreeId={loginTerminalId} terminalId={loginTerminalId} />
                </div>
                <button
                  style={{ ...btnGhost, width: "fit-content" }}
                  onClick={closLoginTerminal}
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                  }}>
                    <span style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: anthropicStatus?.loggedIn ? "var(--green)" : "var(--text-3)",
                      flexShrink: 0,
                    }} />
                    <div style={{ flex: 1 }}>
                      {anthropicStatus?.loggedIn ? (
                        <>
                          <div style={{ fontSize: 12, color: "var(--text)" }}>
                            Signed in via {anthropicStatus.authMethod ?? "claude.ai"}
                          </div>
                          {anthropicStatus.email && (
                            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                              {anthropicStatus.email}
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ fontSize: 12, color: "var(--text-3)" }}>Not signed in</div>
                      )}
                    </div>
                    {anthropicStatus?.loggedIn ? (
                      <button style={btnDanger} onClick={anthropicLogout}>Sign out</button>
                    ) : (
                      <button style={btn} onClick={anthropicLogin}>Sign in</button>
                    )}
                  </div>

                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                    <div style={{ ...sectionLabel, marginBottom: 8 }}>API Key override</div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 10, lineHeight: 1.6 }}>
                      Set a key to pass <code style={{ fontFamily: "Menlo, Monaco, monospace", color: "var(--text-2)" }}>ANTHROPIC_API_KEY</code> to all Claude processes, overriding the signed-in account.
                    </div>

                    {maskedKey ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{
                          fontFamily: "Menlo, Monaco, 'Courier New', monospace",
                          fontSize: 12,
                          color: "var(--text-2)",
                          flex: 1,
                        }}>
                          {maskedKey}
                        </span>
                        <button style={btnGhost} onClick={() => setShowKeyInput(true)}>Replace</button>
                        <button style={btnDanger} onClick={clearKey}>Clear</button>
                      </div>
                    ) : showKeyInput ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          autoFocus
                          type="password"
                          value={keyInput}
                          onChange={(e) => setKeyInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveKey(); if (e.key === "Escape") setShowKeyInput(false); }}
                          placeholder="sk-ant-…"
                          style={{
                            flex: 1,
                            background: "var(--surface-2)",
                            border: "1px solid var(--border-2)",
                            color: "var(--text)",
                            padding: "7px 10px",
                            fontSize: 12,
                            fontFamily: "Menlo, Monaco, 'Courier New', monospace",
                            outline: "none",
                          }}
                        />
                        <button style={btn} onClick={saveKey}>Save</button>
                        <button style={btnGhost} onClick={() => setShowKeyInput(false)}>Cancel</button>
                      </div>
                    ) : (
                      <button style={btnGhost} onClick={() => setShowKeyInput(true)}>
                        + Add API key
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div>
            <div style={sectionLabel}>Default Provider</div>
            <div style={{ display: "flex", gap: 8 }}>
              {PROVIDERS.map((p) => {
                const active = defaultProvider === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={async () => {
                      setDefaultProvider(p.id);
                      await window.api.invoke("settings:set", { defaultProviderId: p.id });
                    }}
                    style={{
                      background: active ? "var(--accent-dim)" : "var(--surface)",
                      border: `1px solid ${active ? "var(--accent)" : "var(--border-2)"}`,
                      color: active ? "var(--accent)" : "var(--text-2)",
                      padding: "8px 16px",
                      fontSize: 12,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: 3,
                      cursor: "pointer",
                      flex: 1,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                    <span style={{ fontSize: 10, color: active ? "var(--accent)" : "var(--text-3)" }}>{p.description}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>
              New chats will use this provider by default.
            </div>
          </div>

          <div>
            <div style={sectionLabel}>GitHub</div>

            {user ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img
                  src={user.avatarUrl}
                  alt={user.login}
                  style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid var(--border-2)" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "var(--text)" }}>{user.name ?? user.login}</div>
                  <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>@{user.login}</div>
                </div>
                <button style={btnGhost} onClick={ghDisconnect}>Disconnect</button>
              </div>
            ) : ghAuthState === "polling" && userCode ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.6 }}>
                  Enter this code at github.com/login/device
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    fontSize: 28,
                    fontWeight: 700,
                    letterSpacing: "0.2em",
                    color: "var(--accent)",
                    padding: "16px 20px",
                    background: "var(--accent-dim)",
                    border: "1px solid var(--accent)",
                  }}>
                    {userCode}
                  </div>
                  <button
                    onClick={() => copyCode(userCode)}
                    style={{
                      background: copied ? "var(--accent-dim)" : "none",
                      border: "1px solid var(--border-2)",
                      color: copied ? "var(--accent)" : "var(--text-2)",
                      padding: "6px 10px",
                      fontSize: 11,
                    }}
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="status-dot running" />
                  Waiting for authorization…
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button
                  style={{ ...btn, width: "fit-content", opacity: ghAuthState === "waiting" ? 0.5 : 1 }}
                  onClick={ghConnect}
                  disabled={ghAuthState === "waiting"}
                >
                  {ghAuthState === "waiting" ? "Opening GitHub…" : "Connect with GitHub"}
                </button>
                {ghError && (
                  <span style={{ fontSize: 12, color: "var(--red)" }}>{ghError}</span>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
