# Card Hand UI Plan — "Having Them in Hand" Look

Goal: Style the combat hand so cards feel like a physical hand of cards (Hearthstone, Slay the Spire, etc.): fanned, overlapping, with hover lift and clear card design.

---

## 1. Hand Layout

### 1.1 Arc / fan
- **Current**: Flat horizontal row, no overlap, fixed gap.
- **Target**: Cards arranged in a **gentle arc** (curve):
  - Base line: cards sit along a curved path so the hand feels natural.
  - Option A: **Vertical arc** — middle cards slightly lower, left/right cards slightly higher (like a smile).
  - Option B: **Fan with rotation** — each card has a small rotation so they fan from a common “hold” point below the center.
- **Recommendation**: Vertical arc (simpler, readable) + slight per-card rotation (optional, for extra “fan” feel). Arc amplitude: e.g. 20–40 px so the center card is a bit lower than the edges.

### 1.2 Overlap
- **Current**: No overlap (`gap = 10`).
- **Target**: Cards **overlap horizontally** so you see the edges of neighbors (e.g. 40–55% of card width visible). Example: `cardWidth = 100`, visible width per card = 45 → overlap = 55 px. Adjust so 5–10 cards still fit on screen without clipping.
- **Formula**: `cardSpacing = cardWidth * overlapRatio` (e.g. `overlapRatio = 0.45`). First card at `startX`, each next at `startX + i * cardSpacing`.

### 1.3 Positioning
- Hand **centered** on screen (same as now).
- **Y**: Single base row (e.g. `handY`) with arc offset:  
  `y(i) = handY + arcAmplitude * (1 - 4 * (i - center)² / (n-1)²)` so the middle card is lowest.
- **Rotation**: Optional small angle per index, e.g. `rotation(i) = (i - center) * 0.03` rad, so left cards tilt left, right cards tilt right.
- **Anchor**: Card pivot at **bottom-center** (so when we “lift” on hover, it grows upward). Pixi: `container.pivot.set(cardWidth/2, cardHeight)` and position the container at the bottom of the card’s slot.

---

## 2. Hover & Selection Behavior

### 2.1 Hover (mouse over)
- **Lift**: Card moves **up** by 15–25 px (or more for drama).
- **Scale**: Slight scale up (e.g. 1.05–1.1) so it “pops”.
- **Z-order**: Hovered card drawn **on top** of others (Pixi: `sortableChildren = true`, set higher `zIndex` for hovered card).
- **Overlap**: Optionally **spread** neighbors slightly when one card is hovered so the hovered card is less covered (optional polish).
- **Cursor**: Pointer (already in place).

### 2.2 No hover
- Default z-order by index (e.g. middle card on top, or left-to-right).
- Default position, scale 1.0, no lift.

### 2.3 Interaction
- **Click**: Play card (existing logic). No need to “select” first; click = play.
- **Disabled / unplayable**: Dimmed or lowered opacity, no hover lift, cursor not pointer (or show “can’t play” cursor). Already have energy check; we can gray out when `state.energy < cost`.

---

## 3. Card Visual Design

### 3.1 Shape and size
- **Shape**: Rounded rectangle (already). Keep rounded corners (e.g. 8–12 px radius).
- **Size**: Slightly larger for readability: e.g. **100×140** or **110×150** (width×height). Match to overlap so 5–7 cards visible in hand.
- **Border**: 1–2 px stroke; color by state (default / playable / unplayable). Optional: rarity or type color later.

### 3.2 Layout (content)
- **Top-left**: **Energy cost** (number in a circle or badge). Green if playable, red if not (already).
- **Top**: **Card name** (single line, truncate with ellipsis).
- **Center**: **Art area** (placeholder: colored rectangle or icon; later: art asset).
- **Bottom**: **Effect text** (short description from `CardDef.effects`; e.g. “Deal 6 damage”).
- **Back**: Not needed for hand; only if we show discard pile as cards later.

### 3.3 Polish
- **Shadow**: When at rest: subtle drop shadow. When hovered: stronger shadow + maybe slight glow to reinforce “lift”.
- **Depth**: Slight gradient or border highlight on top edge to feel like a physical card.

---

## 4. Animation (optional but recommended)

- **Smooth transitions**: When hover starts/ends, **tween** position, scale, rotation over ~80–120 ms so it doesn’t feel instant. Options:
  - Use Pixi’s ticker and lerp in `redraw()` or a dedicated “hand layout” update.
  - Or a small tween library (e.g. gsap, or a simple `lerp(current, target, 0.2)` per frame).
- **Draw / discard**: When a card is drawn or played, a quick slide/scale-in or -out (can be Phase 2).

---

## 5. Technical Notes (Pixi)

- **Containers**: One `PIXI.Container` per card (already). Put all card containers in a single `handContainer` so we can sort children by hover.
- **Order**: `stage.sortableChildren = true` (or `handContainer.sortableChildren = true`). Each card: `container.zIndex = (hoveredIndex === i ? 100 : i)` (or similar).
- **Hover state**: Store `hoveredCardIndex: number | null` in the component. On `pointerover` set it and call `redraw()` or a lightweight `updateHandLayout()`; on `pointerout` clear and redraw. Alternatively, only update hand layout (positions/zIndex) without full redraw.
- **Arc math**: Precompute `x(i)`, `y(i)`, `rotation(i)` for each index; apply to container. Pivot at bottom-center for natural “lift” (y decrease = card goes up).
- **Performance**: If hand animates every frame, only update card transforms, not recreate Graphics/Text. Reuse card objects and update position/scale/rotation.

---

## 6. Implementation Order

1. **Layout**: Switch to overlapping arc layout (x spacing, y arc, optional rotation), pivot at bottom-center. No hover yet.
2. **Visual**: Increase card size, add cost/name/effect layout and optional art placeholder; improve border/shadow.
3. **Hover**: Add hover state, lift + scale + z-order; optional spread.
4. **Unplayable**: Dim unplayable cards, disable hover lift for them.
5. **Animation**: Add simple lerp for hover transitions (and later draw/discard if desired).

---

## 7. Reference (Slay the Spire / Hearthstone)

- **Slay the Spire**: Arc hand, overlap, hover lifts card up and scales it; card has cost orb, name, art, description.
- **Hearthstone**: Similar arc + overlap; hover brings card up and forward with scale; golden glow on hover.
- Both use a single “row” of cards with curve and overlap; no stacking in depth except hover.
