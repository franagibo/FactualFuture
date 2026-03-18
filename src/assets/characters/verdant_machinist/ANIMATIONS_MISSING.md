# Verdant Machinist – Animation Sheets

## Implemented (all sheets in use)

| Sheet filename | Used for | Cards using it | Description |
|----------------|----------|----------------|-------------|
| `verdant_machinist_idle.png` | Idle loop | (always) | Character at rest, looping. |
| `verdant_machinist_strike.png` | Strike card | **Strike** | Quick physical attack. |
| `verdant_machinist_shield.png` | Block / Barrier | **Barrier (defend)**, Root Guard, Bio Shield, Thorn Skin, Root Network, Terraform Engine, Living Fortress | Defensive pose, bracing or raising barriers. |
| `verdant_machinist_grow_seed.png` | Growth abilities | Growth Pulse, Fertilize, Nutrient Burst, Accelerated Evolution, Bloom Cycle, Terraform Engine, Hypergrowth, Spore Reactor | Nurturing / channeling growth into plants. |
| `verdant_machinist_spell.png` | Attack/debuff spells | Thorn Jab, Vine Lash, Drain Tendril, Root Slam, Thorn Volley, Spore Cloud, Symbiotic Strike | Casting or projecting thorns/vines/spores at enemies. |
| `verdant_machinist_summoning.png` | Summon seeds | Seed Pod, Rapid Germination, Regrowth, Seed Storm | Creating or deploying new seedlings. |
| `verdant_machinist_commanding.png` | Directive cards | Attack Directive, Support Protocol, Adaptive Directive | Commanding gesture toward plants. |
| `verdant_machinist_evolve.png` | Evolve plant | Genetic Rewrite, Bioforge | Focused gesture evolving plants. |
| `verdant_machinist_detonate.png` | Sacrifice + damage | Exploding Seed | Detonating or hurling a plant. |
| `verdant_machinist_drain.png` | Sacrifice + energy/draw | Biomass Conversion | Absorbing or siphoning a plant. |

---

## Cards with no dedicated animation (3 cards)

These VM cards currently trigger **no** player animation when played.

| Card id | Card name | Effect summary | Suggested animation | Short description |
|---------|-----------|----------------|---------------------|-------------------|
| `attack_directive` | Attack Directive | Set plants to attack mode | **directive** (new) | Short “commanding” gesture – ordering plants to attack. |
| `support_protocol` | Support Protocol | Set plants to support mode + draw | **directive** (new) | Same as above; commanding plants into support stance. |
| `adaptive_directive` | Adaptive Directive | Set first plant to defense mode | **directive** (new) | Same; single defensive order gesture. |
| `photosynthesis` | Photosynthesis | Gain 1 energy | **channel** or **buff** (new) | Calm, gathering light/energy (e.g. arms up or absorbing). |
| `apex_bloom` | Apex Bloom | Gain 1 energy (exhaust) | **channel** or **buff** (new) | Same idea – brief energy-gathering pose. |
| `overgrowth_protocol` | Overgrowth Protocol | Gain strength, lose 1 HP | **buff** (new) | More intense “powering up” – organic surge, slight strain. |
| `genetic_rewrite` | Genetic Rewrite | Evolve a plant 1 stage | **evolve** (new) | Focused gesture at plants – reshaping/evolving them. |
| `bioforge` | Bioforge | Evolve a plant + block | *(uses shield today)* | Could use **evolve** if you add it (block could stay shield or blend). |
| `biomass_conversion` | Biomass Conversion | Sacrifice plant → energy + draw | **sacrifice** (new) | Absorbing or consuming a plant – pull-in or drain motion. |
| `exploding_seed` | Exploding Seed | Sacrifice plant → AoE damage | **sacrifice** (new) | Same family – detonating or hurling a plant forward. |

---

## How many more sheets to make (optional)

You **don’t have to** add more sheets. The 5 you have cover most cards; the 9 above simply play with no animation.

If you want one animation per “type” of missing behavior:

| New sheet (optional) | Filename | Cards it would cover | Animation idea |
|----------------------|----------|----------------------|----------------|
| **Directive** | `verdant_machinist_directive.png` | attack_directive, support_protocol, adaptive_directive | Short commanding gesture toward plants (e.g. arm raise or point). |
| **Channel / Buff** | `verdant_machinist_channel.png` | photosynthesis, apex_bloom, overgrowth_protocol | Gathering energy or powering up – calm or intense. |
| **Evolve** | `verdant_machinist_evolve.png` | genetic_rewrite, (optionally bioforge) | Focused “evolving” gesture toward plants. |
| **Sacrifice** | `verdant_machinist_sacrifice.png` | biomass_conversion, exploding_seed | Consuming or detonating a plant – pull-in or throw. |

- **Minimum extra:** **0** – everything already has a fallback (idle or one of the 5 sheets).
- **If you want to cover all “missing” cards with a dedicated feel:** **up to 4** new sheets: **directive**, **channel** (or **buff**), **evolve**, **sacrifice**.

Same grid as your other VM sheets (e.g. 5×5) is enough; keep frame count and style consistent with strike/shield/spell so the code can stay simple.

---

## Summary

- **In use:** 10 sheets (idle + strike, shield, grow_seed, spell, summoning, commanding, evolve, detonate, drain).
- **Cards with no animation:** 3 (photosynthesis, apex_bloom, overgrowth_protocol). Add verdant_machinist_channel.png or verdant_machinist_buff.png and wire it in code if you want animations for these.
