// src/feeds/inventory_feed.ts
//
// Derives compact capability tags from inventory items, including WEARABLE SLOTS.
// - Emits specific ranged tags: pc:bow, pc:crossbow, pc:throwing-axe:N
// - Emits generic weapon caps: pc:weapon:ranged, pc:weapon:thrown, pc:weapon:melee
// - Emits wearables: pc:wear:<slot> and pc:wear:<slot>:<slug> for EQUIPPED items
// - Emits pack wearables: pc:pack:<slot>:<slug> for NOT EQUIPPED items carried
// - Keeps umbrella tags for backward-compat: pc:ranged, pc:throwable:N, pc:shield, pc:rope, pc:healing, pc:light:<state>
// - Aggregates armor tier across equipped wearables: pc:armor:light|medium|heavy

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

// ---- Demo/default inventory (replace with your real source as needed) ----
let _items: InvItem[] = [
  { id: "longsword", name: "Iron Longsword", kind: "melee", qty: 1 },
  { id: "buckler", name: "Buckler", kind: "shield", qty: 1 },
  { id: "t-axe", name: "Throwing Axe", kind: "throwing-axe", qty: 1 },
  { id: "torch1", name: "Torch", kind: "torch", qty: 1, state: "unlit" },
  { id: "rope1", name: "Rope (10 m)", kind: "rope", qty: 1 },
  { id: "bandage", name: "Basic Bandages", kind: "healing", qty: 1 },
  // Wearables examples (commented out):
  // { id: "steel-helm", name: "Steel Helmet", kind: "wearable", slot: "head", equipped: true, armorTier: "medium" },
  // { id: "leather-hauberk", name: "Leather Hauberk", kind: "wearable", slot: "chest", equipped: true, armorTier: "light" },
];

export function setInventory(items: InvItem[]) { _items = Array.isArray(items) ? items.slice() : []; }
export function getInventory(): InvItem[] { return _items.slice(); }

// ---- Tag derivation ----
export function inventoryFeed(): { tags: string[]; list: { items: InvItem[] } } {
  const items = getInventory();
  const tags: string[] = [];

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
  const rank = (t?: "light"|"medium"|"heavy") => (t === "heavy" ? 3 : t === "medium" ? 2 : t === "light" ? 1 : 0);

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