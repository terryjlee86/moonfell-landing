/**
 * FILE: src/feeds/inventory_feed.ts
 * WHAT: Single source of truth for player inventory → compact feed tags.
 * HOW: Holds an in-memory inventory list set via setInventory(); derives capability tags
 *      (melee/ranged/thrown/shield/rope/healing/light), wearables (pc:wear / pc:pack),
 *      and aggregated armor tier. This file does NOT invent items — if no inventory has
 *      been set, it emits only `pc:light:none` and returns an empty list.
 */

export type WearableSlot =
  | "head" | "chest" | "hands" | "legs" | "feet"
  | "back" | "waist" | "ring1" | "ring2" | "amulet";

export type ArmorTier = "light" | "medium" | "heavy";

export type InvItem = {
  id: string;
  name: string;
  kind:
    | "melee" | "bow" | "crossbow" | "throwing-axe"
    | "shield" | "torch" | "rope" | "healing" | "wearable" | "misc";
  qty?: number;
  state?: "lit" | "unlit"; // for torch/lantern
  // Wearables only:
  slot?: WearableSlot;
  equipped?: boolean;      // defaults to false
  armorTier?: ArmorTier;   // optional hint for armor aggregation
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ---- Inventory store (no demo defaults) ----
// NOTE: Inventory must be populated by scenario/init via setInventory(...)
let _items: InvItem[] = [];

export function setInventory(items: InvItem[]) {
  _items = Array.isArray(items) ? items.slice() : [];
}

export function getInventory(): InvItem[] {
  return _items.slice();
}

// ---- Tag derivation ----
export function inventoryFeed(): { tags: string[]; list: { items: InvItem[] } } {
  const items = getInventory();
  const tags: string[] = [];

  // If inventory hasn’t been set, emit only a neutral light state and return.
  if (items.length === 0) {
    tags.push("pc:light:none");
    return { tags, list: { items } };
  }

  // Counts by kind
  const countByKind = items.reduce<Record<string, number>>((acc, it) => {
    const qty = it.qty ?? 1;
    acc[it.kind] = (acc[it.kind] || 0) + qty;
    return acc;
  }, {});

  const hasMelee     = (countByKind["melee"] || 0) > 0;
  const hasShield    = (countByKind["shield"] || 0) > 0;
  const hasBow       = (countByKind["bow"] || 0) > 0;
  const hasCrossbow  = (countByKind["crossbow"] || 0) > 0;
  const throwingAxes = countByKind["throwing-axe"] || 0;
  const hasRope      = (countByKind["rope"] || 0) > 0;
  const hasHealing   = (countByKind["healing"] || 0) > 0;

  // Light state (prefer first torch/lantern-like)
  const firstTorch = items.find((i) => i.kind === "torch");
  const lightState: "lit" | "unlit" | "none" = firstTorch ? (firstTorch.state ?? "unlit") : "none";

  // Specific ranged tags
  if (hasBow) tags.push("pc:bow");
  if (hasCrossbow) tags.push("pc:crossbow");
  if (throwingAxes > 0) tags.push(`pc:throwing-axe:${throwingAxes}`);

  // Generic weapon caps (new)
  if (hasBow || hasCrossbow) tags.push("pc:weapon:ranged");
  if (throwingAxes > 0)      tags.push("pc:weapon:thrown");
  if (hasMelee)              tags.push("pc:weapon:melee");

  // Umbrella ranged/back-compat
  const anyRanged = hasBow || hasCrossbow || throwingAxes > 0;
  if (anyRanged) tags.push("pc:ranged");
  tags.push(`pc:throwable:${throwingAxes}`);

  // Other capability tags
  if (hasShield) tags.push("pc:shield");
  if (hasRope)   tags.push("pc:rope");
  if (hasHealing)tags.push("pc:healing");
  tags.push(`pc:light:${lightState}`);

  // ---- Wearables processing ----
  let armorRank = 0; // 0 none, 1 light, 2 medium, 3 heavy
  const rank = (t?: "light"|"medium"|"heavy") =>
    (t === "heavy" ? 3 : t === "medium" ? 2 : t === "light" ? 1 : 0);

  items.forEach((it) => {
    if (it.kind !== "wearable" || !it.slot) return;
    const slot = it.slot;
    const slug = slugify(it.name || it.id);
    const isEquipped = Boolean(it.equipped);

    if (isEquipped) {
      tags.push(`pc:wear:${slot}`);
      tags.push(`pc:wear:${slot}:${slug}`);
      armorRank = Math.max(armorRank, rank(it.armorTier));
    } else {
      tags.push(`pc:pack:${slot}:${slug}`);
    }
  });

  if (armorRank >= 3)      tags.push("pc:armor:heavy");
  else if (armorRank === 2)tags.push("pc:armor:medium");
  else if (armorRank === 1)tags.push("pc:armor:light");

  return { tags, list: { items } };
}