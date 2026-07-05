import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { K_PARAMS } from '../config/abilityParams';

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

// 파지직 번개 (센티넬 drawSparkLine 참고)
const SPARK_YELLOW  = 0xffee44; // 노란 파지직 (빔 주변 + 캐릭터 주변)
const SPARK_BLUE    = 0x59b8ff; // 파란 파지직 (캐릭터 주변)
const SPARK_ALPHA   = 0.55;     // 파지직 반투명도 (살짝 투명)
const CRACKLE_MS    = 480;      // 빔 주변 파지직 지속 시간 (발사 연출, 일회성)
const CRACKLE_STEP  = 55;       // 빔 주변 파지직 리드로 간격 (ms)
const SS_AURA_STEP  = 80;       // 초사이언 상시 오라 파지직 리드로 간격 (ms)

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

  // 태이(ktei) 동반자 — onCreate에서 생성, onUpdate에서 배회, onDestroy에서 정리
  private son?: Phaser.Physics.Arcade.Sprite;
  private sonDir: string = 'front';
  private sonWanderDir = -1; // 배회 방향 (-1 왼쪽 / +1 오른쪽)
  private sonFootOffset = 0; // 발을 바닥 라인에 맞추기 위한 y 오프셋 (센터 원점 보정)

  // 사망 승계 여부 (1회만 승계 → 이후 정상 게임오버)
  private transformed = false;

  // 초사이언 상시 오라 파지직 (재사용 Graphics + 주기적 리드로)
  private ssAura?: Phaser.GameObjects.Graphics;
  private ssAuraNext = 0;

  // ── 태이 동반자: 생성 + 추적 + 특수똥 수집 ─────────────────────────────
  onCreate(api: GameSceneAPI): void {
    const { scene, player } = api;

    // '태이' 크기(아빠의 80%)로, 땅(발 라인 정렬)에서 배회
    const son = scene.physics.add.sprite(scene.scale.width / 2, player.y, 'ktei_front');
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
    scene.physics.add.overlap(son, api.goldPoops,    makeCollect(p => api.collectGoldPoop(p)));
    scene.physics.add.overlap(son, api.diamondPoops, makeCollect(p => api.collectDiamondPoop(p)));
    scene.physics.add.overlap(son, api.topazPoops,   makeCollect(p => api.collectTopazPoop(p)));
    scene.physics.add.overlap(son, api.rainbowPoops, makeCollect(p => api.collectRainbowPoop(p)));

    this.son = son;
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

    // 이동 방향으로 좌우 스프라이트 전환
    const dir = this.sonWanderDir > 0 ? 'right' : 'left';
    if (dir !== this.sonDir) {
      son.setTexture(`ktei_${dir}`);
      this.sonDir = dir;
    }
  }

  onDestroy(_api: GameSceneAPI): void {
    this.son?.destroy();
    this.son = undefined;
    this.ssAura?.destroy();
    this.ssAura = undefined;
  }

  // ── 초사이언 상시 오라 파지직: 주기적으로 clear+리드로 (재사용 Graphics) ───
  private _updateSsAura(api: GameSceneAPI): void {
    const g = this.ssAura;
    if (!g?.active) return;
    const { scene, player } = api;
    if (scene.time.now < this.ssAuraNext) return;
    this.ssAuraNext = scene.time.now + SS_AURA_STEP;
    g.clear();
    this._drawAuraSparks(g, player.x, player.y, player.displayHeight * 0.26);
  }

  // 캐릭터를 감싸는 파란·노란 파지직 (몸통에 바짝 붙는 링에서 방출)
  private _drawAuraSparks(g: Phaser.GameObjects.Graphics, cx: number, cy: number, radius: number): void {
    const bolts = 6;
    for (let i = 0; i < bolts; i++) {
      const a = (i / bolts) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.25, 0.25);
      const r = Phaser.Math.FloatBetween(radius * 0.9, radius * 1.15);
      const sx = cx + Math.cos(a) * r;
      const sy = cy + Math.sin(a) * r * 0.95;
      const color = i % 2 === 0 ? SPARK_BLUE : SPARK_YELLOW;
      this._drawSpark(g, sx, sy, Phaser.Math.FloatBetween(1.8, 2.8), 7, color);
      this._drawSpark(g, sx, sy, 1, 5, 0xffffff); // 밝은 코어로 선명하게
    }
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

    // 태이가 본체로 승계 → 작은 동반자 제거
    this.son?.destroy();
    this.son = undefined;

    // 각성형 스프라이트로 교체 + '태이' 크기(k의 80%)로 + 살짝 공중으로 (조작은 기존 좌우 그대로)
    // SS_HEIGHT_COMP로 균일 확대 → 초사이언 캐릭터 겉보기 크기를 변경 전 태이와 일치
    player.setTexturePrefix('ktei_ss_');
    const kteiScale = KTEI_SCALE * SS_HEIGHT_COMP;
    player.resize(player.displayWidth * kteiScale, player.displayHeight * kteiScale);
    player.setY(player.y - SUCCESSION_LIFT);

    // 승계 순간 보호 + 화면 정리 (승계 직후 즉사·불공정 방지)
    player.setInvincibleBriefly(SUCCESSION_INVINCIBLE_MS);
    this._clearAllPoops(api);

    // 초사이언 상시 오라 파지직 (onUpdate에서 주기적 리드로)
    this.ssAura = scene.add.graphics().setDepth(318);

    // 각성 연출: 금빛 섬광 + 확장 링 + 버스트
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

    // 플레이어 중심 확장 링
    const ring = scene.add.graphics({ x, y }).setDepth(319);
    ring.lineStyle(5, 0xffd23a, 0.95);
    ring.strokeCircle(0, 0, 20);
    scene.tweens.add({
      targets: ring, scaleX: 4, scaleY: 4, alpha: 0, duration: 480, ease: 'Quad.easeOut',
      onComplete: () => { if (ring.active) ring.destroy(); },
    });

    this._spawnBurst(scene, x, y, 30);
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

    this._fireBeam(scene, handX, handY, ux, uy, widthMul);
    this._sweepBeam(api, handX, handY, ux, uy, halfWidth);

    // 초사이언: 캐릭터 주변 번개 폭발(팡 퍼지는 방사형 전격) + 그 범위 똥 제거
    if (isSs) {
      this._boltBurst(scene, shooter.x, shooter.y, SS_AURA_RADIUS);
      this._clearPoopsAround(api, shooter.x, shooter.y, SS_AURA_RADIUS);
      // 빔 주변 노란 파지직 (빔 라인을 따라) — 캐릭터 오라는 onUpdate에서 상시 처리
      this._crackleAlongBeam(scene, handX, handY, ux, uy, BEAM_LENGTH);
    }
  }

  // ── 빔 비주얼 (손끝에서 뻗어나가는 3중 글로우 라인) ───────────────────────
  private _fireBeam(
    scene: Phaser.Scene,
    ox: number, oy: number, ux: number, uy: number, widthMul: number,
  ): void {
    const g = scene.add.graphics().setDepth(315);
    const state = { t: 0, fade: 1 };
    const w0 = 24 * widthMul, w1 = 13 * widthMul, w2 = 5 * widthMul;

    const redraw = () => {
      if (!g.active) return;
      g.clear();
      const ex = ox + ux * BEAM_LENGTH * state.t;
      const ey = oy + uy * BEAM_LENGTH * state.t;
      const a = state.fade;
      g.lineStyle(w0, 0x3aa0ff, 0.22 * a); g.lineBetween(ox, oy, ex, ey); // 바깥 글로우
      g.lineStyle(w1, 0x8fd4ff, 0.50 * a); g.lineBetween(ox, oy, ex, ey); // 중간
      g.lineStyle(w2, 0xffffff, 0.95 * a); g.lineBetween(ox, oy, ex, ey); // 코어
    };

    // 1) 빔이 손끝에서 뻗어나감
    scene.tweens.add({ targets: state, t: 1, duration: 150, ease: 'Quad.easeOut', onUpdate: redraw });
    // 2) 잠깐 유지 후 페이드아웃
    scene.tweens.add({
      targets: state, fade: 0, delay: 210, duration: 220, ease: 'Quad.easeIn',
      onUpdate: redraw,
      onComplete: () => { if (g.active) g.destroy(); },
    });

    this._spawnBurst(scene, ox, oy, 18 * widthMul); // 손끝 머즐 플래시
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

  // 똥 재활용 + 스파크 버스트 (제거 공통) — 재활용한 개수 반환
  private _recycleWithBurst(scene: Phaser.Scene, targets: Phaser.Physics.Arcade.Sprite[]): number {
    if (targets.length === 0) return 0;
    // 위치 저장 후 즉시 재활용 (똥은 오브젝트 풀 — destroy 아님)
    const positions = targets.map(p => ({ x: p.x, y: p.y }));
    targets.forEach(p => (p as unknown as PoolablePoopBase).recycle());
    positions.forEach(({ x, y }) => this._spawnBurst(scene, x, y, 12));
    return positions.length;
  }

  // 재활용 + 이펙트 + 개수당 점수 (빔 경로/주변 제거 공통)
  private _recycleAndScore(
    api: GameSceneAPI, scene: Phaser.Scene, targets: Phaser.Physics.Arcade.Sprite[],
  ): void {
    const n = this._recycleWithBurst(scene, targets);
    if (n > 0) api.addAbilityBonus(n * K_PARAMS.beamPointsPerPoop);
  }

  // ── 초사이언 번개 폭발 (중심에서 방사형으로 팡 뻗는 전격) ──────────────────
  // 원형 파동이 아니라, 여러 갈래 번개가 사방으로 터져나가며 지지직 퍼진다.
  private _boltBurst(scene: Phaser.Scene, x: number, y: number, radius: number): void {
    const g = scene.add.graphics().setDepth(317);
    const state = { reach: 0, fade: 1 };
    const count = 16;
    // 각 번개의 기준 각도(고르게 분포 + 약간 흔들기) — 리드로해도 방향은 유지
    const angles = Array.from({ length: count }, (_, i) =>
      (i / count) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.18, 0.18));

    const redraw = () => {
      if (!g.active) return;
      g.clear();
      const len = radius * state.reach;
      const a = state.fade;
      angles.forEach((ang, i) => {
        const color = i % 2 === 0 ? SPARK_BLUE : SPARK_YELLOW;
        this._drawBolt(g, x, y, ang, len, Phaser.Math.FloatBetween(2, 3.4), color, a);
        this._drawBolt(g, x, y, ang, len, 1, 0xffffff, a); // 밝은 코어
      });
    };

    // 중심 섬광 + 팡 뻗어나감
    this._spawnBurst(scene, x, y, 22);
    scene.tweens.add({ targets: state, reach: 1, duration: 150, ease: 'Quart.easeOut', onUpdate: redraw });
    // 짧게 지지직 유지 후 페이드
    scene.tweens.add({
      targets: state, fade: 0, delay: 110, duration: 220, ease: 'Quad.easeIn',
      onUpdate: redraw,
      onComplete: () => { if (g.active) g.destroy(); },
    });
  }

  // 중심에서 angle 방향으로 length까지 뻗는 번개 한 갈래 (수직 지터로 지그재그)
  private _drawBolt(
    g: Phaser.GameObjects.Graphics,
    cx: number, cy: number, angle: number, length: number,
    thickness: number, color: number, alpha: number,
  ): void {
    if (length < 1) return;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const nx = -dy, ny = dx; // 진행 방향에 수직
    const segs = 5;
    g.lineStyle(thickness, color, alpha);
    g.beginPath();
    g.moveTo(cx, cy);
    for (let i = 1; i <= segs; i++) {
      const along = length * (i / segs);
      const jitter = i === segs ? 0 : Phaser.Math.Between(-7, 7); // 끝점은 정확히
      g.lineTo(cx + dx * along + nx * jitter, cy + dy * along + ny * jitter);
    }
    g.strokePath();
  }

  // ── 파지직 번개 (센티넬 drawSparkLine 참고) ──────────────────────────────
  // 시작점에서 랜덤 지그재그 세그먼트를 이어 그린 전기 스파크
  private _drawSpark(
    g: Phaser.GameObjects.Graphics, ox: number, oy: number,
    thickness: number, segLen: number, color: number,
  ): void {
    g.lineStyle(thickness, color, SPARK_ALPHA);
    g.beginPath();
    let px = ox + Phaser.Math.Between(-5, 5);
    let py = oy + Phaser.Math.Between(-5, 5);
    g.moveTo(px, py);
    const segs = Phaser.Math.Between(2, 4);
    for (let j = 0; j < segs; j++) {
      px += Phaser.Math.Between(-segLen, segLen);
      py += Phaser.Math.Between(-segLen, segLen);
      g.lineTo(px, py);
    }
    g.strokePath();
  }

  // 반복 리드로 파지직 러너: draw(g)를 CRACKLE_STEP 간격으로 갱신, CRACKLE_MS 후 정리
  private _runCrackle(scene: Phaser.Scene, depth: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
    const g = scene.add.graphics().setDepth(depth);
    const tick = () => { if (g.active) { g.clear(); draw(g); } };
    tick();
    const timer = scene.time.addEvent({ delay: CRACKLE_STEP, repeat: Math.floor(CRACKLE_MS / CRACKLE_STEP), callback: tick });
    scene.time.delayedCall(CRACKLE_MS, () => {
      timer.remove();
      if (g.active) g.destroy();
    });
  }

  // 빔 라인을 따라 노란 파지직 (여러 지점에서 튀는 전기)
  private _crackleAlongBeam(
    scene: Phaser.Scene, ox: number, oy: number, ux: number, uy: number, length: number,
  ): void {
    this._runCrackle(scene, 317, g => {
      const bolts = 7;
      for (let i = 0; i < bolts; i++) {
        const d = Phaser.Math.FloatBetween(20, length * 0.75);
        // 빔 라인 위 지점에서 살짝 옆으로 벗어나 튀는 스파크
        const perp = Phaser.Math.Between(-10, 10);
        const bx = ox + ux * d - uy * perp;
        const by = oy + uy * d + ux * perp;
        this._drawSpark(g, bx, by, Phaser.Math.FloatBetween(1.5, 3), 14, SPARK_YELLOW);
      }
    });
  }


  // ── 스파크 버스트 (머즐/피격 공용) ─────────────────────────────────────
  private _spawnBurst(scene: Phaser.Scene, x: number, y: number, radius: number): void {
    const g = scene.add.graphics({ x, y }).setDepth(316);
    g.fillStyle(0xffffff, 0.95); g.fillCircle(0, 0, radius * 0.5);
    g.fillStyle(0x8fd4ff, 0.45); g.fillCircle(0, 0, radius);
    g.lineStyle(2, 0xdff2ff, 0.9);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.lineBetween(0, 0, Math.cos(a) * radius * 0.9, Math.sin(a) * radius * 0.9);
    }
    scene.tweens.add({
      targets: g, alpha: 0, scaleX: 1.7, scaleY: 1.7, duration: 280, ease: 'Quad.easeOut',
      onComplete: () => { if (g.active) g.destroy(); },
    });
  }
}
