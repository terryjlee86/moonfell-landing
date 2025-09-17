// src/types/roster.ts
// Shared, UI-friendly types for the scene roster.
// Keep this file dependency-free (no imports from engine/state).

/** Standardised NPC attitude for UI & sorting. */
export type Attitude = "enemy" | "neutral" | "friendly" | "ally";

/** Simple cover vocabulary (numbers live elsewhere in resolver). */
export type Cover = "none" | "half" | "three-quarters" | "full";

/** Minimal entry the roster UI needs to render a row. */
export type RosterEntry = {
  id: string;                // stable within scene
  name: string;              // display name (fallback to kind if unknown)
  kind: string;              // creature archetype/category
  attitude: Attitude;
  distanceM: number;         // rounded metres from player POV
  cover: Cover | null;       // null if not applicable/unknown
  status: string[];          // e.g., ["blinded","prone"]


  // Optional hints for future panels (do not rely on these in MVP):
  blocking?: boolean;        // whether currently obstructing movement/line
  tags?: string[];           // raw extra tags if you choose to surface them
};

/** Snapshot contract the UI reads from a selector. */
export type RosterSnapshot = {
  source: "context_roster";
  entries: RosterEntry[];
  updatedAt: number; // epoch ms
};