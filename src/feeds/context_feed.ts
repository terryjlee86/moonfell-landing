// src/feeds/context_feed.ts
import { getContext } from "../state/context";

export function contextFeed() {
  const ctx = getContext();
  const tags: string[] = [];

  if (ctx.rails?.length) tags.push(...ctx.rails.map(r => `rail:${r}`));

  for (const n of ctx.nearby) {
    tags.push(`creature:${n.kind}:${n.attitude}:${Math.round(n.distanceM)}m`);
  }

  return { tags };
}