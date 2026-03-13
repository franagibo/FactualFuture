import type { GameState } from '../../../engine/types';

/**
 * Tracks engine zone state and detects transitions (draw, play, discard, exhaust, shuffle).
 * UI can use this to drive presentation targets and animations.
 * Engine state remains authoritative; this is for presentation only.
 */
export class ZoneManager {
  private previousHandLength = 0;
  private previousDeckLength = 0;
  private previousDiscardLength = 0;

  /**
   * Call when engine state has changed. Returns a summary of zone transitions for this tick.
   */
  onEngineStateChanged(state: GameState): ZoneTransitionSummary {
    const hand = state.hand ?? [];
    const deck = state.deck ?? [];
    const discard = state.discard ?? [];
    const handLen = hand.length;
    const deckLen = deck.length;
    const discardLen = discard.length;

    const summary: ZoneTransitionSummary = {
      cardsDrawn: 0,
      cardsPlayedOrRemoved: 0,
      discardShuffledIntoDeck: false,
    };

    if (handLen > this.previousHandLength) {
      summary.cardsDrawn = handLen - this.previousHandLength;
    }
    if (handLen < this.previousHandLength) {
      summary.cardsPlayedOrRemoved = this.previousHandLength - handLen;
    }
    if (deckLen > this.previousDeckLength && discardLen < this.previousDiscardLength) {
      summary.discardShuffledIntoDeck = true;
    }

    this.previousHandLength = handLen;
    this.previousDeckLength = deckLen;
    this.previousDiscardLength = discardLen;

    return summary;
  }

  /** Reset when leaving combat so next combat starts clean. */
  reset(): void {
    this.previousHandLength = 0;
    this.previousDeckLength = 0;
    this.previousDiscardLength = 0;
  }
}

export interface ZoneTransitionSummary {
  cardsDrawn: number;
  cardsPlayedOrRemoved: number;
  discardShuffledIntoDeck: boolean;
}
