import type { GameState } from './types';
import type { RelicDef } from './loadData';

export type RelicEvent = 'onCombatStart' | 'onTurnStart' | 'onCombatEnd' | 'onCardPlay' | 'passive';

/**
 * Run all applicable relics for the given event. Returns new state.
 * Relics only modify state; no UI.
 */
export function runRelics(
  state: GameState,
  event: RelicEvent,
  relicDefs: Map<string, RelicDef>
): GameState {
  const relicIds = state.relics ?? [];
  let next = { ...state };

  for (const relicId of relicIds) {
    const def = relicDefs.get(relicId);
    if (!def) continue;
    for (const trigger of def.triggers) {
      if (trigger.when !== event) continue;
      const eff = trigger.effect;
      if (event === 'onTurnStart' && (eff as { firstTurnOnly?: boolean }).firstTurnOnly && (state.turnNumber ?? 0) !== 0) {
        continue;
      }
      switch (eff.type) {
        case 'maxHp':
          if (eff.value != null) {
            next = {
              ...next,
              playerMaxHp: (next.playerMaxHp ?? next.playerHp) + eff.value,
              playerHp: (next.playerHp ?? 0) + eff.value,
            };
          }
          break;
        case 'energy':
          if (eff.value != null) {
            next = { ...next, energy: next.energy + eff.value, maxEnergy: (next.maxEnergy ?? 3) + 0 };
          }
          break;
        case 'block':
          if (eff.value != null) {
            next = { ...next, playerBlock: (next.playerBlock ?? 0) + eff.value };
          }
          break;
        case 'heal':
          if (eff.value != null) {
            const maxHp = next.playerMaxHp ?? next.playerHp ?? 0;
            const healed = Math.min(eff.value, Math.max(0, maxHp - next.playerHp));
            next = { ...next, playerHp: next.playerHp + healed };
          }
          break;
        case 'strength':
          if (eff.value != null) {
            next = { ...next, strengthStacks: (next.strengthStacks ?? 0) + eff.value };
          }
          break;
        case 'draw':
          // Would need to call drawOne from effectRunner - for now skip or add a simple draw
          break;
        default:
          break;
      }
    }
  }
  return next;
}
