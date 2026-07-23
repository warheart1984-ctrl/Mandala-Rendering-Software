/**
 * Minimal UI primitives.
 * Declared dependency gap: `@openai/apps-sdk-ui` was not added — package may be
 * private / unavailable on public npm for this install. Styled similarly to Badge/Button.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "warn";
}) {
  const colors =
    tone === "accent"
      ? "bg-[#1a3a4a] text-[var(--mrs-accent)]"
      : tone === "warn"
        ? "bg-[#3a2a1a] text-[#ffb86c]"
        : "bg-[#1c242c] text-[var(--mrs-muted)]";
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs tracking-wide ${colors}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type="button"
      className={`rounded border border-[var(--mrs-border)] bg-[var(--mrs-panel)] px-3 py-1.5 text-sm text-[var(--mrs-fg)] hover:border-[var(--mrs-accent)] disabled:opacity-40 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
