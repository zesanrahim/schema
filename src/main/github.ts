import { app, safeStorage, shell } from "electron";
import path from "path";
import fs from "fs";
import { config } from "dotenv";
import type { GitHubUser } from "../shared/types";

config();

const CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? "";

interface StoredAuth {
  encryptedToken: string;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
}

function authPath() {
  return path.join(app.getPath("userData"), "github-auth.json");
}

function storeToken(token: string) {
  const encrypted = safeStorage.encryptString(token);
  fs.writeFileSync(authPath(), JSON.stringify({ encryptedToken: encrypted.toString("base64") }));
}

function loadToken(): string | null {
  try {
    const stored = JSON.parse(fs.readFileSync(authPath(), "utf8")) as StoredAuth;
    return safeStorage.decryptString(Buffer.from(stored.encryptedToken, "base64"));
  } catch {
    return null;
  }
}

export function clearToken() {
  try { fs.unlinkSync(authPath()); } catch {}
}

async function fetchUser(token: string): Promise<GitHubUser> {
  const res = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "schema-app" },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const data = await res.json() as { login: string; name: string | null; avatar_url: string };
  return { login: data.login, name: data.name, avatarUrl: data.avatar_url };
}

let pendingDeviceCode: string | null = null;
let pollInterval: number | null = null;

export async function startDeviceFlow(): Promise<{ userCode: string; verificationUri: string }> {
  if (!CLIENT_ID) throw new Error("GITHUB_CLIENT_ID is not set in .env");
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, scope: "repo user" }),
  });
  const data = await res.json() as DeviceCodeResponse & { error?: string; error_description?: string };
  if (data.error || !data.device_code) {
    throw new Error(data.error_description ?? data.error ?? "Device flow not available. Enable it at github.com/settings/developers.");
  }
  pendingDeviceCode = data.device_code;
  pollInterval = data.interval;
  shell.openExternal(data.verification_uri);
  return { userCode: data.user_code, verificationUri: data.verification_uri };
}

export async function pollForToken(): Promise<GitHubUser> {
  if (!pendingDeviceCode) throw new Error("No device flow in progress");

  const interval = (pollInterval ?? 5) * 1000;
  const deadline = Date.now() + 15 * 60 * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));

    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_code: pendingDeviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    const data = await res.json() as TokenResponse;

    if (data.access_token) {
      pendingDeviceCode = null;
      storeToken(data.access_token);
      return fetchUser(data.access_token);
    }

    if (data.error === "slow_down") {
      pollInterval = (pollInterval ?? 5) + 5;
    } else if (data.error !== "authorization_pending") {
      throw new Error(data.error ?? "Authorization failed");
    }
  }

  throw new Error("Device flow expired");
}

export async function getAuthStatus(): Promise<GitHubUser | null> {
  const token = loadToken();
  if (!token) return null;
  try {
    return await fetchUser(token);
  } catch {
    clearToken();
    return null;
  }
}

export function hasToken(): boolean {
  return loadToken() !== null;
}

export async function githubFetch(pathOrUrl: string, init?: RequestInit): Promise<Response> {
  const token = loadToken();
  if (!token) throw new Error("Not connected to GitHub");
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `https://api.github.com${pathOrUrl}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "schema-app",
      Accept: "application/vnd.github+json",
      ...(init?.headers ?? {}),
    },
  });
}
