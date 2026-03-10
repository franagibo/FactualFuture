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
} from '../../engine/run';
import type { GameState, RunPhase } from '../../engine/types';
import type { CardDef } from '../../engine/cardDef';
import type { EnemyDef, EncounterDef } from '../../engine/loadData';

// Re-export loadData types
type CardsMap = Map<string, CardDef>;
type EnemyDefsMap = Map<string, EnemyDef>;
type EncountersMap = Map<string, EncounterDef>;

const DATA_BASE = 'data';
const MAP_CONFIG_PATH = `${DATA_BASE}/mapConfig.json`;
const RUN_SAVE_KEY = 'run-save.json';

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

  getState(): GameState | null {
    return this.state;
  }

  getCardDef(cardId: string): CardDef | undefined {
    return this.cardsMap?.get(cardId);
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status} ${r.statusText}`);
    return r.json() as Promise<T>;
  }

  async ensureDataLoaded(): Promise<void> {
    if (this.cardsMap && this.enemyDefs && this.encountersMap && this.mapConfig && this.rewardCardPool) {
      return;
    }
    const [cards, enemies, encounters, mapConfig]: [CardDef[], EnemyDef[], EncounterDef[], Record<string, unknown>] = await Promise.all([
      this.fetchJson<CardDef[]>(`${DATA_BASE}/cards.json`),
      this.fetchJson<EnemyDef[]>(`${DATA_BASE}/enemies.json`),
      this.fetchJson<EncounterDef[]>(`${DATA_BASE}/encounters.json`),
      this.fetchJson<Record<string, unknown>>(MAP_CONFIG_PATH),
    ]);
    this.cardsMap = loadCards(cards);
    this.enemyDefs = loadEnemies(enemies);
    this.encountersMap = loadEncounters(encounters);
    this.mapConfig = mapConfig;
    this.rewardCardPool = cards.map((c) => c.id);
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
    this.state = engineEndTurn(this.state, this.cardsMap, this.enemyDefs);
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
    const act1 = this.mapConfig['act1'];
    const encounterId: string | null = act1?.encounterPool?.[0] ?? null;
    this.state = engineChooseNode(
      this.state,
      nodeId,
      encounterId,
      this.cardsMap,
      this.enemyDefs,
      this.encountersMap
    );
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
    if (this.state.combatResult === 'win' && this.state.runPhase === 'combat') {
      this.state = engineAfterCombatWin(this.state, this.rewardCardPool);
    }
  }
}
