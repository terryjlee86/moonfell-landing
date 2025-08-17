// src/feeds/inventory_feed.ts
import { getInventory, Item } from "../state/inventory";

type InventoryFeed = {
  tags: string[];
  list: { equipped: string[]; pack: string[]; ground: string[] };
};

export function inventoryFeed(): InventoryFeed {
  const inv = getInventory();

  const all: Item[] = [...inv.equipped, ...inv.pack, ...inv.ground];

  const has = (pred: (i: Item) => boolean) => all.some(pred);

  const count = (pred: (i: Item) => boolean) =>
    all.reduce((n, it) => n + (pred(it) ? (it.qty ?? 1) : 0), 0);

  const lightState: "none" | "unlit" | "lit" = (() => {
    const torch = all.find((i) => !!i.tags?.includes("light"));
    if (!torch) return "none";
    return torch.lit ? "lit" : "unlit";
  })();

  const tags: string[] = [];
  if (has((i) => !!i.tags?.includes("shield"))) tags.push("pc:shield");
  if (has((i) => !!i.tags?.includes("weapon:ranged"))) tags.push("pc:ranged");

  const throwables = count((i) => !!i.tags?.includes("throwable"));
  if (throwables > 0) tags.push(`pc:throwable:${throwables}`);

  tags.push(`pc:light:${lightState}`);

  if (has((i) => !!i.tags?.includes("rope"))) tags.push("pc:rope");
  if (has((i) => !!i.tags?.includes("healing"))) tags.push("pc:healing");

  const fmt = (i: Item) =>
    `${i.name}${i.qty && i.qty > 1 ? ` x${i.qty}` : ""}${
      i.lit !== undefined ? (i.lit ? " (lit)" : " (unlit)") : ""
    }`;

  const list = {
    equipped: inv.equipped.map(fmt),
    pack: inv.pack.map(fmt),
    ground: inv.ground.map(fmt),
  };

  return { tags, list };
}