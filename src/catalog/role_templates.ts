/**
 * FILE: src/catalog/role_templates.ts
 * WHAT: Occupation kits for humanoids (gear + behavior + small prof mods).
 * HOW: At spawn time, race + role get composed into an entity instance.
 */

import { RoleTemplate } from "./types";

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    id:"bandit", name:"Bandit",
    defaultGear:{ armor:"leather", shield:false, weapons:["shortsword","shortbow"] },
    profMods:{ melee:1, stealth:1 },
    behavior:["ambush","flee-when-outnumbered"],
    faction:"black-thorns",
    handlerOf:["guard-dog"],
  },
  // add more roles…
];