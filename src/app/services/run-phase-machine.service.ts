import { Injectable } from '@angular/core';
import type { RunPhase } from '../../engine/types';

export type PhaseTransition = { from: RunPhase | undefined; to: RunPhase | undefined };

@Injectable({ providedIn: 'root' })
export class RunPhaseMachineService {
  private current: RunPhase | undefined = undefined;

  /** Update current phase and return transition (or null if unchanged). */
  step(next: RunPhase | undefined): PhaseTransition | null {
    if (next === this.current) return null;
    const t: PhaseTransition = { from: this.current, to: next };
    this.current = next;
    return t;
  }

  getCurrent(): RunPhase | undefined {
    return this.current;
  }
}

