import type { CardZone } from './card-state';

/**
 * View-model for a single card in combat. Data only; no Pixi references.
 */
export interface CardInstance {
  /** Unique id for this UI instance (e.g. "hand-0", "hand-1"). */
  instanceId: string;
  /** Engine card definition id. */
  cardId: string;
  /** Current zone. */
  zone: CardZone;
  /** Hand index when zone is hand; used for layout. */
  handIndex?: number;
  /** True when card was just drawn (for draw animation and z-order). */
  isNew?: boolean;
  /** True when card was just played (for play animation). */
  wasJustPlayed?: boolean;
}
