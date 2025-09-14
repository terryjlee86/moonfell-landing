// src/feeds/context_roster.ts
//
// Read-only adapter that shapes engine context → UI-friendly roster entries.
// No state mutation. Safe to import anywhere in UI/playtest.

import { getContext } from "../state/context";

/** Four attitudes we standardise on for the UI. */
export type Attitude = "enemy" | "neutral" | "friendly" | "ally";

/** Simple cover vocabulary (kept generic; numbers come later in resolver). */
export type Cover = "none" | "half" | "three-quarters" | "full";

/** Minimal roster shape the UI needs. */
export type RosterEntry = {
  id: string;
  name: string;
  kind: string;
  attitude: Attitude;
  distanceM: number;
  cover: Cover | null;
  status: string[]; // e.g., ["blinded","prone"]
};

/** Map any legacy/loose attitude values to our 4-state enum. */
function asAttitude(a: any): Attitude {
  switch (String(a || "").toLowerCase()) {
    case "enemy":
    case "hostile":
      return "enemy";
    case "ally":
      return "ally";
    case "friendly":
      return "friendly";
    case "neutral":
    case "wary":
    default:
      return "neutral";
  }
}

/** Normalise cover values into our small set. */
function asCover(v: any): Cover | null {
  const s = String(v ?? "").toLowerCase();
  if (!s) return null;
  if (s === "none") return "none";
  if (s === "half" || s === "1/2" || s === "half-cover" || s === "partial") return "half";
  if (s === "three-quarters" || s === "3/4" || s === "three_quarters") return "three-quarters";
  if (s === "full" || s === "total") return "full";
  return null;
}

/** Safely coerce any status array-ish value to string[]. */
function asStatus(list: any): string[] {
  if (!Array.isArray(list)) return [];
  return list.map((x) => String(x)).filter(Boolean);
}

/**
 * Returns a UI-ready roster list from engine context.
 * Does not sort; preserves engine order. Let the UI choose ordering.
 */
export function contextRoster(): { list: RosterEntry[] } {
  const ctx = getContext?.();
  const nearby = Array.isArray(ctx?.nearby) ? ctx!.nearby : [];

  const list: RosterEntry[] = nearby.map((n: any, i: number) => ({
    id: String(n?.id ?? `cre_${i}`),
    name: String(n?.name ?? n?.kind ?? "unknown"),
    kind: String(n?.kind ?? "creature"),
    attitude: asAttitude(n?.attitude),
    distanceM: Math.round(Number(n?.distanceM ?? 0)),
    cover: asCover(n?.cover),
    status: asStatus(n?.status),
  }));

  return { list };
}