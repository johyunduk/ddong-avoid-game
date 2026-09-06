import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { KNIGHT_PARAMS } from '../config/abilityParams';
import { fxSprite, impact, playFx, projectile } from '../utils/vfx';

/**
 * 나이트 (SR) — 검기로 제거한 똥마다 보너스 / 점수마다 3방향 검기
 * 수치: KNIGHT_PARAMS 참조
 *
 * 연출 방향: **오러 블레이드에서 검기가 뿜어져 나간다.**
 * 검기만 날려서는 '초승달이 앞으로 간다'로 읽힌다 — 그것을 만들어낸 칼이 먼저 보여야 한다.
 * 그래서 세 박자를 고정한다.
 *   1) 맺힘  — 손에서 오러 블레이드가 위로 자란다 (외곽 + 코어 2겹, 120ms)
 *   2) 휘두름 — 블레이드가 아래에서 위로 채이며 사라지고, 그 궤적에 큰 참격이 남는다 (+ 임팩트)
 *   3) 검기  — 칼끝에서 초승달 3개가 **눌린 채로 나와 뻗으며** 날아간다
 * 경로에 닿은 똥은 recycle() 의 공통 타격 연출로 터진다 — 능력이 따로 이펙트를 얹지 않는다.
 *
 * ## 검기는 프레임 시트다
 * 정지 텍스처를 변형만 하면 프레임마다 형태가 바뀌는 작화의 맛이 원리상 안 나온다.
 * 지금은 8프레임 시트를 **비행 시간에 맞춰** 재생한다 — 날아가는 동안 뻗었다가
 * 찢어지고 조각으로 흩어진다.
 *
 * 그래서 정지 텍스처 시절의 장치들이 필요 없어졌다:
 * 겹 쌓기(한 겹이 납작해 보이는 걸 메우던 것), 비행 중 가늘어짐, 발사 뻗음, 잔상.
 * 그림이 프레임마다 다르므로 그걸 흉내 낼 이유가 없다.
 *
 * 남는 규칙은 하나 — **플래시는 그 순간에.** 검기가 칼끝을 떠나는 프레임에 섬광 하나.
 *
 * 이전 구현은 검기 하나당 Graphics 4겹을 매 프레임 250점씩 다시 그리고 45ms 마다
 * 파티클 이미지를 따로 뿌렸다. 지금은 전부 vfx 레이어의 스프라이트로 옮겨
 * 씬 shutdown 시 회수까지 vfx 가 책임진다.
 *
 * ## 비용 상한 (YOU MUST — 늘리기 전에 실기에서 프레임을 재라)
 * 발동 1회가 만드는 것은 **일반 블렌드 6장(블레이드 2 · 참격 1 · 검기 3)**
 * + **가산 3장(발사 섬광, 각 125ms)** 이다. 가산이 짧게만 사는 덕에 블룸 패스도 그동안만 켜진다.
 * 시트로 옮기며 겹 쌓기가 사라져 장수가 절반 이하로 줄었다.
 * 가산 오브젝트는 블룸 레이어로 들어가 살아 있는 내내 전체 화면 블룸 패스를 켜 두므로,
 * 자체 색을 가진 에셋은 가산으로 올리지 않는다 (vfx 설계 원칙 3).
 */

/** 검기 속도(px/s) — 판정 관대함이 속도에 묶여 있으므로 함부로 올리지 않는다 */
const BEAM_SPEED = 520;
/** 발사 각도(도). 0 = 정위, 음수 = 왼쪽 */
const BEAM_ANGLES = [-30, 0, 30] as const;
/** 검기가 플레이어 머리 위 어디서 나가는가 */
const MUZZLE_OFFSET_Y = -20;
/** 화면 위로 완전히 빠져나가도록 여유를 더한 비행 거리 */
const OVERSHOOT = 80;

/** 오러가 칼에 맺히는 시간(ms). 예비 동작이 없으면 검기가 '어디서 나왔는지' 안 보인다 */
const CHARGE_MS = 120;
/** 맺힘 → 휘두름 시작 */
const WINDUP_MS = 140;
/** 휘두르는 데 걸리는 시간(ms) */
const SWING_MS = 95;
/** 휘두름이 거의 끝나는 지점에서 검기가 나간다 */
const RELEASE_MS = WINDUP_MS + 60;
/** 가운데 검기 뒤에 양옆이 따라 나가는 간격(ms) */
const SPREAD_MS = 50;

/**
 * 오러 블레이드. proc-streak(가로로 누운 얇은 렌즈)을 손을 축으로 세워 쓴다.
 * 각도는 화면 기준(도) — 준비 자세에서 위로 채올린다.
 */
const BLADE_TEXTURE = 'fx_proc_streak';
const BLADE_READY_DEG = 55;    // 아래로 내린 준비 자세
const BLADE_SWING_DEG = -115;  // 왼쪽 위로 채올린 끝 자세
/** 손 위치 (플레이어 기준 오프셋) */
const HAND_OFFSET: [number, number] = [7, 4];
/** [가로(길이), 세로(두께)] — 외곽 글로우와 코어 2겹 */
const BLADE_OUTER: [number, number] = [0.36, 0.75];
const BLADE_CORE: [number, number] = [0.32, 0.34];
/** 검기와 같은 계열 — 외곽은 주황, 코어는 흰 크림 */
const BLADE_OUTER_TINT = 0xff8a2b;
const BLADE_CORE_TINT = 0xfff1d0;
/**
 * 검기 — **프레임 시트**다. 날아가는 동안 형태가 뻗었다가 찢어지고 조각으로 흩어진다.
 *
 * 정지 텍스처 3겹(외곽·본체·코어)으로 쓰던 것을 대체한다. 겹쳐 쌓는 건 한 겹이
 * 납작해 보이는 걸 메우려던 것이었는데, 시트는 프레임마다 그림이 달라 그럴 필요가 없다.
 * **색은 시트에 구워 넣는다.** 흰색 한 장을 통째로 착색하면 알파만 다르고 색이 전부
 * 같아서 '기운' 이 아니라 '단색 도형' 으로 보인다. 어두운 가장자리는 진한 주황,
 * 밝은 심지는 흰색이 되도록 밝기를 색 계단으로 바꿔 굽는다
 * (scripts/fx-particle.py --frames-ramp).
 */
const BEAM_SHEET = 'swordSlash' as const;
/** 시트 프레임은 256×192 — 표시 폭을 프레임 폭으로 나눠 배율을 낸다 */
const BEAM_FRAME_W = 256;
/** 화면상 검기 폭(px). 프레임이 256px 이므로 배율은 이 값 / 256 */
const BEAM_WIDTH = 120;
/** 휘두름 참격 — 같은 시트를 제자리에서 크게 재생한다 */
const SWING_WIDTH = 210;

/**
 * 판정 반경(검기 로컬 좌표계). 가로는 보이는 폭에 맞추고,
 * 세로는 한 프레임 이동량(≈9px)과 똥 반지름을 감안해 넉넉히 잡는다 —
 * 좁히면 빠른 검기가 똥을 그냥 통과한다.
 */
const HIT_HALF_W = 48;  // 표시 폭 120px 의 80% — 정지 텍스처(102px/42) 와 같은 비율
const HIT_HALF_H = 26;

export class KnightAbility extends BaseAbility {
  private lastBeamScore = 0;

  /** onDestroy 시 정리할 예약 타이머 (씬 재시작 후 stale 실행 방지) */
  private pendingTimers: Phaser.Time.TimerEvent[] = [];

  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    if (score % KNIGHT_PARAMS.beamInterval === 0 && score > this.lastBeamScore) {
      this.lastBeamScore = score;
      this.fireVolley(api);
    }
  }

  override onDestroy(_api: GameSceneAPI): void {
    this.pendingTimers.forEach(t => t.remove(false));
    this.pendingTimers = [];
    // 스프라이트·블룸 레이어·히트스톱은 vfx 레이어가 씬 shutdown 에서 회수한다
  }

  /** 예약 타이머를 추적 목록에 넣고, 완료 시 스스로 빠지게 한다 */
  private later(api: GameSceneAPI, ms: number, fn: () => void): void {
    const timer = api.scene.time.delayedCall(ms, () => {
      const i = this.pendingTimers.indexOf(timer);
      if (i >= 0) this.pendingTimers.splice(i, 1);
      fn();
    });
    this.pendingTimers.push(timer);
  }

  private fireVolley(api: GameSceneAPI): void {
    this.charge(api);
    this.later(api, WINDUP_MS, () => this.swing(api));

    BEAM_ANGLES.forEach(deg => {
      // 가운데가 먼저 나가고 양옆이 따라 붙는다 — 셋이 동시에 나가면 한 덩어리로 보인다
      const delay = RELEASE_MS + (deg === 0 ? 0 : SPREAD_MS);
      this.later(api, delay, () => this.fireBeam(api, deg));
    });
  }

  /**
   * 1단 — 맺힘: 손을 축으로 오러 블레이드가 자란다.
   *
   * 원점을 [0, 0.5] 로 두어 **손이 회전축이자 성장의 시작점**이 된다 —
   * 가운데를 축으로 두면 칼이 손을 뚫고 반대쪽으로도 자란다.
   * 휘두름 트윈까지 여기서 예약해 둔다 (같은 스프라이트를 이어서 쓴다).
   */
  private charge(api: GameSceneAPI): void {
    const scene = api.scene;
    const hx = api.player.x + HAND_OFFSET[0];
    const hy = api.player.y + HAND_OFFSET[1];
    const ready = BLADE_READY_DEG * (Math.PI / 180);
    const swung = BLADE_SWING_DEG * (Math.PI / 180);
    // 맺힘 + 휘두름 + 여유. 트윈이 어긋나도 이 시간이면 반드시 회수된다
    const life = WINDUP_MS + SWING_MS + 400;

    const layer = (scale: [number, number], tint: number, alpha: number, dz: number) => {
      const img = fxSprite(scene, hx, hy, BLADE_TEXTURE, {
        rotation: ready,
        scale: [scale[0] * 0.12, scale[1]],  // 짧게 시작해 길게 자란다
        origin: [0, 0.5],
        tint,
        alpha: 0,
        depth: 121 + dz,
        lifeMs: life,
      });
      if (!img) return;

      scene.tweens.add({
        targets: img,
        scaleX: scale[0],
        alpha,
        duration: CHARGE_MS,
        ease: 'Back.easeOut',
      });
      // 채올리며 사라진다 — 검기는 이 궤적의 끝에서 나간다
      scene.tweens.add({
        targets: img,
        rotation: swung,
        alpha: 0,
        duration: SWING_MS,
        delay: WINDUP_MS,
        ease: 'Cubic.easeIn',
        onComplete: () => img.destroy(),
      });
    };

    layer(BLADE_OUTER, BLADE_OUTER_TINT, 0.45, 0);
    layer(BLADE_CORE, BLADE_CORE_TINT, 0.85, 1);
  }

  /** 2단 — 휘두름: 블레이드가 지나간 자리에 큰 참격이 남는다 + 손맛 */
  private swing(api: GameSceneAPI): void {
    const { x, y } = api.player;
    // 검기와 **같은 시트**를 제자리에서 크게 재생한다 — 두 연출이 다른 그림이면 따로 논다.
    // playFx 의 scale 은 레지스트리 기본값(0.4)에 곱해지므로 표시 폭에서 역산한다
    playFx(api.scene, BEAM_SHEET, x, y + MUZZLE_OFFSET_Y - 6, {
      rotation: -0.16,
      scale: (SWING_WIDTH / BEAM_FRAME_W) / 0.4,
      alpha: 0.85,
      depth: 121,
    });

    // 휘두르는 무게 — 매화의 '툭 끊기는' 히트스톱보다 조금 길고 흔들림도 크다
    impact(api.scene, {
      hitstop: 35,
      shake: { duration: 90, intensity: 0.0025 },
      punch: { target: api.player, amount: 1.06, duration: 200 },
    });
  }

  /** 2단 — 검기: 초승달 하나가 날아가며 경로 위의 똥을 베어 넘긴다 */
  private fireBeam(api: GameSceneAPI, rotationDeg: number): void {
    const rot = rotationDeg * (Math.PI / 180);
    const ox = api.player.x;
    const oy = api.player.y + MUZZLE_OFFSET_Y;
    // 위로 쏜다 — 화면 y 축이 아래로 향하므로 정위가 (0, -1)
    const travel = oy + OVERSHOOT;
    const dx = Math.sin(rot);
    const dy = -Math.cos(rot);

    // 같은 검기가 같은 똥을 여러 프레임 연속으로 때리지 않게 한 발 안에서 기억한다
    const cut = new Set<Phaser.Physics.Arcade.Sprite>();
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);

    // 검기가 칼끝을 떠나는 그 순간의 섬광 — 유일한 가산 이펙트이자 가장 짧게 산다
    playFx(api.scene, 'bloom', ox + dx * 14, oy + dy * 14, { scale: 0.55, alpha: 0.8 });

    const scale = BEAM_WIDTH / BEAM_FRAME_W;

    projectile(api.scene, ox, oy, {
      to: { x: ox + dx * travel, y: oy + dy * travel },
      duration: (travel / BEAM_SPEED) * 1000,
      rotation: rot,
      sheet: BEAM_SHEET,
      scale: [scale, scale],
      alpha: 0.95,
      blend: 'normal',
      // 뻗어 나오는 연출은 시트 1~2프레임이 이미 하고 있다 — 배율까지 눌러 두면 이중이다
      onStep: (bx, by) => this.cutAlong(api, bx, by, cos, sin, cut),
    });
  }

  /**
   * 검기 중심에서 로컬 좌표로 옮겨 타원 판정한다.
   * 검기는 진행 방향으로 얇고 좌우로 넓어서 원형 판정은 폭을 제대로 못 덮는다.
   */
  private cutAlong(
    api: GameSceneAPI,
    bx: number,
    by: number,
    cos: number,
    sin: number,
    cut: Set<Phaser.Physics.Arcade.Sprite>,
  ): void {
    (api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[]).forEach(sp => {
      if (!sp.active || cut.has(sp)) return;

      const rx = sp.x - bx;
      const ry = sp.y - by;
      // 검기 로컬축: 가로는 칼날을 따라, 세로는 진행 방향
      const lx = rx * cos + ry * sin;
      const ly = -rx * sin + ry * cos;
      if ((lx / HIT_HALF_W) ** 2 + (ly / HIT_HALF_H) ** 2 > 1) return;

      cut.add(sp);
      // 타격 이펙트는 recycle() 안에서 이미 나간다 — 여기서 또 깔면 대상당 큰 가산
      // 스프라이트가 2장씩 겹쳐 상한을 잡아먹고 화면 채우기 비용이 배로 든다
      (sp as PoolablePoopBase).recycle();
      api.addAbilityBonus(KNIGHT_PARAMS.beamKillBonus);
    });
  }
}
