# Active effects in plain English: what Shadowrun 6 Eden lets an item change

2026-10-17. This is the readable companion to [the technical catalog](active-effects-variable-catalog-2026-10-17.md). It uses the words you see on screen in Foundry VTT with the Shadowrun 6 Eden system (version 4.0.11), and the words the CommLink6 (CL6) books data uses. Nothing here matches our items to effects yet. It only answers: **what can an effect change, and what can't it?**

## The short version

1. An effect in Eden is a little instruction stuck on an item: "while you have this, change *this number* by *this much*." The "this number" part is picked from a **dropdown list of about 100 choices**. If it isn't on that list (or the hidden list behind the "Advanced?" box), Eden can't do it.
2. **Most of what a Shadowrun item does fits the list.** Attribute bonuses, skill bonuses, Defense Rating, monitor boxes, initiative, defense pools, weapon Attack Rating and damage, and vehicle stats all have a choice in the dropdown.
3. **Three big things in the CL6 books have no choice in the dropdown at all:**
   - **"Raises your maximum"** (e.g. a bonus to how high you can take Strength). This is 325 of CL6's 522 attribute effects, about two thirds.
   - **Edge rules** ("gain 1 Edge on this test", "can't spend Edge", "Edge-only test", Edge Boosts). About 290 entries. Eden's only Edge dropdown choice is your Edge *maximum*.
   - **Dice for one specific action**, such as Data Spike or Matrix Perception, or for a skill *specialization* (about 40 entries).
4. **Natural, augmented and artificial bonuses can't be told apart.** CL6 labels some attribute bonuses as natural, augmented, or artificial (the gear's own stat). Eden has one "Body Modifier" box and adds everything together, then stops counting at +4.
5. Anything we can't put in the dropdown stays as **text in the item's description**, as it is today.

## How you make an effect in Eden (the screen)

1. Open an item (a quality, cyberware, a weapon, a gear mod) and go to its **Effects** tab. Click add (+).
2. The effect window has tabs. The ones that matter:
   - **Details**: a checkbox called **Apply Effect to Actor**.
     - Ticked: the effect changes the *character* (a Body bonus, a Defense Rating bonus).
     - Unticked: the effect changes *the item itself* (a weapon's damage, a vehicle's handling).
     - It can only be one or the other. Eden warns you not to use a character choice on an item or the reverse.
   - **Changes**: one row per change. Each row has **Key** (the dropdown), **Type** (Add, Override, Multiply, Upgrade, Downgrade, Subtract, Custom), **Value** (a number or a formula) and **Priority** (leave blank).
   - **Advanced?** checkbox: tick it to type any key by hand instead of using the dropdown. Without it, any key not in the dropdown shows up blank.
3. In **Value** you can write `@item.system.rating` to mean "the rating of this item". So one effect "Reaction Modifier, Add, `@item.system.rating`" covers every rating of an item instead of needing one effect per rating.
4. Eden's own tips on that screen: use a **Modifier** choice to nudge a number; use a **Pool (Override only)** choice only to replace a whole attribute (cyberlimbs, skillwires); and attribute and skill bonuses are **capped at +4** automatically, as in the rules.

## What you see in the Key dropdown, and what it does

Left column is the wording on screen. Middle is what it does in plain terms. Right is the CL6 wording it would carry (counts are how many times CL6's data uses it).

### Character choices (Apply Effect to Actor ticked)

| You see | What it does | CL6 wording it fits |
|---|---|---|
| **Body / Agility / Reaction / Strength / Willpower / Logic / Intuition / Charisma / Magic / Resonance Modifier** | Adds to that attribute (bonus, up to +4) | "+N to attribute" (63 entries that are plain bonuses; the other 325 are "maximum" entries, see below) |
| **Edge Attribute** | Raises your Edge *maximum* | Edge bonus (6) |
| **Essence Modifier** | Shows in the list but **does nothing**; Eden works out Essence from the cyberware items themselves | Essence effects (7) cannot be done this way |
| **Physical / Stun / Overflow Monitor Modifier** | More boxes on that track | Physical Monitor (17), Stun (3), Overflow (3) |
| **Physical / Magic / Matrix Attack Rating Modifier** | Adds to your Attack Rating on the sheet | Attack Rating (5) |
| **Physical / Astral / Matrix Defense Rating Modifier** | Adds to that Defense Rating | Physical (23), Astral (4) |
| **Physical Defense Pool Modifier**, **Magic Defense Pool Modifier** | Dice added when you defend | about 35 defense-pool entries in total across all four kinds |
| **Direct Spells / Indirect Spells Defense Pool Modifier** | Dice when resisting direct or indirect combat spells | (counted in the line above) |
| **Physical Damage / Astral Damage Defense Pool Modifier**, **Toxin Resist**, **Drain Resist**, **Fading Resist Pool Modifier** | Dice on those resistance tests | Resist Damage (6), Toxin (4), Drain (2) |
| **Composure, Judge Intentions, Memory, "Lift / Carry" and Matrix Perception Modifier** (five separate choices) | Dice on those derived tests | Composure, Judge Intentions, Memory |
| **Initiative Modifier**, **Astral Initiative Modifier**, **Matrix Initiative Modifier** | Adds to the initiative score | Matrix initiative score (3) |
| **Physical / Astral / Matrix Initiative Dice Pool Modifier** | Extra initiative dice (Eden holds you between 1 and 5) | Initiative dice (13) |
| **Astral, Athletics, Biotech, Close Combat, Con, Conjuring, Cracking, Electronics, Enchanting, Engineering, Exotic Weapons, Firearms, Influence, Outdoors, Perception, Piloting, Sorcery, Stealth, Tasking Skill Modifier** (19) | Extra dice on every roll with that skill | "+N dice to [skill] tests" (65). The 19 skills are exactly the same list in CL6 and Eden |
| **Dice Pool Modifier** | Extra dice on *everything* the character rolls | "all tests" style bonuses |
| **Movement Sprint Base / Sprint Multiplier**, **Movement Rate** | Changes sprint distance. *Movement Rate is listed but Eden never reads it*, so it does nothing | Movement (6) |
| **Hardened Armor** | Adds hardened armor | Hardened armor critter power (3) |
| **Immunity to Normal Weapons (Override true)** | Makes the character immune to normal weapons | Immunity (1) |
| **Pain Tolerance (set Override: 'high' or 'low')** | Sets the character's pain tolerance | Pain tolerance rules (5) |
| **Bad Luck glitches (set Override: true)** | Turns on the Bad Luck quality's effect | Bad Luck quality |
| **Agility Pool / Strength Pool (Override only)** | **Replaces** the whole attribute with the number you give (a cyberlimb's own Strength) | The "artificial" bonuses (19) |
| **[Skill] Skill Pool (Override only)** (19) | **Replaces** the skill rating (skillsofts, hardwires) | Skill set to a rating (part of 44 skill entries; the rest are knowledge/language skills, which are items, not effects) |

Not on the dropdown, but Eden does understand them if you tick **Advanced?** and type the key by hand: Social Attack/Defense Rating and Vehicle Attack/Defense Rating and the Vehicle Defense Pool (commented out in the list as "not yet implemented"), Spells-other defense pool, Damage-resist and Toxin-resist derived pools, and a few more. They'll work but won't be pretty on the sheet.

### Weapon choices (Apply Effect to Actor **unticked**, effect on a weapon or weapon mod)

| You see | What it does |
|---|---|
| **Weapon Mod: Attack Rating (Close / Near / Medium / Far / Extreme)** | Changes one of the five range numbers on the weapon. CL6's "5, 4, 3, 2, 1" style string maps to these five boxes (76 entries) |
| **Weapon Mod: AR Modifier (SA / BF / FA)** | Changes Attack Rating only in single-shot, burst or full-auto |
| **Weapon Mod: Dmg Modifier** | Changes the weapon's damage (25) |
| **Weapon Mod: Stun (true) or Physical (false) damage** | Flips stun/physical |
| **Weapon Mod: Dice Pool Modifier** | Extra dice when firing it |
| **Weapon Mod: Use Wild Die (set Override: true)** | Makes the weapon roll a Wild Die. (CL6 has 17 wild-die entries, but they apply to the *character*, which Eden can't do) |
| **Weapon Mod: Ammo Capacity** | Changes magazine size |

### Armor choices (effect on armor)

**Armor Mod: Defense Rating Modifier** and **Armor Mod: Social Rating Modifier**.

### Vehicles and drones (not in the dropdown; tick Advanced? and type the key)

Handling, Acceleration, Speed Interval and Top Speed each have an "on-road" and an "off-road" box in Eden. Body, Armor, Pilot, Sensors and Seats have one box each. CL6 uses all of these (about 50 entries). They're the one place where CL6 and Eden line up exactly but the dropdown doesn't show them.

### Matrix devices (also Advanced?)

A cyberdeck or commlink has four boxes: Attack, Sleaze, Data Processing, Firewall, and CL6 changes them about 22 times. Eden can change them on the device item, but not for "the whole persona".

## What the books say that the dropdown can't do

Plain-language examples of each, with counts from CL6's data.

1. **"Raises your maximum Strength / Agility / …"** (325). Nothing in Eden holds a maximum, so the max can't live in an effect. Our app would have to keep these as its own rule, not something Foundry applies.
2. **Edge effects** (about 290). Examples in CL6's wording: "gain Edge on this test", "can't spend Edge", "Edge-only test", "reduces the Edge cost", plus the Edge Boost actions (Double Down, Redline, Tokyo Drift, …). Eden has no place for any of it. This stays as text.
3. **"+N dice on [one named action]"** such as Data Spike, Brute Force, Take Aim, Trace Icon, or a complex form such as Resonance Spike (about 20), and **specialization bonuses** (21). Eden only has the whole-skill box. The one exception is Matrix Perception.
4. **Natural vs augmented vs artificial** (84). All bonuses to one attribute are added into one box. They can't be told apart, and Eden stops at +4 total, so two +3 bonuses show as +4, not +6. That matches the rule for augmentation but can wrongly trim a *natural* bonus.
5. **Wild Die on the character** (17). Only weapons can have one.
6. **Matrix initiative while in AR, cold-sim VR or hot-sim VR** (10). CL6 keeps three; Eden has one Matrix Initiative.
7. **Smaller leftovers:** damage reduction, minor actions, power points, monthly cost, Drake Edge, "Magic minimum", a bonus for the whole Matrix persona, Matrix damage resistance.

CL6 also has a lot of "modifications" that were never numbers to begin with: giving you a quality, a gear item or a critter power, allowing or forbidding something, changing a price or a lifestyle. Those are not effects and don't need the dropdown. They're handled by adding items.

## What Eden has that CL6 never uses

Dice Pool Modifier (everything), the three Single-Shot/Burst/Full-Auto Attack Rating boxes, the Movement Sprint boxes, the Spells-other pool, and 44 **status effects** (Blind, Prone, Burning, Dazed and so on). Those are on/off markers with no numbers behind them.

## Decisions for you

1. **Attribute maximums** (two thirds of the attribute entries): keep them inside our app only, since Eden can't hold them?
2. **Edge effects and one-action dice:** leave as text on the item? (There's no alternative in Eden.)
3. **Hidden choices:** is it fine to export effects that use the "Advanced?" box (vehicle stats, device stats, a few defense pools)? The sheet shows them with a blank dropdown, though they work.
4. **Ratings:** write one effect with `@item.system.rating`, or one literal number per rating (our "one catalog item per level" rule)?

## Where to look next

The technical catalog, [active-effects-variable-catalog-2026-10-17.md](active-effects-variable-catalog-2026-10-17.md), has the exact keys, file:line citations and every count. The labels above come from Eden's `lang/en.json` and `module/config.js:3922-4561` (local install, 4.0.11).
