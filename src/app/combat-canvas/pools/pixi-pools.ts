/**
 * Object pools for PixiJS display objects used in combat (and optionally map) rendering.
 * Reusing Graphics, Text, Container, and Sprite reduces allocations and GC pressure during redraws.
 */
import * as PIXI from 'pixi.js';

const TEXT_DPR = typeof window !== 'undefined' ? Math.max(1, window.devicePixelRatio || 1) : 1;

export interface PixiPools {
  getGraphics(): PIXI.Graphics;
  getText(): PIXI.Text;
  getContainer(): PIXI.Container;
  getSprite(): PIXI.Sprite;
}

/** Recursively releases a display object (and its children if Container) back to the pools. Non-pooled types are destroyed. */
export function releaseToPools(obj: PIXI.Container | PIXI.Graphics | PIXI.Text | PIXI.Sprite, pools: CombatPools): void {
  const o = obj as unknown;
  if (o instanceof PIXI.Container) {
    const children = [...o.children];
    for (const ch of children) {
      o.removeChild(ch);
      releaseToPools(ch as PIXI.Container | PIXI.Graphics | PIXI.Text | PIXI.Sprite, pools);
    }
    pools.returnContainer(o);
    return;
  }
  if (o instanceof PIXI.Graphics) {
    o.clear();
    pools.returnGraphics(o);
    return;
  }
  if (o instanceof PIXI.Text) {
    pools.returnText(o);
    return;
  }
  if (o instanceof PIXI.Sprite) {
    o.texture = PIXI.Texture.EMPTY;
    o.destroy();
    return;
  }
  (o as { destroy(opts?: object): void }).destroy({ children: true, texture: false });
}

const MAX_POOL_SIZE = 128;

/**
 * Pools for combat view. Call releaseToPools() on content root children before clearing the stage
 * so objects are reused on the next draw instead of being destroyed.
 */
export class CombatPools implements PixiPools {
  private graphicsPool: PIXI.Graphics[] = [];
  private textPool: PIXI.Text[] = [];
  private containerPool: PIXI.Container[] = [];
  private spritePool: PIXI.Sprite[] = [];

  private removeFromParent(obj: PIXI.Container | PIXI.Graphics | PIXI.Text | PIXI.Sprite): void {
    if (obj.parent) obj.parent.removeChild(obj);
  }

  getGraphics(): PIXI.Graphics {
    const g = this.graphicsPool.pop() ?? new PIXI.Graphics();
    this.removeFromParent(g);
    g.clear();
    g.x = 0;
    g.y = 0;
    g.visible = true;
    g.alpha = 1;
    g.rotation = 0;
    g.scale.set(1);
    return g;
  }

  getText(): PIXI.Text {
    const t = this.textPool.pop() ?? new PIXI.Text({ text: '' });
    this.removeFromParent(t);
    t.text = '';
    t.visible = true;
    t.alpha = 1;
    t.x = 0;
    t.y = 0;
    t.resolution = TEXT_DPR;
    t.roundPixels = true;
    return t;
  }

  getContainer(): PIXI.Container {
    const c = this.containerPool.pop() ?? new PIXI.Container();
    this.removeFromParent(c);
    c.removeChildren();
    c.x = 0;
    c.y = 0;
    c.visible = true;
    c.alpha = 1;
    c.rotation = 0;
    c.scale.set(1);
    c.zIndex = 0;
    return c;
  }

  getSprite(): PIXI.Sprite {
    const s = this.spritePool.pop() ?? new PIXI.Sprite();
    this.removeFromParent(s);
    s.texture = PIXI.Texture.EMPTY;
    s.visible = true;
    s.alpha = 1;
    s.x = 0;
    s.y = 0;
    s.scale.set(1);
    return s;
  }

  /** Returns a Graphics instance to the pool. Call from releaseToPools only. */
  returnGraphics(g: PIXI.Graphics): void {
    g.clear();
    if (this.graphicsPool.length < MAX_POOL_SIZE) this.graphicsPool.push(g);
    else g.destroy();
  }

  /** Returns a Text instance to the pool. Call from releaseToPools only. */
  returnText(t: PIXI.Text): void {
    if (this.textPool.length < MAX_POOL_SIZE) this.textPool.push(t);
    else t.destroy();
  }

  /** Returns a Container to the pool. Call from releaseToPools only. */
  returnContainer(c: PIXI.Container): void {
    if (this.containerPool.length < MAX_POOL_SIZE) this.containerPool.push(c);
    else c.destroy({ children: true, texture: false });
  }

  /** Returns a Sprite to the pool. Call from releaseToPools only. */
  returnSprite(s: PIXI.Sprite): void {
    s.texture = PIXI.Texture.EMPTY;
    if (this.spritePool.length < MAX_POOL_SIZE) this.spritePool.push(s);
    else s.destroy();
  }
}
