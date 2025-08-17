// src/state/inventory.ts
export type Item = {
  id: string;
  name: string;
  where: "main" | "off" | "belt" | "pack" | "ground";
  qty?: number;
  tags?: Array<
    | "weapon:melee"
    | "weapon:ranged"
    | "shield"
    | "throwable"
    | "light"
    | "healing"
    | "rope"
  >;
  lit?: boolean; // only relevant for "light"
};

export type InventoryState = {
  equipped: Item[]; // hands/belt
  pack: Item[];     // backpack
  ground: Item[];   // nearby on ground
};

let _inv: InventoryState = {
  equipped: [
    { id: "longsword", name: "Iron Longsword", where: "main", tags: ["weapon:melee"] },
    { id: "buckler", name: "Buckler", where: "off", tags: ["shield"] },
    { id: "throwing-axe", name: "Throwing Axe", where: "belt", qty: 1, tags: ["throwable","weapon:ranged"] },
    { id: "torch", name: "Torch", where: "belt", qty: 1, tags: ["light"], lit: false },
  ],
  pack: [
    { id: "bandage", name: "Basic Bandages", where: "pack", qty: 2, tags: ["healing"] },
    { id: "twine", name: "Twine (10m)", where: "pack", tags: ["rope"] },
  ],
  ground: [],
};

export function getInventory(): InventoryState { return _inv; }
export function setInventory(next: Partial<InventoryState>) { _inv = { ..._inv, ...next }; }

// tiny helpers (optional)
export function setLitTorch(lit: boolean) {
  for (const area of [_inv.equipped, _inv.pack, _inv.ground]) {
    const t = area.find(i => i.tags?.includes("light"));
    if (t) { t.lit = lit; break; }
  }
}