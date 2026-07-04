import { useState, useEffect } from "react";
import type { GitHubUser } from "../shared/types";

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

type AuthState = "idle" | "waiting" | "polling" | "done" | "error";

export function Settings({ onBack }: Props) {
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [authState, setAuthState] = useState<AuthState>("idle");
  const [userCode, setUserCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  useEffect(() => {
    window.api.invoke("github:auth-status").then(setUser);
  }, []);

  async function connect() {
    setAuthState("waiting");
    setError(null);
    try {
      const { userCode: code } = await window.api.invoke("github:auth-start");
      setUserCode(code);
      setAuthState("polling");
      const u = await window.api.invoke("github:auth-poll");
      setUser(u);
      setAuthState("done");
      setUserCode(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authorization failed");
      setAuthState("error");
      setUserCode(null);
    }
  }

  async function disconnect() {
    await window.api.invoke("github:auth-disconnect");
    setUser(null);
    setAuthState("idle");
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
                <button style={btnGhost} onClick={disconnect}>Disconnect</button>
              </div>
            ) : authState === "polling" && userCode ? (
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
                  style={{ ...btn, width: "fit-content", opacity: authState === "waiting" ? 0.5 : 1 }}
                  onClick={connect}
                  disabled={authState === "waiting"}
                >
                  {authState === "waiting" ? "Opening GitHub…" : "Connect with GitHub"}
                </button>
                {error && (
                  <span style={{ fontSize: 12, color: "var(--red)" }}>{error}</span>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
