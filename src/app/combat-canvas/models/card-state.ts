/**
 * Card UI state for the presentation layer. Drives which system owns targets and animation behavior.
 */
export type CardUiState =
  | 'IN_DECK'
  | 'DRAWING'
  | 'IN_HAND'
  | 'HOVERED'
  | 'DRAGGING'
  | 'PLAYING'
  | 'MOVING_TO_DISCARD'
  | 'MOVING_TO_EXHAUST'
  | 'IN_DISCARD'
  | 'IN_EXHAUST';

export type CardZone = 'deck' | 'hand' | 'discard' | 'exhaust' | 'play';
