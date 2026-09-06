import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { K_PARAMS } from '../config/abilityParams';
import { charAnimKey, sheetTextureKey, type CharDir } from '../utils/charAnim';
import { beam, burst, fxSprite, impact, playFx, projectile } from '../utils/vfx';

// ── K (아빠) 능력 ────────────────────────────────────────────────────────
// K_PARAMS.gmhmInterval 점(초사이언 전)마다 현재 캐릭터(움직이던 그 스프라이트)가
// 그대로 손끝에서 위 대각선으로 에너지파를 발사한다 — 컷인·포즈 교체 없음. 화면 중앙
// 기준 플레이어가 왼쪽이면 오른쪽 위, 오른쪽이면 왼쪽 위로 쏘며 빔 경로상 똥을 제거한다.
//
// 태이 동반자(ktei)는 항상 '태이' 크기(아빠 k의 80%)로 땅에서 뒤를 따라다니며
// (간격 유지, 겹침 없음) 특수똥을 수집한다 (일반 똥은 통과 — 게임오버 유발 안 함).
// k가 죽으면(첫 피격) 게임오버 대신 태이가 각성해 ktei_ss 본체로 승계된다 — 1회 한정.
// 승계 후 본체도 같은 '태이' 크기(k의 80%), 살짝 공중에 뜨지만 조작은 좌우만(기존과 동일).

// 에너지파 (gmhm)
const BEAM_LENGTH     = 780;   // 빔 길이 (화면 대각선보다 김 → 화면 밖까지)
const BEAM_HALF_WIDTH = 34;    // 빔 반경 (경로상 똥 제거 판정) — 초사이언 전
const HAND_X_RATIO    = 0.22;  // 플레이어 폭 대비 손끝 x 오프셋 (발사 방향쪽)
const HAND_Y_RATIO    = 0.34;  // 플레이어 높이 대비 손끝 y 오프셋 (위쪽)
// 빔이 살아있는 동안 반복 판정하여 라인을 통과하는 똥까지 확실히 제거 (순간 1회 판정 시 대부분 놓침)
const BEAM_SWEEP_COUNT    = 5;   // 총 판정 횟수
const BEAM_SWEEP_INTERVAL = 90;  // 판정 간격 (ms) → 5회 × 90ms ≈ 빔 지속시간 커버

// 초사이언(ktei_ss) 강화 에너지파 — 더 굵은 빔 + 주변 번개 폭발로 광역 제거 (정지 없음)
const SS_BEAM_WIDTH_MUL = 2.7;  // 빔 두께 배율 (더 굵게)
const SS_BEAM_HALF_WIDTH = 72;  // 굵어진 빔의 똥 제거 반경
const SS_AURA_RADIUS     = 100; // 발사 시 캐릭터 주변 원형 제거 반경

// ── 연출 (vfx 레이어) ───────────────────────────────────────────────────
// 이전 구현은 빔·번개·오라를 전부 Graphics 로 매 프레임(오라는 80ms마다 영구히) 다시 그렸다.
// 지금은 전용 텍스처 + vfx 프리미티브라 그리는 비용이 없고, 회수도 vfx 가 책임진다.
//
// 비용 상한 (YOU MUST — 늘리기 전에 실기에서 프레임을 재라)
//   발사 1회 = 빔 3장 + 머즐 섬광 1장. 초사이언은 여기에 충격파 1 + 파티클 2세트.
//   승계 후 상시 오라는 **2장**이고 트윈만 돌 뿐 다시 그리지 않는다.
/** 화면상 두께(px). 시트 프레임 세로 전체가 이 값에 매핑된다 */
// 시트 한 프레임이 512×64(=8:1)다. 인게임 두께를 여기에 맞춰 잡아야 늘어나지 않는다 —
// 780/96 ≈ 8.1:1 이 정확히 시트 비율이고, 굵기 차이는 그림 자체가 만든다
const BEAM_SS_THICKNESS = 108;
const BEAM_THICKNESS    = 96;   // 본체 두께(px) — 시트 비율(8:1)에 맞춘 값
const BEAM_EXTEND_MS    = 110;  // 손끝에서 뻗는 시간 — 짧을수록 '파!' 하고 터져나간다
const BEAM_HOLD_MS      = 340;  // 에너지파는 번쩍이 아니라 **버티는** 연출이다
const BEAM_FADE_MS      = 380;  // 훑듯이 사라지는 연출이라 알파 페이드보다 길게 준다

// ── 에너지파 3박자 (드래곤볼식) ─────────────────────────────────────────
// 1) 溜め — 손에 구체가 맺힌다. 이게 없으면 그냥 '선이 지나간다'로 읽힌다
// 2) 발사 — 굵은 흰 코어가 터져나가고 머리가 앞장서서 뻗는다
// 3) 기류 — 빔을 따라 에너지 링이 퍼진다
const CHARGE_MS      = 240;  // 구체가 맺히는 시간
/** 이 시간 안에 다시 발동하면 '연쇄'로 보고 예비 동작을 건너뛴다 */
const CHAIN_WINDOW_MS = 900;
const CHARGE_TEXTURE = 'fx_proc_glow';
const CHARGE_SIZE    = 46;   // 구체 지름(px). 초사이언은 배율만큼 커진다
/** 빔을 따라 퍼지는 링의 위치(길이 비율)와 간격 */
const RING_POSITIONS = [0.22, 0.45, 0.7];
const RING_STEP_MS   = 60;

// ── 파지직 ──────────────────────────────────────────────────────────────
// 이전엔 Graphics 를 주기적으로 지우고 지그재그 선을 다시 그렸다 (오라는 80ms마다 영구히).
// 지금은 **짧게 살다 죽는 스프라이트를 띄엄띄엄 뿌린다** — 동시에 살아 있는 건 서너 장뿐이고
// 그리는 비용은 없다. 눈에는 같은 '지지직'으로 읽힌다.
const SPARK_TEXTURE   = 'fx_proc_streak';
const SPARK_LIFE_MS   = 150;  // 한 장이 사는 시간
const AURA_SPARK_STEP = 150;  // 초사이언 오라: 스파크를 뿌리는 간격
const AURA_SPARK_N    = 2;    // 한 번에 뿌리는 수
const BEAM_SPARK_STEP = 70;   // 빔 주변: 뿌리는 간격
const BEAM_SPARK_TICKS = 4;   // 빔이 살아 있는 동안 몇 번 뿌리는지
const SPARK_YELLOW  = 0xffee44; // 노란 전격 (초사이언 번개 폭발)
const SPARK_BLUE    = 0x59b8ff; // 파란 전격
/** 초사이언 상시 오라 — 링 2겹이 천천히 맥동한다 */
const AURA_TEXTURE  = 'fx_proc_ring';
const AURA_PULSE_MS = 620;
/** 오라는 게임이 끝날 때까지 산다. vfx 보험 타이머는 그보다 길게 잡는다 */
const AURA_LIFE_MS  = 20 * 60 * 1000;

// 태이(ktei) 크기 — 태이 동반자 + 초사이언 본체 공용. 아빠(k)의 80% 크기
const KTEI_SCALE = 0.8;
// 초사이언(ktei_ss)은 프레임 세로 채움이 태이(ktei)보다 작아(1110px vs 1166px) 같은 박스면
// 캐릭터가 작아 보임 → 트림 높이 비율만큼 본체를 균일 확대해 시각적 크기를 태이와 일치.
const SS_HEIGHT_COMP = 1166 / 1110; // ≈ 1.05

// 태이(ktei) 동반자 — 아빠와 무관하게 혼자 좌우로 왔다갔다 (경계에서 방향 반전)
const SON_WANDER_SPEED  = 130;  // 배회 속도 (px/s)
const SON_WANDER_MARGIN = 40;   // 좌우 반전 여백 (화면 가장자리에서)

// 사망 승계 (ktei_ss)
const SUCCESSION_LIFT          = 21;   // 승계 후 본체를 살짝 띄우는 높이 (px)
const SUCCESSION_INVINCIBLE_MS = 1500; // 승계 순간 무적 (즉사 방지)

export class KAbility extends BaseAbility {
  // score가 한 번에 여러 점 뛰어도 같은 마일스톤에서 두 번 발동하지 않도록 가드
  private lastGmhmScore = 0;
  /**
   * 직전 발사 시각. 이 능력은 **제거 보너스(개당 50점)로 자기가 다음 마일스톤을 넘겨**
   * 연달아 발동한다. 발동 자체는 막지 않되(점수는 그대로다), 짧은 간격으로 이어지면
   * 예비 동작(구체·진동)은 건너뛴다 — 겹쳐 쌓이면 화면이 계속 흔들리고 무거워진다.
   */
  private lastFireAt = -Infinity;

  // 태이(ktei) 동반자 — onCreate에서 생성, onUpdate에서 배회, onDestroy에서 정리
  private son?: Phaser.Physics.Arcade.Sprite;
  private sonColliders: Phaser.Physics.Arcade.Collider[] = [];
  private sonDir: string = 'front';
  private sonWanderDir = -1; // 배회 방향 (-1 왼쪽 / +1 오른쪽)
  private sonFootOffset = 0; // 발을 바닥 라인에 맞추기 위한 y 오프셋 (센터 원점 보정)
  private sonAnim = false;   // 태이 시트가 로드돼 있으면 달리기 애니메이션으로 동작

  // 사망 승계 여부 (1회만 승계 → 이후 정상 게임오버)
  private transformed = false;

  // 초사이언 상시 오라 — 플레이어를 따라다니는 링 2겹 (다시 그리지 않는다)
  private ssAura: Phaser.GameObjects.Image[] = [];

  /** onDestroy 시 정리할 예약 타이머 (씬 재시작 후 stale 실행 방지) */
  private pendingTimers: Phaser.Time.TimerEvent[] = [];
  /** 초사이언 오라 파지직 — 승계 후 계속 도는 반복 타이머 */
  private ssSparkTimer?: Phaser.Time.TimerEvent;

  // ── 태이 동반자: 생성 + 추적 + 특수똥 수집 ─────────────────────────────
  onCreate(api: GameSceneAPI): void {
    const { scene, player } = api;

    // '태이' 크기(아빠의 80%)로, 땅(발 라인 정렬)에서 배회.
    // 태이 시트(ktei)가 로드돼 있으면 달리기 애니메이션으로, 없으면 기존 정적 텍스처로 동작한다.
    this.sonAnim = scene.textures.exists(sheetTextureKey('ktei', 'left'));
    const son = scene.physics.add.sprite(
      scene.scale.width / 2, player.y,
      this.sonAnim ? sheetTextureKey('ktei', 'left') : 'ktei_front',
    );
    son.setDisplaySize(player.displayWidth * KTEI_SCALE, player.displayHeight * KTEI_SCALE);
    // 작아진 만큼 아래로 내려 발을 아빠와 같은 바닥 라인에 맞춤 (센터 원점 보정)
    this.sonFootOffset = (player.displayHeight - son.displayHeight) / 2;
    son.setY(player.y + this.sonFootOffset);
    const body = son.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    son.setVelocityX(SON_WANDER_SPEED * this.sonWanderDir); // 혼자 좌우 왕복 시작
    // 배경 위 · 플레이어 뒤로 배치 (표시 순서로 제어)
    scene.children.moveBelow(son, player);

    // 특수 똥은 태이가 닿으면 수집 (일반 똥은 overlap 미등록 → 통과, 게임오버 유발 안 함)
    const makeCollect = (
      fn: (p: Phaser.Physics.Arcade.Sprite) => void,
    ): Phaser.Types.Physics.Arcade.ArcadePhysicsCallback => (_s, p) => {
      const sp = p as Phaser.Physics.Arcade.Sprite;
      if (sp.active) fn(sp);
    };
    this.sonColliders.push(
      scene.physics.add.overlap(son, api.goldPoops,    makeCollect(p => api.collectGoldPoop(p))),
      scene.physics.add.overlap(son, api.diamondPoops, makeCollect(p => api.collectDiamondPoop(p))),
      scene.physics.add.overlap(son, api.topazPoops,   makeCollect(p => api.collectTopazPoop(p))),
      scene.physics.add.overlap(son, api.rainbowPoops, makeCollect(p => api.collectRainbowPoop(p))),
    );

    this.son = son;
    // 첫 update 전까지 시트 0번 프레임(피격)이 보이지 않도록 시작 방향을 바로 잡는다
    this.sonDir = this.sonWanderDir > 0 ? 'right' : 'left';
    this._faceSon(this.sonDir as CharDir);
  }

  /** 태이 제거 시 collider도 함께 정리 — 죽은 body를 매 스텝 검사하는 잔여 collider 방지 */
  private _destroySon(): void {
    this.sonColliders.forEach(c => c.destroy());
    this.sonColliders = [];
    this.son?.destroy();
    this.son = undefined;
  }

  onUpdate(api: GameSceneAPI): void {
    // 초사이언 후: 태이 없음 → 캐릭터 주변 상시 오라 파지직만 갱신
    if (this.transformed) {
      this._updateSsAura(api);
      return;
    }

    const son = this.son;
    if (!son || !son.active) return;
    const { scene, player } = api;

    // 혼자 좌우 왕복 — 화면 가장자리(여백 안쪽)에 닿으면 방향 반전
    const half = son.displayWidth / 2;
    const minX = SON_WANDER_MARGIN + half;
    const maxX = scene.scale.width - SON_WANDER_MARGIN - half;
    if (son.x <= minX && this.sonWanderDir < 0) {
      this.sonWanderDir = 1;
      son.setVelocityX(SON_WANDER_SPEED);
    } else if (son.x >= maxX && this.sonWanderDir > 0) {
      this.sonWanderDir = -1;
      son.setVelocityX(-SON_WANDER_SPEED);
    }

    // 바닥 라인 고정 (아빠 y 기준, 발 정렬)
    son.y = player.y + this.sonFootOffset;

    // 이동 방향으로 좌우 전환 — 시트가 있으면 그 방향의 달리기를 재생한다
    const dir = this.sonWanderDir > 0 ? 'right' : 'left';
    if (dir !== this.sonDir) {
      this._faceSon(dir as CharDir);
      this.sonDir = dir;
    }
  }

  /** 태이의 방향 전환. 시트 모드면 달리기 애니메이션, 아니면 정적 텍스처. */
  private _faceSon(dir: CharDir): void {
    const son = this.son;
    if (!son) return;
    if (this.sonAnim) {
      const key = charAnimKey('ktei', dir, 'walk');
      if (son.scene.anims.exists(key)) {
        // 표시 크기는 프레임을 갈아끼워도 유지돼야 한다 (텍스처가 바뀌므로 다시 잡는다)
        const w = son.displayWidth, h = son.displayHeight;
        son.play(key, true);
        son.setDisplaySize(w, h);
        return;
      }
    }
    son.setTexture(`ktei_${dir}`);
  }

  onDestroy(_api: GameSceneAPI): void {
    this._destroySon();
    this.ssAura.forEach(r => r.destroy());
    this.ssAura = [];
    this.pendingTimers.forEach(t => t.remove(false));
    this.pendingTimers = [];
    this.ssSparkTimer?.remove(false);
    this.ssSparkTimer = undefined;
  }

  /**
   * 파지직 한 장 — 아무 방향으로 누운 짧은 발광 선. 150ms 살고 사라진다.
   * proc-streak 은 192px 안에 가로 170px 짜리 얇은 렌즈라 길이만 잡아 주면 된다.
   */
  private _spark(scene: Phaser.Scene, x: number, y: number, len: number, tint: number): void {
    const img = fxSprite(scene, x, y, SPARK_TEXTURE, {
      rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
      scale: [len / 192, 0.13],
      tint,
      alpha: 0.85,
      depth: 318,
      blend: 'normal',
      lifeMs: SPARK_LIFE_MS + 200,
      slot: 'k_spark',
      maxConcurrent: 12,
    });
    if (!img) return;
    scene.tweens.add({
      targets: img, alpha: 0, scaleX: (len * 0.5) / 192,
      duration: SPARK_LIFE_MS, ease: 'Quad.easeIn',
      onComplete: () => img.destroy(),
    });
  }

  /** 중심 주변 링 위에 파지직을 흩뿌린다 (초사이언 오라) */
  private _sparkRing(scene: Phaser.Scene, cx: number, cy: number, radius: number): void {
    for (let i = 0; i < AURA_SPARK_N; i++) {
      const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const r = Phaser.Math.FloatBetween(radius * 0.85, radius * 1.15);
      const tint = i % 2 === 0 ? SPARK_BLUE : SPARK_YELLOW;
      this._spark(scene, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.95,
        Phaser.Math.FloatBetween(14, 26), tint);
    }
  }

  /** 예약 타이머를 추적 목록에 넣고, 완료 시 스스로 빠지게 한다 */
  private _later(scene: Phaser.Scene, ms: number, fn: () => void): void {
    const timer = scene.time.delayedCall(ms, () => {
      const i = this.pendingTimers.indexOf(timer);
      if (i >= 0) this.pendingTimers.splice(i, 1);
      fn();
    });
    this.pendingTimers.push(timer);
  }

  /**
   * 초사이언 상시 오라 — **좌표만 따라간다.**
   * 이전 구현은 80ms 마다 Graphics 를 지우고 번개 12갈래를 다시 그렸다. 승계 이후
   * 게임이 끝날 때까지 계속 도는 비용이라 실기에서 가장 비싼 부분이었다.
   */
  private _updateSsAura(api: GameSceneAPI): void {
    const { player } = api;
    for (const ring of this.ssAura) {
      if (!ring.active) continue;
      ring.x = player.x;
      ring.y = player.y;
    }
  }

  /** 승계 시 1회 생성. 맥동은 트윈이 돌고, 그리는 비용은 없다 */
  private _spawnSsAura(api: GameSceneAPI): void {
    const { scene, player } = api;
    const base = player.displayHeight * 0.9;

    const ring = (scale: number, tint: number, alpha: number, dz: number, delay: number) => {
      const img = fxSprite(scene, player.x, player.y, AURA_TEXTURE, {
        scale: [scale, scale * 0.95],
        tint,
        alpha,
        depth: 317 + dz,
        blend: 'normal',
        lifeMs: AURA_LIFE_MS,
        slot: 'k_aura',
        maxConcurrent: 4,
      });
      if (!img) return;
      scene.tweens.add({
        targets: img,
        scaleX: scale * 1.12, scaleY: scale * 1.06, alpha: alpha * 0.55,
        duration: AURA_PULSE_MS, delay, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      this.ssAura.push(img);
    };

    // proc-ring 은 192px 링이라 표시 지름 = 192 × scale
    const s = base / 192;
    ring(s * 1.15, SPARK_BLUE, 0.5, 0, 0);
    ring(s * 0.9, SPARK_YELLOW, 0.42, 1, AURA_PULSE_MS / 2);

    // 몸을 감싸는 파지직 — 링만 있으면 '고리'지 '전기'로 안 보인다.
    // 좌표는 매 틱 플레이어에서 다시 읽는다 (승계 후엔 플레이어가 곧 본체다)
    this.ssSparkTimer?.remove(false);
    this.ssSparkTimer = scene.time.addEvent({
      delay: AURA_SPARK_STEP,
      loop: true,
      callback: () => this._sparkRing(scene, player.x, player.y, base * 0.55),
    });
  }

  // ── 사망 승계: k 죽으면 태이가 각성해 본체가 됨 (1회) ────────────────────
  // true 반환 시 GameScene이 게임오버를 취소하고 피격 똥을 회수한다.
  onHitPoop(api: GameSceneAPI): boolean {
    if (this.transformed) return false; // 이미 승계됨 → 정상 게임오버
    this.transformed = true;
    this._succeedToKteiSs(api);
    return true;
  }

  private _succeedToKteiSs(api: GameSceneAPI): void {
    const { scene, player } = api;

    // 태이가 본체로 승계 → 작은 동반자 제거 (collider 포함)
    this._destroySon();

    // 각성형 스프라이트로 교체 + '태이' 크기(k의 80%)로 + 살짝 공중으로 (조작은 기존 좌우 그대로)
    // SS_HEIGHT_COMP로 균일 확대 → 초사이언 캐릭터 겉보기 크기를 변경 전 태이와 일치
    player.setTexturePrefix('ktei_ss_');
    const kteiScale = KTEI_SCALE * SS_HEIGHT_COMP;
    player.resize(player.displayWidth * kteiScale, player.displayHeight * kteiScale);
    player.setY(player.y - SUCCESSION_LIFT);

    // 승계 순간 보호 + 화면 정리 (승계 직후 즉사·불공정 방지)
    player.setInvincibleBriefly(SUCCESSION_INVINCIBLE_MS);
    this._clearAllPoops(api);

    // 초사이언 상시 오라 (트윈만 도는 링 2겹)
    this._spawnSsAura(api);

    // 각성 연출: 금빛 섬광 + 충격파 + 불티
    this._succeedEffect(scene, player.x, player.y);
  }

  private _clearAllPoops(api: GameSceneAPI): void {
    const { poops, scene } = api;
    const targets = (poops.getChildren() as Phaser.Physics.Arcade.Sprite[]).filter(p => p.active);
    this._recycleWithBurst(scene, targets); // 승계 연출 — 점수 없이 전체 정리
  }

  private _succeedEffect(scene: Phaser.Scene, x: number, y: number): void {
    // 전체 화면 금빛 섬광
    const flash = scene.add.rectangle(
      scene.scale.width / 2, scene.scale.height / 2,
      scene.scale.width, scene.scale.height, 0xffe066, 0.5,
    ).setDepth(318);
    scene.tweens.add({
      targets: flash, alpha: 0, duration: 380,
      onComplete: () => { if (flash.active) flash.destroy(); },
    });

    // 플레이어 중심 충격파 + 금빛 불티 — 각성은 이 한 방이 전부다
    playFx(scene, 'shockwave', x, y, { scale: 2.6, tint: 0xffd23a, depth: 319 });
    burst(scene, x, y, 'ember', { count: 20, tint: [0xffd23a, 0xfff2a8], speed: 1.3, depth: 319 });
    impact(scene, { hitstop: 60, shake: { duration: 220, intensity: 0.006 } });
  }

  onScoreMilestone(score: number, api: GameSceneAPI): void {
    // 초사이언 후엔 더 자주(gmhmIntervalSs), 전엔 gmhmInterval 간격
    const interval = this.transformed ? K_PARAMS.gmhmIntervalSs : K_PARAMS.gmhmInterval;
    if (score % interval !== 0) return;
    if (score <= this.lastGmhmScore) return;
    this.lastGmhmScore = score;
    this._fireGmhm(api);
  }

  // ── 에너지파 발사 (컷인 없이 발사 주체가 그대로 발사) ────────────────────
  private _fireGmhm(api: GameSceneAPI): void {
    const { scene, player } = api;
    const isSs = this.transformed; // 초사이언 승계 후 여부

    // 발사 주체: 초사이언 전 = 태이(ktei), 후 = 본체(player = ktei_ss)
    const shooter = isSs ? player : this.son;
    if (!shooter || !shooter.active) return;

    // 중앙 기준 왼쪽 → 오른쪽 위 대각선(+1), 오른쪽 → 왼쪽 위 대각선(-1)
    const dirX = shooter.x < scene.scale.width / 2 ? 1 : -1;

    // 손 끝 좌표 — 발사 주체의 상체(발사 방향쪽)에서 시작
    const handX = shooter.x + dirX * shooter.displayWidth * HAND_X_RATIO;
    const handY = shooter.y - shooter.displayHeight * HAND_Y_RATIO;

    // 45° 위 대각선 단위 벡터
    const inv = 1 / Math.SQRT2;
    const ux = dirX * inv;
    const uy = -inv;

    const widthMul  = isSs ? SS_BEAM_WIDTH_MUL : 1;
    const halfWidth = isSs ? SS_BEAM_HALF_WIDTH : BEAM_HALF_WIDTH;

    // 연쇄 발동이면 예비 동작을 생략하고 바로 쏜다
    const chained = scene.time.now - this.lastFireAt < CHAIN_WINDOW_MS;
    this.lastFireAt = scene.time.now;

    // 1단 — 溜め: 손에 구체가 맺힌다. 좌표는 지금 고정한다
    // (발사 주체가 움직여도 구체가 따라다니면 '모으는 힘'이 아니라 '달고 다니는 물건'이 된다)
    if (!chained) this._chargeOrb(scene, handX, handY, widthMul);

    // 2단 — 발사. 판정도 여기서부터 (구체가 맺히는 동안엔 아직 아무것도 안 맞는다)
    this._later(scene, chained ? 0 : CHARGE_MS, () => {
      this._fireBeam(scene, handX, handY, ux, uy, widthMul);
      this._sweepBeam(api, handX, handY, ux, uy, halfWidth);
      this._crackleAlongBeam(scene, handX, handY, ux, uy, BEAM_LENGTH, isSs ? 3 : 2, chained);

      // 초사이언: 캐릭터 주변 번개 폭발(팡 퍼지는 방사형 전격) + 그 범위 똥 제거
      if (isSs) {
        this._boltBurst(scene, shooter.x, shooter.y, SS_AURA_RADIUS);
        this._clearPoopsAround(api, shooter.x, shooter.y, SS_AURA_RADIUS);
      }
    });
  }

  /**
   * 1단 — 溜め: 손끝에 에너지 구체가 맺혀 부풀다가 발사 순간 삼켜진다.
   *
   * 에너지파가 '선이 지나간다'가 아니라 '모았다가 쏜다'로 읽히게 하는 건 이 예비 동작이다.
   * 구체 없이 빔만 나가면 아무리 굵어도 레이저처럼 보인다.
   */
  private _chargeOrb(scene: Phaser.Scene, x: number, y: number, widthMul: number): void {
    const size = CHARGE_SIZE * widthMul;

    const orb = (scale: number, tint: number, alpha: number, dz: number) => {
      const img = fxSprite(scene, x, y, CHARGE_TEXTURE, {
        // proc-glow 는 192px 텍스처 — 지름을 px 로 잡는다
        scale: [(size * scale) / 192 * 0.2, (size * scale) / 192 * 0.2],
        tint, alpha: 0,
        depth: 316 + dz,
        blend: 'normal',
        lifeMs: CHARGE_MS + 300,
        slot: 'k_charge',
        maxConcurrent: 6,
      });
      if (!img) return;
      const full = (size * scale) / 192;
      // 부풀었다가 발사 직전 살짝 오므라든다 — 그 반동으로 빔이 나간다
      scene.tweens.add({
        targets: img, scaleX: full, scaleY: full, alpha,
        duration: CHARGE_MS * 0.75, ease: 'Quad.easeOut',
      });
      scene.tweens.add({
        targets: img, scaleX: full * 0.6, scaleY: full * 0.6, alpha: 0,
        delay: CHARGE_MS * 0.75, duration: CHARGE_MS * 0.35, ease: 'Quad.easeIn',
        onComplete: () => img.destroy(),
      });
    };

    orb(1.6, SPARK_BLUE, 0.5, 0);   // 바깥 기운
    orb(0.9, 0xffffff, 0.95, 1);    // 흰 코어
    // 모으는 동안의 낮은 진동 — 터지기 전의 긴장
    impact(scene, { shake: { duration: CHARGE_MS, intensity: 0.001 } });
  }

  // ── 빔 비주얼 (손끝에서 뻗어나가는 광선) ─────────────────────────────────
  private _fireBeam(
    scene: Phaser.Scene,
    ox: number, oy: number, ux: number, uy: number, widthMul: number,
  ): void {
    const ss = widthMul > 1;
    const thickness = (ss ? BEAM_SS_THICKNESS : BEAM_THICKNESS);

    // **빔의 요동은 시트가, 각도·길이·두께는 코드가 맡는다.**
    // 초사이언 쪽은 전기 갈래가 프레임마다 다르게 그려져 있어 재생만 하면 지지직거린다 —
    // 빔을 따라 스파크를 따로 뿌리던 코드가 필요 없어졌다.
    // 색은 시트에 구워 넣었다. 통째로 착색하면 흰 코어까지 물들고, 시안은 하늘색에 묻힌다.
    beam(scene, ox, oy, {
      angle: Math.atan2(uy, ux),
      length: BEAM_LENGTH,
      thickness,
      sheet: ss ? 'kBeamSs' : 'kBeam',
      alpha: 0.92,
      blend: 'normal',
      depth: 315,
      extendMs: BEAM_EXTEND_MS,
      holdMs: BEAM_HOLD_MS,
      fadeMs: BEAM_FADE_MS,
      dissipate: 'retract',
      maxConcurrent: 4,
    });

    // 뻗어나가는 머리 — 빔 끝을 앞장서 달린다. 끝이 뭉툭해야 '기운 덩어리'로 읽힌다.
    // 시트는 균일한 통이라 이건 시트가 대신해 주지 않는다
    projectile(scene, ox, oy, {
      to: { x: ox + ux * BEAM_LENGTH, y: oy + uy * BEAM_LENGTH },
      duration: BEAM_EXTEND_MS,
      texture: CHARGE_TEXTURE,
      scale: [(thickness * 1.3) / 192, (thickness * 1.3) / 192],
      alpha: 0.9,
      blend: 'normal',
      depth: 316,
      maxConcurrent: 4,
    });

    // 빔을 따라 퍼지는 에너지 링 — 통이 그냥 서 있지 않고 기운이 흐르는 것으로 보이게
    RING_POSITIONS.forEach((p, i) => {
      this._later(scene, i * RING_STEP_MS, () => {
        playFx(scene, 'shockwave', ox + ux * BEAM_LENGTH * p, oy + uy * BEAM_LENGTH * p, {
          scale: (thickness * 1.6) / 92, tint: SPARK_BLUE, alpha: 0.75, depth: 314,
        });
      });
    });

    // 머즐은 시트 안에 그려져 있다 — 프레임 비율(512:64)을 인게임 빔 비율(780:96)에
    // 맞춰 뽑았으므로 늘어나지 않는다. 따로 얹던 머즐 스프라이트는 그래서 없앴다.
    impact(scene, { shake: { duration: 150, intensity: 0.0022 * widthMul } });
  }

  // ── 빔 경로 판정: 빔이 살아있는 동안 반복 sweep (통과하는 똥까지 확실히 제거) ──
  private _sweepBeam(
    api: GameSceneAPI,
    ox: number, oy: number, ux: number, uy: number, halfWidth: number,
  ): void {
    const sweep = () => {
      if (!api.scene.sys.isActive()) return;
      this._clearPoopsAlongBeam(api, ox, oy, ux, uy, halfWidth);
    };
    sweep(); // 발사 즉시 1회
    for (let i = 1; i < BEAM_SWEEP_COUNT; i++) {
      api.scene.time.delayedCall(i * BEAM_SWEEP_INTERVAL, sweep);
    }
  }

  // ── 빔 경로상 일반 똥 제거 (단발 판정) ──────────────────────────────────
  private _clearPoopsAlongBeam(
    api: GameSceneAPI,
    ox: number, oy: number, ux: number, uy: number, halfWidth: number,
  ): void {
    const { poops, scene } = api;
    const targets = (poops.getChildren() as Phaser.Physics.Arcade.Sprite[])
      .filter(p => {
        if (!p.active) return false;
        const rx = p.x - ox;
        const ry = p.y - oy;
        const along = rx * ux + ry * uy;             // 빔 방향 투영(전방 거리)
        if (along < 0 || along > BEAM_LENGTH) return false;
        const perp = Math.abs(rx * uy - ry * ux);    // 빔 직선까지 수직 거리
        return perp <= halfWidth;
      });

    this._recycleAndScore(api, scene, targets);
  }

  // ── 캐릭터 주변 원형 범위 똥 제거 (초사이언 전용) ────────────────────────
  private _clearPoopsAround(api: GameSceneAPI, cx: number, cy: number, radius: number): void {
    const { poops, scene } = api;
    const r2 = radius * radius;
    const targets = (poops.getChildren() as Phaser.Physics.Arcade.Sprite[])
      .filter(p => {
        if (!p.active) return false;
        const dx = p.x - cx, dy = p.y - cy;
        return dx * dx + dy * dy <= r2;
      });
    this._recycleAndScore(api, scene, targets);
  }

  /**
   * 똥 재활용 — 재활용한 개수를 반환한다.
   *
   * 타격 이펙트는 `recycle()` 안에서 이미 나간다. 여기서 또 깔면 대상당 큰 가산
   * 스프라이트가 2장씩 겹쳐 상한을 잡아먹고 화면 채우기 비용이 배로 든다.
   */
  private _recycleWithBurst(_scene: Phaser.Scene, targets: Phaser.Physics.Arcade.Sprite[]): number {
    if (targets.length === 0) return 0;
    targets.forEach(p => (p as unknown as PoolablePoopBase).recycle());
    return targets.length;
  }

  // 재활용 + 이펙트 + 개수당 점수 (빔 경로/주변 제거 공통)
  private _recycleAndScore(
    api: GameSceneAPI, scene: Phaser.Scene, targets: Phaser.Physics.Arcade.Sprite[],
  ): void {
    const n = this._recycleWithBurst(scene, targets);
    if (n > 0) api.addAbilityBonus(n * K_PARAMS.beamPointsPerPoop);
  }

  /**
   * 초사이언 번개 폭발 — 중심에서 사방으로 팡 터지는 전격.
   *
   * 이전엔 번개 32갈래를 매 프레임 다시 그렸다. 지금은 충격파 한 장이 퍼지고
   * 그 위로 섬광선 파티클이 방사형으로 날아간다 — 그리는 비용이 없다.
   */
  private _boltBurst(scene: Phaser.Scene, x: number, y: number, radius: number): void {
    // shockwave 는 128px 텍스처가 지름 92px 쯤으로 그려진다 → 원하는 반경에 맞춰 배율을 잡는다
    playFx(scene, 'shockwave', x, y, { scale: (radius * 2) / 92, tint: SPARK_BLUE, depth: 317 });
    burst(scene, x, y, 'streak', {
      count: 14, tint: [SPARK_BLUE, SPARK_YELLOW, 0xffffff],
      speed: radius / 60, depth: 317,
    });
    playFx(scene, 'bloom', x, y, { scale: 0.7, alpha: 0.9, depth: 318 });
  }

  /**
   * 빔을 따라 튀는 파지직.
   * 선을 다시 그리지 않고, 빔이 살아 있는 동안 몇 번에 나눠 짧은 스파크를 뿌린다.
   */
  private _crackleAlongBeam(
    scene: Phaser.Scene, ox: number, oy: number, ux: number, uy: number, length: number,
    perTick: number, chained: boolean,
  ): void {
    // 연쇄 발동은 절반만 — 겹쳐 쌓이면 상한만 먹고 화면은 더 지저분해진다
    const ticks = chained ? Math.ceil(BEAM_SPARK_TICKS / 2) : BEAM_SPARK_TICKS;
    for (let t = 0; t < ticks; t++) {
      this._later(scene, t * BEAM_SPARK_STEP, () => {
        for (let i = 0; i < perTick; i++) {
          const d = Phaser.Math.FloatBetween(length * 0.05, length * 0.8);
          const perp = Phaser.Math.FloatBetween(-16, 16);
          this._spark(
            scene,
            ox + ux * d - uy * perp,
            oy + uy * d + ux * perp,
            Phaser.Math.FloatBetween(16, 30),
            i % 2 === 0 ? SPARK_YELLOW : 0xffffff,
          );
        }
      });
    }
  }

}
