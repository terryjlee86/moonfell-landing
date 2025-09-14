// src/state/selectors/roster_selector.ts
// Read-only selector that adapts the context roster feed into a stable snapshot
// for UI consumption. No side effects; no sorting here (UI can decide).

import { contextRoster } from "../../feeds/context_roster_feed";
import type { RosterSnapshot, RosterEntry } from "../../types/roster";

export function getRosterSnapshot(): RosterSnapshot {
  const { list } = contextRoster(); // expects { list: RosterEntry[] }
  // Shallow-copy to avoid accidental mutation by consumers
  const entries: RosterEntry[] = list.map((e) => ({ ...e }));
  return {
    source: "context_roster",
    entries,
    updatedAt: Date.now(),
  };
}