import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { MAEHWA_PARAMS } from '../config/abilityParams';
import { impact, petalFall, sweep } from '../utils/vfx';

/**
 * 매화 (SR) — 이동속도 버프 / 점수마다 칼 베기
 * 수치: MAEHWA_PARAMS 참조
 *
 * 연출 방향: **베는 감각**. 터지는 연출(충격파·섬광·불티·파편·섬광선)은 쓰지 않는다.
 * 대상 하나당 이펙트 호출은 3개로 고정한다 — 예고 잔상 / 칼날 궤적 / 꽃잎 낙화.
 *   1) 예고  — 벨 선을 옅게 미리 그어 보여준다
 *   2) 베기  — 항상 ↗ 방향으로 똥을 가로지르고, 지나간 경로에 잔상이 잠깐 남는다
 *   3) 잔향  — proc-petal 꽃잎이 좌우로 흔들리며 아래로 진다 (퍼지지 않는다)
 */

/**
 * 예고 → 베기 사이 간격(ms).
 * 똥은 계속 떨어지므로 이 간격이 길수록 예고와 베기 위치가 벌어진다 — 짧게 유지한다.
 */
const TELEGRAPH_MS = 70;
/** 볼리 안에서 대상마다 어긋나게 베도록 주는 지연(ms) */
const STAGGER_MS = 40;
/** 칼날이 똥을 가로지르는 순간(sweep 시작 후 ms) — 이때 똥이 사라져야 '베였다'로 읽힌다 */
const CUT_MS = 50;
/**
 * 베는 방향은 항상 고정 — 똥 기준 왼쪽 아래 → 오른쪽 위(↗).
 * 화면 y축이 아래로 향하므로 -45°.
 */
const SLASH_ANGLE = -Math.PI / 4;
/**
 * 칼날 길이. proc-arc 의 실제 그려진 폭은 149px 이라 0.5 ≈ 75px —
 * 똥(지름 40px)을 가로질러 지나가는 1.5~2배 길이가 된다.
 */
const BLADE_LENGTH = 0.5;
/** 두께 배율. 낮을수록 아크가 눌려 직선 베기에 가까워진다 (52px → 약 15px) */
const BLADE_THICKNESS = 0.28;
/**
 * 매화 색.
 * 잔상·예고선은 **일반 블렌드**로 배경 위에 얹히므로, 밝은 배경(평균 192/255)과
 * 어두운 배경 양쪽에서 읽히도록 어두운 진홍 계열을 쓴다. 코어도 너무 밝히지 않는다.
 */
const MAEHWA_RED = 0xff2f5e;
const BLADE_WHITE = 0xfff0f4;
const TRAIL_CORE = 0xd42a52;
const TRAIL_EDGE = 0xa8143a;

/** 똥이 회수된 뒤에도 마지막 위치를 기억하기 위한 홀더 */
interface LastPos { x: number; y: number; }

/** 살아 있으면 현재 좌표를 읽어 갱신하고, 회수됐으면 마지막으로 알던 좌표를 쓴다 */
function livePos(poop: Phaser.Physics.Arcade.Sprite, last: LastPos): LastPos {
  if (poop.active) {
    last.x = poop.x;
    last.y = poop.y;
  }
  return last;
}

export class MaehwaAbility extends BaseAbility {
  private lastMaehwaScore = 0;

  /** onDestroy 시 정리할 예약 타이머 (씬 재시작 후 stale 실행 방지) */
  private pendingTimers: Phaser.Time.TimerEvent[] = [];

  override getPlayerSpeedBonus(): number {
    return MAEHWA_PARAMS.speedBonus;
  }

  // ★2+: 특수 똥 수집 시 추가 점수 (MAEHWA_PARAMS.awake2SpecialBonus)
  override onCollectSpecial(_type: import('./types').SpecialPoopType): number {
    return this.awakeningLevel >= 2 ? MAEHWA_PARAMS.awake2SpecialBonus : 0;
  }

  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    if (score % MAEHWA_PARAMS.slashInterval === 0 && score > this.lastMaehwaScore) {
      this.lastMaehwaScore = score;
      this.slashClosestPoops(MAEHWA_PARAMS.slashCount, api);
    }
  }

  override onDestroy(_api: GameSceneAPI): void {
    this.pendingTimers.forEach(t => t.remove(false));
    this.pendingTimers = [];
    // 스프라이트·이미터·블룸 레이어·히트스톱은 vfx 레이어가 씬 shutdown 에서 회수한다
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

  private slashClosestPoops(count: number, api: GameSceneAPI): void {
    const active = api.poops
      .getChildren()
      .filter(p => {
        const sp = p as Phaser.Physics.Arcade.Sprite;
        return sp.active && sp.y < api.player.y;
      }) as Phaser.Physics.Arcade.Sprite[];

    active.sort((a, b) => {
      const da = Phaser.Math.Distance.Between(api.player.x, api.player.y, a.x, a.y);
      const db = Phaser.Math.Distance.Between(api.player.x, api.player.y, b.x, b.y);
      return da - db;
    });

    active.slice(0, count).forEach((poop, i) => {
      const delay = i * STAGGER_MS;
      // 좌표는 고정하지 않는다 — 똥이 계속 떨어지므로 매 단계에서 현재 위치를 다시 읽는다.
      // 회수된 뒤에는 이 홀더에 남은 마지막 좌표로 폴백한다.
      const last: LastPos = { x: poop.x, y: poop.y };

      if (delay > 0) {
        this.later(api, delay, () => this.telegraph(api, poop, last));
      } else {
        this.telegraph(api, poop, last);
      }

      // 히트스톱은 첫 대상에서만 — 볼리 전체가 늘어지면 '끊기는' 맛이 사라진다
      this.later(api, delay + TELEGRAPH_MS, () => this.strike(api, poop, last, i === 0));
    });
  }

  /**
   * 1단 — 예고: 벨 선을 옅게 미리 긋는다 (이펙트 1개, 잔상 없음).
   * 옅은 선이라 가산이면 밝은 배경에서 사라진다 → 일반 블렌드.
   */
  private telegraph(api: GameSceneAPI, poop: Phaser.Physics.Arcade.Sprite, last: LastPos): void {
    const { x, y } = livePos(poop, last);
    sweep(api.scene, x, y, {
      rotation: SLASH_ANGLE,
      length: BLADE_LENGTH * 0.75,
      thickness: BLADE_THICKNESS * 0.7,
      duration: 160,
      tint: TRAIL_EDGE,
      alpha: 0.35,
      blend: 'normal',
    });
  }

  /** 2단 — 베기: 선명한 칼날 궤적 하나 (이펙트 1개 + 임팩트) */
  private strike(
    api: GameSceneAPI,
    poop: Phaser.Physics.Arcade.Sprite,
    last: LastPos,
    leadTarget: boolean,
  ): void {
    // 지금 이 순간의 똥 위치에서 벤다 (예고 시점 좌표를 쓰면 떨어진 만큼 어긋난다)
    const { x, y } = livePos(poop, last);

    // 칼이 100ms 만에 지나가고, 지나간 경로에 붉은 잔상이 약 500ms 남는다
    sweep(api.scene, x, y, {
      rotation: SLASH_ANGLE,
      length: BLADE_LENGTH,
      thickness: BLADE_THICKNESS,
      duration: 100,
      tint: BLADE_WHITE,
      // 잔상은 일반 블렌드 — 밝은 배경 위에 남는 '베인 자국'이다
      trail: { alpha: 0.42, hold: 150, fade: 350, tint: TRAIL_EDGE, coreTint: TRAIL_CORE, blend: 'normal' },
    });

    if (leadTarget) {
      // 베기는 '툭 끊기는' 감각 — 히트스톱은 짧게, 셰이크는 거의 느껴지지 않을 만큼
      impact(api.scene, {
        hitstop: 25,
        shake: { duration: 70, intensity: 0.0015 },
        punch: { target: api.player, amount: 1.05, duration: 180 },
      });
    }

    // 칼날이 똥을 가로지르는 순간에 사라지고, 그 자리에서 꽃잎이 진다
    // (타격 이펙트는 칼날과 겹치면 '터지는' 느낌이 되므로 조용히 회수한다)
    this.later(api, CUT_MS, () => {
      const cut = livePos(poop, last);
      if (poop.active) (poop as PoolablePoopBase).recycle(true);
      this.afterglow(api, cut.x, cut.y);
    });
  }

  /**
   * 3단 — 잔향: 꽃잎이 흩날리며 진다 (이펙트 1개).
   * 칼날 궤적이 주인공이므로 꽃잎은 작게 유지한다.
   */
  private afterglow(api: GameSceneAPI, x: number, y: number): void {
    petalFall(api.scene, x, y, {
      count: 9,
      tint: [MAEHWA_RED, 0xff7a9c, 0xffc6d6],
      scale: { min: 0.035, max: 0.07 },
      fall: { min: 70, max: 130 },
      sway: { min: 9, max: 22 },
      duration: { min: 1000, max: 1800 },
    });
  }
}
