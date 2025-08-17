// src/feeds/inventory_feed.ts
//
// Derives compact capability tags from inventory items.
// We keep umbrella tags (pc:ranged, pc:throwable:N) AND specific tags (pc:bow, pc:crossbow, pc:throwing-axe:N).
// This lets the Rolls DM fail “shoot with my bow” when only throwables are present.

export type InvItem = {
  id: string;
  name: string;
  kind:
    | "melee"
    | "bow"
    | "crossbow"
    | "throwing-axe"
    | "shield"
    | "torch"
    | "rope"
    | "healing"
    | "misc";
  qty?: number;
  state?: "lit" | "unlit"; // for torch/lantern
};

// --- Demo/default inventory (edit to match your real state) ---
let _items: InvItem[] = [
  { id: "longsword", name: "Iron Longsword", kind: "melee", qty: 1 },
  { id: "buckler", name: "Buckler", kind: "shield", qty: 1 },
  { id: "t-axe", name: "Throwing Axe", kind: "throwing-axe", qty: 1 },
  { id: "torch1", name: "Torch", kind: "torch", qty: 1, state: "unlit" },
  { id: "rope1", name: "Rope (10 m)", kind: "rope", qty: 1 },
  { id: "bandage", name: "Basic Bandages", kind: "healing", qty: 1 },
];

// If you have a real inventory state elsewhere, swap these helpers out:
export function setInventory(items: InvItem[]) {
  _items = Array.isArray(items) ? items.slice() : [];
}
export function getInventory(): InvItem[] {
  return _items.slice();
}

// --- Tag derivation ---
export function inventoryFeed(): { tags: string[]; list: { items: InvItem[] } } {
  const items = getInventory();
  const tags: string[] = [];

  // Specific capabilities + counts
  const countByKind = items.reduce<Record<string, number>>((acc, it) => {
    acc[it.kind] = (acc[it.kind] || 0) + (it.qty ?? 1);
    return acc;
  }, {});

  const hasShield = countByKind["shield"] > 0;
  const hasBow = countByKind["bow"] > 0;
  const hasCrossbow = countByKind["crossbow"] > 0;
  const throwingAxes = countByKind["throwing-axe"] || 0;
  const hasRope = countByKind["rope"] > 0;
  const hasHealing = countByKind["healing"] > 0;

  // Light state (prefer first torch/lantern)
  const firstTorch = items.find((i) => i.kind === "torch");
  const lightState: "lit" | "unlit" | "none" =
    firstTorch ? firstTorch.state ?? "unlit" : "none";

  // Specific tags
  if (hasBow) tags.push("pc:bow");
  if (hasCrossbow) tags.push("pc:crossbow");
  if (throwingAxes > 0) tags.push(`pc:throwing-axe:${throwingAxes}`);

  // Umbrella tags (for backward-compat and generic logic)
  const anyRanged = hasBow || hasCrossbow || throwingAxes > 0;
  if (anyRanged) tags.push("pc:ranged");
  const totalThrowable = throwingAxes; // expand if you add more throwable kinds
  tags.push(`pc:throwable:${totalThrowable}`);

  // Other capabilities
  if (hasShield) tags.push("pc:shield");
  if (hasRope) tags.push("pc:rope");
  if (hasHealing) tags.push("pc:healing");
  tags.push(`pc:light:${lightState}`);

  return {
    tags,
    list: { items },
  };
}