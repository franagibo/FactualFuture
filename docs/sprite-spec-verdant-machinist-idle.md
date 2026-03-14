# Verdant Machinist – 25-Frame Idle Sprite Sheet Spec

## Atlas layout (Unity / Godot)

| Property | Value |
|----------|--------|
| **Layout** | 5 columns × 5 rows |
| **Frames** | 25 (index 0–24) |
| **Cell size** | 900 × 900 px |
| **Total texture** | 4500 × 4500 px |
| **Background** | Transparent (alpha) |
| **Loop** | Frame 0 = Frame 24 (Frame 1 = Frame 25 in 1-based) |

## Grid alignment

- Origin: **top-left** (0, 0).
- Cell (col, row): left = `col * 900`, top = `row * 900`.
- No scaling or padding; each frame is exactly 900×900.
- Pixel-perfect: no half-pixel offsets; all art aligned to integer grid.

## Character reference

- **Design**: Chibi biomechanical plant cultivator (hooded, glowing orange-yellow eyes, dark suit).
- **Growth**: Dense green vines and small orange/red flowers (use “fully grown” look from reference frames 11–15).
- **Facing**: Same as reference – slightly to viewer’s right, consistent across all 25 frames.
- **Scale**: Same character size in every cell; only pose/motion change.

## Idle animation arc (25 frames)

Goal: subtle, alive idle (breathing, vine sway, eye flicker) with **Frame 0 = Frame 24** for a seamless loop.

| Frames | Phase | Motion |
|--------|--------|--------|
| **0–1** | Rest | Neutral pose (this pose = frame 24). |
| **2–5** | Inhale | Slight chest/body rise; vines very subtle lift. |
| **6–9** | Hold | Peak of “breath”; eyes can have a soft glow pulse. |
| **10–13** | Exhale | Body and vines settle back toward neutral. |
| **14–17** | Settle | Gentle vine sway (left→right or right→left). |
| **18–21** | Sway back | Vines return; maybe a very small eye flicker. |
| **22–24** | Return | Ease back into exact Frame 0 pose so 24 = 0. |

**Loop rule**: Pose at frame **0** and frame **24** must be **identical** (same pixels) so the loop is seamless.

## Per-frame checklist

- [ ] Same facing direction as reference.
- [ ] Same character scale in all 25 cells.
- [ ] Transparent background (no opaque BG).
- [ ] 900×900 px per cell; total 4500×4500.
- [ ] No subpixel or rotated placement; strict grid.
- [ ] Frame 0 = Frame 24 for perfect idle loop.
- [ ] Motion: breath + vine sway + optional eye pulse only; no walk/run.

## Unity

- Slice: Grid By Cell Count 5×5, Cell Size 900×900, Pivot e.g. Bottom Center.
- Use **Sprite Mode: Multiple** and slice; frame order left→right, top→bottom (row-major).

## Godot

- Import as texture; create **Atlas** or **SpriteFrames**.
- Sub-regions: 5×5 grid, each 900×900; name frames e.g. `idle_00` … `idle_24`.
- Animate FPS so 25 frames at ~12–15 FPS ≈ 1.7–2 s loop.

## File naming suggestion

- `verdant_machinist_idle_5x5_4500.png` (or your project’s naming for 5×5 idle atlases).
