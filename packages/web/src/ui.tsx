import React from "react";

export function cx(...parts: (string | false | undefined | null)[]) {
  return parts.filter(Boolean).join(" ");
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function fmtAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function Button({
  children,
  onClick,
  variant = "default",
  size = "md",
  className,
  disabled,
  type,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md font-normal transition-colors duration-150 select-none border disabled:opacity-40 disabled:pointer-events-none";
  const sizes = { sm: "px-2.5 py-1 text-xs", md: "px-3 py-1.5 text-[13px]" };
  const variants = {
    default: "bg-surface text-text border-borderhi hover:bg-elevated",
    primary: "bg-accent text-accentdark border-transparent font-medium hover:bg-accent2",
    ghost: "text-muted border-transparent hover:text-text hover:bg-elevated",
    danger: "bg-surface text-bad border-bad/40 hover:bg-bad/5",
  };
  return (
    <button
      type={type || "button"}
      onClick={onClick}
      disabled={disabled}
      className={cx(base, sizes[size], variants[variant], className)}
    >
      {children}
    </button>
  );
}

export function Badge({ tone, children }: { tone: "warm" | "cold" | "good" | "muted" | "accent"; children: React.ReactNode }) {
  const tones = {
    warm: "bg-brandwash text-greenink border-[#cfeede]",
    cold: "bg-elevated text-muted border-border",
    good: "bg-brandwash text-greenink border-[#cfeede]",
    muted: "bg-elevated text-muted border-border",
    accent: "bg-brandwash text-greenink border-[#cfeede]",
  };
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: "warm" | "cold" }) {
  return (
    <span
      className={cx(
        "inline-block h-1.5 w-1.5 rounded-full",
        tone === "warm" ? "bg-greenink" : "bg-subtle"
      )}
    />
  );
}

/** poopabase logomark — two streaming waves (Litestream), not a db cylinder. */
export function Logo({ size = 20, stroke = "#05341f" }: { size?: number; stroke?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9c2.3-3.1 4.6-3.1 6.9 0s4.6 3.1 6.9 0 4.6-3.1 6.2-1" />
      <path d="M3 15c2.3-3.1 4.6-3.1 6.9 0s4.6 3.1 6.9 0 4.6-3.1 6.2-1" />
    </svg>
  );
}

export function LogoTile({ className }: { className?: string }) {
  return (
    <div className={cx("flex items-center justify-center rounded-lg bg-accent", className)}>
      <Logo size={17} />
    </div>
  );
}

/** Deterministic monogram tile for a project. */
export function Monogram({ name, warm, className }: { name: string; warm?: boolean; className?: string }) {
  const ch = (name.trim()[0] || "?").toUpperCase();
  return (
    <div
      className={cx(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold",
        warm ? "bg-brandwash text-greenink border-[#cfeede]" : "bg-elevated text-muted border-border",
        className
      )}
    >
      {ch}
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("rounded-md border border-border bg-surface shadow-card", className)}>{children}</div>;
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="text-[11px] uppercase tracking-wider text-subtle">{label}</span>
      <span className="text-xl font-semibold text-text tabular-nums">{value}</span>
      {sub && <span className="text-[11px] text-muted">{sub}</span>}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-muted">
      {children}
    </kbd>
  );
}

export function Icon({ name, className }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    db: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
        <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </>
    ),
    sql: (
      <>
        <polyline points="8 8 4 12 8 16" />
        <polyline points="16 8 20 12 16 16" />
      </>
    ),
    table: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M3 15h18M9 4v16" />
      </>
    ),
    stream: (
      <>
        <path d="M4 7h10M4 12h16M4 17h7" />
        <circle cx="18" cy="7" r="1.4" />
        <circle cx="14" cy="17" r="1.4" />
      </>
    ),
    fn: (
      <>
        <path d="M9 4h3c3 0 3 3 3 6s0 6 3 6M6 12h9" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l3 2" />
      </>
    ),
    activity: <path d="M3 12h4l3 8 4-16 3 8h4" />,
    home: (
      <>
        <path d="M3 11l9-7 9 7" />
        <path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    gear: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </>
    ),
    book: (
      <>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </>
    ),
    chevron: <polyline points="6 9 12 15 18 9" />,
    plus: <path d="M12 5v14M5 12h14" />,
    play: <polygon points="6 4 20 12 6 20" />,
    moon: <path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4-4" />
      </>
    ),
    check: <polyline points="4 12 9 17 20 6" />,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    copy: (
      <>
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V5a2 2 0 0 1 2-2h10" />
      </>
    ),
    bolt: <polygon points="13 2 4 14 11 14 11 22 20 10 13 10 13 2" />,
    filter: <polygon points="3 4 21 4 14 12.5 14 19 10 21 10 12.5" />,
    sort: (
      <>
        <path d="M7 4v16M7 20l-3-3M7 4l3 3" />
        <path d="M14 7h7M14 12h5M14 17h3" />
      </>
    ),
    key: (
      <>
        <circle cx="8" cy="8" r="4" />
        <path d="M11 11l7 7M15 15l2-2M18 18l2-2" />
      </>
    ),
    refresh: (
      <>
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        <path d="M3 21v-5h5" />
      </>
    ),
    plug: (
      <>
        <path d="M9 2v6M15 2v6" />
        <path d="M6 8h12v3a6 6 0 0 1-12 0z" />
        <path d="M12 20v2" />
      </>
    ),
    external: (
      <>
        <path d="M14 4h6v6M20 4l-9 9" />
        <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
      </>
    ),
    snapshot: (
      <>
        <rect x="3" y="6" width="18" height="14" rx="2" />
        <circle cx="12" cy="13" r="3.5" />
        <path d="M8 6l1.5-2h5L16 6" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {paths[name]}
    </svg>
  );
}
