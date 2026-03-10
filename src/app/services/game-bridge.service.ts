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
  type ShopPoolConfig,
} from '../../engine/run';
import type { GameState, MetaState, RunPhase } from '../../engine/types';
import type { CardDef } from '../../engine/cardDef';
import type { EnemyDef, EncounterDef, EventDef, RelicDef } from '../../engine/loadData';
import { loadEvents, loadRelics } from '../../engine/loadData';
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
  private meta: MetaState = { unlockedCards: [], unlockedRelics: [], highestActReached: 0 };

  getState(): GameState | null {
    return this.state;
  }

  getCardDef(cardId: string): CardDef | undefined {
    return this.cardsMap?.get(cardId);
  }

  getRelicName(relicId: string): string {
    return this.relicDefs?.get(relicId)?.name ?? relicId;
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
    };
    const [cards, enemies, encounters, mapConfig, eventsData, relicsData, shopPoolsData]: [
      CardDef[],
      EnemyDef[],
      EncounterDef[],
      Record<string, unknown>,
      EventDef[],
      RelicDef[],
      Record<string, ShopPoolConfig>,
    ] = await Promise.all([
      this.fetchJson<CardDef[]>(DATA_PATHS.cards),
      this.fetchJson<EnemyDef[]>(DATA_PATHS.enemies),
      this.fetchJson<EncounterDef[]>(DATA_PATHS.encounters),
      this.fetchJson<Record<string, unknown>>(DATA_PATHS.mapConfig),
      this.fetchJson<EventDef[]>(DATA_PATHS.events).catch(() => []),
      this.fetchJson<RelicDef[]>(DATA_PATHS.relics).catch(() => []),
      this.fetchJson<Record<string, ShopPoolConfig>>(DATA_PATHS.shopPools).catch(() => ({})),
    ]);
    this.cardsMap = loadCards(cards);
    this.enemyDefs = loadEnemies(enemies);
    this.encountersMap = loadEncounters(encounters);
    this.mapConfig = mapConfig;
    this.rewardCardPool = cards.map((c) => c.id);
    this.eventPool = loadEvents(eventsData);
    this.relicDefs = loadRelics(relicsData);
    this.shopPoolsByAct = shopPoolsData;
    await this.loadMeta();
  }

  startRun(): void {
    if (!this.mapConfig) return;
    const act1 = this.mapConfig['act1'];
    if (!act1) return;
    // Simple seed for now
    const seed = Date.now() & 0xffffffff;
    this.state = engineStartRun(seed, act1);
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
      this.meta = {
        unlockedCards: Array.isArray(m.unlockedCards) ? m.unlockedCards : [],
        unlockedRelics: Array.isArray(m.unlockedRelics) ? m.unlockedRelics : [],
        highestActReached: typeof m.highestActReached === 'number' ? m.highestActReached : 0,
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

  playCard(cardId: string, target?: number): void {
    if (!this.state || !this.cardsMap) return;
    this.state = enginePlayCard(this.state, cardId, target ?? 0, this.cardsMap);
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

  chooseNode(nodeId: string): void {
    if (!this.state || !this.cardsMap || !this.enemyDefs || !this.encountersMap || !this.mapConfig) return;
    const actKey = `act${this.state.act ?? 1}`;
    const actConfig = this.mapConfig[actKey] as { encounterPool?: string[]; bossEncounter?: string } | undefined;
    let encounterId: string | null = null;
    if (this.state.map) {
      const node = engineGetNodeById(this.state.map, nodeId);
      if (node?.type === 'boss' && actConfig?.bossEncounter) {
        encounterId = actConfig.bossEncounter;
      } else if ((node?.type === 'combat' || node?.type === 'elite') && actConfig?.encounterPool?.length) {
        const pool = actConfig.encounterPool;
        encounterId = pool[Math.floor(Math.random() * pool.length)];
      }
    }
    const shopPool = this.shopPoolsByAct[actKey];
    let next = engineChooseNode(
      this.state,
      nodeId,
      encounterId,
      this.cardsMap,
      this.enemyDefs,
      this.encountersMap,
      this.eventPool ?? [],
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
    this.state = enginePurchaseCard(this.state, cardId);
  }

  purchaseRelic(relicId: string): void {
    if (!this.state) return;
    this.state = enginePurchaseRelic(this.state, relicId);
  }

  advanceToNextAct(): void {
    if (!this.state || !this.mapConfig) return;
    this.state = engineAdvanceToNextAct(this.state, this.mapConfig as Record<string, import('../../engine/map/mapGenerator').ActConfig & Record<string, unknown>>);
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
    if (!this.state || !this.rewardCardPool) return;
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
    } else {
      this.state = engineAfterCombatWin(this.state, this.rewardCardPool);
    }
  }
}
