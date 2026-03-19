# Fight UI Layout Spec (1920×1080)

This document is the **single source of truth** for fight UI sizing/placement. All fight UI art and layout constants should be authored against this spec.

## Design resolution
- **Internal combat resolution**: **1920×1080 (16:9)**
- **Scaling rule**: letterbox (**contain**) into the window; do not stretch.
- **Art export rule**: export UI art at **2×** (for crispness), then downscale in-game.

## Global spacing
- **Safe margin**: 24px (keep critical text/icons inside)
- **Grid**: 8px increments for offsets/sizes

## Screen zones
- **Header zone**: 96px tall (top)
- **Stage zone**: from y=96 down to y=1080 (full remaining height)
- **No footer**: combat uses full-height background. The “hand area” is implied by where cards sit.

## Player + enemies (stage framing)
- **Baseline (feet)**: y=820
- **Player box**: 320×420, anchored at feet on baseline, centered around x≈0.28w
- **Enemy box (medium)**: 260×320, anchored at feet on baseline, centered around right side
- **Enemy gap**: 32px between enemies

## HUD bars
### Player HP + Shield (stacked under player)
- **Bar width**: 240px
- **Bar height**: 24px
- **Gap between bars**: 6px
- **Text**: 14–16px centered

### Enemy HP + Shield (stacked inside enemy frame)
- **Bar width**: 120px
- **Bar height**: 18px
- **Gap between bars**: 4px
- **Text**: 11–12px centered

## Cards (hand)
- **Card size**: 160×240
- **Resting position**: cards are **partially off-screen** at the bottom (“peek”).
- **Peek height (visible at rest)**: ~120px (half the card)
- **Hover behavior**: hovered/selected card becomes **fully visible** while staying visually anchored to the bottom edge.
- **Extra hover reveal**: lift by \((cardHeight - peekHeight)\) plus a small additional lift for readability.
- **Hover lift (extra)**: 32px (used as a small additive feel component)
- **Hover scale**: 1.06
- **Overlap ratio**: 0.60
- **Max fan angle**: 34°

### Card UI placement (relative to card top-left)
These are tuned to the **current empty card template**.
- **Cost circle center**: (26, 26)
- **Name**: centered at x=80, y=14
- **Description**: x=16, y=160, wrap width≈128

## Status/intent placement (recommended)
- **Enemy intent**: 24×24 near top-left of enemy box (plus value label)
- **Enemy statuses**: vertical pills on the right side of enemy box; show max 4 + “+N”
- **Player statuses**: under player HP/shield bars (wrap rows)

