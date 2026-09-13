import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import { type GameSceneAPI } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import {
  RED_PARAMS, RED_SPARROW_SHEETS, RED_SPARROW_UP_SHEETS, RED_TREX_SHEET, RED_ROBOT_SHEET,
} from '../config/abilityParams';
import { fxPickSheetKey, fxSprite, playFx, burst, impact } from '../utils/vfx';

/** 시트별 프레임 구간 — 그림을 열어 확인한 값이다 */
const SPARROW_FLAP  = { start: 0, end: 3, fps: 12 };  // 날갯짓 루프
const TREX_WALK     = { start: 0, end: 3, fps: 9 };   // 네 발로 걷기
const TREX_ROAR     = { start: 4, end: 5, fps: 5 };   // 몸 세워 입 벌림
const ROBOT_FALL    = { start: 0, end: 1, fps: 8 };   // 검 내린 채 강하
const ROBOT_RAISE   = { start: 2, end: 3, fps: 9 };   // 검 들어올림 (예비 동작)
const ROBOT_SLASH   = { start: 4, end: 5, fps: 12 };  // 베고 난 뒤

/** 시트 원본 프레임 크기 — 표시 배율을 여기서 나눈다 */
const SPARROW_FRAME_PX = 128;
const TREX_FRAME_H     = 192;
const ROBOT_FRAME_H    = 192;
/**
 * 로봇 그림이 프레임에서 차지하는 **가로** 비율 (전 프레임 알파 bbox 합집합 136/192).
 * 표시 높이 × 이 값 = 실제로 보이는 가로 폭 — 화면 밖으로 잘리지 않게 자르는 데 쓴다.
 */
const ROBOT_ART_W = 136 / 192;

const DEPTH_SPARROW = 6;       // 플레이어(0)·똥(0) 위. 궤도가 머리 위라 가려질 일이 없다
const DEPTH_TREX    = 5;
const DEPTH_ROBOT   = 7;
const DEPTH_RING    = 8;
const DEPTH_FLASH   = 320;     // 테드 결합 섬광과 같은 대역

/**
 * `proc-ring.png` 에서 **밝은 선이 있는 반지름**(px). 프레임은 192x192 라 반지름이
 * 96 이지만, 선은 그 안쪽 0.91 지점에 있다 (`scripts/measure-ring.py` 로 실측).
 *
 * 링 배율을 이 값으로 나눠야 **보이는 링 = 지워지는 범위**가 된다. 예전에는 92 로
 * 나누고 있었는데(프레임 지름을 192 가 아니라 92 로 착각), 그러면 링이 실제 판정보다
 * 1.9배 넓게 그려져 "링에 닿았는데 안 지워진다" 가 된다.
 */
const RING_ART_RADIUS = 87.4;

/**
 * 포효 링의 **보험 타이머**. 반드시 링 트윈(둘째 겹 = 지연 + 지속)보다 길어야 한다.
 *
 * 짧으면 보험이 먼저 링을 파괴하면서 트윈까지 취소해 `onComplete` 의 회수가
 * 영영 안 불린다 (`lifeMs 420` vs `90 + 380 = 470` 이었다).
 * 하네스 `[C2b]` 가 이 부등식을 지킨다 — 값을 만질 때 같이 본다.
 */
export const ROAR_RING_LIFE_MS =
  RED_PARAMS.trexRingDelayMs + RED_PARAMS.trexRingMs + 120;

/**
 * 호 길이 등분용 누적표. `orbitRx`/`orbitRy` 가 상수라 모듈 로드 때 한 번만 만든다
 * (256칸 = 2KB, 참새 5마리라 조회 비용은 무시할 수준).
 */
/**
 * 좌우 끝(가로 속도 0) 부근에서 뒤집힘을 얼마나 붙잡아 둘지. `|sin θ|` 기준이라
 * 0.06 은 극점에서 약 3.4도 — 눈에 안 띄는 폭이면서 부호 떨림은 확실히 막는다.
 */
const FLIP_DEADZONE = 0.06;

const ARC_LUT_N = 256;
const ARC_LUT: number[] = (() => {
  const cum = [0];
  const dt = (Math.PI * 2) / ARC_LUT_N;
  for (let k = 1; k <= ARC_LUT_N; k++) {
    const tm = (k - 0.5) * dt;
    cum.push(cum[k - 1] + Math.hypot(
      RED_PARAMS.orbitRx * Math.sin(tm),
      RED_PARAMS.orbitRy * Math.cos(tm),
    ) * dt);
  }
  return cum;
})();

/**
 * 정규화 호 길이 `s`(0~1) → 궤도 각도.
 *
 * **각도로 등분하면 납작한 타원의 좌우 끝에서 참새가 뭉친다.** 좌우 끝에 걸친 두
 * 마리는 x 가 같고 y 만 다르므로 간격이 `1.176 x orbitRy` 로 고정되고 — `orbitRx` 를
 * 아무리 키워도 그 간격은 **1px 도 안 넓어진다**. 호 길이로 등분하면 눈에 보이는
 * 둘레를 고르게 나누므로 그 지점이 벌어진다 (14.1 → 18.6px).
 *
 * 도는 속도도 같이 고와진다 — 등각이면 좌우 끝에서 호 속도가 `ry/rx` 배로 느려져
 * 참새가 거기 머물다 위아래로 휙 지나간다.
 */
function arcTheta(s: number): number {
  const TAU = Math.PI * 2;
  const u = ((s % 1) + 1) % 1;
  if (!RED_PARAMS.orbitArcEven) return u * TAU;

  const target = u * ARC_LUT[ARC_LUT_N];
  let lo = 1;
  let hi = ARC_LUT_N;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ARC_LUT[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  // 칸 안에서 선형 보간 — 256칸이면 이것 없이도 오차가 1.4도지만 공짜에 가깝다
  const a = ARC_LUT[lo - 1];
  const b = ARC_LUT[lo];
  const f = b > a ? (target - a) / (b - a) : 0;
  return ((lo - 1 + f) / ARC_LUT_N) * TAU;
}

/**
 * **머리 꼭대기**의 y. 표시 상자의 위가 아니다 — 캐릭터 원화는 위쪽에 빈칸이 있고
 * (레드는 표시 높이의 17.3%), 상자 위에서 재면 참새가 그만큼 더 떠 보인다.
 */
function headTopY(player: GameSceneAPI['player']): number {
  return player.y - player.displayHeight * (0.5 - RED_PARAMS.orbitHeadInsetH);
}

/**
 * 포효 광역 반경(px). **화면 폭 비율**이라 기기 폭이 달라져도 체감이 같다.
 * 로봇 마무리는 화면 전체(Infinity)를 지우므로 둘은 "절반 vs 전체" 로 갈린다.
 */
function trexRadius(scene: Phaser.Scene): number {
  return scene.scale.width * RED_PARAMS.trexRadiusW;
}

const RED = 0xd93b3b;
const FLASH_ALPHA = 0.26;
const FLASH_FADE_MS = 140;

/** 궤도를 도는 참새 한 마리 */
interface Orbiter {
  ob: Phaser.GameObjects.Sprite;
  /**
   * 궤도 **호 길이** 진행도 (0~1). 매 프레임 일정하게 는다.
   * 각도가 아니라 호 길이인 이유는 {@link arcTheta} 주석에 있다.
   */
  s: number;
  /** 개체 번호 — 발사할 때 짝이 되는 '위 보는' 시트를 찾는 데 쓴다 */
  kind: number;
  /** 지금 뒤집혀 있는가. 좌우 끝(가로 속도 0)에서 깜빡이지 않게 기억해 둔다 */
  flip: boolean;
}

/** 발사되어 위로 올라가는 참새 */
interface Shot {
  ob: Phaser.GameObjects.Sprite;
  done: boolean;
}

/**
 * 레드 (SR) — 참새 동료.
 *
 * 참새 {@link RED_PARAMS.sparrowCount}마리가 머리 위 **타원** 궤도를 돈다.
 * {@link RED_PARAMS.sparrowInterval}점마다 한 마리가 곧장 위로 날아가고,
 * 지나는 길의 **일반 똥 하나**를 부수고 자신도 사라진다.
 * **빗나가도 소모된다** — 그래서 발사 간격이 짧다 (맞을 때만 소모하면 마무리 주기가
 * 상황에 따라 한없이 늘어져 능력이 안 터진 것처럼 느껴진다).
 *
 * 다섯이 다 비면 마무리가 한 번 나온다:
 * - 보통은 **티라노**가 걸어나와 포효 → 반경 {@link RED_PARAMS.trexRadiusW} 안의 일반 똥
 * - {@link RED_PARAMS.robotChance} 확률로 **로봇**이 대신 하늘에서 강하해 베기 → 화면 전체
 *
 * 마무리가 끝나면 참새 다섯이 다시 채워진다.
 *
 * ## 시트를 쓰는 방식
 *
 * 일곱 장 모두 `vfx.ts` 의 `FX_SHEETS` 에 등록하지 **않는다**. 레드 전용 3.2MB 를
 * 전원에게 올릴 이유가 없고, 등록하면 `FxKey` 유니온까지 커진다. 대신 테드의 체스 말과
 * 같은 길(`character.ts` 의 `extraFxSheets` → `loadFxPickSheet`)로 텍스처만 올리고,
 * **애니메이션은 이 파일이 직접 등록한다** (테드는 정지 프레임만 써서 필요 없었다).
 *
 * ## 정리
 *
 * 만든 스프라이트는 전부 {@link tracked} 에 담고 {@link onDestroy} 에서 회수한다.
 * 트윈은 스프라이트가 죽으면 따라 죽지만, 예약 타이머는 씬이 내려간 뒤에도 불리므로
 * {@link timers} 로 따로 잡아 둔다 (매화와 같은 구조).
 */
export class RedAbility extends BaseAbility {
  private orbit: Orbiter[] = [];
  private shots: Shot[] = [];
  private tracked = new Set<Phaser.GameObjects.GameObject>();
  private timers: Phaser.Time.TimerEvent[] = [];
  /** 마지막으로 발사를 건 점수 — 보너스 점수로 재진입하는 것을 막는다 */
  private lastLaunchScore = 0;
  /** 마무리 연출이 도는 중. 이 동안에는 발사도 재보충도 하지 않는다 */
  private finishing = false;
  /** 씬이 내려간 뒤 예약이 깨어나도 아무 일도 안 하게 하는 빗장 */
  private dead = false;

  // ── 수명 ────────────────────────────────────────────────────────────
  override onCreate(api: GameSceneAPI): void {
    this.dead = false;
    this.registerAnims(api.scene);
    this.refillOrbit(api);
  }

  override onDestroy(_api: GameSceneAPI): void {
    this.dead = true;
    this.timers.forEach(t => t.remove(false));
    this.timers = [];
    this.orbit.forEach(o => o.ob.destroy());
    this.shots.forEach(s => s.ob.destroy());
    this.orbit = [];
    this.shots = [];
    this.tracked.forEach(o => o.destroy());
    this.tracked.clear();
  }

  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    if (score % RED_PARAMS.sparrowInterval !== 0) return;
    // **자기 보너스로 들어온 마일스톤은 삼킨다.** 이게 재진입 가드의 본체다 —
    // 기준선(lastLaunchScore)만으로는 보너스가 다음 배수를 넘길 때 못 막는다
    if (this.awarding) return;
    if (score <= this.lastLaunchScore) return;
    this.lastLaunchScore = score;
    if (this.finishing || this.orbit.length === 0) return;
    this.launch(api);
  }

  override onUpdate(api: GameSceneAPI): void {
    if (this.dead) return;
    this.spinOrbit(api);
    this.flyShots(api);
  }

  // ── 궤도 ────────────────────────────────────────────────────────────
  /**
   * 머리 위 **타원** 궤도. 정원으로 그리면 원이 서 있어서 "옆에서 도는" 것이 되고,
   * 눕혀야 "머리 위를 도는" 것으로 읽힌다.
   *
   * 앞뒤는 depth 로 못 만든다 — 배경·플레이어·똥이 전부 depth 0 이라 그 사이에 끼울
   * 자리가 없다 (음수로 내리면 배경 뒤로 간다). 대신 **뒤쪽 반원에서 축소·감광**해
   * 원근을 만든다. 궤도가 머리 위에 떠 있어 애초에 겹치지 않으므로 이걸로 충분하다.
   */
  private spinOrbit(api: GameSceneAPI): void {
    if (this.orbit.length === 0) return;
    const { player, scene } = api;
    const dt = scene.game.loop.delta / 1000;
    // 호 길이 진행도를 일정하게 올린다 — 각도가 아니다 (arcTheta 주석 참고)
    const step = (dt * 1000) / RED_PARAMS.orbitMs;
    const cy = headTopY(player) - RED_PARAMS.orbitAbove;

    for (const o of this.orbit) {
      o.s = (o.s + step) % 1;
      const theta = arcTheta(o.s);
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      o.ob.setPosition(player.x + cos * RED_PARAMS.orbitRx, cy + sin * RED_PARAMS.orbitRy);
      // sin > 0 = 앞쪽(아래) 반원
      const front = sin > 0;
      const k = front ? 1 : RED_PARAMS.orbitBackScale;
      o.ob.setScale(this.sparrowScale() * k);
      o.ob.setAlpha(front ? 1 : RED_PARAMS.orbitBackAlpha);
      // 시트는 전부 왼쪽을 본다 — **가는 방향**으로 뒤집는다.
      // x = player.x + cos(θ)·Rx 이므로 가로 속도는 `dx/dθ = -sin(θ)·Rx` 다.
      // 오른쪽으로 가는 것은 `sin(θ) < 0`(뒤쪽 반원)일 때다 — 예전엔 `cos > 0`,
      // 즉 **있는 자리**로 판단해서 절반 구간에서 뒤로 나는 그림이 됐다.
      // 좌우 끝은 가로 속도가 0 이라 부호가 흔들릴 수 있다 → 그 근처에서는
      // 직전 방향을 유지한다 (히스테리시스)
      if (Math.abs(sin) > FLIP_DEADZONE) o.flip = sin < 0;
      o.ob.setFlipX(o.flip);
    }
  }

  private refillOrbit(api: GameSceneAPI): void {
    if (this.dead) return;
    const { scene, player } = api;
    const cy = headTopY(player) - RED_PARAMS.orbitAbove;

    for (let i = 0; i < RED_PARAMS.sparrowCount; i++) {
      const kind = i % RED_SPARROW_SHEETS.length;
      const sheet = RED_SPARROW_SHEETS[kind];
      const key = fxPickSheetKey(sheet);
      if (!scene.textures.exists(key)) continue;     // 시트가 안 올라왔으면 조용히 건너뛴다
      // 호 길이로 등분한다 — 각도로 나누면 타원 좌우 끝에 뭉친다
      const s0 = i / RED_PARAMS.sparrowCount;
      const theta = arcTheta(s0);
      const ob = scene.add.sprite(
        player.x + Math.cos(theta) * RED_PARAMS.orbitRx,
        cy + Math.sin(theta) * RED_PARAMS.orbitRy,
        key,
      )
        .setDepth(DEPTH_SPARROW)
        .setScale(this.sparrowScale());
      // 다섯이 한 박자로 퍼덕이면 부채처럼 보인다 — 위상을 어긋뜨린다 (구미호 꼬리와 같은 이유)
      ob.play({ key: this.animKey(sheet, 'flap'), startFrame: i % 4 });
      this.orbit.push({ ob, s: s0, kind, flip: Math.sin(theta) < 0 });
      this.track(ob);
    }
  }

  private sparrowScale(): number {
    return RED_PARAMS.sparrowFrame / SPARROW_FRAME_PX;
  }

  // ── 발사 ────────────────────────────────────────────────────────────
  /**
   * 궤도에서 한 마리를 떼어 **곧장 위로** 보낸다.
   *
   * 가장 위에 있는(= 위상이 가장 앞선) 마리부터 보낸다. 아무 마리나 고르면
   * 아래쪽에 있던 새가 플레이어를 뚫고 올라가는 그림이 나온다.
   */
  private launch(api: GameSceneAPI): void {
    const { scene } = api;
    let best = 0;
    for (let i = 1; i < this.orbit.length; i++) {
      if (Math.sin(arcTheta(this.orbit[i].s)) < Math.sin(arcTheta(this.orbit[best].s))) best = i;
    }
    const [o] = this.orbit.splice(best, 1);
    o.ob.setAlpha(1).setScale(this.sparrowScale()).setFlipX(false);
    // 위 보는 시트가 있으면 **그림 자체가 위를 본다** — 기울이지 않는다.
    // 없으면(시트 미로딩) 예전처럼 옆모습을 살짝 기울여 흉내 낸다
    const up = this.upSprite(api, o);
    if (up) {
      this.shots.push({ ob: up, done: false });
      this.crossFade(scene, o.ob, up);
    } else {
      o.ob.setRotation(-0.35);
      this.shots.push({ ob: o.ob, done: false });
    }

    // 떠나는 자리에 깃털 한 줌 — 발사가 일어났다는 신호
    burst(scene, o.ob.x, o.ob.y, 'shard', {
      count: 4, tint: [RED, 0xe8c9a0, 0xffffff], speed: 0.7, scale: 0.5,
      depth: DEPTH_SPARROW - 1, blend: 'normal',
    });
  }

  /**
   * 발사용 '위 보는' 스프라이트. 궤도 스프라이트와 **같은 자리·같은 날갯짓 프레임**으로
   * 띄운다 — 프레임을 안 맞추면 날개가 끊긴다.
   *
   * 시트가 안 올라왔으면 `null` 을 돌려 호출부가 예전 방식(옆모습 기울이기)으로
   * 넘어가게 한다. 시트 하나 때문에 능력이 죽으면 안 된다.
   */
  private upSprite(api: GameSceneAPI, o: Orbiter): Phaser.GameObjects.Sprite | null {
    const { scene } = api;
    const sheet = RED_SPARROW_UP_SHEETS[o.kind];
    const key = fxPickSheetKey(sheet);
    if (!scene.textures.exists(key)) return null;
    const anim = this.animKey(sheet, 'flap');
    if (!scene.anims.exists(anim)) return null;

    const ob = scene.add.sprite(o.ob.x, o.ob.y, key)
      .setDepth(DEPTH_SPARROW)
      .setScale(this.sparrowScale());
    // 날갯짓 위상을 그대로 이어받는다 (옆·위 시트가 같은 4프레임이라 번호가 통한다).
    //
    // **Phaser 의 `currentFrame.index` 는 1부터 센다** (`frame.index = i + 1`).
    // 그대로 `startFrame` 에 넣으면 마지막 프레임에서 배열 밖을 가리킨다 — Phaser 의
    // 방어 코드가 `startFrame > totalFrames` 라 4프레임에서 4가 그대로 통과하고,
    // `anim.frames[4]` 가 undefined 라 `getFirstTick` 에서 게임이 죽는다.
    const last = SPARROW_FLAP.end - SPARROW_FLAP.start;
    const cur = o.ob.anims.currentFrame?.index ?? 1;
    ob.play({ key: anim, startFrame: Phaser.Math.Clamp(cur - 1, 0, last) });
    this.track(ob);
    return ob;
  }

  /** 옆모습 → 위 보는 모습. 실루엣이 툭 바뀌지 않게 겹쳐 넘긴다 */
  private crossFade(
    scene: Phaser.Scene,
    from: Phaser.GameObjects.Sprite,
    to: Phaser.GameObjects.Sprite,
  ): void {
    const ms = RED_PARAMS.sparrowTurnMs;
    if (ms <= 0) { this.discard(from); return; }
    to.setAlpha(0);
    scene.tweens.add({ targets: to, alpha: 1, duration: ms });
    scene.tweens.add({
      targets: from,
      alpha: 0,
      duration: ms,
      onComplete: () => this.discard(from),
    });
    // 넘어가는 동안 옆모습도 같이 올라가야 두 장이 안 벌어진다
    scene.tweens.add({
      targets: from,
      y: from.y - (RED_PARAMS.sparrowSpeed * ms) / 1000,
      duration: ms,
    });
  }

  /**
   * 올라가는 참새를 옮기고 **지나간 길의 일반 똥을 전부** 부순다.
   *
   * 예전에는 첫 똥 하나를 부수고 그 자리에서 소모됐다. 그래서 한 번 발사의 성과가
   * **0 아니면 한 개**였고, 빗나간 마리도 소모되니 5마리(=250점)를 성과 없이
   * 흘려보내는 판이 나왔다. 테드의 체스 말·하이디의 점프는 이미 경로 전체를 쓴다.
   *
   * **똥을 부숴도 멈추지 않는다.** 화면 위로 나갈 때까지 올라간다 — '격추' 라는
   * 컨셉에도 그쪽이 맞다.
   */
  private flyShots(api: GameSceneAPI): void {
    if (this.shots.length === 0) return;
    const { scene } = api;
    const dt = scene.game.loop.delta / 1000;
    const dy = RED_PARAMS.sparrowSpeed * dt;

    let smashed = 0;
    for (const s of this.shots) {
      if (s.done) continue;
      const y0 = s.ob.y;                 // 옮기기 전 자리 — 지나간 **선분**을 판정한다
      s.ob.y -= dy;
      const n = this.smashPoops(api, s.ob.x, s.ob.y, y0);
      smashed += n;
      if (n > 0) {
        burst(scene, s.ob.x, s.ob.y, 'shard', {
          count: 5, tint: [RED, 0xffffff], speed: 0.9, scale: 0.5,
          depth: DEPTH_SPARROW - 1, blend: 'normal',
        });
      }
      if (s.ob.y < -RED_PARAMS.sparrowFrame) {     // 소모는 **화면 밖에서만**
        s.done = true;
        this.discard(s.ob);
      }
    }

    this.shots = this.shots.filter(s => !s.done);
    // 점수는 **순회가 끝난 뒤 한 번에** 준다. 루프 안에서 주면 addAbilityBonus 가
    // 도는 동안 this.shots 가 바뀔 수 있다 (빗장이 막아 주지만 구조로도 안 걸어 둔다)
    if (smashed > 0) this.award(api, smashed * RED_PARAMS.sparrowPoints);
    // 마지막 한 마리까지 다 쓰였으면 마무리로 넘어간다
    if (!this.finishing && this.orbit.length === 0 && this.shots.length === 0) {
      this.startFinisher(api);
    }
  }

  /**
   * 참새가 지나간 **선분 위의 일반 똥을 전부** 부수고 개수를 돌려준다.
   *
   * **일반 똥만** 친다. 금·다이아·토파즈·무지개는 플레이어가 먹어야 하는 보너스라
   * 없애면 도와주는 게 아니라 뺏는 것이 된다 (테드·K 도 같은 이유로 일반 똥만 친다).
   */
  private smashPoops(api: GameSceneAPI, x: number, y: number, yPrev = y): number {
    const r = RED_PARAMS.sparrowHitR;
    const r2 = r * r;
    // **지나간 자리까지 본다.** 지금 좌표만 보면 한 프레임에 판정 지름보다 많이
    // 움직였을 때 똥을 뚫고 지나간다 — 620px/s 라 프레임이 71ms 넘게 밀리면 그렇다.
    // 테드 낙하·하이디 점프가 쓰는 것과 같은 **점-선분 거리 판정**이다.
    // 참새는 수직으로만 날므로 세로를 구간에 물리는 것으로 족하다
    const lo = Math.min(y, yPrev);
    const hi = Math.max(y, yPrev);
    // 회수가 목록을 건드릴 수 있으니 사본으로 돈다 (clearPoops 와 같은 이유)
    const list = (api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[]).slice();
    let n = 0;
    for (const p of list) {
      if (!p.active) continue;
      const dx = p.x - x;
      const dy = p.y - Phaser.Math.Clamp(p.y, lo, hi);
      if (dx * dx + dy * dy > r2) continue;
      (p as unknown as PoolablePoopBase).recycle();   // 타격 이펙트는 recycle 안에서 나온다
      n++;
    }
    return n;
  }

  // ── 마무리 ──────────────────────────────────────────────────────────
  /**
   * 마무리 시작 — 티라노(또는 로봇)가 **등장하는 그 순간** 참새를 다시 채운다.
   *
   * 예전엔 마무리가 **끝난 뒤**에 채웠다. 티라노가 걸어와 포효하고 나가는 2.1초 동안
   * 머리 위가 텅 비어서, 탄이 다 떨어진 채로 연출만 보는 그림이 됐다.
   * 등장과 동시에 채우면 "티라노가 나오면서 재장전된다"로 읽힌다.
   *
   * **발사는 마무리가 끝날 때까지 계속 막는다** (`onScoreMilestone` 의 `finishing` 검사).
   * 마무리 도중에 다섯을 다 쏘면 끝나자마자 궤도가 비어 다음 마무리가 곧바로 걸린다 —
   * 티라노가 연달아 나오는 그림이 된다.
   */
  private startFinisher(api: GameSceneAPI): void {
    this.finishing = true;
    this.refillOrbit(api);
    if (Math.random() < RED_PARAMS.robotChance) this.robotFinisher(api);
    else this.trexFinisher(api);
  }

  /** 마무리가 끝나면 발사를 다시 연다 (채우기는 {@link startFinisher} 에서 이미 했다) */
  private endFinisher(api: GameSceneAPI): void {
    if (this.dead) return;
    this.finishing = false;
    // 보험 — 시트가 없어 등장 때 못 채웠거나 중간에 비었으면 여기서 채운다.
    // 비어 있는 채로 마무리를 끝내면 다음 프레임에 또 마무리가 걸린다
    if (this.orbit.length === 0) this.refillOrbit(api);
  }

  /**
   * 티라노 — 화면 밖에서 걸어 들어와 포효하고 다시 나간다.
   *
   * 시트는 걷기 4프레임 + 포효 2프레임뿐이라 **포효를 시트로 끌지 못한다.**
   * 파동·셰이크·히트스톱을 코드로 얹어 그 구간을 채운다 (테드 큐브와 같은 분담).
   */
  private trexFinisher(api: GameSceneAPI): void {
    const { scene, player } = api;
    const key = fxPickSheetKey(RED_TREX_SHEET);
    if (!scene.textures.exists(key)) { this.endFinisher(api); return; }

    const { width: W } = scene.scale;
    // 플레이어가 있는 쪽 반대편에서 들어온다 — 캐릭터를 밟고 지나가지 않게
    const fromLeft = player.x > W / 2;
    const groundY = player.y + player.displayHeight / 2;
    const scale = RED_PARAMS.trexFrame / TREX_FRAME_H;
    const startX = fromLeft ? -RED_PARAMS.trexFrame : W + RED_PARAMS.trexFrame;
    // **서는 자리는 반경과 무관하다.** 몸이 겹치지 않을 만큼만 떨어져 선다 —
    // 예전엔 `trexRadius * 0.45` 라 반경을 키우면 티라노가 괜히 멀찍이 섰다.
    // 화면 밖으로 나가 서지 않도록 몸 반폭만큼 여유를 두고 자른다
    const edge = RED_PARAMS.trexFrame * 0.5;
    const stopX = Phaser.Math.Clamp(
      player.x + (fromLeft ? -1 : 1) * RED_PARAMS.trexStandGap,
      edge, W - edge,
    );

    const trex = scene.add.sprite(startX, groundY, key)
      .setDepth(DEPTH_TREX)
      .setOrigin(0.5, 1)          // 발이 바닥선에 닿게
      .setScale(scale)
      .setFlipX(fromLeft);        // 시트는 왼쪽을 본다 → 오른쪽으로 걸으면 뒤집는다
    trex.play(this.animKey(RED_TREX_SHEET, 'walk'));
    this.track(trex);

    scene.tweens.add({
      targets: trex,
      x: stopX,
      duration: RED_PARAMS.trexWalkMs,
      ease: 'Sine.easeOut',
      onComplete: () => {
        if (this.dead || !trex.active) return;
        trex.play(this.animKey(RED_TREX_SHEET, 'roar'));
        this.roar(api, trex.x, groundY - RED_PARAMS.trexFrame * 0.55);
        this.later(api, RED_PARAMS.trexRoarMs, () => {
          if (this.dead || !trex.active) return;
          trex.play(this.animKey(RED_TREX_SHEET, 'walk'));
          trex.setFlipX(!fromLeft);
          scene.tweens.add({
            targets: trex,
            x: startX,
            duration: RED_PARAMS.trexLeaveMs,
            ease: 'Sine.easeIn',
            onComplete: () => { this.discard(trex); this.endFinisher(api); },
          });
        });
      },
    });
  }

  /** 포효 — 파동 두 겹이 밖으로 퍼지고, 반경 안의 일반 똥이 한꺼번에 걷힌다 */
  private roar(api: GameSceneAPI, x: number, y: number): void {
    const { scene } = api;
    const R = trexRadius(scene);

    for (let i = 0; i < 2; i++) {
      const ring = fxSprite(scene, x, y, 'fx_proc_ring', {
        depth: DEPTH_RING,
        blend: 'add',
        tint: i === 0 ? 0xffe0a0 : RED,
        alpha: 0.55,
        scale: [0.3, 0.3],
        // **보험 타이머는 트윈보다 길어야 한다.** 짧으면 트윈이 끝나기 전에 링을
        // 파괴하면서 트윈을 취소해 `onComplete` 가 영영 안 불린다.
        // 둘째 겹은 `delay 90 + duration 380 = 470ms` 라 420 으로는 모자랐다
        lifeMs: ROAR_RING_LIFE_MS,
        slot: 'redRoar',
        maxConcurrent: 2,
      });
      if (!ring) continue;
      this.track(ring);
      // **눈에 보이는 링 = 지워지는 범위.** 배율은 원화의 밝은 선 반지름으로 나눈다
      // (프레임 반지름이 아니다 — 선은 프레임 안쪽 0.91 지점에 있다)
      const to = (R / RING_ART_RADIUS) * (i === 0 ? 1 : RED_PARAMS.trexRingInner);
      scene.tweens.add({
        targets: ring,
        scaleX: to, scaleY: to, alpha: 0,
        duration: RED_PARAMS.trexRingMs,
        delay: i * RED_PARAMS.trexRingDelayMs,
        ease: 'Cubic.easeOut',
        onComplete: () => this.discard(ring),
      });
    }
    burst(scene, x, y, 'smoke', { count: 8, scale: 0.7, depth: DEPTH_TREX - 1 });
    // 포효는 '밀어내는' 감각 — 셰이크를 길게, 히트스톱은 짧게
    impact(scene, {
      hitstop: 45,
      shake: { duration: 220, intensity: 0.006 },
    });

    const n = this.clearPoops(api, x, y, R);
    if (n > 0) this.award(api, n * RED_PARAMS.trexPoints);
  }

  /**
   * 로봇 — 하늘에서 강하해 한 번 베고 **화면 전체**를 지운다.
   *
   * 로봇 시트에는 칼 궤적이 없다. 참격은 이미 있는 `swordSlash` 시트를 얹어 만든다
   * (전원 preload 라 추가 VRAM 이 0 이다).
   */
  private robotFinisher(api: GameSceneAPI): void {
    const { scene, player } = api;
    const key = fxPickSheetKey(RED_ROBOT_SHEET);
    if (!scene.textures.exists(key)) { this.trexFinisher(api); return; }

    const { width: W, height: H } = scene.scale;
    const scale = RED_PARAMS.robotFrame / ROBOT_FRAME_H;
    const landY = H * 0.42;

    // 플레이어 위로 떨어지되 **화면 안에 들어오게** 자른다. 로봇 그림은 프레임의
    // 가로 0.708 을 차지하므로, 플레이어가 화면 가장자리(x=23)에 붙으면 몸 절반이
    // 잘려 나갔다 (지금 크기에서도 19.5px). 로봇은 화면 전체를 지우니 서는 자리가
    // 판정에 영향을 주지 않는다 — 잘리지 않게 옮겨도 게임은 그대로다
    const halfW = RED_PARAMS.robotFrame * ROBOT_ART_W * 0.5;
    const dropX = Phaser.Math.Clamp(player.x, halfW, W - halfW);

    const robot = scene.add.sprite(dropX, -RED_PARAMS.robotFrame, key)
      .setDepth(DEPTH_ROBOT)
      .setScale(scale);
    robot.play(this.animKey(RED_ROBOT_SHEET, 'fall'));
    this.track(robot);

    scene.tweens.add({
      targets: robot,
      y: landY,
      duration: RED_PARAMS.robotFallMs,
      ease: 'Quad.easeIn',
      onComplete: () => {
        if (this.dead || !robot.active) return;
        // 예비 동작 — 검을 들어올리는 동안 멈춘다. 짧고 강한 파열은 이 정적이 만든다
        robot.play(this.animKey(RED_ROBOT_SHEET, 'raise'));
        this.later(api, RED_PARAMS.robotRaiseMs, () => {
          if (this.dead || !robot.active) return;
          robot.play(this.animKey(RED_ROBOT_SHEET, 'slash'));
          this.slash(api, robot.x, robot.y, W);
          this.later(api, RED_PARAMS.robotSlashMs, () => {
            if (this.dead || !robot.active) return;
            scene.tweens.add({
              targets: robot,
              y: -RED_PARAMS.robotFrame,
              alpha: 0.2,
              duration: RED_PARAMS.robotLeaveMs,
              ease: 'Quad.easeIn',
              onComplete: () => { this.discard(robot); this.endFinisher(api); },
            });
          });
        });
      },
    });
  }

  /** 베기 — 참격 시트 + 한 프레임 섬광. 그 순간 화면의 일반 똥이 전부 사라진다 */
  private slash(api: GameSceneAPI, x: number, y: number, W: number): void {
    const { scene } = api;

    playFx(scene, 'swordSlash', x, y, {
      scale: (W * 1.1) / 256,        // slash_256x192 → 화면 폭을 넘게 뻗는다
      depth: DEPTH_ROBOT + 1,
      rotation: -0.18,
      alpha: 0.95,
    });

    // **일반 블렌드**여야 밝은 배경에서도 컷으로 읽힌다 (가산 흰색은 아무 일도 안 일어난 것처럼 보인다)
    const rect = scene.add.rectangle(W / 2, scene.scale.height / 2, W, scene.scale.height,
      0xffffff, FLASH_ALPHA)
      .setDepth(DEPTH_FLASH)
      .setScrollFactor(0);
    this.track(rect);
    scene.tweens.add({
      targets: rect, alpha: 0, duration: FLASH_FADE_MS,
      onComplete: () => this.discard(rect),
    });

    impact(scene, {
      hitstop: 70,
      shake: { duration: 140, intensity: 0.009 },
      punch: { target: api.player, amount: 1.08, duration: 200 },
    });

    const n = this.clearPoops(api, 0, 0, Infinity);
    if (n > 0) this.award(api, n * RED_PARAMS.robotPoints);
  }

  // ── 공통 ────────────────────────────────────────────────────────────
  /**
   * 반경 안의 일반 똥을 **조용히** 걷는다.
   *
   * `recycle(true)` 인 이유: 한 번에 여러 개가 사라지는데 개마다 타격 이펙트를 깔면
   * 상한만 잡아먹고 화면이 하얘진다. 파동이 이미 "쓸어냈다"를 말하고 있다.
   */
  private clearPoops(api: GameSceneAPI, x: number, y: number, r: number): number {
    const r2 = r * r;
    const list = (api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[]).slice();
    let n = 0;
    for (const p of list) {
      if (!p.active) continue;
      if (r !== Infinity) {
        const dx = p.x - x;
        const dy = p.y - y;
        if (dx * dx + dy * dy > r2) continue;
      }
      (p as unknown as PoolablePoopBase).recycle(true);
      n++;
    }
    return n;
  }

  /**
   * 보너스 점수. {@link BaseAbility.awardBonus} 가 **주는 동안 빗장을 걸어**
   * 자기 보너스로 다시 발사되지 않게 한다.
   *
   * 예전에는 `lastLaunchScore += amount` 로 기준선을 올렸다. 두 가지가 틀렸다 —
   * 보너스가 다음 배수를 넘기면 그대로 통과했고 (Codex 재현: `last=50`·점수 90·+25 →
   * 100 에서 추가 발사), 기준선이 올라간 만큼 **정상 마일스톤까지 삼켰다**.
   */
  private award(api: GameSceneAPI, amount: number): void {
    this.awardBonus(api, amount);
  }

  /**
   * 추적 목록에 넣고, **누가 파괴하든** 목록에서 빠지게 한다.
   *
   * `discard()` 로만 빼면 **vfx 보험 타이머가 먼저 파괴한 오브젝트가 남는다.**
   * 보험 타이머는 스프라이트를 destroy 하면서 트윈까지 취소하므로
   * `onComplete: () => this.discard(...)` 가 영영 안 불린다 (Codex 재현: 포효 750ms 뒤
   * 파괴된 링 참조 2개 잔류 — GPU 는 회수돼도 JS 참조가 게임오버까지 쌓인다).
   * 파괴 이벤트에 걸어 두면 경로가 무엇이든 목록이 샐 수 없다.
   */
  private track<T extends Phaser.GameObjects.GameObject>(ob: T): T {
    this.tracked.add(ob);
    ob.once(Phaser.GameObjects.Events.DESTROY, () => this.tracked.delete(ob));
    return ob;
  }

  private discard(ob: Phaser.GameObjects.GameObject): void {
    this.tracked.delete(ob);
    ob.destroy();
  }

  /** 예약 타이머를 추적 목록에 넣고, 완료 시 스스로 빠지게 한다 */
  private later(api: GameSceneAPI, ms: number, fn: () => void): void {
    const timer = api.scene.time.delayedCall(ms, () => {
      const i = this.timers.indexOf(timer);
      if (i >= 0) this.timers.splice(i, 1);
      if (!this.dead) fn();
    });
    this.timers.push(timer);
  }

  // ── 애니메이션 등록 ─────────────────────────────────────────────────
  private animKey(sheet: string, name: string): string {
    return `red_${sheet.replace(/_\d+x\d+\.png$/, '')}_${name}`;
  }

  /**
   * `loadFxPickSheet` 는 텍스처만 올리고 애니메이션은 만들지 않는다 (테드는 정지
   * 프레임만 써서 필요 없었다). 루프가 필요한 쪽은 여기서 직접 등록한다.
   */
  private registerAnims(scene: Phaser.Scene): void {
    const def = (
      sheet: string,
      name: string,
      span: { start: number; end: number; fps: number },
      repeat: number,
    ) => {
      const texKey = fxPickSheetKey(sheet);
      if (!scene.textures.exists(texKey)) return;
      const key = this.animKey(sheet, name);
      if (scene.anims.exists(key)) return;
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(texKey, { start: span.start, end: span.end }),
        frameRate: span.fps,
        repeat,
      });
    };

    for (const s of RED_SPARROW_SHEETS) def(s, 'flap', SPARROW_FLAP, -1);
    for (const s of RED_SPARROW_UP_SHEETS) def(s, 'flap', SPARROW_FLAP, -1);
    def(RED_TREX_SHEET,  'walk',  TREX_WALK,   -1);
    def(RED_TREX_SHEET,  'roar',  TREX_ROAR,    0);
    def(RED_ROBOT_SHEET, 'fall',  ROBOT_FALL,  -1);
    def(RED_ROBOT_SHEET, 'raise', ROBOT_RAISE,  0);
    def(RED_ROBOT_SHEET, 'slash', ROBOT_SLASH,  0);
  }
}
