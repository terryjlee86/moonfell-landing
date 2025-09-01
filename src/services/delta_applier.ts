// src/services/delta_applier.ts
//
// Universal delta applier for Moonfell.
// Applies small, structured state changes to Environment + Inventory.
// Safe to call from Rolls DM decisions (apply_now/on_success/on_failure),
// narrator observers, or action-resolution code. Now logs each applied delta.

import { upsertEnvItem, removeQty as envRemoveQty } from "../state/environment";
import { getInventory, setInventory } from "../state/inventory";

// ---------- Types ----------

export type EnvDelta =
  | { type: "environment"; op: "add"; slug: string; name?: string; where: "ground" | "feature"; qty?: number; tags?: string[] }
  | { type: "environment"; op: "remove"; slug: string; where: "ground" | "feature"; qty?: number }
  | { type: "environment"; op: "move"; slug: string; from: "ground" | "feature"; to: "ground" | "feature"; qty?: number };

export type InvWhere = "main" | "off" | "belt" | "pack" | "ground" | "hand"; // "hand" maps to equipped group

export type InventoryTag =
  | "weapon:melee"
  | "weapon:ranged"
  | "shield"
  | "throwable"
  | "light"
  | "healing"
  | "rope";

export type InvDelta =
  | { type: "inventory"; op: "add"; item: string; where: InvWhere; qty?: number; name?: string; tags?: InventoryTag[] }
  | { type: "inventory"; op: "remove"; item: string; where: InvWhere; qty?: number }
  | { type: "inventory"; op: "move"; item: string; from: InvWhere; to: InvWhere; qty?: number }
  | { type: "inventory"; op: "consume"; item: string; qty?: number };

export type Delta = EnvDelta | InvDelta;

// ---------- Inventory helpers ----------

type InvState = ReturnType<typeof getInventory>;
type InvItem = InvState["equipped"][number];

function slotArray(inv: InvState, where: InvWhere): InvItem[] {
  // your inventory model groups by arrays; items inside carry .where
  if (where === "main" || where === "off" || where === "belt" || where === "hand") return inv.equipped;
  if (where === "pack") return inv.pack;
  if (where === "ground") return inv.ground;
  return inv.pack;
}

function findFirst(items: InvItem[], idOrName: string, where?: InvWhere): { idx: number; it: InvItem } | null {
  const needle = idOrName.toLowerCase();
  for (let i = 0; i < items.length; i++) {
    const it = items[i] as any;
    const whereMatch = where ? (it.where ?? it.slot) === where : true;
    const idMatch =
      (it.id?.toLowerCase?.() === needle) ||
      (it.name?.toLowerCase?.() === needle) ||
      (it.name?.toLowerCase?.().includes(needle));
    if (whereMatch && idMatch) return { idx: i, it: items[i] };
  }
  return null;
}

function toInventoryTags(ts?: InventoryTag[]): InventoryTag[] {
  if (!ts) return [];
  // already typed; just dedupe
  return Array.from(new Set(ts)) as InventoryTag[];
}

function addTo(inv: InvState, where: InvWhere, itemIdOrName: string, qty = 1, opts?: { name?: string; tags?: InventoryTag[] }) {
  const arr = slotArray(inv, where);
  const safeTags = toInventoryTags(opts?.tags);

  const found = findFirst(arr, itemIdOrName, where);
  if (found) {
    const it: any = found.it;
    it.qty = (it.qty ?? 1) + qty;
    if (safeTags.length) {
      it.tags = Array.from(new Set([...(it.tags ?? []), ...safeTags])) as InventoryTag[];
    }
    return;
  }

  arr.push({
    id: itemIdOrName,
    name: opts?.name ?? itemIdOrName,
    where: where as any,
    qty,
    tags: safeTags.length ? safeTags : undefined,
  } as any);
}

function removeFrom(inv: InvState, where: InvWhere, itemIdOrName: string, qty = 1): boolean {
  const arr = slotArray(inv, where);
  const found = findFirst(arr, itemIdOrName, where);
  if (!found) return false;
  const cur = (found.it as any).qty ?? 1;
  if (cur <= qty) {
    arr.splice(found.idx, 1);
  } else {
    (found.it as any).qty = cur - qty;
  }
  return true;
}

function moveBetween(inv: InvState, from: InvWhere, to: InvWhere, itemIdOrName: string, qty = 1, opts?: { name?: string; tags?: InventoryTag[] }): boolean {
  const ok = removeFrom(inv, from, itemIdOrName, qty);
  if (!ok) return false;
  addTo(inv, to, itemIdOrName, qty, opts);
  return true;
}

function consumeAny(inv: InvState, itemIdOrName: string, qty = 1): boolean {
  // priority: hand/main → off/belt → pack → ground
  const order: InvWhere[] = ["hand", "main", "off", "belt", "pack", "ground"];
  let remaining = qty;
  for (const w of order) {
    while (remaining > 0) {
      const found = findFirst(slotArray(inv, w), itemIdOrName, w);
      if (!found) break;
      const take = Math.min(remaining, ((found.it as any).qty ?? 1));
      removeFrom(inv, w, itemIdOrName, take);
      remaining -= take;
    }
    if (remaining <= 0) break;
  }
  return remaining === 0;
}

// ---------- Simple logger (ring buffer) ----------

const _log: string[] = [];
const _LOG_MAX = 50;

function pushLog(line: string) {
  _log.push(line);
  if (_log.length > _LOG_MAX) _log.shift();
  // also print to server logs so you see it immediately
  // eslint-disable-next-line no-console
  console.log(line);
}

/** Optional: get the last N applied-delta lines (for UI debug if you want) */
export function getDeltaLog(lastN = 20): string[] {
  if (lastN >= _log.length) return [..._log];
  return _log.slice(_log.length - lastN);
}
/** Optional: clear the in-memory delta log */
export function clearDeltaLog() {
  _log.length = 0;
}

// ---------- Apply deltas ----------

export function applyDeltas(deltas: Delta[] | undefined | null): { applied: Delta[]; errors: string[] } {
  const applied: Delta[] = [];
  const errors: string[] = [];
  if (!Array.isArray(deltas) || deltas.length === 0) return { applied, errors };

  let inv = getInventory();

  for (const d of deltas) {
    try {
      if (d.type === "environment") {
        if (d.op === "add") {
          upsertEnvItem({
            slug: d.slug,
            name: d.name ?? d.slug,
            where: d.where,
            qty: d.qty ?? 1,
            tags: d.tags ?? [],
          });
          applied.push(d);
          pushLog(`Δ env:add ${d.slug}@${d.where} x${d.qty ?? 1}`);
          continue;
        }
        if (d.op === "remove") {
          const ok = envRemoveQty(d.slug, d.where, d.qty ?? 1);
          if (!ok) throw new Error(`env remove failed: ${d.slug}@${d.where}`);
          applied.push(d);
          pushLog(`Δ env:remove ${d.slug}@${d.where} x${d.qty ?? 1}`);
          continue;
        }
        if (d.op === "move") {
          const ok = envRemoveQty(d.slug, d.from, d.qty ?? 1);
          if (!ok) throw new Error(`env move: missing ${d.slug}@${d.from}`);
          upsertEnvItem({ slug: d.slug, name: d.slug, where: d.to, qty: d.qty ?? 1 });
          applied.push(d);
          pushLog(`Δ env:move ${d.slug} ${d.from}→${d.to} x${d.qty ?? 1}`);
          continue;
        }
      }

      if (d.type === "inventory") {
        if (d.op === "add") {
          addTo(inv, d.where, d.item, d.qty ?? 1, { name: d.name, tags: d.tags });
          applied.push(d);
          pushLog(`Δ inv:add ${d.item}@${d.where} x${d.qty ?? 1}`);
          continue;
        }
        if (d.op === "remove") {
          const ok = removeFrom(inv, d.where, d.item, d.qty ?? 1);
          if (!ok) throw new Error(`inv remove failed: ${d.item}@${d.where}`);
          applied.push(d);
          pushLog(`Δ inv:remove ${d.item}@${d.where} x${d.qty ?? 1}`);
          continue;
        }
        if (d.op === "move") {
          const ok = moveBetween(inv, d.from, d.to, d.item, d.qty ?? 1, undefined);
          if (!ok) throw new Error(`inv move failed: ${d.item} ${d.from}→${d.to}`);
          applied.push(d);
          pushLog(`Δ inv:move ${d.item} ${d.from}→${d.to} x${d.qty ?? 1}`);
          continue;
        }
        if (d.op === "consume") {
          const ok = consumeAny(inv, d.item, d.qty ?? 1);
          if (!ok) throw new Error(`inv consume failed: ${d.item} x${d.qty ?? 1}`);
          applied.push(d);
          pushLog(`Δ inv:consume ${d.item} x${d.qty ?? 1}`);
          continue;
        }
      }

      throw new Error(`unsupported delta: ${JSON.stringify(d)}`);
    } catch (e: any) {
      errors.push(`${e?.message || e}`);
      pushLog(`Δ ERROR ${e?.message || e}`);
    }
  }

  setInventory(inv);
  return { applied, errors };
}