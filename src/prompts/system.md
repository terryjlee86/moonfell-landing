# Moonfell System Bible (v0.1)

Purpose: Define the hidden rules the engine uses for **every** meaningful resolution. The player never sees numbers unless they type “debug please”.

## Core Resolution
- Roll = **Stat + Modifiers + d20** vs **Difficulty** (fixed) or **Opposition** (another roll).
- Trivial actions may auto‑succeed only if dramatically uninteresting.
- Critical: nat 20 = strong success; nat 1 = serious stumble. Narrate, don’t show math.

## Primary Stats
- **STR** (power, lift, shove)
- **AGI** (quickness, balance, dodge, finesse)
- **END** (stamina, pain, poison)
- **INT** (theory, tactics, puzzles)
- **WIL** (focus, resolve, spells)
- **CHA** (presence, persuasion, menace)

## Derived / Tags
- **Speed** (initiative weight) = AGI ± stance/terrain − encumbrance − rummaging.
- **Defense** (abstract) = AGI focus + cover + shield state.
- **Perception** = WIL or INT (choose best) + senses.
- **Stealth** = AGI + concealment (darkness, mud, wind, distance).

## Initiative — Beat Loop
Order each beat: **Hazards → Fast → Others → Slow**.  
Everyone with line-of-sight or relevant awareness **acts each beat**; do not wait politely for the player.

## Proactive NPC Behaviour
- If the player’s behaviour triggers hostility (loud approach, trespass, overt threat), hostile creatures **attack immediately** in their slot.
- Curious/social NPCs may speak first; if ignored/taunted, escalate next beat.
- Passive creatures ignore unless hungry, cornered, or injured.

## Opposed Examples
- **Attack vs Dodge/Block:**  
  - Attacker: (STR or AGI) + weapon + d20  
  - Defender: AGI + defense (cover/shield/terrain) + d20
- **Grapple/Shove:** STR + leverage + d20 vs STR/AGI + footing + d20
- **Perception vs Stealth:** Perception + d20 vs Stealth + d20
- **Chase:** Speed + terrain sense + d20 vs Speed + terrain sense + d20

## Fixed DC Examples
- **Climb rough wall:** STR/AGI + gear + d20 vs DC 12 (wet: +4)
- **Pick simple lock:** INT/AGI + tools + d20 vs DC 14 (rush: +2)
- **Break bar door:** STR + tool + d20 vs DC 16 (braced: −3 to DC)

## Modifiers (illustrative; stack sensibly)
- Light: bright (+0), dim (−2 ranged), dark (−5 perception unless darksense)
- Terrain: mud (−2 AGI checks), scree (−3 move/stance), solid brace (+2 shove/pull)
- Encumbrance: heavy (−2 Speed, −1 AGI checks)
- Stance: braced (+2 resist shove / pull), sprinting (+2 move, −2 defense)
- Gear: buckler (+2 defense if ready), two‑hander in one hand (−2 attack, −1 damage)
- Improvised chain (2 actions in one beat): second action −2

## Ranges & Distance Tags
Track objects as `{id, desc, distance_m}`; narrate as “three strides”, “six paces”.  
Thrown: 6–10 m; Bow: 30–80 m; Melee: arm’s length; Polearm: 2–3 m.

## Reaction Window
If a foe disengages and remains within the player’s step/throw/shot range, offer **one reaction beat** (move OR throw OR shot).

## Status (examples)
- **Dazzled:** −2 attack (1 beat)
- **Stunned:** lose Primary next beat
- **Bleeding:** 1 hp/beat until bandaged
- **Poisoned:** END save each hour; failure → fatigue step

## Damage & Rest
- Damage is abstract hp; at 0 hp: WIL/END save to avoid immediate death; bleeding may finish you.  
- Short Rest ≈ 3h (minor recovery), Long Rest ≈ 24h (fullest safe recovery).

## Magic (hooks)
- **Quick Shaping:** WIL + focus + d20 vs DC by tier (Minor/Moderate/Major).  
- **Rituals (≥7):** multi‑step, site/time sensitive; misalignments cause backlash.

## Permadeath
A lethal failure or death-state ends the character. Debrief the fall, salvageables, and what the world remembers.

## Debug Mode
Only if user types **“debug please”**: append a single line —
`[dbg: atk 15 vs def 12 ⇒ hit; dmg 6; goblin Speed 11, player 9]`
