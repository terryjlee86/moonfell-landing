// src/ui/roster/RosterSidebar.tsx
// A small, dependency-free roster sidebar. Purely presentational.
// - Controlled via props (open/close, selection, filter).
// - No engine imports. No global state. Easy to mount/unmount.
//
// You can wire hotkeys later; for now there’s a simple button in the header.

import * as React from "react";
import type { RosterEntry, Attitude } from "../../types/roster";

export type RosterSidebarProps = {
  /** Full list as provided by the selector. */
  entries: RosterEntry[];

  /** Is the sidebar visible. */
  open: boolean;

  /** Called when user toggles the sidebar. */
  onToggle: () => void;

  /** Optional: show only enemies. */
  hostilesOnly?: boolean;

  /** Called when the "Hostiles only" filter changes. */
  onToggleHostiles?: (next: boolean) => void;

  /** Currently selected target id (single select). */
  selectedTargetId?: string | null;

  /** Called when user selects (or deselects) a row. */
  onSelectTarget?: (id: string | null) => void;

  /** If true, show a "Targeted" pill on the selected row (UI-only affordance). */
  isActionTargeting?: boolean;
};

const attitudeOrder: Record<Attitude, number> = {
  enemy: 0,
  ally: 1,
  neutral: 2,
  friendly: 3,
};

export default function RosterSidebar(props: RosterSidebarProps) {
  const {
    entries,
    open,
    onToggle,
    hostilesOnly = false,
    onToggleHostiles,
    selectedTargetId,
    onSelectTarget,
    isActionTargeting = false,
  } = props;

  const playerEntry = entries.find((e) => e.id === 'player-id');
  const entriesWithPlayer: RosterEntry[] = playerEntry ? entries : [{ id: 'player-id', name: 'Player', kind: 'Player', attitude: 'friendly', distanceM: 0, cover: null, status: [] }, ...entries];

  const filtered = React.useMemo(() => {
    const list = hostilesOnly ? entriesWithPlayer.filter((e) => e.attitude === "enemy") : entriesWithPlayer.slice();
    // Default order: distance asc → attitude priority → name
    list.sort((a, b) => {
      if (a.distanceM !== b.distanceM) return a.distanceM - b.distanceM;
      const ao = isAttitude(a.attitude) ? attitudeOrder[a.attitude] : 99;
      const bo = isAttitude(b.attitude) ? attitudeOrder[b.attitude] : 99;
      if (ao !== bo) return ao - bo;
      return ((a.name || (a as RosterEntry).kind) ?? '').localeCompare((b.name || (b as RosterEntry).kind) ?? '');
    });
    return list;
  }, [entries, hostilesOnly]);

  return (
    <aside style={styles.wrapper(open)} aria-hidden={!open}>
      <header style={styles.header}>
        <strong>Roster</strong>
        <div style={styles.headerBtns}>
          <label style={styles.filterLabel} title="Filter to enemies only">
            <input
              type="checkbox"
              checked={hostilesOnly}
              onChange={(e) => onToggleHostiles?.(e.target.checked)}
            />
            Hostiles only
          </label>
          <button
            style={styles.btn}
            onClick={onToggle}
            aria-expanded={open}
            aria-label="Toggle roster panel"
          >
            {open ? "Hide" : "Show"}
          </button>
        </div>
      </header>

      <div style={styles.list(open)}>
        {filtered.length === 0 ? (
          <div style={styles.empty}>No creatures nearby.</div>
        ) : (
          filtered.map((e) => {
            const selected = e.id === (selectedTargetId ?? null);
            return (
              <div
                key={e.id}
                role="button"
                onClick={() => onSelectTarget?.(selected ? null : e.id)}
                style={styles.row(selected)}
                title={`#${e.id}`}
              >
                <div style={styles.rowMain}>
                  <div style={styles.nameLine}>
                    <span style={styles.name}>{e.name || e.kind}</span>
                    <span style={styles.distance}>{e.distanceM}m</span>
                  </div>
                  <div style={styles.badgesLine}>
                    <Badge tone={toneForAttitude(e.attitude as Attitude)}>{e.attitude}</Badge>
                    {e.cover && e.cover !== "none" && (
                      <Badge tone="muted">{coverLabel(e.cover)}</Badge>
                    )}
                    {e.status?.slice(0, 3).map((s) => (
                      <Badge key={s} tone="neutral">{s}</Badge>
                    ))}
                    {e.status && e.status.length > 3 && (
                      <Badge tone="neutral">+{e.status.length - 3}</Badge>
                    )}
                    {selected && isActionTargeting && (
                      <Badge tone="accent">Targeted</Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

function Badge({
  children,
  tone = "neutral",
}: React.PropsWithChildren<{ tone?: "danger" | "accent" | "muted" | "neutral" }>) {
  return <span style={styles.badge(tone)}>{children}</span>;
}

function coverLabel(c: NonNullable<RosterEntry["cover"]>) {
  switch (c) {
    case "half":
      return "½ cover";
    case "three-quarters":
      return "¾ cover";
    case "full":
      return "full cover";
    default:
      return c;
  }
}

function toneForAttitude(a: Attitude): "danger" | "accent" | "muted" | "neutral" {
  switch (a) {
    case "enemy":
      return "danger";
    case "ally":
      return "accent";
    case "neutral":
      return "muted";
    case "friendly":
      return "neutral";
    default:
      return "neutral";
  }
}

function isAttitude(value: string): value is Attitude {
  return value in attitudeOrder;
}

// ---------------- styles (inline to keep this file self-contained) ----------------

const styles = {
  wrapper: (open: boolean): React.CSSProperties => ({
    position: "fixed",
    top: 0,
    right: 0,
    height: "100%",
    width: open ? 320 : 0,
    background: "rgba(20,22,26,0.96)",
    color: "#e7e9ee",
    borderLeft: "1px solid rgba(255,255,255,0.08)",
    boxShadow: open ? "0 0 0 1px rgba(0,0,0,0.2), -6px 0 24px rgba(0,0,0,0.35)" : "none",
    overflow: "hidden",
    transition: "width 160ms ease",
    zIndex: 50,
  }),
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.02)",
  } as React.CSSProperties,
  headerBtns: { display: "flex", gap: 8, alignItems: "center" } as React.CSSProperties,
  filterLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    opacity: 0.9,
    userSelect: "none",
  } as React.CSSProperties,
  btn: {
    fontSize: 12,
    padding: "6px 10px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#fff",
    borderRadius: 6,
    cursor: "pointer",
  } as React.CSSProperties,
  list: (open: boolean): React.CSSProperties => ({
    opacity: open ? 1 : 0,
    transition: "opacity 160ms ease 40ms",
    height: "calc(100% - 44px)",
    overflowY: "auto",
    padding: open ? 8 : 0,
  }),
  empty: { padding: 12, opacity: 0.75, fontSize: 13 } as React.CSSProperties,
  row: (selected: boolean): React.CSSProperties => ({
    display: "flex",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 8,
    cursor: "pointer",
    border: selected ? "1px solid rgba(0,185,255,0.6)" : "1px solid rgba(255,255,255,0.06)",
    background: selected ? "rgba(0,185,255,0.08)" : "transparent",
    marginBottom: 6,
  }),
  rowMain: { flex: 1, minWidth: 0 } as React.CSSProperties,
  nameLine: { display: "flex", justifyContent: "space-between", alignItems: "baseline" } as React.CSSProperties,
  name: { fontWeight: 600, letterSpacing: 0.2 } as React.CSSProperties,
  distance: { fontSize: 12, opacity: 0.8 } as React.CSSProperties,
  badgesLine: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 } as React.CSSProperties,
  badge: (tone: "danger" | "accent" | "muted" | "neutral"): React.CSSProperties => {
    const colors = {
      danger: { bg: "rgba(255, 99, 99, 0.16)", br: "rgba(255, 99, 99, 0.45)", fg: "#ff8b8b" },
      accent: { bg: "rgba(0,185,255,0.16)", br: "rgba(0,185,255,0.45)", fg: "#8ddfff" },
      muted: { bg: "rgba(255,255,255,0.08)", br: "rgba(255,255,255,0.16)", fg: "#d0d3d9" },
      neutral: { bg: "rgba(255,255,255,0.06)", br: "rgba(255,255,255,0.12)", fg: "#e7e9ee" },
    }[tone];
    return {
      display: "inline-block",
      padding: "2px 6px",
      borderRadius: 999,
      fontSize: 11,
      border: `1px solid ${colors.br}`,
      color: colors.fg,
      background: colors.bg,
      lineHeight: 1.6,
    } as React.CSSProperties;
  },
};