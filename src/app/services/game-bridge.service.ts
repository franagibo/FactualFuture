import { Injectable } from '@angular/core';
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
  type ShopPoolConfig,
} from '../../engine/run';
import type { CharacterDef } from '../../engine/loadData';
import { loadCharacters } from '../../engine/loadData';
import type { GameState, MetaState, RunPhase } from '../../engine/types';
import type { CardDef } from '../../engine/cardDef';
import type { EnemyDef, EncounterDef, EventDef, PotionDef, RelicDef } from '../../engine/loadData';
import { loadEvents, loadPotions, loadRelics } from '../../engine/loadData';
import { runRelics } from '../../engine/relicRunner';

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
  private cardsMap: CardsMap | null = null;
  private enemyDefs: EnemyDefsMap | null = null;
  private encountersMap: EncountersMap | null = null;
  private mapConfig: any | null = null;
  private rewardCardPool: string[] | null = null;
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

  getCardDef(cardId: string): CardDef | undefined {
    return this.cardsMap?.get(cardId);
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
    this.state = engineUsePotion(this.state, potionId, targetEnemyIndex ?? 0, def);
    this.maybeHandleCombatWin();
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status} ${r.statusText}`);
    return r.json() as Promise<T>;
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
      this.fetchJson<EventDef[]>(DATA_PATHS.events).catch(() => []),
      this.fetchJson<RelicDef[]>(DATA_PATHS.relics).catch(() => []),
      this.fetchJson<Record<string, ShopPoolConfig>>(DATA_PATHS.shopPools).catch(() => ({})),
      this.fetchJson<PotionDef[]>(DATA_PATHS.potions).catch(() => []),
      this.fetchJson<CharacterDef[]>(DATA_PATHS.characters).catch(() => []),
    ]);
    this.cardsMap = loadCards(cards);
    this.enemyDefs = loadEnemies(enemies);
    this.encountersMap = loadEncounters(encounters);
    this.mapConfig = mapConfig;
    this.rewardCardPool = cards.map((c) => c.id);
    this.eventPool = loadEvents(eventsData);
    this.relicDefs = loadRelics(relicsData);
    this.shopPoolsByAct = shopPoolsData;
    this.potionDefs = loadPotions(potionsData);
    this.charactersMap = loadCharacters(Array.isArray(charactersData) ? charactersData : []);
    await this.loadMeta();
  }

  /** Start a new run. Uses characterId's starter deck and stores characterId in state. Default character: gunboy. */
  startRun(characterId: string = 'gunboy'): void {
    if (!this.mapConfig) return;
    const act1 = this.mapConfig['act1'];
    if (!act1) return;
    const character = this.charactersMap.get(characterId);
    const starterDeck = character?.starterDeck;
    const seed = Date.now() & 0xffffffff;
    this.state = engineStartRun(seed, act1, {
      starterDeck: starterDeck?.length ? starterDeck : undefined,
      characterId: character ? characterId : undefined,
    });
  }

  getCharacters(): CharacterDef[] {
    return Array.from(this.charactersMap.values());
  }

  getCharacter(id: string): CharacterDef | undefined {
    return this.charactersMap.get(id);
  }

  getCurrentCharacterId(): string | undefined {
    return this.state?.characterId;
  }

  clearState(): void {
    this.state = null;
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
      this.state = data as GameState;
      return true;
    }
    return false;
  }

  playCard(cardId: string, target?: number, handIndex?: number): void {
    if (!this.state || !this.cardsMap || !this.enemyDefs) return;
    this.state = enginePlayCard(this.state, cardId, target ?? null, this.cardsMap, this.enemyDefs, handIndex);
    this.maybeHandleCombatWin();
  }

  endTurn(): void {
    if (!this.state || !this.cardsMap || !this.enemyDefs) return;
    let next = engineEndTurn(this.state, this.cardsMap, this.enemyDefs);
    if (this.relicDefs) next = runRelics(next, 'onTurnStart', this.relicDefs);
    this.state = next;
    this.maybeHandleCombatWin();
  }

  getRunPhase(): RunPhase | undefined {
    return this.state?.runPhase;
  }

  getAvailableNextNodes(): string[] {
    if (!this.state) return [];
    return engineGetAvailableNextNodes(this.state);
  }

  /** Merge act shop pool with meta unlocks; exclude curse cards. When character has cardPoolIds, shop cards = character pool + unlocked. */
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
    if (this.cardsMap) rawCards = rawCards.filter((id) => !this.cardsMap!.get(id)?.isCurse);
    const relics = [...new Set([...(base.relics ?? []), ...this.meta.unlockedRelics])];
    return { ...base, cards: rawCards, relics };
  }

  /** Event pool for current act: events with no act or matching act. */
  private getEventPoolForAct(act: number): EventDef[] {
    return (this.eventPool ?? []).filter((e) => e.act == null || e.act === act);
  }

  /** Reward card pool for current act. When character has cardPoolIds, use it as base; else act pool. Merge with unlocked, filter non-curse. */
  private getRewardCardPoolForAct(actKey: string): string[] {
    const characterId = this.state?.characterId;
    const character = characterId ? this.charactersMap.get(characterId) : undefined;
    const base =
      character?.cardPoolIds && character.cardPoolIds.length > 0
        ? character.cardPoolIds
        : (this.shopPoolsByAct[actKey]?.cards ?? []);
    let merged = [...new Set([...base, ...this.meta.unlockedCards])];
    if (this.cardsMap) merged = merged.filter((id) => this.cardsMap!.get(id) && !this.cardsMap!.get(id)?.isCurse);
    return merged;
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
    const actConfig = this.mapConfig[actKey] as {
      encounterPool?: string[];
      eliteEncounterPool?: string[];
      bossEncounter?: string;
      encounterWeights?: Record<string, number>;
      eliteEncounterWeights?: Record<string, number>;
    } | undefined;
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
    this.state = next;
  }

  leaveShop(): void {
    if (!this.state) return;
    this.state = engineLeaveShop(this.state);
  }

  executeEventChoice(choiceIndex: number): void {
    if (!this.state) return;
    this.state = engineExecuteEventChoice(this.state, choiceIndex);
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
    this.state = enginePurchaseCard(this.state, cardId);
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
    this.state = enginePurchaseRelic(this.state, relicId);
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
    this.state = engineAdvanceToNextAct(this.state, this.mapConfig as Record<string, import('../../engine/map/mapGenerator').ActConfig & Record<string, unknown>>);
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
    this.state = engineChooseCardReward(this.state, cardId);
  }

  restHeal(): void {
    if (!this.state) return;
    this.state = engineRestHeal(this.state);
  }

  restRemoveCard(cardId: string): void {
    if (!this.state) return;
    this.state = engineRestRemoveCard(this.state, cardId);
  }

  private maybeHandleCombatWin(): void {
    if (!this.state) return;
    if (this.state.combatResult !== 'win' || this.state.runPhase !== 'combat') return;
    if (engineIsBossNode(this.state)) {
      const runPhase = engineGetRunPhaseAfterBossWin(this.state);
      this.state = {
        ...this.state,
        runPhase,
        currentEncounter: null,
        enemies: [],
        combatResult: null,
        rewardCardChoices: undefined,
      };
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
      this.state = engineAfterCombatWin(this.state, rewardPool.length > 0 ? rewardPool : (this.rewardCardPool ?? []));
      this.meta = {
        ...this.meta,
        runStats: { combatsWon: (this.meta.runStats?.combatsWon ?? 0) + 1, goldSpent: this.meta.runStats?.goldSpent ?? 0 },
      };
      this.saveMeta();
    }
  }
}
