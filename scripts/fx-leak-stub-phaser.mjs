/**
 * fx-leak-check 전용 Phaser 스텁.
 *
 * vfx.ts / MaehwaAbility.ts 가 실제로 건드리는 표면만 흉내 내고,
 * 만들어진 스프라이트·이미터·레이어의 생존 수를 세어 누수를 측정한다.
 * 렌더링은 하지 않는다 — 검증 대상은 "회수 장부"이지 그림이 아니다.
 *
 * 번들 의존 그래프상 이 모듈이 settings.ts 보다 먼저 평가되므로
 * localStorage / window 전역도 여기서 깔아둔다.
 */

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: id => clearTimeout(id),
  };
}

/** 살아 있는 오브젝트 수 (destroy 되면 감소) */
export const live = { sprites: 0, emitters: 0, layers: 0 };
/** 누적 생성 수 */
export const created = { sprites: 0, emitters: 0, layers: 0 };
/** 칼날 궤적(proc-arc)이 그려진 좌표·시각 — '이펙트가 똥 위치에 나는지' 검증용 */
export const arcSpawns = [];

class Emitter {
  #handlers = new Map();
  on(ev, fn) { (this.#handlers.get(ev) ?? this.#handlers.set(ev, []).get(ev)).push(fn); return this; }
  once(ev, fn) {
    const wrap = (...a) => { this.off(ev, wrap); fn(...a); };
    wrap._orig = fn;
    return this.on(ev, wrap);
  }
  off(ev, fn) {
    const list = this.#handlers.get(ev);
    if (!list) return this;
    const i = list.findIndex(h => h === fn || h._orig === fn);
    if (i >= 0) list.splice(i, 1);
    return this;
  }
  emit(ev, ...a) {
    const list = this.#handlers.get(ev);
    if (!list) return false;
    [...list].forEach(h => h(...a));
    return true;
  }
}

const DESTROY = 'destroy';
const ANIM_COMPLETE = 'animationcomplete';

class GameObj extends Emitter {
  constructor(scene) {
    super();
    this.x = 0;
    this.y = 0;
    this.scene = scene;
    this.active = true;
    this.depth = 0;
    this.displayList = null;
  }
  setDepth(d) { this.depth = d; return this; }
  destroy() {
    if (!this.scene) return;
    this.scene = null;
    this.active = false;
    if (this.displayList) this.displayList.remove(this);
    this.emit(DESTROY, this);
  }
}

class Sprite extends GameObj {
  constructor(scene) {
    super(scene);
    created.sprites++; live.sprites++;
    this.scaleX = 1; this.scaleY = 1; this.alpha = 1; this.angle = 0; this.rotation = 0; this.blendMode = 0;
  }
  get scale() { return this.scaleX; }
  set scale(v) { this.scaleX = v; this.scaleY = v; }
  setScale(x, y) { this.scaleX = x; this.scaleY = y === undefined ? x : y; return this; }
  setRotation(r) { this.rotation = r; return this; }
  setAlpha(a) { this.alpha = a; return this; }
  setBlendMode(m) { this.blendMode = m; return this; }
  setTint() { return this; }
  /** 씬 클럭(anims.globalTimeScale 반영)으로 애니메이션 완료를 흉내 낸다 */
  play(_key) {
    this.scene?.__clock.add(200, () => this.emit(ANIM_COMPLETE), 'anims');
    return this;
  }
  destroy() {
    const wasAlive = !!this.scene;
    super.destroy();
    if (wasAlive) live.sprites--;
  }
}

class ParticleEmitterObj extends GameObj {
  constructor(scene) {
    super(scene);
    created.emitters++; live.emitters++;
    this.exploded = 0;
  }
  explode(n) { this.exploded += n; return this; }
  destroy() {
    const wasAlive = !!this.scene;
    super.destroy();
    if (wasAlive) live.emitters--;
  }
}

class Layer extends GameObj {
  constructor(scene) {
    super(scene);
    created.layers++; live.layers++;
    this.list = [];
    this.postFX = {
      list: [],
      addBloom: () => { this.postFX.list.push({ bloom: true }); },
      clear: () => { this.postFX.list.length = 0; },
    };
  }
  add(obj) {
    if (obj.displayList) obj.displayList.remove(obj);
    obj.displayList = this;
    this.list.push(obj);
    return this;
  }
  remove(obj) {
    const i = this.list.indexOf(obj);
    if (i >= 0) this.list.splice(i, 1);
    return this;
  }
  destroy() {
    const wasAlive = !!this.scene;
    [...this.list].forEach(o => o.destroy());
    this.list.length = 0;
    super.destroy();
    if (wasAlive) live.layers--;
  }
}

/** 씬 클럭 — timeScale 을 실제로 반영하는 가짜 시계 (히트스톱 재현용) */
class FakeClock {
  constructor(scene) {
    this.scene = scene;
    this.events = [];
    this.tick = this.tick.bind(this);
    this.handle = setInterval(this.tick, 16);
  }
  add(ms, fn, scaleSource) {
    const ev = { remaining: ms, fn, scaleSource, removed: false, remove() { this.removed = true; } };
    this.events.push(ev);
    return ev;
  }
  tick() {
    const list = this.events;
    this.events = [];
    for (const ev of list) {
      if (ev.removed) continue;
      const scale = ev.scaleSource === 'anims'
        ? this.scene.anims.globalTimeScale
        : this.scene.time.timeScale;
      ev.remaining -= 16 * scale;
      if (ev.remaining <= 0) ev.fn();
      else this.events.push(ev);
    }
  }
  stop() { clearInterval(this.handle); }
  get pending() { return this.events.filter(e => !e.removed).length; }
}

class FakeCanvasTexture {
  constructor(key) { this.key = key; }
  getContext() { return makeCtx(); }
  add() {}
  refresh() {}
}

function makeCtx() {
  const grad = { addColorStop() {} };
  const noop = () => {};
  return {
    save: noop, restore: noop, translate: noop, beginPath: noop, rect: noop, clip: noop,
    moveTo: noop, lineTo: noop, quadraticCurveTo: noop, closePath: noop, fill: noop,
    stroke: noop, arc: noop, fillRect: noop,
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1,
  };
}

export function createFakeScene() {
  const scene = new Emitter();
  scene.events = new Emitter();
  scene.sys = { displayList: { remove() {} } };

  scene.__clock = new FakeClock(scene);

  scene.time = {
    timeScale: 1,
    delayedCall: (ms, fn) => scene.__clock.add(ms, fn, 'time'),
    get pending() { return scene.__clock.pending; },
  };
  scene.anims = {
    globalTimeScale: 1,
    __keys: new Set(),
    exists: k => scene.anims.__keys.has(k),
    create: cfg => { scene.anims.__keys.add(cfg.key); },
  };
  const textureKeys = new Set();
  scene.textures = {
    exists: k => textureKeys.has(k),
    createCanvas: k => { textureKeys.add(k); return new FakeCanvasTexture(k); },
    __addAsset: k => textureKeys.add(k),
  };
  scene.tweens = {
    timeScale: 1,
    add: cfg => {
      const tween = { remove() { this.removed = true; }, removed: false };
      // 트윈은 즉시 끝난 것으로 처리 (연출 타이밍이 아니라 회수 장부가 검증 대상)
      scene.__clock.add(cfg.duration ?? 0, () => {
        if (!tween.removed) cfg.onComplete?.();
      }, 'tweens');
      return tween;
    },
    killTweensOf: () => {},
  };
  const spawn = (x, y, key) => {
    const o = new Sprite(scene);
    o.x = x; o.y = y; o.textureKey = key;
    if (key === 'fx_proc_arc') arcSpawns.push({ x, y, t: Date.now(), obj: o });
    return o;
  };
  scene.add = {
    sprite: (x, y, key) => spawn(x, y, key),
    image: (x, y, key) => spawn(x, y, key),
    particles: () => new ParticleEmitterObj(scene),
    layer: () => new Layer(scene),
  };
  // 로더는 즉시 성공한 것으로 취급 — 검증 대상은 회수 장부이지 네트워크가 아니다
  scene.load = {
    image: k => textureKeys.add(k),
    spritesheet: k => textureKeys.add(k),
  };
  scene.cameras = { main: { shake: () => {} } };
  scene.physics = { world: { timeScale: 1 } };
  scene.game = { renderer: { type: 2 } }; // 2 = Phaser.WEBGL

  return scene;
}

const Phaser = {
  WEBGL: 2,
  CANVAS: 1,
  BlendModes: { NORMAL: 0, ADD: 1 },
  Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } },
  GameObjects: { Events: { DESTROY } },
  Animations: { Events: { ANIMATION_COMPLETE: ANIM_COMPLETE } },
  Math: {
    Angle: { Between: (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1) },
    Clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    Distance: { Between: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1) },
    Between: (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1)),
    FloatBetween: (lo, hi) => lo + Math.random() * (hi - lo),
  },
};

export default Phaser;
