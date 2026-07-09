import type { CSSProperties } from "react";

export const sectionLabel: CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--text-3)",
  marginBottom: 12,
};

export const btn: CSSProperties = {
  background: "var(--accent-dim)",
  border: "1px solid var(--accent)",
  color: "var(--accent)",
  padding: "7px 14px",
  fontSize: 12,
};

export const btnGhost: CSSProperties = {
  background: "none",
  border: "1px solid var(--border-2)",
  color: "var(--text-2)",
  padding: "7px 14px",
  fontSize: 12,
};

export const btnDanger: CSSProperties = {
  background: "none",
  border: "1px solid var(--border-2)",
  color: "var(--red)",
  padding: "7px 14px",
  fontSize: 12,
};
