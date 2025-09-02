/**
 * FILE: src/feeds/inventory_feed.ts
 * WHAT: Read-only VIEW of the canonical inventory in `state/inventory` → compact feed tags.
 * HOW: Reads raw items from state, normalises them, and emits:
 *      - Identity tags:   pc:item:<slug>   +   pc:name:<slug>=<Display Name>
 *      - Capability tags: pc:weapon:melee|ranged|thrown, pc:bow, pc:crossbow, pc:throwing-axe:N
 *                         pc:shield, pc:rope, pc:healing, pc:light:<state>, pc:ranged, pc:throwable:N
 *      - Wearables:       pc:wear:<slot>, pc:wear:<slot>:<slug>, pc:pack:<slot>:<slug>
 *      - Armor tier:      pc:armor:light|medium|heavy
 *      - (If state has locations) also emits: pc:hand:main:<slug>, pc:hand:off:<slug>, pc:belt:<slug>, pc:pack:<slug>
 *
 * IMPORTANT:
 *  - This file DOES NOT mutate state and DOES NOT keep its own store.
 *  - All add/remove/equip/consume happens in `state/inventory`. Feeds only look and format.
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

// We import state loosely to tolerate current shapes.
let _stateInvMod: any;
try {
  // From src/feeds/... to src/state/...
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  _stateInvMod = require("../state/inventory");
} catch { _stateInvMod = null; }

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ---------- State → InvItem[] normalisation ----------

/**
 * Accepts whatever the current state/inventory module returns and normalises to InvItem[].
 * Supports two shapes:
 *  1) Flat array of items [{id,name,kind,qty,state,slot,equipped,armorTier}]
 *  2) Scenario-style buckets { equipped: StartItem[], pack: StartItem[], ground: StartItem[] }
 *     where StartItem has {id,name,where,qty,tags,lit}
 */
function readStateAsItems(): { items: InvItem[], originals: any[] } {
  if (!_stateInvMod) return { items: [], originals: [] };

  let raw = [];
  try {
    // Prefer getInventory() if it exists
    if (typeof _stateInvMod.getInventory === "function") {
      raw = _stateInvMod.getInventory() ?? [];
    } else if (Array.isArray(_stateInvMod.items)) {
      raw = _stateInvMod.items;
    } else if (typeof _stateInvMod === "object" && _stateInvMod) {
      // Some modules export the buckets directly
      raw = _stateInvMod;
    }
  } catch {
    raw = [];
  }

  // Case A: already InvItem[]
  if (Array.isArray(raw)) {
    const items: InvItem[] = raw.map((r: any) => ({
      id: r.id, name: r.name, kind: r.kind,
      qty: r.qty, state: r.state, slot: r.slot, equipped: r.equipped, armorTier: r.armorTier
    })).filter((x: InvItem) => !!x && !!x.id && !!x.name && !!x.kind);
    return { items, originals: raw };
  }

  // Case B: buckets (equipped/pack/ground) with StartItem-like tags
  const buckets: any = raw;
  const all: any[] = []
    .concat(Array.isArray(buckets.equipped) ? buckets.equipped : [])
    .concat(Array.isArray(buckets.pack) ? buckets.pack : [])
    .concat(Array.isArray(buckets.ground) ? buckets.ground : []);

  const toKind = (tags: string[], id: string): InvItem["kind"] => {
    if (tags?.includes("shield")) return "shield";
    if (tags?.includes("weapon:melee")) {
      // Special-case throwing axe by id/tag
      if (tags.includes("weapon:ranged") || id.includes("throwing-axe")) return "throwing-axe";
      return "melee";
    }
    if (tags?.includes("weapon:ranged")) {
      if (id.includes("crossbow")) return "crossbow";
      if (id.includes("bow")) return "bow";
      if (id.includes("throwing-axe")) return "throwing-axe";
      return "misc";
    }
    if (tags?.includes("light"))   return "torch";
    if (tags?.includes("healing")) return "healing";
    if (tags?.includes("rope"))    return "rope";
    return "misc";
  };

  const items: InvItem[] = all.map((it: any) => ({
    id: it.id,
    name: it.name,
    kind: toKind(it.tags || [], String(it.id || "")),
    qty: it.qty ?? 1,
    state: typeof it.lit === "boolean" ? (it.lit ? "lit" : "unlit") : undefined,
  }));

  return { items, originals: all };
}

// ---------- Feed derivation (pure view) ----------

export function inventoryFeed(): { tags: string[]; list: { items: InvItem[] } } {
  const { items, originals } = readStateAsItems();
  const tags: string[] = [];

  // If inventory is empty, emit a neutral light tag only.
  if (items.length === 0) {
    tags.push("pc:light:none");
    return { tags, list: { items } };
  }

  // Identity + pretty-name tags for every item (enables human prose + exact matching)
  for (const it of items) {
    const slug = slugify(it.name || it.id);
    tags.push(`pc:item:${slug}`);
    tags.push(`pc:name:${slug}=${it.name || it.id}`);
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

  // Generic weapon caps
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

  // Wearables processing (unchanged)
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

  // Optional location tags if originals include scenario-style "where"
  try {
    const locs = Array.isArray(originals) ? originals : [];
    for (const src of locs) {
      const slug = slugify(String(src.name || src.id || ""));
      if (!slug) continue;
      switch (src.where) {
        case "main": tags.push(`pc:hand:main:${slug}`); break;
        case "off":  tags.push(`pc:hand:off:${slug}`);  break;
        case "belt": tags.push(`pc:belt:${slug}`);      break;
        case "pack": tags.push(`pc:pack:${slug}`);      break;
        // "ground" stays env until picked up
      }
    }
  } catch { /* best-effort */ }

  return { tags, list: { items } };
}