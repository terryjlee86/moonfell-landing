# Rolls Rules (Moonfell)

## Purpose
Decide **when** a player action should trigger a dice roll, and when it should not.  
These rules guide the Rolls DM only (players never see them).

The AI should use **feeds** (`inventory`, `learned`, `context`, `character`) as the ground truth for what the player can or cannot do.  
If a required item, spell, or condition is missing, **auto-fail with a clear reason and tag** (e.g. `needs-bow`, `needs-spell:fireball`).  
If the action is possible but requires chance, return a **roll** (fixed or opposed).  
If the action is pure ambience, return **no-roll**.

---

## Categories

### 1) No Roll
Use narration only — no dice, no suspense.
- Pure observation/input with no consequence intended:  
  “look around”, “listen”, “sniff the air”.
- Casual ambient acts:  
  “hum”, “sing a tune”, “whistle”, “stretch”, “swap grip” (when unpressured).
- Moving slowly within obvious safety, without contest or risk.

**Tag:** `["ambient-action"]`  
**Heuristic:** Only classify as no-roll if the player’s action has **no intent to affect the world, a creature, or their own state**.

---

### 2) Auto-Success
Trivial actions that always succeed; no suspense is added by rolling.
- Pick up an item at your feet in calm conditions.
- Draw/sheath a weapon when unopposed.
- Speak a few words aloud.

**Tag:** `["auto-success"]`

---

### 3) Auto-Fail
Impossible under current physics, fiction, or demo boundaries.  
- Attempting to leave the locked preview area (rail block).  
- Leap implausible gaps, fly unaided, ignore encumbrance limits.  
- Cast a spell the character does not know (check feeds).  
- Use an item/weapon that the character does not possess (check feeds).  

**Tags:**  
- `["rail-block"]` for demo boundaries.  
- `["needs-bow"]`, `["needs-crossbow"]`, `["needs-handcannon"]`, `["needs-spell:fireball"]`, etc. for missing prerequisites.  

**Heuristic:** Use auto-fail only when **feeds prove the player lacks the required item/spell/capability**.  
Never auto-fail just because the LLM thinks something is unlikely.

---

### 4) Fixed DC
Environmental/object interactions against a set difficulty.  
- Climb, jump, force a door, balance, pick a lock.  
- Choose ability by fiction:  
  - STR → brute force (shove, lift, break).  
  - AGI → balance, speed, accuracy.  
  - END → stamina, resisting fatigue or poison.  
  - INT → analysis, recall, tactics.  
  - WIL → focus, resisting fear, keeping calm.  
  - CHA → inspiring allies, rallying crowds.  
- Optional DC hint: `easy`, `standard`, `hard`, `heroic`.

**Tag:** `["fixed-action"]`

---

### 5) Opposed
Direct contests against creatures or resisting agents.  
- Attack/dodge/block.  
- Shove, grapple, restrain.  
- Stealth vs perception.  
- Chase or contest of speed.  

**Format:** `opposed atk=<ability> vs <creature/environment/player>`.  

---

## Social / Mental Influence (Roll REQUIRED if intent stated)
Any attempt to alter a creature/NPC’s **behaviour, mood, attention, or intent** requires a roll.  

Examples: calm, lull, distract, charm, soothe, frighten, intimidate, persuade, lure, mesmerise, confuse, taunt, mislead.  

- Default **CHA**.  
- Allow **WIL** or **INT** when fictionally appropriate (prayer, ritual, tactical feint).  
- Use **Opposed vs creature** when a target resists.  
- Use **Fixed DC** if resistance is ambient/low.  

**Intent heuristic (strict):**  
If the player’s text includes an **influence verb** (calm, lull, distract, frighten, charm, persuade, lure, mesmerise) **and** references a creature/NPC (explicitly or by pronoun/description), classify as **roll required** (usually opposed).  
Do **not** treat as ambient.  

**Tag:** `["social-influence"]`

---

## Weapons & Items (Feeds are ground truth)
- If the player specifies **a weapon or item**, check feeds for a matching tag.  
  - Bow → requires `pc:bow`.  
  - Crossbow → requires `pc:crossbow`.  
  - Handcannon / pistol / musket / rifle → requires `pc:handcannon`.  
  - Throwing axe → requires `pc:throwing-axe:N` with N > 0.  
  - Rope → requires `pc:rope`.  
  - Torch/Lantern → requires `pc:light:lit` or `pc:light:unlit`.  
- If the specific item is **not in feeds**, auto-fail with clear reason + tag.  
- If the player asks for a **similar but non-existent item** (e.g. “short sword” when only a longsword exists), AI should try to **substitute the closest match** from inventory and resolve with a roll.

---

## Spells (Feeds are ground truth)
- Player must have `pc:spell:<id>` to cast.  
- Attempting unknown spells = **auto-fail** with tag `needs-spell:<id>`.  
- Example tags: `pc:spell:fireball`, `pc:spell:sparkLight`.  
- Spells follow the same categories:  
  - Pure ambience → no-roll (e.g. whispering a prayer).  
  - Quick, low-level → fixed DC.  
  - Combat or influence → opposed.

---

## Ambience vs Influence (Tagging Rule)
- **Ambient actions** with **no stated intent to affect a creature** = **No Roll**.  
  Tag as `["ambient-action"]`.  
- **Influence attempts** that aim to change a creature/NPC = **Roll required**.  
  Tag as `["social-influence"]`.  
- When ambiguous, classify as **ambient** (do not assume influence intent).  

---

## Examples (authoritative)
- “sing a tune” → **No Roll**, tags `["ambient-action"]`.  
- “sing a tune **to lull the creature**” → **Opposed**, `atk=CHA vs creature`, tags `["social-influence"]`.  
- “whisper a prayer to steady my nerves” → **Fixed** (WIL), tags `["self-bolster"]`.  
- “shove the goblin” → **Opposed** (STR vs creature).  
- “sneak past the lookout” → **Opposed** (AGI vs perception).  
- “shoot my bow” when no bow in feeds → **Auto-Fail**, reason “You don’t have a bow.”, tag `["needs-bow"]`.  
- “use my short sword” when only a longsword exists → **Fixed**, reason “Interpreted as longsword (closest match).”, tag `["fuzzy-match:longsword"]`.

---

## Criticals
- Nat 20 = strong success.  
- Nat 1 = serious stumble.  
Narrate the outcome but **never expose raw numbers or math**.

---

## Debug Mode
If the client requests debug, return a short, plain-language reason and relevant **tags**.  
Always surface:  
- The category (no-roll, auto-success, auto-fail, fixed, opposed).  
- The **reason**.  
- Any **needs-*** or **fuzzy-match** tags.  

---