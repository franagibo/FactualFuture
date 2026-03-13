import type { GameState } from '../types';
import type { CardDef } from '../cardDef';
import type { EnemyDef, EncounterDef, EventDef, RelicDef } from '../loadData';
import type { CharacterDef } from '../loadData';
import type { ActConfigEncounter } from '../encounterPicker';
import type { ShopPoolConfig } from '../run';
import {
  startRun,
  getAvailableNextNodes,
  chooseNode,
  afterCombatWin,
  chooseCardReward,
  restHeal,
  leaveShop,
  executeEventChoice,
  getRunPhaseAfterBossWin,
  advanceToNextAct,
  isBossNode,
  purchaseCard,
  purchaseRelic,
} from '../run';
import { startCombatFromRunState, playCard, endTurn, processHpThresholdTriggers } from '../combat';
import { cardDamageValue, cardBlockValue, enumerateCandidateActions, type CandidateAction } from './strategyBot';
import { pickActionLearned, setLearnedPolicy, type LearnedPolicyConfig } from './learnedPolicy';
import { pickEncounterForNode } from '../encounterPicker';
import { runRelics } from '../relicRunner';
import { createSeededRng } from '../rng';
import { pickAction, type BotAction } from './strategyBot';
import { detectArchetypesFromState, type ArchetypeContext, detectArchetypes } from './archetypes';
import type { ActConfig } from '../map/mapGenerator';

export interface SimulatorOptions {
  /** Character id; used with charactersMap to get starterDeck, startingMaxHp, starterRelicId. */
  characterId?: string;
  /** Character definitions; required if characterId is set. */
  charactersMap?: Map<string, CharacterDef>;
  /** Override: starter deck (used when characterId not set or for testing). */
  starterDeck?: string[];
  /** Override: starting max HP. */
  startingMaxHp?: number;
  /** Override: starter relic id. */
  starterRelicId?: string;
  /** Act configs keyed by act1, act2, ... Must include typeWeights and encounter pools. */
  mapConfig: Record<string, ActConfigEncounter & ActConfig>;
  cardsMap: Map<string, CardDef>;
  enemyDefs: Map<string, EnemyDef>;
  encountersMap: Map<string, EncounterDef>;
  relicDefs?: Map<string, RelicDef>;
  /** Event pool for event nodes (can be empty to use stub). */
  eventPool?: EventDef[];
  /** Reward card pool for combat wins and treasure (e.g. character card pool). */
  rewardCardPool: string[];
  /** Shop pool for shop nodes (can be undefined to skip shop content). */
  shopPool?: ShopPoolConfig;
  /** Auto-pick rewards based on archetype-aware scoring (default true). */
  autoDraftRewards?: boolean;
  /** Auto-buy shop items based on archetype-aware scoring (default true). */
  autoShop?: boolean;
  /** Optional custom bot for simulator runs (defaults to heuristic pickAction). */
  bot?: (
    state: GameState,
    cardsMap: Map<string, CardDef>,
    enemyDefs: Map<string, EnemyDef>,
    archetypeContext: ArchetypeContext
  ) => BotAction;
  /** When true, use learned policy bot if configured, otherwise fall back to heuristic. */
  useLearnedPolicyBot?: boolean;
  /** Optional policy config to set for this run (overrides any globally cached one). */
  learnedPolicyConfig?: LearnedPolicyConfig | null;
  /** When true, only keep first combat metrics per run (saves memory during large data collection). */
  minimalRunMetrics?: boolean;
  /** Max turns per combat before forcing a loss (avoids infinite loops e.g. VM plants tanking). Default 99. */
  maxCombatTurns?: number;
}

export interface CombatMetrics {
  encounterId: string;
  win: boolean;
  turns: number;
  hpStart: number;
  hpEnd: number;
  damageTaken: number;
}

export interface RunMetrics {
  seed: number;
  result: 'win' | 'lose';
  floorReached: number;
  combats: CombatMetrics[];
  finalHp: number;
}

function resolveOptions(opts: SimulatorOptions): {
  starterDeck: string[];
  startingMaxHp: number;
  starterRelicId: string | undefined;
  characterId: string | undefined;
} {
  let starterDeck = opts.starterDeck;
  let startingMaxHp = opts.startingMaxHp;
  let starterRelicId = opts.starterRelicId;
  let characterId = opts.characterId;

  if (opts.characterId && opts.charactersMap) {
    const c = opts.charactersMap.get(opts.characterId);
    if (c) {
      characterId = c.id;
      if (!starterDeck?.length) starterDeck = c.starterDeck;
      if (startingMaxHp == null) startingMaxHp = c.startingMaxHp ?? 70;
      if (starterRelicId == null) starterRelicId = c.starterRelicId;
    }
  }

  const deck = starterDeck?.length ? starterDeck : [
    'strike', 'strike', 'strike', 'strike', 'strike',
    'defend', 'defend', 'defend', 'defend',
    'bash',
  ];
  return {
    starterDeck: deck,
    startingMaxHp: startingMaxHp ?? 70,
    starterRelicId,
    characterId,
  };
}

export type DecisionSampleHook = (args: {
  state: GameState;
  cardsMap: Map<string, CardDef>;
  enemyDefs: Map<string, EnemyDef>;
  archetypeContext: ArchetypeContext;
  candidates: CandidateAction[];
  chosenIndex: number;
}) => void;

/** Called once when a combat ends with the win/loss result. Used to tag decision samples with outcome. */
export type CombatEndHook = (combatWon: boolean) => void;

/** Called when a full run ends (win or lose). Use to tag samples with run-level outcome. */
export type RunEndHook = (runWon: boolean) => void;

/** Default cap on combat length so simulation cannot hang (e.g. VM with plants tanking indefinitely). */
const DEFAULT_MAX_COMBAT_TURNS = 99;

export function runCombatToConclusion(
  state: GameState,
  cardsMap: Map<string, CardDef>,
  enemyDefs: Map<string, EnemyDef>,
  encountersMap: Map<string, EncounterDef>,
  relicDefs: Map<string, RelicDef> | undefined,
  archetypeContext: ArchetypeContext,
  bot: (
    state: GameState,
    cardsMap: Map<string, CardDef>,
    enemyDefs: Map<string, EnemyDef>,
    archetypeContext: ArchetypeContext
  ) => BotAction = pickAction,
  onDecision?: DecisionSampleHook,
  onCombatEnd?: CombatEndHook,
  opts?: { maxCombatTurns?: number }
): { state: GameState; combatMetrics: CombatMetrics } {
  const encounterId = state.currentEncounter ?? '';
  const hpStart = state.playerHp;
  let turns = state.turnNumber ?? 1;
  const maxTurns = opts?.maxCombatTurns ?? DEFAULT_MAX_COMBAT_TURNS;

  let next = state;
  if (relicDefs) {
    next = runRelics(next, 'onCombatStart', relicDefs);
    next = runRelics(next, 'onTurnStart', relicDefs);
  }

  while (next.runPhase === 'combat' && next.combatResult !== 'win' && next.combatResult !== 'lose') {
    if ((next.turnNumber ?? 1) > maxTurns) {
      next = { ...next, combatResult: 'lose' };
      break;
    }
    if (next.phase !== 'player') {
      next = endTurn(next, cardsMap, enemyDefs);
      if (relicDefs) next = runRelics(next, 'onTurnStart', relicDefs);
      turns = next.turnNumber ?? turns;
      continue;
    }

    const candidates = enumerateCandidateActions(next, cardsMap);
    const action = bot(next, cardsMap, enemyDefs, archetypeContext);

    if (onDecision) {
      const chosenIndex = candidates.findIndex((c) => {
        if (action.type === 'endTurn' && c.action.type === 'endTurn') return true;
        if (action.type === 'play' && c.action.type === 'play') {
          return (
            c.action.cardId === action.cardId &&
            c.action.targetIndex === action.targetIndex
          );
        }
        return false;
      });

      onDecision({
        state: next,
        cardsMap,
        enemyDefs,
        archetypeContext,
        candidates,
        chosenIndex: chosenIndex >= 0 ? chosenIndex : candidates.length - 1,
      });
    }
    if (action.type === 'endTurn') {
      next = endTurn(next, cardsMap, enemyDefs);
      if (relicDefs) next = runRelics(next, 'onTurnStart', relicDefs);
      turns = next.turnNumber ?? turns;
      continue;
    }

    next = playCard(next, action.cardId, action.targetIndex, cardsMap, enemyDefs);
    next = processHpThresholdTriggers(next, enemyDefs);
  }

  const hpEnd = next.playerHp;
  const damageTaken = Math.max(0, hpStart - hpEnd);

  const combatMetrics: CombatMetrics = {
    encounterId,
    win: next.combatResult === 'win',
    turns,
    hpStart,
    hpEnd,
    damageTaken,
  };

  if (onCombatEnd) {
    onCombatEnd(next.combatResult === 'win');
  }

  return { state: next, combatMetrics };
}

function scoreRewardCard(
  cardId: string,
  archetype: ArchetypeContext,
  cardsMap: Map<string, CardDef>,
  state: GameState
): number {
  const card = cardsMap.get(cardId);
  if (!card) return -1000;

  if (card.isCurse) return -500;
  if (card.isStatus) return -200;

  let score = 0;

  const effects = card.effects ?? [];
  const hasDamage = effects.some(
    (e) => (e.type === 'damage' || e.type === 'multiHit' || e.type === 'damageAll') && e.target === 'enemy'
  );
  const hasBlock = effects.some((e) => e.type === 'block' || e.type === 'doubleBlock');
  const hasStrength =
    effects.some((e) => e.type === 'strength' || (e.strengthScale ?? 0) > 0);
  const hasVulnerable = effects.some(
    (e) => e.type === 'vulnerable' || e.type === 'vulnerableAll'
  );
  const hasAoe = effects.some((e) => e.type === 'damageAll');
  const hasExhaustSynergy = effects.some((e) =>
    [
      'exhaustRandom',
      'exhaustHand',
      'exhaustHandNonAttack',
      'exhaustHandNonAttackGainBlock',
      'exhaustHandDealDamage',
      'exhume',
    ].includes(e.type)
  );

  const dmgEstimate = cardDamageValue(card, state);
  const blockEstimate = cardBlockValue(card);
  score += dmgEstimate * 0.8 + blockEstimate * 0.6;
  score -= card.cost * 2;

  if (archetype.primary === 'strength' || archetype.secondary === 'strength') {
    if (hasStrength) score += 15;
    if (hasDamage && hasStrength) score += 10;
  }

  if (archetype.primary === 'block_barricade' || archetype.secondary === 'block_barricade') {
    if (hasBlock) score += 12;
    if (effects.some((e) => e.type === 'damageEqualToBlock')) score += 18;
  }

  if (archetype.primary === 'exhaust' || archetype.secondary === 'exhaust') {
    if (hasExhaustSynergy || card.exhaust) score += 15;
  }

  if (archetype.primary === 'vulnerable_loop' || archetype.secondary === 'vulnerable_loop') {
    if (hasVulnerable) score += 18;
  }

  if (archetype.primary === 'aoe_finisher' || archetype.secondary === 'aoe_finisher') {
    if (hasAoe) score += 20;
  }

  // Verdant Machinist: archetype-aware reward scoring.
  if (state.characterId === 'verdant_machinist') {
    const hasSummonPlant = effects.some((e) => e.type === 'summon_plant');
    const hasGrowPlant = effects.some((e) => e.type === 'grow_plant');
    const hasEvolvePlant = effects.some((e) => e.type === 'evolve_plant');
    const hasSacrificePlant = effects.some((e) => e.type === 'sacrifice_plant');
    const hasBlockToPlant = effects.some((e) => e.type === 'blockToPlant');
    const hasPlantModeDefense = effects.some(
      (e) => e.type === 'plant_mode' && (e as { mode?: string }).mode === 'defense'
    );
    if (archetype.primary === 'plant_swarm' || archetype.secondary === 'plant_swarm') {
      if (hasSummonPlant) score += 18;
      if (hasAoe) score += 12;
    }
    if (archetype.primary === 'plant_evolution' || archetype.secondary === 'plant_evolution') {
      if (hasGrowPlant) score += 14;
      if (hasEvolvePlant) score += 20;
    }
    if (archetype.primary === 'plant_sacrifice' || archetype.secondary === 'plant_sacrifice') {
      if (hasSacrificePlant) score += 18;
      if (hasDamage && hasSacrificePlant) score += 10;
    }
    if (archetype.primary === 'plant_defense' || archetype.secondary === 'plant_defense') {
      if (hasBlock) score += 10;
      if (hasBlockToPlant) score += 16;
      if (hasPlantModeDefense) score += 12;
    }
  }

  return score;
}

export function singleRun(
  seed: number,
  opts: SimulatorOptions,
  hooks?: {
    onDecision?: DecisionSampleHook;
    onCombatEnd?: CombatEndHook;
    onRunEnd?: RunEndHook;
  }
): RunMetrics {
  const resolved = resolveOptions(opts);
  const rng = createSeededRng(seed);
  const actConfig = opts.mapConfig['act1'];
  if (!actConfig) {
    hooks?.onRunEnd?.(false);
    return { seed, result: 'lose', floorReached: 0, combats: [], finalHp: resolved.startingMaxHp };
  }

  let state = startRun(seed, actConfig, {
    starterDeck: resolved.starterDeck,
    characterId: resolved.characterId,
    starterRelicId: resolved.starterRelicId,
    startingMaxHp: resolved.startingMaxHp,
    rng,
  });

  const combats: CombatMetrics[] = [];
  const eventPool = opts.eventPool ?? [];
  const rewardCardPool = opts.rewardCardPool?.length ? opts.rewardCardPool : ['strike', 'defend', 'bash'];
  const shopPool = opts.shopPool;

  while (state.runPhase === 'map' || state.runPhase === 'combat' || state.runPhase === 'reward' || state.runPhase === 'rest' || state.runPhase === 'shop' || state.runPhase === 'event') {
    if (state.runPhase === 'map') {
      const available = getAvailableNextNodes(state);
      if (available.length === 0) break;
          const nodeId = available[Math.floor(rng() * available.length)];
      const actKey = `act${state.act ?? 1}`;
      const currentActConfig = opts.mapConfig[actKey];
      const encounterId = currentActConfig ? pickEncounterForNode(state, nodeId, currentActConfig, rng) : null;

      state = chooseNode(
        state,
        nodeId,
        encounterId,
        opts.cardsMap,
        opts.enemyDefs,
        opts.encountersMap,
        eventPool,
        shopPool,
        rewardCardPool
      );

      if (state.runPhase === 'combat') {
        const archetypeContext = detectArchetypes(state.deck ?? [], opts.cardsMap, state.relics ?? []);

        if (opts.learnedPolicyConfig !== undefined) {
          setLearnedPolicy(opts.learnedPolicyConfig);
        }

        const combatBot: (
          s: GameState,
          cm: Map<string, CardDef>,
          ed: Map<string, EnemyDef>,
          ac: ArchetypeContext
        ) => BotAction =
          opts.bot ??
          (opts.useLearnedPolicyBot
            ? (s, cm, ed, ac) => {
                try {
                  return pickActionLearned(s, cm, ed, ac);
                } catch {
                  return pickAction(s, cm, ed, ac);
                }
              }
            : pickAction);

        const { state: afterCombat, combatMetrics } = runCombatToConclusion(
          state,
          opts.cardsMap,
          opts.enemyDefs,
          opts.encountersMap,
          opts.relicDefs,
          archetypeContext,
          combatBot,
          hooks?.onDecision,
          hooks?.onCombatEnd,
          { maxCombatTurns: opts.maxCombatTurns }
        );
        state = afterCombat;
        if (opts.minimalRunMetrics) {
          if (combats.length === 0) combats.push(combatMetrics);
        } else {
          combats.push(combatMetrics);
        }

        if (state.combatResult === 'lose') {
          hooks?.onRunEnd?.(false);
          return {
            seed,
            result: 'lose',
            floorReached: state.floor ?? 0,
            combats,
            finalHp: state.playerHp,
          };
        }

        if (isBossNode(state)) {
          const runPhase = getRunPhaseAfterBossWin(state);
          state = { ...state, runPhase, currentEncounter: null, enemies: [], combatResult: null, rewardCardChoices: undefined };
          if (runPhase === 'victory') {
            hooks?.onRunEnd?.(true);
            return { seed, result: 'win', floorReached: state.floor ?? 0, combats, finalHp: state.playerHp };
          }
          if (runPhase === 'actComplete') {
            state = advanceToNextAct(state, opts.mapConfig as Record<string, ActConfig & Record<string, unknown>>);
          }
          continue;
        }

        const encounterIdBefore = state.currentEncounter;
        state = afterCombatWin(state, rewardCardPool, opts.cardsMap);
        const wasMonster =
          encounterIdBefore != null &&
          currentActConfig &&
          currentActConfig.bossEncounter !== encounterIdBefore &&
          !(currentActConfig.eliteEncounterPool ?? []).includes(encounterIdBefore);
        if (wasMonster) {
          state = {
            ...state,
            monsterEncountersCompletedThisAct: (state.monsterEncountersCompletedThisAct ?? 0) + 1,
            lastMonsterEncounterIds: [...(state.lastMonsterEncounterIds ?? []), encounterIdBefore].slice(-2),
          };
        }
        if (opts.relicDefs) state = runRelics(state, 'onCombatEnd', opts.relicDefs);
      }
      continue;
    }

    if (state.runPhase === 'reward') {
      if (!opts.autoDraftRewards && opts.autoDraftRewards !== undefined) {
        const choice = state.rewardCardChoices?.[0];
        state = choice ? chooseCardReward(state, choice) : { ...state, runPhase: 'map', rewardCardChoices: undefined };
        continue;
      }

      const choices = state.rewardCardChoices ?? [];
      if (!choices.length) {
        state = { ...state, runPhase: 'map', rewardCardChoices: undefined };
        continue;
      }

      const archetypeContext = detectArchetypesFromState(state, opts.cardsMap);
      let bestId = choices[0];
      let bestScore = -Infinity;
      for (const id of choices) {
        const s = scoreRewardCard(id, archetypeContext, opts.cardsMap, state);
        if (s > bestScore) {
          bestScore = s;
          bestId = id;
        }
      }
      state = chooseCardReward(state, bestId);
      continue;
    }

    if (state.runPhase === 'rest') {
      state = restHeal(state);
      continue;
    }

    if (state.runPhase === 'shop') {
      if (opts.autoShop ?? true) {
        const archetypeContext = detectArchetypesFromState(state, opts.cardsMap);
        let next = state;
        let improved = true;
        while (improved && next.shopState) {
          improved = false;
          let bestItem: { type: 'card' | 'relic'; id: string; score: number } | null = null;

          for (const id of next.shopState.cardIds) {
            const price = next.shopState.cardPrices[id];
            if (price == null || (next.gold ?? 0) < price) continue;
            const s = scoreRewardCard(id, archetypeContext, opts.cardsMap, next);
            if (!bestItem || s > bestItem.score) {
              bestItem = { type: 'card', id, score: s };
            }
          }

          if (opts.relicDefs) {
            for (const id of next.shopState.relicIds) {
              const price = next.shopState.relicPrices[id];
              if (price == null || (next.gold ?? 0) < price) continue;
              const s = 25;
              if (!bestItem || s > bestItem.score) {
                bestItem = { type: 'relic', id, score: s };
              }
            }
          }

          if (bestItem && bestItem.score > 0) {
            improved = true;
            if (bestItem.type === 'card') {
              next = purchaseCard(next, bestItem.id);
            } else {
              next = purchaseRelic(next, bestItem.id);
            }
          }
        }
        state = leaveShop(next);
      } else {
        state = leaveShop(state);
      }
      continue;
    }

    if (state.runPhase === 'event') {
      state = executeEventChoice(state, 0);
      continue;
    }

    break;
  }

  const runWon = state.runPhase === 'victory';
  hooks?.onRunEnd?.(runWon);
  return {
    seed,
    result: runWon ? 'win' : 'lose',
    floorReached: state.floor ?? 0,
    combats,
    finalHp: state.playerHp,
  };
}

/**
 * Run N simulated runs and return metrics for each plus aggregates.
 * When seedList is provided, N is seedList.length and each run uses seedList[i]; otherwise seeds are seedBase + i.
 */
export function runSimulation(
  options: SimulatorOptions,
  N: number,
  seedBase: number = 0,
  hooks?: {
    onDecision?: DecisionSampleHook;
    onCombatEnd?: CombatEndHook;
    onRunEnd?: RunEndHook;
  },
  seedList?: number[]
): { runs: RunMetrics[]; winRate: number; avgFloorReached: number; avgHpAfterFirstCombat: number } {
  const seeds = seedList ?? Array.from({ length: N }, (_, i) => seedBase + i);
  const runs: RunMetrics[] = [];
  for (let i = 0; i < seeds.length; i++) {
    runs.push(singleRun(seeds[i], options, hooks));
  }

  const wins = runs.filter((r) => r.result === 'win').length;
  const winRate = N > 0 ? wins / N : 0;
  const avgFloorReached = N > 0 ? runs.reduce((s, r) => s + r.floorReached, 0) / N : 0;
  const firstCombatHp = runs.filter((r) => r.combats.length >= 1).map((r) => r.combats[0].hpEnd);
  const avgHpAfterFirstCombat =
    firstCombatHp.length > 0 ? firstCombatHp.reduce((a, b) => a + b, 0) / firstCombatHp.length : 0;

  return {
    runs,
    winRate,
    avgFloorReached,
    avgHpAfterFirstCombat,
  };
}
