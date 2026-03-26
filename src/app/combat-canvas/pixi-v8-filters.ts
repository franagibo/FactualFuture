/**
 * Stub filter stubs compatible with PixiJS v8.
 * GlowFilter and NoiseFilter from @pixi/filter-glow / @pixi/filter-noise are PixiJS v7-only.
 * We provide lightweight stand-ins here so the rest of the code compiles without changes.
 * Visual glow/noise post-FX are handled via CSS on the host element instead.
 */
import { Filter } from 'pixi.js';

/** No-op filter stub — glow is applied via CSS instead. */
export class GlowFilter extends Filter {
  constructor(_options?: { distance?: number; outerStrength?: number; innerStrength?: number; color?: number; quality?: number }) {
    super({ glProgram: undefined as any, resources: {} });
    this.enabled = false;
  }
}

/** No-op filter stub — noise is applied via CSS instead. */
export class NoiseFilter extends Filter {
  noise: number;
  constructor(noiseLevel = 0.5) {
    super({ glProgram: undefined as any, resources: {} });
    this.noise = noiseLevel;
    this.enabled = false;
  }
}
