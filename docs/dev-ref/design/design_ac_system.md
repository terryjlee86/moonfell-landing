# Armor Class System (Moonfell v1.0 Draft)

### Core Idea
Moonfell uses a **bounded AC model** designed for the d20. Instead of defense values spiraling upward, we keep most outcomes in the **50–70% hit range**. This keeps combat cinematic — blows land often enough to feel dangerous, while agility, cover, and armor still matter.

---

## 1. Base Armor Class (BAC)
Every creature starts with a universal **BAC = 9**.  
This is the floor — representing instinct, stance, and the basic difficulty of striking a moving foe.

---

## 2. Armor Class (AC)
A creature’s actual defensive target number is its **AC**.

**Formula:**
```
AC = BAC (9) + AGI modifier + shield bonus + cover bonus
```

- **AGI modifier** = `round((AGI − 10) / 4)`  
  (Stats run 1–20; mods typically −2 to +3).  
- **Shields**: +1 (buckler) or +2 (tower).  
- **Cover**: +1 (low wall, light foliage) to +2 (stone wall, strong concealment).  

---

## 3. Armor Soak
Armor no longer increases AC. Instead, it reduces **damage taken** when a hit lands:

- Light armor: soak 1  
- Medium armor: soak 2  
- Heavy armor: soak 3–4  

This makes agile characters harder to hit, while armored ones get hit more often but survive longer.

---

## 4. Attack Rolls
Resolving an attack:
```
d20 + STR/DEX mod + proficiency + situational bonuses ≥ target AC
```

---

## 5. Examples (using your creatures)

### Wolf
```
AGI ≈ 14 → AGI mod +1
AC = 9 + 1 = 10
Traits: Pack Tactics (+1 to hit when allies engage same target)
```
- Versus a human guard (+3 to hit): needs 7+ → **70% hit chance**.  
- Works as a dangerous skirmisher, especially in packs.

---

### Boar
```
AGI ≈ 10 → AGI mod 0
AC = 9
Armor Soak: 2 (thick hide)
```
- Easy to hit, but thick hide negates small strikes.  
- A dagger dealing 4 damage only inflicts 2 after soak.  
- Feels like a brute that you can stab all day, but it just keeps charging.

---

### Guard Dog
```
AGI ≈ 12 → AGI mod +1
AC = 10
Traits: Loyal (+1 morale when handler nearby)
```
- AC like the wolf, but lacks the pack bonus.  
- Reliable but less threatening alone.

---

### Mirefold
```
AGI ≈ 12 → AGI mod +1
AC = 10 (normal), 12 (while camouflaged in swamp)
Traits: Amphibious, Camouflage
```
- Hidden in marshes: attackers need 12+, so about a **45% hit rate**.  
- Once revealed, drops back to 10 AC and is much easier to dispatch.  
- Creates a “spike danger” opening moment, then levels out.

---

## 6. Why BAC + AC Works
- **BAC 9**: universal floor, keeps low-level creatures hittable.  
- **AC (final)**: clear, familiar number that folds in agility, shields, and cover.  
- **Armor Soak**: separates survivability from avoidance, making tank vs rogue feel distinct.  
- **d20 friendly**: most attack rolls end up in the 50–70% range, keeping dice exciting but not frustrating.  
