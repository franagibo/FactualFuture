export interface FixedStepConfig {
  stepMs: number;
  maxCatchUpSteps: number;
}

export class FixedTimestepLoop {
  private acc = 0;
  private last = 0;

  constructor(private cfg: FixedStepConfig) {}

  reset(nowMs: number): void {
    this.acc = 0;
    this.last = nowMs;
  }

  /** Returns how many fixed steps to simulate this frame. */
  advance(nowMs: number): number {
    if (this.last === 0) {
      this.reset(nowMs);
      return 0;
    }
    const dt = Math.max(0, nowMs - this.last);
    this.last = nowMs;
    this.acc += dt;
    const stepMs = this.cfg.stepMs;
    let steps = Math.floor(this.acc / stepMs);
    if (steps > this.cfg.maxCatchUpSteps) steps = this.cfg.maxCatchUpSteps;
    this.acc -= steps * stepMs;
    return steps;
  }
}

