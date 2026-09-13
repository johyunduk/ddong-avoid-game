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
export const live = { sprites: 0, emitters: 0, layers: 0, graphics: 0 };
/** 누적 생성 수 */
export const created = { sprites: 0, emitters: 0, layers: 0, graphics: 0 };

/**
 * 절차 생성 텍스처가 **언제** 구워졌는지. 실제 Phaser 에서는 여기서 캔버스 할당 +
 * 프레임 수만큼의 그리기 + GPU 업로드(`refresh()`)가 한꺼번에 일어난다 — 그게
 * 연출 발동 프레임에 걸리면 그 한 프레임이 통째로 밀린다.
 */
export const textureBuilds = [];
/** 칼날 궤적(proc-arc)이 그려진 좌표·시각 — '이펙트가 똥 위치에 나는지' 검증용 */
export const arcSpawns = [];
/** 테드 큐브의 '말 → 칸' 전환 조각이 생긴 좌표·시각 */
export const shardSpawns = [];
/** 파열 파동 겹이 뜬 시각 — 동시 상한에 걸려 조용히 잘리는지 확인용 */
export const waveSpawns = [];
/** 시트 이펙트 생성 로그 — 어떤 시트가 몇 번 나갔는지 (발사 횟수 계측) */
export const beamSpawns = [];

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
  setPosition(x, y) { this.x = x; this.y = y; return this; }
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
  setDisplaySize(w, h) { this.displayWidth = w; this.displayHeight = h; return this; }
  setScrollFactor() { return this; }
  setRotation(r) { this.rotation = r; return this; }
  /** 레드 참새가 궤도를 돌며 매 프레임 좌표를 갱신한다 */
  setPosition(x, y) { this.x = x; this.y = y; return this; }
  /** 시트가 전부 왼쪽을 봐서, 오른쪽 반원에서는 뒤집어 쓴다 */
  setFlipX(v) { this.flipX = !!v; return this; }
  setOrigin(x, y) { this.originX = x; this.originY = y === undefined ? x : y; return this; }
  setVisible(v) { this.visible = v; return this; }
  setAlpha(a) { this.alpha = a; return this; }
  setBlendMode(m) { this.blendMode = m; return this; }
  setTint() { return this; }
  /** 시트 재생 위상 — sheetStart 로 루프를 어긋나게 하는 경로가 여기를 탄다 */
  anims = { setProgress() {}, currentFrame: null };
  /**
   * 씬 클럭(anims.globalTimeScale 반영)으로 애니메이션 완료를 흉내 낸다.
   *
   * **`startFrame` 범위를 검사한다.** 실기 Phaser 는 `startFrame > totalFrames` 로만
   * 막아서 4프레임짜리에 4를 주면 그대로 통과하고 `anim.frames[4]` 가 undefined 가 돼
   * `getFirstTick` 에서 게임이 죽는다 (`currentFrame.index` 가 1부터 세는 걸 잊으면
   * 바로 이 꼴이 난다 — 실제로 레드 참새에서 터졌다). 하네스는 더 빡빡하게 잡는다.
   */
  play(key) {
    const cfg = typeof key === 'object' && key !== null ? key : { key };
    const anim = this.scene?.anims?.__frames?.get(cfg.key);
    if (anim !== undefined && cfg.startFrame !== undefined) {
      if (!Number.isInteger(cfg.startFrame) || cfg.startFrame < 0 || cfg.startFrame >= anim) {
        throw new RangeError(
          `play('${cfg.key}'): startFrame ${cfg.startFrame} 이 프레임 수 ${anim} 밖이다`,
        );
      }
    }
    // 지금 프레임 — Phaser 와 같이 **1부터** 센다
    this.anims.currentFrame = { index: 1 + ((cfg.startFrame ?? 0) % (anim || 1)) };
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

/**
 * Graphics — vfx 로 넘어가지 않고 남아 있는 손그림 경로를 세기 위한 스텁.
 * Phaser 에서 Graphics 한 장은 자기 지오메트리를 들고 배치를 끊으므로,
 * '발동 한 번에 몇 장을 만드는가'가 그대로 비용이다.
 */
class GraphicsObj extends GameObj {
  constructor(scene) {
    super(scene);
    created.graphics++; live.graphics++;
    this.alpha = 1;
  }
  clear() { return this; }
  fillStyle() { return this; }
  lineStyle() { return this; }
  fillRect() { return this; }
  strokeRect() { return this; }
  fillCircle() { return this; }
  strokeCircle() { return this; }
  fillEllipse() { return this; }
  strokeEllipse() { return this; }
  fillTriangle() { return this; }
  strokeTriangle() { return this; }
  fillRoundedRect() { return this; }
  strokeRoundedRect() { return this; }
  lineBetween() { return this; }
  setPosition(x, y) { this.x = x; this.y = y; return this; }
  setDepth(d) { this.depth = d; return this; }
  setVisible() { return this; }
  save() { return this; }
  restore() { return this; }
  translateCanvas() { return this; }
  rotateCanvas() { return this; }
  scaleCanvas() { return this; }
  generateTexture() { return this; }
  beginPath() { return this; }
  moveTo() { return this; }
  lineTo() { return this; }
  closePath() { return this; }
  strokePath() { return this; }
  fillPath() { return this; }
  fillPoints() { return this; }
  setAlpha(a) { this.alpha = a; return this; }
  setScale() { return this; }
  setRotation() { return this; }
  setBlendMode() { return this; }
  destroy() {
    const wasAlive = !!this.scene;
    super.destroy();
    if (wasAlive) live.graphics--;
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
  setFilter() {}
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
  scene.sys = { displayList: { remove() {} }, isActive: () => scene.__alive !== false };
  // ScenePlugin — 실제 Phaser 씬의 `scene.scene.isActive()`. 이게 없으면 씬 생존을
  // 확인하는 호출부(TedAbility.startBlast 등)가 조용히 빠져나가 검사가 헛돈다
  scene.scene = { isActive: () => scene.__alive !== false };

  scene.__clock = new FakeClock(scene);

  scene.time = {
    timeScale: 1,
    // Phaser 의 Time.Clock.now 는 **timeScale 의 영향을 받지 않는 실시간**이다.
    // 이게 없으면 호출부의 경과 시간 계산이 전부 NaN 이 되고, 비교문이 조용히 false 가 되어
    // 연출 큐가 한 번도 안 돌면서도 검사는 통과한다 (실제로 그랬다)
    get now() { return Date.now(); },
    delayedCall: (ms, fn) => scene.__clock.add(ms, fn, 'time'),
    // repeat: -1 로 도는 타이머 — remove() 로 멈추지 않으면 영원히 스프라이트를 뱉는다
    addEvent: ({ delay, repeat = 0, callback }) => {
      const ev = { removed: false, left: repeat, remove() { this.removed = true; } };
      const tick = () => {
        if (ev.removed) return;
        callback();
        if (ev.left !== 0) { if (ev.left > 0) ev.left--; scene.__clock.add(delay, tick, 'time'); }
      };
      scene.__clock.add(delay, tick, 'time');
      return ev;
    },
    get pending() { return scene.__clock.pending; },
  };
  scene.anims = {
    globalTimeScale: 1,
    __keys: new Set(),
    // 애니메이션별 프레임 수 — play({startFrame}) 범위 검사에 쓴다
    __frames: new Map(),
    exists: k => scene.anims.__keys.has(k),
    create: cfg => {
      scene.anims.__keys.add(cfg.key);
      scene.anims.__frames.set(cfg.key, (cfg.frames ?? []).length);
    },
    // 레드는 시트 한 장에서 구간(걷기/포효 …)을 잘라 애니메이션을 직접 등록한다
    generateFrameNumbers: (key, { start = 0, end = 0 } = {}) =>
      Array.from({ length: end - start + 1 }, (_, i) => ({ key, frame: start + i })),
  };
  const textureKeys = new Set();
  scene.textures = {
    exists: k => textureKeys.has(k),
    // beam() 이 텍스처 원본 크기로 길이·두께 배율을 계산한다
    // setFilter — 픽셀 시트가 NEAREST 를 건다. 없으면 호출부가 던진다
    get: () => ({ getSourceImage: () => ({ width: 397, height: 96 }), setFilter() {} }),
    createCanvas: k => {
      textureKeys.add(k);
      textureBuilds.push({ key: k, t: Date.now() });
      return new FakeCanvasTexture(k);
    },
    addCanvas: k => { textureKeys.add(k); return new FakeCanvasTexture(k); },
    __addAsset: k => textureKeys.add(k),
  };
  scene.tweens = {
    timeScale: 1,
    add: cfg => {
      const tween = {
        progress: 0, removed: false,
        remove() { this.removed = true; },
        stop() { this.removed = true; },   // 반복 트윈은 stop() 으로 멈춘다
      };
      const targets = Array.isArray(cfg.targets) ? cfg.targets : [cfg.targets];
      const from = targets.map(t => ({ x: t?.x ?? 0, y: t?.y ?? 0 }));
      const duration = cfg.duration ?? 0;
      const TICK = 16;

      // 검증 대상은 회수 장부이지 그림이 아니므로 보간하는 값은 **좌표뿐**이다.
      // (projectile 의 onStep 경로 판정과 잔상 간격이 진행도에 묶여 있어 필요하다.
      //  alpha/scale 까지 건드리면 '생성 시점의 알파' 를 보는 검사가 깨진다)
      const tick = () => {
        if (tween.removed) return;
        tween.progress = duration > 0 ? Math.min(1, tween.progress + TICK / duration) : 1;
        const p = tween.progress;
        targets.forEach((t, i) => {
          if (!t) return;
          if (typeof cfg.x === 'number') t.x = from[i].x + (cfg.x - from[i].x) * p;
          if (typeof cfg.y === 'number') t.y = from[i].y + (cfg.y - from[i].y) * p;
        });
        cfg.onUpdate?.(tween);
        if (p >= 1) { cfg.onComplete?.(); return; }
        scene.__clock.add(TICK, tick, 'tweens');
      };

      scene.__clock.add(cfg.delay ?? 0, () => { if (!tween.removed) tick(); }, 'tweens');
      return tween;
    },
    killTweensOf: () => {},
  };
  const spawn = (x, y, key, frame) => {
    const o = new Sprite(scene);
    o.x = x; o.y = y; o.textureKey = key;
    // 실제 Phaser 의 GameObject 는 texture/frame 을 들고 있다 — 호출부가 여기서 키를 읽는다
    o.texture = { key };
    o.frame = { name: frame ?? 0 };
    if (key === 'fx_proc_arc') arcSpawns.push({ x, y, t: Date.now(), obj: o });
    if (key === 'fx_cubewave') waveSpawns.push({ t: Date.now() });
    // 전환 조각은 판본에 따라 텍스처가 다르다 (proc-shard / 픽셀 칸) — 둘 다 센다
    if (key === 'fx_proc_shard' || String(key).startsWith('fx_px_cubie')) {
      shardSpawns.push({ x, y, t: Date.now() });
    }
    if (typeof key === 'string' && key.startsWith('fxsheet_')) beamSpawns.push(key);
    return o;
  };
  scene.add = {
    sprite: (x, y, key, frame) => spawn(x, y, key, frame),
    image: (x, y, key, frame) => spawn(x, y, key, frame),
    particles: () => new ParticleEmitterObj(scene),
    // 전체 화면 섬광 사각형 (K 승계 연출) — 장부 밖이지만 destroy 는 불려야 한다
    rectangle: (x, y) => spawn(x, y, '__rect'),
    layer: () => new Layer(scene),
    graphics: () => new GraphicsObj(scene),
    // 보너스 점수 텍스트 — 장부에는 안 들어가지만 destroy 가 불려야 한다
    text: () => {
      const o = new GameObj(scene);
      o.setOrigin = () => o;
      o.alpha = 1;
      return o;
    },
  };
  // 로더는 즉시 성공한 것으로 취급 — 검증 대상은 회수 장부이지 네트워크가 아니다
  scene.load = {
    image: k => textureKeys.add(k),
    spritesheet: k => textureKeys.add(k),
  };
  scene.cameras = { main: { shake: () => {}, flash: () => {} } };
  // 레거시는 화면 전체에 불꽃을 뿌리고 빗줄기를 화면 폭에 걸쳐 떨군다
  scene.scale = { width: 360, height: 640 };
  // 센티넬 궤도가 프레임 델타로 각도를 굴린다
  scene.game = { renderer: { type: 2 }, loop: { delta: 16 } };
  // K 는 동반자(태이)를 물리 스프라이트로 만들고 특수똥 overlap 을 건다.
  // 계측 대상은 vfx 장부이므로 몸체는 필요한 표면만 흉내 낸다.
  scene.physics = {
    world: { timeScale: 1 },
    add: {
      sprite: (x, y, key) => {
        const o = spawn(x, y, key);
        o.displayWidth = 48; o.displayHeight = 64;
        o.body = { setAllowGravity: () => {} };
        o.setDisplaySize = (w, h) => { o.displayWidth = w; o.displayHeight = h; return o; };
        o.setVelocityX = () => o;
        o.setY = v => { o.y = v; return o; };
        o.setTexture = k => { o.textureKey = k; return o; };
        return o;
      },
      overlap: () => ({ destroy() {} }),
    },
  };
  scene.children = { moveBelow: () => {} };

  return scene;
}

const Phaser = {
  WEBGL: 2,
  CANVAS: 1,
  BlendModes: { NORMAL: 0, ADD: 1 },
  Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } },
  GameObjects: { Events: { DESTROY } },
  Animations: { Events: { ANIMATION_COMPLETE: ANIM_COMPLETE } },
  Utils: { Array: { GetRandom: a => a[Math.floor(Math.random() * a.length)] } },
  Textures: { FilterMode: { LINEAR: 0, NEAREST: 1 } },
  Math: {
    DegToRad: d => (d * Math.PI) / 180,
    Angle: {
      Between: (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1),
      // (-PI, PI] 로 접는다. 퍼지는 말의 '머리가 앞' 각도가 이걸 쓴다
      Wrap: a => {
        const r = (a + Math.PI) % (Math.PI * 2);
        return (r < 0 ? r + Math.PI * 2 : r) - Math.PI;
      },
    },
    Clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    Distance: { Between: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1) },
    Between: (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1)),
    FloatBetween: (lo, hi) => lo + Math.random() * (hi - lo),
    Linear: (a, b, u) => a + (b - a) * u,
  },
};

export default Phaser;
