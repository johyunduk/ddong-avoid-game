import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import { type GameSceneAPI } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { HEIDI_PARAMS, HEIDI_PUYO_SHEETS } from '../config/abilityParams';
import { fxPickSheetKey, burst, impact } from '../utils/vfx';

/** 시트별 프레임 구간 — 그림을 열어 확인한 값이다 */
// 걷기 fps 는 배회 속도에 딸린다 — 안 맞추면 **발이 바닥을 미끄러진다**.
// 105px/s 에 10fps 였으니 150px/s 면 대략 14fps 다
const PUYO_WALK   = { start: 0, end: 5, fps: 14 };
const PUYO_IDLE   = { start: 0, end: 3, fps: 5 };
const PUYO_CROUCH = { start: 0, end: 2, fps: 14 };
const PUYO_JUMP   = { start: 0, end: 2, fps: 12 };
const PUYO_KICK   = { start: 0, end: 5, fps: 14 };
const PUYO_WALL   = { start: 0, end: 2, fps: 12 };

const PUYO_FRAME = 128;

/**
 * 프레임 안에서 뿌요의 **발바닥**이 있는 세로 위치 (프레임 높이 대비).
 * `scripts/build-puyo-sheet.py` 가 바닥선 y=118 로 하단 정렬해 굽는다 — 원점을 여기 두어야
 * 동작이 바뀌어도(웅크림·도약) 발이 바닥선에서 안 뜬다.
 */
const FOOT_ORIGIN_Y = 118 / PUYO_FRAME;

const DEPTH_PUYO = 6;      // 배경 위 · 플레이어 뒤. 태이와 같은 대역

/** 뿌요 상태. 이름 그대로 `HEIDI_PUYO_SHEETS` 의 키다 */
type PuyoState = 'walk' | 'idle' | 'crouch' | 'jump' | 'wall' | 'kick';

/**
 * 하이디 (SR) — 동반자 강아지 **뿌요**.
 *
 * 뿌요가 땅에서 혼자 좌우로 돌아다니다가, {@link HEIDI_PARAMS.puyoInterval}점마다
 * **웅크렸다 먼 쪽 화면 끝까지 뛰어 벽을 짚고, 내려오면서 반대편까지 날라차기로
 * 가로지른다.** 지나간 길의 일반 똥이 부서진다.
 *
 * 한 번의 발동이 `crouch → jump → wall → kick` 네 토막이다. 벽을 짚는 순간이
 * 궤적의 정점이자 유일한 정지점이라, 되돌아 내려오는 발차기에 무게가 실린다.
 * 하강 구간은 판정이 넓고({@link HEIDI_PARAMS.puyoKickHitR}) 점수가 높다.
 *
 * 예전에는 날라차기가 확률로 갈리는 **대체 동작**이었다. 지금은 확률이 아니라
 * 언제나 발동의 뒷절반이다 — `puyoKickChance` 는 그래서 없앴다.
 *
 * 설계 문서는 `docs/fx-heidi-puyo.md`. 선례는 K 의 태이(동반자 배회)와
 * 레드의 참새(발사 시 시트 교체·진행 방향 판단)다.
 */
export class HeidiAbility extends BaseAbility {
  private dead = false;
  private tracked = new Set<Phaser.GameObjects.GameObject>();

  private puyo?: Phaser.GameObjects.Sprite;
  private state: PuyoState = 'walk';
  private dir = -1;              // 배회 방향 (-1 왼쪽 / +1 오른쪽)
  private flip = false;          // 지금 뒤집혀 있는가 (경계에서 깜빡이지 않게 기억한다)
  private stateUntil = 0;        // 이 시각(scene.time.now)까지 현재 상태를 유지한다
  private groundY = 0;

  /** 점프 · 벽 짚기 */
  private wallRight = false;     // 이번에 짚는 쪽이 오른쪽 벽인가
  private lastWallRight?: boolean;  // 지난번에 짚은 쪽. 없으면 아직 한 번도 안 뛰었다
  private pending = false;       // 점수는 찼는데 **거리가 모자라** 아직 안 뛴 상태
  private wallX = 0;             // 짚는 자리의 x (화면 폭이 바뀌어도 매 프레임 다시 잡는다)
  private jumpT0 = 0;
  private from = { x: 0, y: 0 };
  private to = { x: 0, y: 0 };
  private prev = { x: 0, y: 0 };  // 지난 프레임 좌표 — 터널링 방지용 선분 판정에 쓴다

  /**
   * 재진입 가드. `addAbilityBonus` 는 GameScene 안에서 점수를 1점씩 순회하며
   * 마일스톤을 부르므로, 먼저 올려 두지 않으면 보너스가 곧바로 다음 발동을 부른다.
   */
  private lastFireScore = 0;

  // ── 생성 · 정리 ───────────────────────────────────────────────────
  override onCreate(api: GameSceneAPI): void {
    const { scene, player } = api;
    this.dead = false;
    this.registerAnims(scene);

    const key = fxPickSheetKey(HEIDI_PUYO_SHEETS.walk);
    if (!scene.textures.exists(key)) return;   // 시트가 안 올라왔으면 조용히 없던 일로

    const h = player.displayHeight * HEIDI_PARAMS.puyoScale;
    this.groundY = player.y + player.displayHeight / 2;

    const ob = scene.add.sprite(scene.scale.width / 2, this.groundY, key)
      .setDepth(DEPTH_PUYO)
      .setOrigin(0.5, FOOT_ORIGIN_Y)          // 발이 바닥선에 꽂힌다
      .setDisplaySize(h, h);
    this.puyo = ob;
    this.tracked.add(ob);
    this.play('walk');
  }

  override onDestroy(_api: GameSceneAPI): void {
    this.dead = true;
    for (const ob of this.tracked) ob.destroy();
    this.tracked.clear();
    this.puyo = undefined;
  }

  // ── 매 프레임 ─────────────────────────────────────────────────────
  override onUpdate(api: GameSceneAPI): void {
    if (this.dead) return;
    const puyo = this.puyo;
    if (!puyo || !puyo.active) return;

    const { scene, player } = api;
    const now = scene.time.now;
    this.groundY = player.y + player.displayHeight / 2;

    if (this.state === 'jump' || this.state === 'kick') { this.stepJump(api, now); return; }

    // 벽에 붙어 있는 동안 — 접촉 → 웅크림 → 차기의 3컷이 여기서 돈다.
    // 바닥선이 매 프레임 바뀌므로 자리를 다시 잡아 준다 (땅에 내려놓지 않는다)
    if (this.state === 'wall') {
      puyo.setPosition(this.wallX, this.groundY - scene.scale.height * HEIDI_PARAMS.puyoWallH);
      if (now >= this.stateUntil) this.startKick(api, now);
      return;
    }

    // 웅크림 → 점프. 예비 동작이 있어야 도약이 무겁게 읽힌다
    if (this.state === 'crouch') {
      if (now >= this.stateUntil) this.startJump(api, now);
      puyo.y = this.groundY;
      return;
    }
    if (this.state === 'idle') {
      puyo.y = this.groundY;
      // 뛸 차례인데 멈춰 서 있으면 대기가 길어진다 — 바로 걷기로 돌아간다
      if (this.pending || now >= this.stateUntil) this.play('walk');
      return;
    }

    // 배회 — 화면 가장자리(여백 안쪽)에 닿으면 방향을 반전하고 가끔 멈춰 선다
    const W = scene.scale.width;

    // 뛸 차례인데 목표 벽이 코앞이면 **반대쪽으로 물러선다.** 가만히 배회하게 두면
    // 하필 벽 쪽으로 걸어가다 되짚어 오느라 대기가 두 배로 길어진다.
    // 물러섰다 달려가 뛰는 모양이 되어 도약도 무거워진다
    if (this.pending && !this.runwayOk(W, puyo.x, puyo.displayWidth / 2)) {
      this.dir = this.nextWallRight(W, puyo.x) ? -1 : 1;
    }

    const dt = scene.game.loop.delta / 1000;
    const half = puyo.displayWidth / 2;
    const minX = HEIDI_PARAMS.puyoMargin + half;
    const maxX = W - HEIDI_PARAMS.puyoMargin - half;
    const step = HEIDI_PARAMS.puyoSpeed * dt * this.dir;
    // 화면 밖에서 걸어 들어오는 중이면 아직 가두지 않는다 (들어올 때까지 자유롭게)
    const entering = puyo.x < minX ? this.dir > 0 : (puyo.x > maxX ? this.dir < 0 : false);
    puyo.x = entering ? puyo.x + step : Phaser.Math.Clamp(puyo.x + step, minX, maxX);
    puyo.y = this.groundY;

    if (!entering && ((puyo.x <= minX && this.dir < 0) || (puyo.x >= maxX && this.dir > 0))) {
      this.dir = -this.dir;
      // 뛸 차례면 멈춰 서지 않는다
      if (!this.pending && Math.random() < HEIDI_PARAMS.puyoIdleChance) {
        this.play('idle', now + HEIDI_PARAMS.puyoIdleMs);
      }
    }
    // **가는 방향**으로 뒤집는다 (있는 자리가 아니라 — 참새에서 겪은 것과 같다).
    // 방향 전환점에서는 속도가 0 을 지나므로 데드존 안에서는 직전 방향을 유지한다
    if (Math.abs(step) > HEIDI_PARAMS.puyoFlipDead) this.flip = this.dir > 0;
    puyo.setFlipX(this.flip);

    // 점수가 찼으면 **목표 벽이 충분히 멀어질 때까지 걷다가** 웅크린다
    if (this.pending && this.runwayOk(W, puyo.x, half)) {
      this.pending = false;
      this.play('crouch', now + HEIDI_PARAMS.puyoCrouchMs);
    }
  }

  /**
   * 이번에 짚을 벽이 **충분히 먼가.**
   *
   * 번갈아 짚게 하고 나니, 날라차기가 내려놓은 자리 바로 옆이 다음 목표가 되는 판이
   * 생겼다 — 코앞으로 폴짝 뛰고 끝나서 경로에 똥이 거의 없다. 똥을 쓸어내는 것이
   * 이 능력의 본체이므로, 거리가 찰 때까지 **발동을 미룬다.**
   * 뿌요는 좌우 끝에서 방향을 되짚으므로 한 번 가로지르는 사이에 반드시 충족된다.
   */
  private runwayOk(W: number, x: number, half: number): boolean {
    const toRight = this.nextWallRight(W, x);
    const dist = toRight ? W - x : x;
    // **못 채우는 조건이면 영영 안 뛴다.** 뿌요는 배회 여백(puyoMargin) 안쪽까지만
    // 물러설 수 있으므로, 요구치를 그 한계 아래로 잘라 둔다.
    // 화면이 좁거나 여백이 커지면 W * puyoMinRunW 가 손 닿는 범위를 넘길 수 있다
    const reach = W - HEIDI_PARAMS.puyoMargin - half - 1;
    return dist >= Math.min(W * HEIDI_PARAMS.puyoMinRunW, reach);
  }

  /** 이번에 짚을 벽. 첫 발동만 먼 쪽이고, 그다음부터는 직전의 반대쪽이다 */
  private nextWallRight(W: number, x: number): boolean {
    if (this.lastWallRight !== undefined) return !this.lastWallRight;
    return x === W - x ? this.dir > 0 : x < W - x;
  }

  // ── 발동 ──────────────────────────────────────────────────────────
  override onScoreMilestone(score: number, _api: GameSceneAPI): void {
    if (score % HEIDI_PARAMS.puyoInterval !== 0) return;
    if (score <= this.lastFireScore) return;    // 재진입 가드
    this.lastFireScore = score;
    if (this.dead || !this.puyo || !this.puyo.active) return;
    // 이미 웅크렸거나 뛰고 있으면 삼킨다 — 한 번에 여러 마리로 갈라지면 안 된다
    if (this.state !== 'walk' && this.state !== 'idle') return;
    // **바로 뛰지 않는다.** 목표 벽이 코앞이면 지나갈 똥이 없다 — 예약만 걸고,
    // 거리가 차는 순간 onUpdate 의 배회 갈래에서 웅크린다
    this.pending = true;
  }

  /**
   * ① 도약 시작 — **양쪽 벽을 번갈아** 짚는다.
   *
   * 처음 한 번만 "지금 자리에서 먼 쪽"으로 간다 (왼쪽까지 `puyo.x`, 오른쪽까지
   * `W - puyo.x` 중 긴 쪽 = `puyo.x < W / 2` 면 오른쪽). 그다음부터는 **직전에 짚은
   * 벽의 반대쪽**이다.
   *
   * 매번 먼 쪽을 고르면 **같은 벽에만 붙는다.** 날라차기가 벽 반대편 끝까지 날아가
   * 착지하므로, 착지 자리에서 먼 쪽은 언제나 **방금 찼던 그 벽**이다. 두 규칙이 서로를
   * 물어 한쪽으로 고정된다 — 실제로 그렇게 나왔고, 그래서 먼 쪽 규칙을 접었다.
   */
  private startJump(api: GameSceneAPI, now: number): void {
    const { scene } = api;
    const puyo = this.puyo;
    if (!puyo) return;

    const W = scene.scale.width;
    const toRight = this.nextWallRight(W, puyo.x);
    this.lastWallRight = toRight;
    // 짚는 자리 — 발바닥이 화면 끝에 닿아 보이도록 **스프라이트 바깥 끝**을 기준으로 잡는다.
    // 중심을 기준으로 잡으면 몸 절반만큼 안쪽에서 허공을 짚는다
    const half = puyo.displayWidth / 2;
    const m = HEIDI_PARAMS.puyoWallMargin;
    this.wallRight = toRight;
    this.wallX = toRight ? W - m - half : m + half;

    this.from = { x: puyo.x, y: this.groundY };
    this.to = { x: this.wallX, y: this.groundY - scene.scale.height * HEIDI_PARAMS.puyoWallH };
    this.prev = { x: this.from.x, y: this.from.y };
    this.jumpT0 = now;
    this.flip = toRight;
    puyo.setFlipX(this.flip);
    this.play('jump');

    burst(scene, puyo.x, this.groundY, 'smoke', {
      count: 6, scale: 0.55, speed: 0.7, depth: DEPTH_PUYO - 1, blend: 'normal',
    });
  }

  /**
   * ② 벽 짚기 — 궤적의 정점에서 한 번 멈춘다.
   *
   * 멈추는 구간이 있어야 되돌아 내려오는 발차기가 "튕겨 나왔다"로 읽힌다.
   * 시트가 안 올라왔으면 {@link play} 가 조용히 넘어가고, 자세만 유지한 채 시간을 센다.
   */
  private startCling(api: GameSceneAPI, now: number): void {
    const { scene } = api;
    const puyo = this.puyo;
    if (!puyo) return;
    puyo.setPosition(this.wallX, this.to.y);
    this.play('wall', now + HEIDI_PARAMS.puyoWallMs);
    // 짚는 순간의 먼지는 **벽 쪽**에서 터져야 한다
    burst(scene, this.wallRight ? scene.scale.width : 0, this.to.y, 'smoke', {
      count: 5, scale: 0.5, speed: 0.7, depth: DEPTH_PUYO - 1, blend: 'normal',
    });
    impact(scene, { hitstop: 40, shake: { duration: 140, intensity: 0.004 } });
  }

  /**
   * ③ 날라차기 — 벽을 밀고 **반대편 바닥까지** 대각선으로 내려온다.
   *
   * 여기서부터 판정이 넓어지고 점수가 오른다 ({@link smashPoops} 가 상태를 보고 가른다).
   */
  private startKick(api: GameSceneAPI, now: number): void {
    const { scene } = api;
    const puyo = this.puyo;
    if (!puyo) return;
    const W = scene.scale.width;
    const half = puyo.displayWidth / 2;
    // 착지는 **짚은 벽에서 화면 폭의 puyoLandW 만큼** 간 자리다.
    // 반대쪽 끝까지 날아가 박히면 다음 대기 지점까지 한참을 걸어 돌아온다
    const landX = this.wallRight ? W * (1 - HEIDI_PARAMS.puyoLandW)
      : W * HEIDI_PARAMS.puyoLandW;
    this.from = { x: puyo.x, y: puyo.y };
    this.to = { x: Phaser.Math.Clamp(landX, half, W - half), y: this.groundY };
    this.prev = { x: this.from.x, y: this.from.y };
    this.jumpT0 = now;
    this.flip = !this.wallRight;          // 가는 방향(벽 반대쪽)을 본다
    puyo.setFlipX(this.flip);
    this.play('kick');
    impact(scene, { hitstop: 50, shake: { duration: 160, intensity: 0.005 } });
  }

  /**
   * 도약·하강 한 프레임.
   *
   * 도약은 끝점이 이미 높으므로 **끝점까지 선형 + 중간 웃자람**으로 그린다.
   * 예전처럼 바닥 기준 포물선을 쓰면 벽에 닿는 높이를 맞출 수가 없다.
   * 하강은 `u²` 로 가속한다 — 차고 내려오는 동작은 끝이 빨라야 한다.
   */
  private stepJump(api: GameSceneAPI, now: number): void {
    const puyo = this.puyo;
    if (!puyo) return;
    const { scene } = api;

    const rising = this.state === 'jump';
    const dur = rising ? HEIDI_PARAMS.puyoJumpMs : HEIDI_PARAMS.puyoKickMs;
    const u = Phaser.Math.Clamp((now - this.jumpT0) / dur, 0, 1);
    const x = Phaser.Math.Linear(this.from.x, this.to.x, u);
    const y = rising
      // 4u(1-u) 가 u=0.5 에서 1 이 되는 가장 싼 아치다. 끝점 위로 살짝 넘겼다 붙는다
      ? Phaser.Math.Linear(this.from.y, this.to.y, u)
        - scene.scale.height * HEIDI_PARAMS.puyoRiseH * 4 * u * (1 - u)
      : Phaser.Math.Linear(this.from.y, this.to.y, u * u);
    puyo.setPosition(x, y);

    this.smashPoops(api, this.prev.x, this.prev.y, x, y);
    this.prev = { x, y };
    if (u < 1) return;

    if (rising) { this.startCling(api, now); return; }

    // 착지
    puyo.setPosition(x, this.groundY);
    burst(scene, x, this.groundY, 'smoke', {
      count: 7, scale: 0.6, speed: 0.8, depth: DEPTH_PUYO - 1, blend: 'normal',
    });
    impact(scene, { shake: { duration: 180, intensity: 0.005 } });
    // 착지 자리는 화면 끝 근처다 — **안쪽으로**(방금 찼던 벽 쪽으로) 걸어 들어가야
    // 한 걸음 만에 가장자리에 부딪혀 방향을 뒤집지 않는다
    this.dir = this.wallRight ? 1 : -1;
    this.play('walk');
  }

  // ── 똥 ────────────────────────────────────────────────────────────
  /**
   * 점프 선분 위의 **일반 똥**을 부수고 개수만큼 점수를 준다.
   *
   * 지난 프레임 좌표와 잇는 **점-선분 거리 판정**이다 — 한 프레임에 수십 px 을
   * 움직이므로 현재 위치만 보면 똥을 뚫고 지나간다 (테드 낙하와 같은 구조).
   *
   * 금·다이아·토파즈·무지개는 건드리지 않는다 — `api.poops` 가 일반 똥 전용 그룹이라
   * 구조적으로 닿지 않는다. 그건 플레이어가 먹어야 하는 보너스라 없애면 뺏는 것이 된다.
   */
  private smashPoops(api: GameSceneAPI, ax: number, ay: number, bx: number, by: number): void {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    // 내려오는 날라차기는 뻗은 발만큼 판정이 넓다
    const r = this.state === 'kick' ? HEIDI_PARAMS.puyoKickHitR : HEIDI_PARAMS.puyoHitR;
    const r2 = r * r;

    const hit = (api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[]).filter(p => {
      if (!p.active) return false;
      const rx = p.x - ax;
      const ry = p.y - ay;
      const t = len2 > 0 ? Math.min(1, Math.max(0, (rx * dx + ry * dy) / len2)) : 0;
      const px = rx - t * dx;
      const py = ry - t * dy;
      return px * px + py * py <= r2;
    });
    if (hit.length === 0) return;

    // 타격 이펙트는 recycle() 안에서 이미 나간다 — 여기서 또 깔면 상한만 잡아먹는다
    for (const p of hit) (p as unknown as PoolablePoopBase).recycle();

    const bonus = hit.length
      * (this.state === 'kick' ? HEIDI_PARAMS.puyoKickPoints : HEIDI_PARAMS.puyoPoints);
    // **가드가 먼저다.** addAbilityBonus 는 점수를 1씩 올리며 마일스톤을 부르므로,
    // 올려 두지 않으면 이 줄이 착지하는 순간 다음 점프를 연쇄로 부른다
    this.lastFireScore += bonus;
    api.addAbilityBonus(bonus);
  }

  // ── 보조 ──────────────────────────────────────────────────────────
  /** 상태 전환 = 시트 교체. 표시 크기는 텍스처가 바뀌어도 유지돼야 한다 */
  private play(state: PuyoState, until = 0): void {
    const puyo = this.puyo;
    if (!puyo) return;
    this.state = state;
    this.stateUntil = until;

    const sheet = HEIDI_PUYO_SHEETS[state];
    const anim = this.animKey(sheet);
    if (!puyo.scene.anims.exists(anim)) return;
    const w = puyo.displayWidth;
    const h = puyo.displayHeight;
    puyo.play({ key: anim }, true);
    puyo.setDisplaySize(w, h);
  }

  private animKey(sheet: string): string {
    return `heidi_${sheet.replace(/_\d+x\d+\.png$/, '')}`;
  }

  /**
   * `loadFxPickSheet` 는 텍스처만 올리고 애니메이션은 만들지 않는다.
   * 루프가 필요한 쪽은 여기서 직접 등록한다 (레드와 같은 길).
   */
  private registerAnims(scene: Phaser.Scene): void {
    const def = (
      sheet: string,
      span: { start: number; end: number; fps: number },
      repeat: number,
    ) => {
      const texKey = fxPickSheetKey(sheet);
      if (!scene.textures.exists(texKey)) return;
      const key = this.animKey(sheet);
      if (scene.anims.exists(key)) return;
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(texKey, { start: span.start, end: span.end }),
        frameRate: span.fps,
        repeat,
      });
    };
    def(HEIDI_PUYO_SHEETS.walk,   PUYO_WALK,   -1);
    def(HEIDI_PUYO_SHEETS.idle,   PUYO_IDLE,   -1);
    def(HEIDI_PUYO_SHEETS.crouch, PUYO_CROUCH,  0);
    def(HEIDI_PUYO_SHEETS.jump,   PUYO_JUMP,    0);
    def(HEIDI_PUYO_SHEETS.kick,   PUYO_KICK,    0);
    def(HEIDI_PUYO_SHEETS.wall,   PUYO_WALL,    0);
  }
}
