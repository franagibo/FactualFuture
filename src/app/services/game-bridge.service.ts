import { Injectable, signal } from '@angular/core';
import { playCard as enginePlayCard, endTurn as engineEndTurn } from '../../engine/combat';
import { loadCards, loadEnemies, loadEncounters } from '../../engine/loadData';
import {
  startRun as engineStartRun,
  getAvailableNextNodes as engineGetAvailableNextNodes,
  chooseNode as engineChooseNode,
  afterCombatWin as engineAfterCombatWin,
  chooseCardReward as engineChooseCardReward,
  restHeal as engineRestHeal,
  restRemoveCard as engineRestRemoveCard,
  leaveShop as engineLeaveShop,
  executeEventChoice as engineExecuteEventChoice,
  isBossNode as engineIsBossNode,
  getNodeById as engineGetNodeById,
  purchaseCard as enginePurchaseCard,
  purchaseRelic as enginePurchaseRelic,
  getRunPhaseAfterBossWin as engineGetRunPhaseAfterBossWin,
  advanceToNextAct as engineAdvanceToNextAct,
  usePotion as engineUsePotion,
  pickRandomPotionByRarity as enginePickRandomPotionByRarity,
  type ShopPoolConfig
} from '../../engine/run';
import type { CharacterDef } from '../../engine/loadData';
import { loadCharacters } from '../../engine/loadData';
import type { GameState, MetaState, RunPhase } from '../../engine/types';
import type { CardDef } from '../../engine/cardDef';
import type { EnemyDef, EncounterDef, EventDef, PotionDef, RelicDef } from '../../engine/loadData';
import { loadEvents, loadPotions, loadRelics } from '../../engine/loadData';
import { runRelics } from '../../engine/relicRunner';
import type { ActConfig } from '../../engine/map/mapGenerator';
import { GAME_BALANCE } from '../constants/game-balance.constants';
import { logger } from '../util/app-logger';

/** Act config as stored in mapConfig.json: ActConfig plus encounter pools for the bridge. */
export interface MapConfigAct extends ActConfig {
  encounterPool?: string[];
  eliteEncounterPool?: string[];
  bossEncounter?: string;
  encounterWeights?: Record<string, number>;
  eliteEncounterWeights?: Record<string, number>;
}

// Re-export loadData types
type CardsMap = Map<string, CardDef>;
type EnemyDefsMap = Map<string, EnemyDef>;
type EncountersMap = Map<string, EncounterDef>;
type RelicDefsMap = Map<string, RelicDef>;

const DATA_BASE = 'data';
const MAP_CONFIG_PATH = `${DATA_BASE}/mapConfig.json`;
const RUN_SAVE_KEY = 'run-save.json';
const META_SAVE_KEY = 'meta.json';

/** Unlocks granted when reaching Act 2 for the first time. */
const UNLOCK_ON_ACT2_CARDS = ['plasma_shot', 'reactive_plating', 'overclock'];
const UNLOCK_ON_ACT2_RELICS = ['plating_fragment'];
/** Unlock granted on run victory. */
const UNLOCK_ON_VICTORY_RELIC = 'turbo_injector';

declare const window: Window & { electronAPI?: { readSave: (path: string) => Promise<unknown>; writeSave: (path: string, data: unknown) => Promise<void> } };

/**
 * Bridge between Angular UI and pure TypeScript engine.
 * Holds engine state and loaded data; only passes serializable commands.
 */
@Injectable({ providedIn: 'root' })
export class GameBridgeService {
  private state: GameState | null = null;
  /** Exposed so components can read state without calling getState() on every CD. */
  readonly stateSignal = signal<GameState | null>(null);
  private cardsMap: CardsMap | null = null;
  private enemyDefs: EnemyDefsMap | null = null;
  private encountersMap: EncountersMap | null = null;
  private mapConfig: Record<string, MapConfigAct> | null = null;
  private rewardCardPool: string[] | null = null;
  private dataLoadFailed = false;
  private dataLoadErrorMessage: string | null = null;
  private eventPool: EventDef[] | null = null;
  private relicDefs: RelicDefsMap | null = null;
  private shopPoolsByAct: Record<string, ShopPoolConfig> = {};
  private potionDefs: Map<string, PotionDef> = new Map();
  private charactersMap: Map<string, CharacterDef> = new Map();
  private meta: MetaState = {
    unlockedCards: [],
    unlockedRelics: [],
    highestActReached: 0,
    runStats: { combatsWon: 0, goldSpent: 0 },
  };

  getState(): GameState | null {
    return this.state;
  }

  private setState(next: GameState | null): void {
    this.state = next;
    this.stateSignal.set(next);
  }

  getCardDef(cardId: string): CardDef | undefined {
    return this.cardsMap?.get(cardId);
  }

  /** All known card ids from loaded data (used for asset preloading). */
  getAllCardIds(): string[] {
    return this.cardsMap ? Array.from(this.cardsMap.keys()) : [];
  }

  /** Card ids to preload for current run (current character pool). Use for card art to avoid loading every card. */
  getCardPoolIdsForPreload(): string[] {
    if (!this.state) return this.getFullPlayableCardPool();
    const actKey = `act${this.state.act ?? 1}`;
    return this.getRewardCardPoolForAct(actKey);
  }

  getRelicName(relicId: string): string {
    return this.relicDefs?.get(relicId)?.name ?? relicId;
  }

  getRelicDescription(relicId: string): string {
    return this.relicDefs?.get(relicId)?.description ?? '';
  }

  getPotionDef(potionId: string): PotionDef | undefined {
    return this.potionDefs.get(potionId);
  }

  getPotions(): string[] {
    return this.state?.potions ?? [];
  }

  usePotion(potionId: string, targetEnemyIndex?: number): void {
    if (!this.state) return;
    const def = this.potionDefs.get(potionId);
    this.setState(engineUsePotion(this.state, potionId, targetEnemyIndex ?? null, def, this.cardsMap ?? undefined));
    this.maybeHandleCombatWin();
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status} ${r.statusText}`);
    return r.json() as Promise<T>;
  }

  /** True if the last ensureDataLoaded() failed. Check before starting a run. */
  isDataLoadFailed(): boolean {
    return this.dataLoadFailed;
  }

  /** User-facing message when data load failed, or null. */
  getDataLoadErrorMessage(): string | null {
    return this.dataLoadErrorMessage;
  }

  /** Clear data load error state (e.g. after user clicks Retry). */
  clearDataLoadError(): void {
    this.dataLoadFailed = false;
    this.dataLoadErrorMessage = null;
  }

  async ensureDataLoaded(): Promise<void> {
    if (
      this.cardsMap &&
      this.enemyDefs &&
      this.encountersMap &&
      this.mapConfig &&
      this.rewardCardPool != null &&
      this.eventPool !== null &&
      this.relicDefs !== null
    ) {
      return;
    }
    this.dataLoadFailed = false;
    this.dataLoadErrorMessage = null;
    try {
      await this.doEnsureDataLoaded();
    } catch (err) {
      this.dataLoadFailed = true;
      this.dataLoadErrorMessage = err instanceof Error ? err.message : 'Data failed to load';
      logger.warn('ensureDataLoaded failed', err);
      throw err;
    }
  }

  private async doEnsureDataLoaded(): Promise<void> {
    const DATA_PATHS = {
      cards: `${DATA_BASE}/cards.json`,
      enemies: `${DATA_BASE}/enemies.json`,
      encounters: `${DATA_BASE}/encounters.json`,
      mapConfig: MAP_CONFIG_PATH,
      events: `${DATA_BASE}/events.json`,
      relics: `${DATA_BASE}/relics.json`,
      shopPools: `${DATA_BASE}/shopPools.json`,
      potions: `${DATA_BASE}/potions.json`,
      characters: `${DATA_BASE}/characters.json`,
    };
    const [cards, enemies, encounters, mapConfig, eventsData, relicsData, shopPoolsData, potionsData, charactersData]: [
      CardDef[],
      EnemyDef[],
      EncounterDef[],
      Record<string, unknown>,
      EventDef[],
      RelicDef[],
      Record<string, ShopPoolConfig>,
      PotionDef[],
      CharacterDef[],
    ] = await Promise.all([
      this.fetchJson<CardDef[]>(DATA_PATHS.cards),
      this.fetchJson<EnemyDef[]>(DATA_PATHS.enemies),
      this.fetchJson<EncounterDef[]>(DATA_PATHS.encounters),
      this.fetchJson<Record<string, unknown>>(DATA_PATHS.mapConfig),
      this.fetchJson<EventDef[]>(DATA_PATHS.events).catch((err) => { logger.warn('Events load failed', DATA_PATHS.events, err); return []; }),
      this.fetchJson<RelicDef[]>(DATA_PATHS.relics).catch((err) => { logger.warn('Relics load failed', DATA_PATHS.relics, err); return []; }),
      this.fetchJson<Record<string, ShopPoolConfig>>(DATA_PATHS.shopPools).catch((err) => { logger.warn('Shop pools load failed', DATA_PATHS.shopPools, err); return {}; }),
      this.fetchJson<PotionDef[]>(DATA_PATHS.potions).catch((err) => { logger.warn('Potions load failed', DATA_PATHS.potions, err); return []; }),
      this.fetchJson<CharacterDef[]>(DATA_PATHS.characters).catch((err) => { logger.warn('Characters load failed', DATA_PATHS.characters, err); return []; }),
    ]);
    this.cardsMap = loadCards(cards);
    this.enemyDefs = loadEnemies(enemies);
    this.encountersMap = loadEncounters(encounters);
    this.mapConfig = mapConfig as Record<string, MapConfigAct>;
    this.rewardCardPool = cards.map((c) => c.id);
    this.eventPool = loadEvents(eventsData);
    this.relicDefs = loadRelics(relicsData);
    this.shopPoolsByAct = shopPoolsData;
    this.potionDefs = loadPotions(potionsData);
    this.charactersMap = loadCharacters(Array.isArray(charactersData) ? charactersData : []);
    await this.loadMeta();
  }

  /** Start a new run. No-op if data load previously failed (call ensureDataLoaded + check isDataLoadFailed first). Uses characterId's starter deck and stores characterId in state. Default character: gungirl. Optional seed for reproducible runs. */
  startRun(characterId: string = 'gungirl', seed?: number): void {
    if (this.dataLoadFailed || !this.mapConfig) return;
    const act1 = this.mapConfig['act1'];
    if (!act1) return;
    const actConfig: ActConfig = {
      combat: act1.combat,
      elite: act1.elite,
      rest: act1.rest,
      shop: act1.shop,
      event: act1.event,
      boss: act1.boss,
      floorCount: act1.floorCount,
      typeWeights: act1.typeWeights,
    };
    const character = this.charactersMap.get(characterId);
    const starterDeck = character?.starterDeck;
    const runSeed = seed ?? (Date.now() & 0xffffffff);
    this.setState(engineStartRun(runSeed, actConfig, {
      starterDeck: starterDeck?.length ? starterDeck : undefined,
      characterId: character ? characterId : undefined,
    }));
  }

  /** Current run seed (if any). Used for display and "New run with seed". */
  getRunSeed(): number | undefined {
    return this.state?.seed;
  }

  getCharacters(): CharacterDef[] {
    return Array.from(this.charactersMap.values());
  }

  getCharacter(id: string): CharacterDef | undefined {
    return this.charactersMap.get(id);
  }

  /** True when the character has frame-by-frame idle animation (e.g. chibi, gungirl). */
  hasAnimatedIdle(characterId: string): boolean {
    if (!characterId) return false;
    const def = this.charactersMap.get(characterId);
    return def?.animatedIdle === true;
  }

  getCurrentCharacterId(): string | undefined {
    return this.state?.characterId;
  }

  clearState(): void {
    this.setState(null);
  }

  /** Save current run to disk (Electron) or localStorage (browser). Call when quitting to menu. */
  saveRun(): void {
    const state = this.getState();
    if (!state || !state.runPhase) return;
    const data = JSON.stringify(state);
    if (typeof window !== 'undefined' && window.electronAPI?.writeSave) {
      window.electronAPI.writeSave(RUN_SAVE_KEY, state);
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem('run-save', data);
    }
  }

  async loadMeta(): Promise<void> {
    let data: unknown = null;
    if (typeof window !== 'undefined' && window.electronAPI?.readSave) {
      data = await window.electronAPI.readSave(META_SAVE_KEY);
    } else if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('meta-save');
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          return;
        }
      }
    }
    if (data != null && typeof data === 'object' && 'highestActReached' in data) {
      const m = data as MetaState;
      const rs = m.runStats;
      this.meta = {
        unlockedCards: Array.isArray(m.unlockedCards) ? m.unlockedCards : [],
        unlockedRelics: Array.isArray(m.unlockedRelics) ? m.unlockedRelics : [],
        highestActReached: typeof m.highestActReached === 'number' ? m.highestActReached : 0,
        runStats: rs && typeof rs.combatsWon === 'number' && typeof rs.goldSpent === 'number'
          ? { combatsWon: rs.combatsWon, goldSpent: rs.goldSpent }
          : { combatsWon: 0, goldSpent: 0 },
      };
    }
  }

  saveMeta(): void {
    if (typeof window !== 'undefined' && window.electronAPI?.writeSave) {
      window.electronAPI.writeSave(META_SAVE_KEY, this.meta);
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem('meta-save', JSON.stringify(this.meta));
    }
  }

  getMeta(): MetaState {
    return { ...this.meta };
  }

  /** Remove saved run so Continue is hidden after starting a new run. */
  clearSavedRun(): void {
    if (typeof window !== 'undefined' && window.electronAPI?.writeSave) {
      window.electronAPI.writeSave(RUN_SAVE_KEY, null);
    } else if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('run-save');
    }
  }

  /** True if a run save exists. */
  async hasSavedRun(): Promise<boolean> {
    if (typeof window !== 'undefined' && window.electronAPI?.readSave) {
      const data = await window.electronAPI.readSave(RUN_SAVE_KEY);
      return data != null && typeof data === 'object' && 'runPhase' in data;
    }
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('run-save');
      if (!raw) return false;
      try {
        const data = JSON.parse(raw);
        return data != null && data.runPhase != null;
      } catch {
        return false;
      }
    }
    return false;
  }

  /** Load saved run into state. Call before navigating to /game for Continue. */
  async loadRun(): Promise<boolean> {
    let data: unknown = null;
    if (typeof window !== 'undefined' && window.electronAPI?.readSave) {
      data = await window.electronAPI.readSave(RUN_SAVE_KEY);
    } else if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('run-save');
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          return false;
        }
      }
    }
    if (data != null && typeof data === 'object' && 'runPhase' in data) {
      this.setState(data as GameState);
      return true;
    }
    return false;
  }

  playCard(cardId: string, target?: number, handIndex?: number): void {
    if (!this.state || !this.cardsMap || !this.enemyDefs) return;
    this.setState(enginePlayCard(this.state, cardId, target ?? null, this.cardsMap, this.enemyDefs, handIndex));
    this.maybeHandleCombatWin();
  }

  endTurn(): void {
    if (!this.state || !this.cardsMap || !this.enemyDefs) return;
    let next = engineEndTurn(this.state, this.cardsMap, this.enemyDefs);
    if (this.relicDefs) next = runRelics(next, 'onTurnStart', this.relicDefs);
    this.setState(next);
    this.maybeHandleCombatWin();
  }

  getRunPhase(): RunPhase | undefined {
    return this.state?.runPhase;
  }

  getAvailableNextNodes(): string[] {
    if (!this.state) return [];
    return engineGetAvailableNextNodes(this.state);
  }

  /**
   * Enemy IDs that may be needed for the next map nodes (combat/elite/boss).
   * Use to preload combat assets when on map so entering combat is smoother.
   */
  getEnemyIdsForNextPossibleEncounters(): string[] {
    if (!this.state?.map || !this.mapConfig || !this.encountersMap) return [];
    const nextIds = engineGetAvailableNextNodes(this.state);
    if (nextIds.length === 0) return [];
    const actKey = `act${this.state.act ?? 1}`;
    const actConfig = this.mapConfig[actKey];
    if (!actConfig) return [];
    const encounterIds = new Set<string>();
    for (const nodeId of nextIds) {
      const node = engineGetNodeById(this.state!.map!, nodeId);
      if (!node) continue;
      if (node.type === 'boss' && actConfig.bossEncounter) {
        encounterIds.add(actConfig.bossEncounter);
      }
      if (node.type === 'elite' && actConfig.eliteEncounterPool?.length) {
        actConfig.eliteEncounterPool.forEach((id) => encounterIds.add(id));
      }
      if ((node.type === 'combat' || node.type === 'elite') && actConfig.encounterPool?.length) {
        actConfig.encounterPool.forEach((id) => encounterIds.add(id));
      }
    }
    const enemyIds = new Set<string>();
    for (const encId of encounterIds) {
      const enc = this.encountersMap!.get(encId);
      if (enc?.enemies) enc.enemies.forEach((eid) => enemyIds.add(eid));
    }
    return Array.from(enemyIds);
  }

  /**
   * Shop pool for the given act. Data-driven: uses shopPools.json for the act (cards, relics, prices, counts).
   * Merges with character cardPoolIds when present (e.g. Gunboy): shop cards = character pool + meta unlockedCards.
   * When character has no cardPoolIds, uses act's base cards from shopPools. Relics = act base + meta unlockedRelics.
   * To add a card to a character's shop: add its id to characters.json cardPoolIds and optionally to shopPools.act1.cards for act-specific availability.
   */
  private getMergedShopPool(actKey: string): ShopPoolConfig | undefined {
    const base = this.shopPoolsByAct[actKey];
    if (!base) return undefined;
    const characterId = this.state?.characterId;
    const character = characterId ? this.charactersMap.get(characterId) : undefined;
    let rawCards: string[];
    if (character?.cardPoolIds && character.cardPoolIds.length > 0) {
      rawCards = [...new Set([...character.cardPoolIds, ...this.meta.unlockedCards])];
    } else {
      rawCards = [...new Set([...(base.cards ?? []), ...this.meta.unlockedCards])];
    }
    if (this.cardsMap) rawCards = rawCards.filter((id) => !this.cardsMap!.get(id)?.isCurse && !this.cardsMap!.get(id)?.isStatus);
    const relics = [...new Set([...(base.relics ?? []), ...this.meta.unlockedRelics])];
    return { ...base, cards: rawCards, relics };
  }

  /** Event pool for current act: events with no act or matching act. */
  private getEventPoolForAct(act: number): EventDef[] {
    return (this.eventPool ?? []).filter((e) => e.act == null || e.act === act);
  }

  /** All card IDs that can appear in rewards (non-curse, non-status). Used when character has no pool or pool is tiny. */
  private getFullPlayableCardPool(): string[] {
    if (!this.cardsMap) return this.rewardCardPool ?? [];
    return (this.rewardCardPool ?? []).filter(
      (id) => this.cardsMap!.get(id) && !this.cardsMap!.get(id)?.isCurse && !this.cardsMap!.get(id)?.isStatus
    );
  }

  /**
   * Reward card pool for the current act. Fully data-driven.
   * - When the run has a character with cardPoolIds (e.g. Gunboy): pool = character.cardPoolIds ∪ meta.unlockedCards.
   * - Starter cards (Strike, Defend, Bash) are filtered out when the pool has >5 cards so rewards favor upgrades.
   * - Curses and status cards are always excluded. If the filtered pool would be <5 cards, returns the full playable pool instead.
   * To add a card to a character's rewards: add its id to data/characters.json under that character's cardPoolIds and ensure the card exists in data/cards.json.
   */
  private getRewardCardPoolForAct(actKey: string): string[] {
    const characterId = this.state?.characterId;
    const character = characterId ? this.charactersMap.get(characterId) : undefined;
    const fullPool = this.getFullPlayableCardPool();
    const base =
      character?.cardPoolIds && character.cardPoolIds.length > 0
        ? character.cardPoolIds
        : fullPool;
    let merged = [...new Set([...base, ...(this.meta.unlockedCards ?? [])])];
    // Filter out curses/status and, when we have enough cards, basic starter cards (e.g. Strike/Defend/Bash)
    // so rewards focus on more interesting upgrades.
    const starterIds = character?.starterDeck ?? [];
    if (this.cardsMap) {
      merged = merged.filter((id) => {
        const def = this.cardsMap!.get(id);
        if (!def) return false;
        if (def.isCurse || def.isStatus) return false;
        // If the pool is large enough, avoid offering pure starter cards as rewards.
        if (starterIds.includes(id) && merged.length > 5) return false;
        return true;
      });
    }
    return merged.length >= 5 ? merged : fullPool;
  }

  /** Pick one id from pool; if weights map is provided use weighted random. */
  private pickEncounter(pool: string[], weights?: Record<string, number>): string {
    if (weights && Object.keys(weights).length > 0) {
      let total = 0;
      for (const id of pool) total += weights[id] ?? 0;
      if (total <= 0) return pool[Math.floor(Math.random() * pool.length)];
      let r = Math.random() * total;
      for (const id of pool) {
        const w = weights[id] ?? 0;
        if (r < w) return id;
        r -= w;
      }
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  chooseNode(nodeId: string): void {
    if (!this.state || !this.cardsMap || !this.enemyDefs || !this.encountersMap || !this.mapConfig) return;
    const actKey = `act${this.state.act ?? 1}`;
    const actConfig = this.mapConfig[actKey];
    let encounterId: string | null = null;
    if (this.state.map) {
      const node = engineGetNodeById(this.state.map, nodeId);
      if (node?.type === 'boss' && actConfig?.bossEncounter) {
        encounterId = actConfig.bossEncounter;
      } else if (node?.type === 'elite' && actConfig?.eliteEncounterPool?.length) {
        encounterId = this.pickEncounter(
          actConfig.eliteEncounterPool,
          actConfig.eliteEncounterWeights
        );
      } else if ((node?.type === 'combat' || node?.type === 'elite') && actConfig?.encounterPool?.length) {
        encounterId = this.pickEncounter(
          actConfig.encounterPool,
          actConfig.encounterWeights
        );
      }
    }
    const shopPool = this.getMergedShopPool(actKey);
    const eventPool = this.getEventPoolForAct(this.state.act ?? 1);
    let next = engineChooseNode(
      this.state,
      nodeId,
      encounterId,
      this.cardsMap,
      this.enemyDefs,
      this.encountersMap,
      eventPool,
      shopPool
    );
    if (next.runPhase === 'combat' && this.relicDefs) {
      next = runRelics(next, 'onCombatStart', this.relicDefs);
      next = runRelics(next, 'onTurnStart', this.relicDefs);
    }
    this.setState(next);
  }

  leaveShop(): void {
    if (!this.state) return;
    this.setState(engineLeaveShop(this.state));
  }

  executeEventChoice(choiceIndex: number): void {
    if (!this.state) return;
    this.setState(engineExecuteEventChoice(this.state, choiceIndex));
  }

  getShopState(): GameState['shopState'] {
    return this.state?.shopState ?? undefined;
  }

  getEventState(): GameState['eventState'] {
    return this.state?.eventState ?? undefined;
  }

  purchaseCard(cardId: string): void {
    if (!this.state) return;
    const price = this.state.shopState?.cardPrices?.[cardId] ?? 0;
    this.setState(enginePurchaseCard(this.state, cardId));
    if (price > 0) {
      this.meta = {
        ...this.meta,
        runStats: { combatsWon: this.meta.runStats?.combatsWon ?? 0, goldSpent: (this.meta.runStats?.goldSpent ?? 0) + price },
      };
      this.saveMeta();
    }
  }

  purchaseRelic(relicId: string): void {
    if (!this.state) return;
    const price = this.state.shopState?.relicPrices?.[relicId] ?? 0;
    this.setState(enginePurchaseRelic(this.state, relicId));
    if (price > 0) {
      this.meta = {
        ...this.meta,
        runStats: { combatsWon: this.meta.runStats?.combatsWon ?? 0, goldSpent: (this.meta.runStats?.goldSpent ?? 0) + price },
      };
      this.saveMeta();
    }
  }

  advanceToNextAct(): void {
    if (!this.state || !this.mapConfig) return;
    const previousAct = this.state.act ?? 1;
    this.setState(engineAdvanceToNextAct(this.state, this.mapConfig as Record<string, ActConfig & Record<string, unknown>>));
    const newAct = this.state.act ?? 1;
    if (newAct === 2 && previousAct === 1 && this.meta.highestActReached < 2) {
      for (const id of UNLOCK_ON_ACT2_CARDS) {
        if (!this.meta.unlockedCards.includes(id)) this.meta.unlockedCards = [...this.meta.unlockedCards, id];
      }
      for (const id of UNLOCK_ON_ACT2_RELICS) {
        if (!this.meta.unlockedRelics.includes(id)) this.meta.unlockedRelics = [...this.meta.unlockedRelics, id];
      }
      this.saveMeta();
    }
  }

  getRewardChoices(): string[] {
    return this.state?.rewardCardChoices ?? [];
  }

  chooseReward(cardId: string): void {
    if (!this.state) return;
    this.setState(engineChooseCardReward(this.state, cardId));
  }

  restHeal(): void {
    if (!this.state) return;
    this.setState(engineRestHeal(this.state));
  }

  restRemoveCard(cardId: string): void {
    if (!this.state) return;
    this.setState(engineRestRemoveCard(this.state, cardId));
  }

  private maybeHandleCombatWin(): void {
    if (!this.state) return;
    if (this.state.combatResult !== 'win' || this.state.runPhase !== 'combat') return;
    if (engineIsBossNode(this.state)) {
      const runPhase = engineGetRunPhaseAfterBossWin(this.state);
      this.setState({
        ...this.state,
        runPhase,
        currentEncounter: null,
        enemies: [],
        combatResult: null,
        rewardCardChoices: undefined,
      });
      const act = this.state.act ?? 1;
      if (act > this.meta.highestActReached) {
        this.meta = { ...this.meta, highestActReached: act };
        this.saveMeta();
      }
      if (runPhase === 'victory') {
        if (!this.meta.unlockedRelics.includes(UNLOCK_ON_VICTORY_RELIC)) {
          this.meta = { ...this.meta, unlockedRelics: [...this.meta.unlockedRelics, UNLOCK_ON_VICTORY_RELIC] };
          this.saveMeta();
        }
      }
    } else {
      const actKey = `act${this.state.act ?? 1}`;
      const rewardPool = this.getRewardCardPoolForAct(actKey);
      this.setState(engineAfterCombatWin(this.state, rewardPool.length > 0 ? rewardPool : (this.rewardCardPool ?? []), this.cardsMap!));
      if (this.state.potions && this.state.potions.length < GAME_BALANCE.maxPotions && Math.random() < GAME_BALANCE.potionDropChance) {
        const potionId = enginePickRandomPotionByRarity(this.potionDefs);
        if (potionId) this.setState({ ...this.state, potions: [...this.state.potions, potionId] });
      }
      this.meta = {
        ...this.meta,
        runStats: { combatsWon: (this.meta.runStats?.combatsWon ?? 0) + 1, goldSpent: this.meta.runStats?.goldSpent ?? 0 },
      };
      this.saveMeta();
    }
  }
}
