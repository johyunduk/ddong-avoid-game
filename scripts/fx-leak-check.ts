/**
 * VFX 누수 계측 하네스.
 *
 * 실제 `MaehwaAbility` 를 가짜 씬(scripts/fx-leak-stub-phaser.mjs) 위에서 20회 발동시키고,
 * 이펙트가 다 끝난 뒤 vfx 장부(스프라이트·이미터·타이머·블룸 참조)와
 * 실제 오브젝트 생존 수가 기준선(0)으로 돌아오는지 숫자로 확인한다.
 *
 * 실행:  node scripts/run-fx-leak-check.mjs
 */
// @ts-nocheck
import Phaser, { live, created, createFakeScene, arcSpawns, beamSpawns, shardSpawns, waveSpawns, textureBuilds } from 'phaser';
import { MaehwaAbility } from '../src/abilities/MaehwaAbility';
import { KnightAbility } from '../src/abilities/KnightAbility';
import { KAbility } from '../src/abilities/KAbility';
import { LegacyAbility } from '../src/abilities/LegacyAbility';
import { TedAbility, HEAD_ORIGIN_Y } from '../src/abilities/TedAbility';
import { RedAbility, ROAR_RING_LIFE_MS } from '../src/abilities/RedAbility';
import { HeidiAbility } from '../src/abilities/HeidiAbility';
import { LEGACY_PARAMS, K_PARAMS, TED_PARAMS, RED_PARAMS, RED_SHEETS, HEIDI_PARAMS, HEIDI_SHEETS } from '../src/config/abilityParams';
import { beam, fxSprite, getFxStats, preloadFxAssets, preloadFxSheet, playFx, getFxCounters, resetFxCounters, fxPickSheetKey, CUBE_VARIANT, FX_PARTICLE_ASSETS, FX_ASSET_DIR } from '../src/utils/vfx';

const VOLLEYS = 20;
const KNIGHT_VOLLEYS = 10;
const VOLLEY_GAP_MS = 250;
const SETTLE_MS = 5000;
// 꽃잎 낙하는 최대 1.8s + 보험 0.7s 라 정지 구간은 그보다 넉넉해야 '회수됐다'를 판정할 수 있다
const FREEZE_MS = 3500;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function snapshot(scene) {
  const st = getFxStats(scene);
  return { ...st, liveSprites: live.sprites, liveEmitters: live.emitters, liveLayers: live.layers };
}

function fmt(label, s) {
  return `${label.padEnd(26)} sprites=${String(s.sprites).padStart(3)} `
    + `emitters=${String(s.emitters).padStart(3)} timeouts=${String(s.timeouts).padStart(3)} `
    + `slots=${String(s.activeSlots).padStart(3)} `
    + `bloomRefs=${String(s.bloomRefs).padStart(3)} bloomChildren=${String(s.bloomChildren).padStart(3)} `
    + `| liveObjects=${s.liveSprites + s.liveEmitters}`;
}

/**
 * 기준선 복귀 — **스냅샷의 모든 항목**이 0 이어야 한다.
 *
 * 항목을 하나하나 나열하면 새 항목이 늘 때 조용히 빠진다 (`liveLayers` 가 실제로
 * 빠져 있었다). 스냅샷을 통째로 훑는다.
 */
/**
 * 기준선 복귀 — **스냅샷의 모든 수치**가 0 이어야 한다. 단 하나만 뺀다.
 *
 * 항목을 손으로 나열하면 새 항목이 늘 때 조용히 빠진다 (`liveLayers` 가 실제로
 * 빠져 있었다). 그래서 통째로 훑되, 예외는 **이유를 적어 둔다.**
 *
 * `liveLayers` — 블룸 레이어는 씬당 하나를 만들어 재사용하고 shutdown 에서 내린다.
 * 이펙트가 끝나도 살아 있는 것이 정상이고, 새는지는 `bloomChildren` 이 말한다.
 */
const NOT_A_LEAK = new Set(['liveLayers']);

function isZero(s) {
  return Object.entries(s)
    .every(([k, v]) => typeof v !== 'number' || NOT_A_LEAK.has(k) || v === 0);
}

/** 매초 일어나는 공통 연출 — 똥 파괴 n발 (아이템 획득 팝은 제거됨) */
const capStat = { requested: 0, played: 0 };
function commonFx(scene, n) {
  for (let i = 0; i < n; i++) {
    capStat.requested++;
    if (playFx(scene, 'impactHit', 60 + i * 30, 300)) capStat.played++;
  }
}

/**
 * K 에너지파 — 층 + 무한 반복 일렁임 트윈이 붙는다.
 * 반복 트윈은 오브젝트가 죽어도 안 끊기면 그대로 누수라 여기서 함께 검증한다.
 */
function fireBeams(scene, n) {
  for (let i = 0; i < n; i++) {
    // 실기와 같은 형태로 — 색·요동은 시트가 맡고 코드는 각도·길이·두께만 준다
    beam(scene, 60, 500, {
      angle: -Math.PI / 4, length: 780, thickness: 96,
      sheet: 'kBeam', blend: 'normal', alpha: 0.92,
      dissipate: 'retract', maxConcurrent: 4,
    });
  }
}

/**
 * K 초사이언 오라 파지직 — 짧게 살다 죽는 스프라이트를 계속 뿌린다.
 * 승계 후 게임이 끝날 때까지 도는 패턴이라, 장부가 조금이라도 새면 여기서 드러난다.
 */
const sparkStat = { made: 0 };
function sparkChurn(scene, n) {
  for (let i = 0; i < n; i++) {
    const img = fxSprite(scene, 180 + i * 8, 500, 'fx_proc_streak', {
      rotation: Math.random() * 6.28,
      scale: [0.1, 0.13],
      tint: 0x59b8ff,
      alpha: 0.85,
      depth: 318,
      blend: 'normal',
      lifeMs: 350,
      slot: 'k_spark',
      maxConcurrent: 12,
    });
    if (!img) continue;
    sparkStat.made++;
    scene.tweens.add({
      targets: img, alpha: 0, duration: 150,
      onComplete: () => img.destroy(),
    });
  }
}

/** 실기처럼 똥이 계속 떨어진다 — 좌표를 고정해 두면 이펙트가 뒤에 남는다 */
const FALL_SPEED = 300; // px/s
const recycleLog = [];

function makeApi(scene) {
  const player = { x: 180, y: 520, scaleX: 1, scaleY: 1 };
  let poops = [];
  const fallTimer = setInterval(() => {
    // 실기에서는 히트스톱 중 물리도 멈추므로 낙하도 씬 시계를 따른다
    const dt = 0.016 * scene.time.timeScale;
    for (const p of poops) if (p.active) p.y += FALL_SPEED * dt;
  }, 16);
  return {
    api: {
      scene,
      player,
      poops: { getChildren: () => poops },
      addAbilityBonus() {}, // 나이트 검기 처치 보너스 — 점수는 계측 대상이 아니다
      spawnGoldPoop() {},   // 레거시 시작 피버가 금똥으로 갈아끼운다
    },
    refillPoops() {
      poops = [0, 1, 2].map(i => ({
        x: 120 + i * 60,
        y: 200 + i * 40,
        active: true,
        recycle() {
          this.active = false;
          recycleLog.push({ x: this.x, y: this.y, t: Date.now() });
        },
      }));
    },
    stopFall() { clearInterval(fallTimer); },
  };
}

/**
 * 각 똥이 사라진 좌표와, 그 직전에 그려진 칼날 궤적 좌표의 차이.
 * 좌표를 예고 시점에 고정하면 낙하한 만큼 벌어진다.
 */
function maxCutOffset() {
  let worst = 0;
  for (const r of recycleLog) {
    // 대상마다 x 가 다르므로(60px 간격) 같은 대상의 궤적끼리만 짝지어 비교한다
    let best = null;
    for (const a of arcSpawns) {
      if (a.t > r.t || r.t - a.t > 200) continue;
      if (Math.abs(a.x - r.x) > 25) continue;
      if (!best || a.t > best.t) best = a;
    }
    if (!best) continue;
    worst = Math.max(worst, Math.hypot(best.x - r.x, best.y - r.y));
  }
  return worst;
}

async function main() {
  const scene = createFakeScene();
  preloadFxAssets(scene); // 실제 로더 경로(파일명 WxH 파싱 + registerFxSheet)를 그대로 탄다

  const ability = new MaehwaAbility(0);
  const { api, refillPoops, stopFall } = makeApi(scene);

  const baseline = snapshot(scene);
  console.log('\n=== VFX 누수 계측 (매화 %d회 발동, 대상 3마리/회) ===\n', VOLLEYS);
  console.log(fmt('[1] 기준선 (발동 전)', baseline));

  // ── 부하 구간 ────────────────────────────────────────────────────────
  let peak = baseline;
  const sampler = setInterval(() => {
    const s = snapshot(scene);
    if (s.liveSprites + s.liveEmitters > peak.liveSprites + peak.liveEmitters) peak = s;
  }, 40);

  for (let i = 1; i <= VOLLEYS; i++) {
    refillPoops();
    ability.onScoreMilestone(i * 100, api);
    commonFx(scene, 10); // 상한(6)을 넘겨 호출 — 초과분이 조용히 무시되는지도 함께 본다
    await sleep(VOLLEY_GAP_MS);
  }
  clearInterval(sampler);
  const stress = getFxCounters();
  console.log(fmt('[2] 최대 동시 사용량', peak));

  // ── 정착 ─────────────────────────────────────────────────────────────
  await sleep(SETTLE_MS);
  const settled = snapshot(scene);
  console.log(fmt('[3] 이펙트 종료 후', settled));

  // ── 나이트: 날아가는 검기(projectile) 세트가 전량 회수되는지 ─────────
  // 매화와 달리 본체가 이동하고 잔상이 비행 중 계속 늘어난다 — 세트 회수가 핵심.
  const knight = new KnightAbility(0);
  let knightPeak = settled;
  const knightSampler = setInterval(() => {
    const s = snapshot(scene);
    if (s.liveSprites + s.liveEmitters > knightPeak.liveSprites + knightPeak.liveEmitters) knightPeak = s;
  }, 40);
  for (let i = 1; i <= KNIGHT_VOLLEYS; i++) {
    refillPoops();
    knight.onScoreMilestone(i * 100, api);
    fireBeams(scene, 3); // 상한(4)을 넘겨 호출 — 초과분이 조용히 무시되는지도 본다
    // 오라 파지직 3초치 (110ms × 2장)
    for (let k = 0; k < 3; k++) { sparkChurn(scene, 2); await sleep(100); }
  }
  clearInterval(knightSampler);
  console.log(fmt('[3a] 나이트 + K 빔/파지직 최대 동시', knightPeak));
  console.log('파지직 생성 %d장 (상한에 걸린 초과분 제외)', sparkStat.made);
  await sleep(SETTLE_MS);
  const knightSettled = snapshot(scene);
  console.log(fmt('[3b] 나이트 이펙트 종료 후', knightSettled));

  // ── 레거시: 상시 오라 + 빗줄기 타이머 + 불태우기 폭발 ────────────────
  // 이 캐릭터가 렉의 주범이었다. 세 가지가 동시에 돈다 —
  // 매 프레임 오라 불꽃, repeat:-1 로 도는 빗줄기 타이머, 똥 4개 동시 소각.
  // 특히 legacyRainTimer 는 remove() 를 놓치면 씬이 끝나도 계속 스프라이트를 뱉는다.
  const legacy = new LegacyAbility(0);
  legacy.onCreate(api);
  let legacyPeak = snapshot(scene);
  const legacySampler = setInterval(() => {
    const s = snapshot(scene);
    if (s.liveSprites + s.liveEmitters > legacyPeak.liveSprites + legacyPeak.liveEmitters) legacyPeak = s;
  }, 40);
  legacy.onScoreMilestone(LEGACY_PARAMS.legacyInterval, api); // 레거시 모드 진입
  for (let i = 0; i < 40; i++) {
    legacy.onUpdate(api);          // 오라 불꽃 (레거시 모드 = 80ms 간격 3장)
    if (i % 8 === 0) { refillPoops(); legacy.onAfterSpawnPoop(api); }
    await sleep(40);
  }
  clearInterval(legacySampler);
  console.log(fmt('[15a] 레거시 모드 최대 동시', legacyPeak));

  legacy.onDestroy(api);
  await sleep(SETTLE_MS + 1500);   // 빗줄기 수명(최대 3.6s)까지 기다린다
  const legacySettled = snapshot(scene);
  console.log(fmt('[15b] 레거시 종료 후', legacySettled));

  // onDestroy 이후에 타이머가 더 뱉지 않는지 — 정착 시점의 생성 수를 다시 재 본다
  const afterLegacyCreated = created.sprites;
  await sleep(600);
  const legacyQuiet = created.sprites === afterLegacyCreated;
  console.log('레거시 정리 후 600ms 동안 추가 생성: %d장', created.sprites - afterLegacyCreated);

  // ── K 초사이언: 제거 보너스가 스스로 다음 마일스톤을 넘기는 재진입 ─────
  // 실기 GameScene 은 점수를 1점씩 순회하며 마일스톤을 호출한다. K 는 빔으로 지운
  // 똥 1개당 50점을 주는데 초사이언 발동 간격이 150점이라, **3개만 지워도 그 자리에서
  // 다음 발동이 걸린다.** 여기서는 그 되먹임을 그대로 재현해 한 번의 발동이 몇 번의
  // 발동으로 번지는지, 그동안 화면에 몇 장이 떠 있는지를 잰다.
  // '마일스톤 통과 횟수'가 아니라 **실제로 빔이 나간 횟수**를 센다 (빔 시트 스프라이트 수)
  const kFire = { milestones: 0 };
  const countBeams = () => beamSpawns.filter(k => k === 'fxsheet_kBeamSs').length;
  const kScene = scene;
  const kPlayer = {
    x: 120, y: 520, scaleX: 1, scaleY: 1, active: true, displayWidth: 48, displayHeight: 64,
    setTexturePrefix() {}, resize(w, h) { this.displayWidth = w; this.displayHeight = h; },
    setY(v) { this.y = v; }, setInvincibleBriefly() {},
  };
  let kPoops = [];
  const kRefill = () => {
    // 빔 경로(왼쪽 아래 → 오른쪽 위 45°)에 확실히 걸리도록 대각선으로 깐다
    kPoops = Array.from({ length: 8 }, (_, i) => ({
      x: 130 + i * 20, y: 500 - i * 20, active: true,
      recycle() { this.active = false; },
    }));
  };
  kRefill();
  let kScore = 0;
  const kApi = {
    scene: kScene,
    player: kPlayer,
    poops: { getChildren: () => kPoops },
    goldPoops: {}, diamondPoops: {}, topazPoops: {}, rainbowPoops: {},
    collectGoldPoop() {}, collectDiamondPoop() {}, collectTopazPoop() {}, collectRainbowPoop() {},
    spawnGoldPoop() {},
    // GameScene.checkMissedSpawnPoints 와 같은 순회 (점수 1점마다 마일스톤 호출)
    addAbilityBonus(n) {
      const to = kScore + n;
      for (let sc = kScore + 1; sc <= to; sc++) {
        kScore = sc;
        if (sc % K_PARAMS.gmhmIntervalSs === 0) kFire.milestones++;
        k.onScoreMilestone(sc, kApi);
      }
      kScore = to;
    },
  };
  const k = new KAbility(0);
  k.onCreate(kApi);
  k.onHitPoop(kApi);                 // 초사이언 승계
  await sleep(400);

  let kPeak = snapshot(kScene);
  const kSampler = setInterval(() => {
    const sn = snapshot(kScene);
    if (sn.liveSprites + sn.liveEmitters > kPeak.liveSprites + kPeak.liveEmitters) kPeak = sn;
  }, 40);
  // 첫 발동 한 번만 사람 손으로 넣는다 — 이후는 전부 자기 보너스가 굴린 것이다
  kScore = K_PARAMS.gmhmIntervalSs - 1;
  const beamsBefore = countBeams();
  kApi.addAbilityBonus(1);
  for (let i = 0; i < 40; i++) { k.onUpdate(kApi); if (i % 4 === 0) kRefill(); await sleep(50); }
  clearInterval(kSampler);
  console.log(fmt('[17a] K 초사이언 최대 동시', kPeak));
  const kCascade = countBeams() - beamsBefore;
  console.log('발동 1회 입력 → 실제 발사 %d회 (마일스톤 통과 %d회) · 최종 점수 %d',
    kCascade, kFire.milestones, kScore);

  k.onDestroy(kApi);
  await sleep(SETTLE_MS);
  const kSettled = snapshot(kScene);
  console.log(fmt('[17b] K 정리 후', kSettled));

  // ── 상시 가산 이펙트가 블룸 레이어를 붙잡지 않는지 ────────────────────
  // 블룸 레이어는 depth 가 고정이라 올라간 오브젝트는 자기 depth 를 잃고,
  // 하나라도 살아 있으면 전체 화면 블룸 패스가 계속 돈다.
  // 구미 꼬리(9개 상시, 가산)가 여기 올라가 렉과 렌더 순서 붕괴를 일으킨 적이 있다.
  const persist = [];
  for (let i = 0; i < 9; i++) {
    persist.push(fxSprite(scene, 100 + i * 10, 400, 'fx_proc_streak', {
      rotation: 0, scale: [0.14, 0.14], origin: [0, 0.5],
      tint: 0xff2200, alpha: 0.9, depth: 3, blend: 'add',
      lifeMs: 60000, slot: 'gumi_tail', maxConcurrent: 12,
    }));
  }
  const persistBloom = snapshot(scene).bloomRefs;
  persist.forEach(o => o?.destroy());
  await sleep(200);
  const persistCleared = snapshot(scene);
  console.log('상시 가산 9장: bloomRefs=%d (0 이어야 한다), 파기 후 sprites=%d timeouts=%d',
    persistBloom, persistCleared.sprites, persistCleared.timeouts);

  // ── 잔상 누락 검사: 매화 1회 발동에서 sweep/잔상 요청 = 생성 이어야 한다 ──
  resetFxCounters();
  recycleLog.length = 0;
  arcSpawns.length = 0;
  refillPoops();
  ability.onScoreMilestone((VOLLEYS + 3) * 100, api);
  await sleep(500); // 스태거(0/55/110) + 예고→베기(90) 가 전부 끝날 때까지
  const single = getFxCounters();
  const cutOffset = maxCutOffset();
  // 밝은 배경(background2 평균 192/255)에서 묻히는 조합: 옅은 알파 + 가산 블렌드
  const ADD = 1;
  const faintAdditive = arcSpawns.filter(a => a.obj.blendMode === ADD && a.obj.alpha < 0.6);
  console.log('\n단발 발동: sweep 요청 %d / 생성 %d, 잔상 요청 %d / 생성 %d',
    single.sweepRequested, single.sweepCreated, single.trailRequested, single.trailCreated);
  console.log('스트레스 구간 누계: sweep %d/%d, 잔상 %d/%d',
    stress.sweepCreated, stress.sweepRequested, stress.trailCreated, stress.trailRequested);
  console.log('칼날↔소멸 위치 최대 오차: %dpx (낙하 %dpx/s, 칼날 통과 50ms 기준 이론값 %dpx)',
    Math.round(cutOffset), FALL_SPEED, Math.round(FALL_SPEED * 0.05));
  console.log('궤적 %d장 중 옅은알파(<0.6)+가산 조합: %d장  [알파/블렌드: %s]',
    arcSpawns.length, faintAdditive.length,
    arcSpawns.map(a => `${a.obj.alpha.toFixed(2)}/${a.obj.blendMode === ADD ? 'ADD' : 'NORMAL'}`).join(' '));


  // ── 히트스톱 지속 중 회수 (timeScale=0 에서도 회수가 도는지) ──────────
  refillPoops();
  ability.onScoreMilestone((VOLLEYS + 1) * 100, api);
  commonFx(scene, 6);
  await sleep(400); // 3단계(예고·베기·잔향)가 전부 스폰될 때까지
  const midFlight = snapshot(scene);
  console.log(fmt('[4] 발동 직후(비행 중)', midFlight));

  scene.time.timeScale = 0;
  scene.tweens.timeScale = 0;
  scene.anims.globalTimeScale = 0;
  await sleep(FREEZE_MS);
  const frozen = snapshot(scene);
  console.log(fmt('[5] 씬 시계 정지 3.5s 후', frozen));
  scene.time.timeScale = 1;
  scene.tweens.timeScale = 1;
  scene.anims.globalTimeScale = 1;

  // ── 씬 재시작 (발동 도중 shutdown) ───────────────────────────────────
  refillPoops();
  ability.onScoreMilestone((VOLLEYS + 2) * 100, api);
  commonFx(scene, 6);
  await sleep(150); // 이펙트가 아직 살아 있는 시점
  const beforeRestart = snapshot(scene);
  console.log(fmt('[6] 재시작 직전(비행 중)', beforeRestart));

  ability.onDestroy(api);              // GameScene 이 하는 것과 동일
  knight.onDestroy(api);
  scene.events.emit(Phaser.Scenes.Events.SHUTDOWN);
  const afterRestart = snapshot(scene);
  console.log(fmt('[7] shutdown 직후', afterRestart));

  scene.__clock.stop();
  stopFall();

  const tedScene = createFakeScene();
  preloadFxAssets(tedScene);
  // 풀 상한(60)만큼 화면을 똥으로 채운다 — 파열 순간 한 프레임에 몰리는 비용을 재기 위해서다.
  // PoolablePoopBase.recycle 과 같은 규칙: silent 가 아니면 화면 안에서만 타격 이펙트가 난다
  const POOP_POOL = 60;
  const recycleCalls = { silent: 0, loud: 0 };
  let frameRecycles = 0;          // 이번 틱에 반납된 수 (한 프레임에 몰리는지 본다)
  let maxFrameRecycles = 0;
  // 특수 똥 — TedAbility 는 `api.poops`(일반 똥 전용 그룹) 만 본다. 여기 것이 하나라도
  // 반납되면 그룹을 잘못 훑고 있다는 뜻이다
  const specialPoops = Array.from({ length: 12 }, (_, i) => ({
    x: 30 + i * 26, y: 120 + (i % 4) * 70, active: true,
    recycle() { this.active = false; },
  }));
  const makePoops = () => Array.from({ length: POOP_POOL }, (_, i) => ({
    x: 20 + (i % 10) * 34,
    y: 60 + Math.floor(i / 10) * 90,
    active: true,
    recycle(silent) {
      if (!silent && this.active) playFx(tedScene, 'impactHit', this.x, this.y);
      recycleCalls[silent ? 'silent' : 'loud']++;
      frameRecycles++;
      this.active = false;
    },
  }));
  let tedPoops = makePoops();
  const tedApi = {
    scene: tedScene,
    player: { x: 180, y: 520, scaleX: 1, scaleY: 1 },
    poops: { getChildren: () => tedPoops },
    addAbilityBonus: () => {},
  };
  // ── 테드 체스 큐브 (흡수 → 조각 → 결합 → 충전 → 파열) ────────────────
  //
  // **독립된 씬에서 돈다.** 같은 씬에 붙이면 2초짜리 연출이 앞뒤 검사의 타이밍을
  // 밀어 버려서, 멀쩡한 검사가 흔들린다 (실제로 [4] 가 그렇게 깨졌다).
  // 확인하는 것 세 가지 (docs/fx-ted-cube-remake.md §7):
  //   · 말 7개의 **도착 시각 편차** — 시트의 결합 섬광(600ms)과 맞아야 한다
  //   · **이동 중 발동** 시 말의 도착 좌표와 플레이어의 거리 — 목적지를 고정하면 벌어진다
  //   · 2초 연출이 끝난 뒤 기준선 복귀
  preloadFxSheet(tedScene, 'cubeBurst');
  // 판본이 'none' 이면 큐브 시트가 한 장도 안 올라간다 (VRAM 절약)
  const cubeSheetsLoaded = ['cubeArtForge', 'cubeArtBlast', 'cubeCore', 'cubeForge', 'cubeBlast']
    .filter(k => tedScene.textures.exists(`fxsheet_${k}`)).length;
  const ted = new TedAbility(0);
  const tedBase = snapshot(tedScene);
  console.log(fmt('[T0] 테드 발동 전 기준선', tedBase));

  // 바닥에 꽂힌 말을 직접 심는다 (낙하 7회를 기다리는 대신 — 측정 대상은 흡수 이후다)
  const board = [];
  for (let i = 0; i < TED_PARAMS.chessStackMax; i++) {
    const p = tedScene.add.image(40 + i * 45, 560, 'fxpick_chess', 0);
    p.displayWidth = 54; p.displayHeight = 72;
    board.push(p);
  }
  (ted as any).landed = board;
  (ted as any).tracked = new Set(board);

  // **플레이어가 계속 움직인다.** 큐브는 화면 중앙 고정이므로, 플레이어가 어떻게
  // 움직이든 말과 조각은 화면 중앙에 도착해야 한다 (예전엔 '플레이어를 따라가는가' 를
  // 검증했는데, 목표가 화면 중앙으로 바뀌었으므로 불변식을 다시 겨냥한다)
  const PLAYER_SPEED = 420;                       // px/s (난이도 최고 속도 근처)
  shardSpawns.length = 0;
  const tedT0 = Date.now();
  // 여기서부터 구워지는 텍스처만 센다 — preload 에서 구운 것과 같은 ms 에 걸릴 수 있어
  // 시각 비교가 아니라 **개수 표식**으로 자른다
  const buildMark = textureBuilds.length;
  const playerTrack = [];                         // 조각이 생긴 **그 순간**의 몸 위치를 대조한다
  const mover = setInterval(() => {
    tedApi.player.x = 180 + Math.sin((Date.now() - tedT0) / 260) * 140;
    playerTrack.push({ t: Date.now(), x: tedApi.player.x });
  }, 16);

  waveSpawns.length = 0;                          // 파동 겹은 파열 시각(+지연)에 뜬다
  // 도착 신호 — 퍼짐 판본에는 조각(shard)이 없다. 중앙에 세워져 발사를 기다리는
  // `spreadReady` 에 하나씩 들어오는 순간이 '도착' 이다
  const arrivals: { t: number; x: number }[] = [];
  let seenReady = 0;
  let maxSpreading = 0;
  const frameCost: number[] = [];
  // 프레임별 장부 — 발동 순간에 무엇이 몰리는지 **추측 말고 재려고** 둔다.
  // ms = onUpdate 한 번, new = 그 프레임에 새로 만들어진 GameObject, rec = 반납된 똥
  const frameLog: { t: number; ms: number; new: number; rec: number; live: number }[] = [];
  const spreadTrace: {
    t: number;
    p: { x: number; y: number; w: number; h: number; a: number;
         r: number; oy: number; f: number }[];
  }[] = [];
  // 머리가 진행 방향 앞인가 — 로컬 위 (0,-1) 이 회전 r 에서 가는 방향 (sin r, -cos r) 과
  // 진행 방향 (dx, dy) 의 내적. 1 이면 정확히 머리가 앞
  let headDot = 2;
  // 보이는 머리끝과 **판정 선분 끝점**의 어긋남(px). 원점이 꽁무니면 말 길이만큼 벌어진다
  let headErr = 0;
  let seenDirs = 0;
  // 말이 **화면 밖까지** 가는가. 안에서 멈추면 허공에서 사라지는 것처럼 보인다
  let minReach = Infinity;
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  (ted as any).clearBoard(tedApi);
  const tedTicker = setInterval(() => {
    frameRecycles = 0;
    const bornBefore = created.sprites;
    const t0 = nowMs();
    ted.onUpdate(tedApi);
    const ms = nowMs() - t0;
    frameCost.push(ms);
    frameLog.push({
      t: Date.now() - tedT0, ms,
      new: created.sprites - bornBefore,
      rec: frameRecycles,
      live: live.sprites,
    });
    if (frameRecycles > maxFrameRecycles) maxFrameRecycles = frameRecycles;
    const ready = (ted as any).spreadReady as { x: number }[];
    while (seenReady < ready.length) {
      arrivals.push({ t: Date.now(), x: ready[seenReady].x });
      seenReady++;
    }
    const sp = (ted as any).spreading as any[];
    if (sp.length > maxSpreading) maxSpreading = sp.length;
    // 검수 그림용 — **실제로 돈 코드**의 좌표를 그대로 남긴다 (리플리카가 아니다)
    if (sp.length) {
      spreadTrace.push({
        t: Date.now() - tedT0,
        p: sp.filter(q => !q.done).map(q => ({
          x: Math.round(q.ob.x), y: Math.round(q.ob.y),
          w: Math.round(q.ob.displayWidth ?? 0), h: Math.round(q.ob.displayHeight ?? 0),
          a: Number((q.ob.alpha ?? 1).toFixed(3)),
          r: Number((q.ob.rotation ?? 0).toFixed(4)),
          oy: Number((q.ob.originY ?? 0).toFixed(4)),
          f: Number(q.ob.frame?.name ?? 0),
        })),
      });
      seenDirs = Math.max(seenDirs, sp.length);
      for (const q of sp) minReach = Math.min(minReach, q.dist);
      for (const q of sp) {
        if (q.done) continue;
        const r = q.ob.rotation ?? 0;
        headDot = Math.min(headDot, Math.sin(r) * q.dx + -Math.cos(r) * q.dy);
        // 원점에서 머리끝까지의 로컬 세로 거리 → 회전시켜 월드 어긋남을 잰다.
        // 판정 끝점은 q.px/q.py (= 원점)이므로 원점이 머리면 이 값이 0 이다
        const fi = Number(q.ob.frame?.name ?? 0);
        const dLocal = (HEAD_ORIGIN_Y[fi] - (q.ob.originY ?? 0)) * (q.ob.displayHeight ?? 0);
        headErr = Math.max(headErr, Math.hypot(Math.sin(r) * -dLocal, Math.cos(r) * dLocal));
      }
    }
  }, 16);

  await sleep(TED_PARAMS.cubeGatherMs + 120);
  const tedGather = snapshot(tedScene);
  console.log(fmt('[T1] 결합 직후', tedGather));

  // 조각은 말이 도착하는 순간 그 자리에서 생긴다 → 도착 시각·좌표의 대리 측정값이다
  const arriveTimes = arrivals.map(a => a.t - tedT0);
  const arriveSpread = arriveTimes.length
    ? Math.max(...arriveTimes) - Math.min(...arriveTimes) : 999;
  // 기대 도착 지점 = 화면 중앙 (TED_PARAMS.cubeCenterX). 플레이어 궤적과는 무관하다
  const centerX = tedScene.scale.width * TED_PARAMS.cubeCenterX;
  let playerSwing = 0;
  for (const q of playerTrack) playerSwing = Math.max(playerSwing, Math.abs(q.x - centerX));
  let arriveOffset = 0;
  for (const a of arrivals) arriveOffset = Math.max(arriveOffset, Math.abs(a.x - centerX));

  // ── 퍼짐 결과 · 성능 ──────────────────────────────────────────────────
  // 파열은 cubeForge 재생이 끝나는 순간(=cubeBurstMs)에 걸린다. 그 한 프레임에
  // 똥 60개 반납 + 파동 + 파열 시트가 겹친다
  const beforeBurst = { sprites: created.sprites, ms: Date.now() };
  // 퍼짐이 다 끝날 때까지 (모임 + 멈칫 + 퍼짐 + 여유)
  const spreadEndMs = TED_PARAMS.chessSuckMs + TED_PARAMS.spreadHoldMs
    + TED_PARAMS.spreadMs * (1 + TED_PARAMS.spreadDurVar)
    + TED_PARAMS.spreadStagger * TED_PARAMS.chessStackMax + 200;
  await sleep(Math.max(0, spreadEndMs - (Date.now() - tedT0)));
  const burstCost = {
    cleared: recycleCalls.loud,
    silent: recycleCalls.silent,
    newSprites: created.sprites - beforeBurst.sprites,
    alive: tedPoops.filter(p => p.active).length,
    special: specialPoops.filter(p => p.active).length,
  };
  frameCost.sort((a, b) => a - b);
  const costP50 = frameCost[Math.floor(frameCost.length * 0.5)] ?? 0;
  const costMax = frameCost[frameCost.length - 1] ?? 0;
  console.log('');
  console.log(`퍼짐 — 말 ${maxSpreading}개 발사 · 일반 똥 ${POOP_POOL}개 중 `
    + `${burstCost.cleared}개 제거, ${burstCost.alive}개 생존 (말이 안 닿은 자리) · `
    + `특수 똥 ${specialPoops.length}개 중 ${burstCost.special}개 그대로`);
  try {
    const fs = await import('node:fs');
    fs.mkdirSync('build/cube', { recursive: true });
    fs.writeFileSync('build/cube/spread_trace.json', JSON.stringify({
      screen: { w: tedScene.scale.width, h: tedScene.scale.height },
      center: { x: centerX, y: tedScene.scale.height * TED_PARAMS.cubeCenterY },
      hitRadius: TED_PARAMS.chessHitRadius,
      // 똥의 처음 자리와 살아남았는지 — 그림과 판정이 맞는지 눈으로 대조하는 데 쓴다
      poops: tedPoops.map(q => ({ x: q.x, y: q.y, alive: q.active })),
      special: specialPoops.map(q => ({ x: q.x, y: q.y, alive: q.active })),
      frames: spreadTrace,
    }));
  } catch { /* 검수 그림용이라 실패해도 검사에는 영향 없다 */ }
  const cornerDist = Math.hypot(tedScene.scale.width / 2, tedScene.scale.height / 2);
  console.log(`  사거리 — 가장 짧은 말 ${Math.round(minReach)}px, `
    + `중앙에서 화면 모서리까지 ${Math.round(cornerDist)}px `
    + `(짧으면 화면 안에서 사라진다)`);
  const lateBuilds = textureBuilds.slice(buildMark);
  if (lateBuilds.length) {
    console.log(`  ** 연출 도중에 구워진 절차 텍스처 ${lateBuilds.length}개 — `
      + lateBuilds.map(b => `${b.key}(t=${b.t - tedT0}ms)`).join(', '));
  } else {
    console.log('  연출 도중에 구워진 절차 텍스처 0개 (전부 미리 구워 둠)');
  }
  // 가장 비싼 프레임 다섯 개 — 범인을 이름으로 부를 수 있게 같이 찍는다
  const worst = [...frameLog].sort((a, b) => b.ms - a.ms).slice(0, 5);
  console.log('  가장 비싼 프레임 5개 (t=발동 기준 ms)');
  for (const f of worst) {
    console.log(`    t=${String(f.t).padStart(5)}ms  ${f.ms.toFixed(3)}ms  `
      + `새 오브젝트 ${String(f.new).padStart(3)}개  똥 반납 ${String(f.rec).padStart(3)}개  `
      + `살아있는 스프라이트 ${f.live}`);
  }
  const bornMax = frameLog.reduce((m, f) => Math.max(m, f.new), 0);
  const bornSum = frameLog.reduce((m, f) => m + f.new, 0);
  console.log(`  연출 한 번에 새로 만든 GameObject ${bornSum}개 · `
    + `한 프레임 최대 ${bornMax}개`);
  console.log(`  머리가 앞서는 정도 ${headDot.toFixed(4)} (1 = 정확, 방향 ${seenDirs}개 전부) · `
    + `보이는 머리끝과 판정 끝점의 어긋남 ${headErr.toFixed(2)}px `
    + `(발 원점이었다면 말 길이 ${Math.round(TED_PARAMS.chessHeight)}px 만큼 벌어진다)`);
  console.log(`  한 프레임 최대 반납 ${maxFrameRecycles}개 · onUpdate 비용 `
    + `p50 ${costP50.toFixed(3)}ms / 최대 ${costMax.toFixed(3)}ms `
    + `(말 ${TED_PARAMS.chessStackMax} × 똥 ${POOP_POOL} = `
    + `${TED_PARAMS.chessStackMax * POOP_POOL}회 거리 판정/프레임)`);

  await sleep(TED_PARAMS.cubeTotalMs);
  const tedPeak = snapshot(tedScene);
  console.log(fmt('[T2] 파열 뒤', tedPeak));

  // 대조 — 같은 60개를 **조용히가 아니라** 반납하면 얼마나 드는가.
  // 한 번은 0ms 로 찍혀 비교가 안 되므로 60개 × REPS 회를 재고 1회분으로 나눈다
  const REPS = 200;
  // 첫 회만 따로 잰다 — 상한 6이 차고 나면 이후 회차는 스프라이트를 안 만든다.
  // 실기에서 문제가 되는 건 '슬롯이 빈 상태에서 60개가 한꺼번에 들어오는 그 한 프레임'이다
  tedPoops = makePoops();
  const firstBefore = created.sprites;
  for (const p of tedPoops) p.recycle(false);
  const loudFirst = created.sprites - firstBefore;
  await sleep(900);                       // impactHit 이 끝나 슬롯이 풀리도록

  const loudBefore = created.sprites;
  const loudT0 = Date.now();
  for (let r = 0; r < REPS; r++) {
    tedPoops = makePoops();
    for (const p of tedPoops) p.recycle(false);
  }
  const loudCost = { ms: (Date.now() - loudT0) / REPS, sprites: (created.sprites - loudBefore) / REPS };
  const silentBefore = created.sprites;
  const silentT0 = Date.now();
  for (let r = 0; r < REPS; r++) {
    tedPoops = makePoops();
    for (const p of tedPoops) p.recycle(true);
  }
  const silentCost = { ms: (Date.now() - silentT0) / REPS, sprites: (created.sprites - silentBefore) / REPS };
  const waveSpread = waveSpawns.length > 1
    ? Math.round(waveSpawns[waveSpawns.length - 1].t - waveSpawns[0].t) : 0;
  console.log('파동 겹 %d/%d 장 발사 (동시 상한에 안 걸림), 첫 겹 → 마지막 겹 %dms',
    waveSpawns.length, 4, waveSpread);
  console.log('파열 한 프레임: 일반 똥 %d개 반납, 남은 활성 %d, 시끄러운 반납 %d회',
    burstCost.cleared, burstCost.alive, burstCost.loud);
  console.log('  60개 반납 1회 비용 — 조용히 ' + silentCost.ms.toFixed(3) + 'ms / 새 스프라이트 '
    + silentCost.sprites.toFixed(2) + '개   vs  시끄럽게 ' + loudCost.ms.toFixed(3) + 'ms / '
    + '첫 프레임 새 스프라이트 ' + loudFirst + '개 (동시 상한 6에서 막히지만 그 전에 60번 슬롯 경쟁)');

  clearInterval(mover);

  // ── 착지 위치 분산 ────────────────────────────────────────────────────
  // 실제 `pickLandX` 를 화면 폭마다 수백 판 돌려 **인접 말 사이 최소 간격**을 본다.
  // 대조군은 예전 방식(독립 균등 난수) — 같은 판 수, 같은 폭.
  const LAND_BOARDS = 400;
  const landStat = (w, pick) => {
    const mins = [];
    for (let b = 0; b < LAND_BOARDS; b++) {
      const xs = pick(w);
      xs.sort((p, q) => p - q);
      let m = Infinity;
      for (let i = 1; i < xs.length; i++) m = Math.min(m, xs[i] - xs[i - 1]);
      mins.push(m);
    }
    mins.sort((p, q) => p - q);
    return {
      min: Math.round(mins[0]),
      p10: Math.round(mins[Math.floor(mins.length * 0.1)]),
      mean: Math.round(mins.reduce((a, v) => a + v, 0) / mins.length),
      tight: mins.filter(v => v < 20).length / mins.length,
    };
  };
  const stratified = (w) => {
    const probe = new TedAbility(0);
    (probe as any).landSlots = [];
    (probe as any).landed = [];
    const xs = [];
    for (let i = 0; i < TED_PARAMS.chessStackMax; i++) {
      const x = (probe as any).pickLandX(w);
      xs.push(x);
      (probe as any).landed.push({ x });        // 다음 말이 최소 간격 검사를 할 수 있게
    }
    return xs;
  };
  const uniform = (w) => Array.from({ length: TED_PARAMS.chessStackMax },
    () => 30 + Math.random() * Math.max(1, w - 60));

  console.log('');
  console.log('착지 x 분산 — 판 %d회, 인접 말 사이 **최소 간격**(px)', LAND_BOARDS);
  const pad = (v, n) => String(v).padStart(n);
  console.log('  폭   방식            최소   p10   평균   <20px   (칸너비)');
  const landOk = [];
  for (const w of [360, 390, 430]) {
    const a = landStat(w, stratified);
    const b = landStat(w, uniform);
    landOk.push(a);
    const cell = Math.round((w - Math.min(30, w * 0.08) * 2) / TED_PARAMS.chessStackMax);
    console.log(`  ${pad(w, 3)}  층화(채택)     ${pad(a.min, 4)}  ${pad(a.p10, 4)}  `
      + `${pad(a.mean, 4)}  ${pad(Math.round(a.tight * 100), 4)}%   ${pad(cell, 4)}px`);
    console.log(`       독립균등(이전) ${pad(b.min, 4)}  ${pad(b.p10, 4)}  `
      + `${pad(b.mean, 4)}  ${pad(Math.round(b.tight * 100), 4)}%`);
  }

  // ── 동시 비행 상한 ────────────────────────────────────────────────────
  // 큰 보너스 한 번이면 마일스톤이 한 프레임에 여러 개 터진다 (addAbilityBonus 가
  // 점수를 1씩 올리며 호출한다). chessMaxAlive 에 걸려 **조용히 안 떨어지는** 말이
  // 몇 개인지 실제로 센다.
  tedScene.textures.__addAsset(fxPickSheetKey('chess_96x128.png'));
  const burstAbility = new TedAbility(0);
  const BURST_MILESTONES = TED_PARAMS.chessStackMax;
  for (let i = 1; i <= BURST_MILESTONES; i++) {
    burstAbility.onScoreMilestone(TED_PARAMS.chessInterval * i, tedApi);
  }
  const aliveCost = {
    attempts: BURST_MILESTONES,
    dropped: (burstAbility as any).flying,
    cap: TED_PARAMS.chessMaxAlive,
  };
  burstAbility.onDestroy(tedApi);
  console.log(`한 프레임에 마일스톤 ${aliveCost.attempts}개(큰 보너스) → 실제 낙하 `
    + `${aliveCost.dropped}개, 상한 ${aliveCost.cap}. `
    + `평시엔 비행 354~432ms 라 겹치지 않지만 보너스가 몰리면 여기서 잘린다`);

  // ── 점수 재진입 가드 ──────────────────────────────────────────────────
  // GameScene 의 addAbilityBonus 는 **점수를 1씩 올리며 마일스톤을 호출**한다.
  // 파열 정액 보너스(+100)와 똥 파괴 보너스(개당 30)가 그 자리에서 다음 낙하를
  // 부르지 않는지 — 실제 코드로 확인한다.
  const guardTed = new TedAbility(0);
  let simScore = 0;
  let dropsDuringBonus = 0;
  let guardPoops: any[] = [];
  const guardApi: any = {
    scene: tedScene,
    player: { x: 180, y: 520, scaleX: 1, scaleY: 1 },
    poops: { getChildren: () => guardPoops },
    addAbilityBonus: (n: number) => {
      for (let i = 0; i < n; i++) {                 // GameScene 과 같은 방식
        simScore++;
        const before = (guardTed as any).flying;
        guardTed.onScoreMilestone(simScore, guardApi);
        if ((guardTed as any).flying > before) dropsDuringBonus++;
      }
    },
  };

  // (a) 파열 정액 보너스
  (guardTed as any).landed = Array.from({ length: TED_PARAMS.chessStackMax }, (_, i) => {
    const p = tedScene.add.image(40 + i * 30, 560, 'fxpick_chess', 0);
    p.displayWidth = 54; p.displayHeight = 72;
    return p;
  });
  (guardTed as any).clearBoard(guardApi);
  // 퍼짐은 모임이 끝난 뒤에 걸린다. 여기선 기다리지 않고 발동 경로를 직접 부른다
  (guardTed as any).startSpread(guardApi);
  // 파열 스프라이트의 실제 배율 — 화면 가로를 채우는 정수여야 한다
  const burstDrops = dropsDuringBonus;
  const burstScore = simScore;

  // (b) 똥 파괴 보너스 — 낙하 선분 위의 일반 똥 6개 (6 × 30 = 180점)
  dropsDuringBonus = 0;
  guardPoops = Array.from({ length: 6 }, (_, i) => ({
    x: 100, y: 200 + i * 10, active: true, recycle() { this.active = false; },
  }));
  (guardTed as any).smashPoops(guardApi, 100, 180, 100, 260);
  const smashDrops = dropsDuringBonus;
  const smashScore = simScore - burstScore;

  // (c) 가드가 영구적이면 안 된다 — 보너스 구간을 지난 뒤엔 다시 떨어져야 한다
  const beforeLater = (guardTed as any).flying;
  const nextTick = Math.ceil((simScore + 1) / TED_PARAMS.chessInterval) * TED_PARAMS.chessInterval;
  guardTed.onScoreMilestone(nextTick, guardApi);
  const laterDrops = (guardTed as any).flying - beforeLater;
  guardTed.onDestroy(guardApi);

  console.log('');
  console.log(`재진입 가드 — 낙하 간격 ${TED_PARAMS.chessInterval}점`);
  console.log(`  파열 정액 +${burstScore}점 → 그 구간 마일스톤 `
    + `${Math.floor(burstScore / TED_PARAMS.chessInterval)}개, 실제 낙하 ${burstDrops}개`);
  console.log(`  똥 6개 × ${TED_PARAMS.chessPoopPoints}점 = +${smashScore}점 → 그 구간 마일스톤 `
    + `${Math.floor(smashScore / TED_PARAMS.chessInterval)}개, 실제 낙하 ${smashDrops}개`);
  console.log(`  보너스 구간을 지난 뒤(${nextTick}점) 낙하 ${laterDrops}개 — 가드는 영구가 아니다`);
  console.log(`큐브 시트 — 판본 '${CUBE_VARIANT}' 이라 로딩 대상 `
    + `${cubeSheetsLoaded}장 (0 이면 VRAM 0)`);

  await sleep(SETTLE_MS);
  clearInterval(tedTicker);
  ted.onDestroy(tedApi);
  const tedAfter = snapshot(tedScene);
  console.log(fmt('[T3] 큐브 종료 후', tedAfter));
  console.log('말 %d개 중앙 도착 %d개 · 도착 시각 편차 %dms (한 프레임 33ms 이내) · '
    + '화면 중앙(x=%d)에서 %dpx — 그 사이 플레이어는 중앙에서 최대 %dpx 떨어져 있었다',
    TED_PARAMS.chessStackMax, arrivals.length, Math.round(arriveSpread),
    Math.round(centerX), Math.round(arriveOffset), Math.round(playerSwing));

  // 반복 발동이 파동 장부를 더럽히기 전에 1회차 값을 잠근다
  const waveCount = waveSpawns.length;

  // ── 반복 발동 — 쌓이는가, 그리고 첫 발동이 유독 비쌌던 게 뭐였는가 ──────
  //
  // "순간 렉" 이 **발동 순간**이면 그 프레임에 몰린 일이 범인이고, **여러 번 발동한 뒤**
  // 점점 느려지는 것이면 누수다. 둘을 가르려고 다섯 번 연속으로 돌린다.
  const REPEAT = 5;
  const runs: { burstMs: number; born: number; after: number }[] = [];
  for (let r = 0; r < REPEAT; r++) {
    const rTed = new TedAbility(0);
    const rBoard = [];
    for (let i = 0; i < TED_PARAMS.chessStackMax; i++) {
      const q = tedScene.add.image(40 + i * 45, 560, 'fxpick_chess', 0);
      q.displayWidth = 54; q.displayHeight = 72;
      rBoard.push(q);
    }
    (rTed as any).landed = rBoard;
    (rTed as any).tracked = new Set(rBoard);
    let rPoops = makePoops();
    const rApi = {
      scene: tedScene,
      player: { x: 180, y: 520, scaleX: 1, scaleY: 1 },
      poops: { getChildren: () => rPoops },
      addAbilityBonus: () => {},
    };
    const bornBase = created.sprites;
    let burstMs = 0;
    (rTed as any).clearBoard(rApi);
    const rT0 = Date.now();
    const rTick = setInterval(() => {
      const t0 = nowMs();
      rTed.onUpdate(rApi);
      const ms = nowMs() - t0;
      // 발동(= 퍼짐 시작) 전후 한 프레임이 가장 비싼 프레임이다
      if (Date.now() - rT0 >= TED_PARAMS.chessSuckMs) burstMs = Math.max(burstMs, ms);
    }, 16);
    await sleep(spreadEndMs + SETTLE_MS);
    clearInterval(rTick);
    rTed.onDestroy(rApi);
    rPoops = [];
    runs.push({
      burstMs,
      born: created.sprites - bornBase,
      after: snapshot(tedScene).liveSprites,
    });
  }
  console.log('');
  console.log(`반복 발동 ${REPEAT}회 — 쌓이면 누수, 안 쌓이면 발동 프레임 문제다`);
  for (let i = 0; i < runs.length; i++) {
    console.log(`  ${i + 1}회차  발동 구간 최대 프레임 ${runs[i].burstMs.toFixed(3)}ms  `
      + `새 오브젝트 ${String(runs[i].born).padStart(3)}개  `
      + `종료 후 살아있는 스프라이트 ${runs[i].after}`);
  }
  const repeatClean = runs.every(r => r.after === 0);
  const bornSpread = Math.max(...runs.map(r => r.born)) - Math.min(...runs.map(r => r.born));

  tedScene.events.emit(Phaser.Scenes.Events.SHUTDOWN);
  tedScene.__clock.stop();


  // ── 레드: 참새 5마리 → 마무리 ────────────────────────────────────────
  // 두 가지를 본다.
  //  (1) **재진입 폭주** — 참새가 부순 똥 1개당 15점인데 발사 간격이 50점이다.
  //      네 개만 지워도 그 자리에서 다음 발사가 걸린다. 테드와 K 가 같은 자리에서
  //      두 번 터졌고, RedAbility.award() 가 기준선을 먼저 올려 막는다.
  //  (2) **특수 똥 보호** — 포효(광역)와 로봇(전체)이 금·다이아를 쓸면 도와주는 게
  //      아니라 뺏는 것이 된다.
  const redScene = createFakeScene();
  preloadFxAssets(redScene);
  for (const f of RED_SHEETS) redScene.textures.__addAsset(fxPickSheetKey(f));
  const redPlayer = { x: 180, y: 560, active: true, displayWidth: 47, displayHeight: 80 };
  let redNormal = [];
  let redSpecial = [];
  const redRefill = () => {
    // 발사된 참새가 지나가는 수직선 위에 촘촘히 깔아 **반드시 맞게** 한다
    redNormal = Array.from({ length: 10 }, (_, i) => ({
      x: redPlayer.x, y: 500 - i * 24, active: true,
      recycle() { this.active = false; },
    }));
    // 특수 똥은 플레이어 발치 — 광역·전체 삭제가 건드리면 안 되는 것들
    redSpecial = Array.from({ length: 3 }, (_, i) => ({
      x: redPlayer.x + i * 8, y: redPlayer.y, active: true,
      recycle() { this.active = false; },
    }));
  };
  redRefill();
  let redScore = 0;
  const redApi = {
    scene: redScene,
    player: redPlayer,
    poops: { getChildren: () => redNormal },
    goldPoops: { getChildren: () => redSpecial },
    diamondPoops: { getChildren: () => redSpecial },
    topazPoops: { getChildren: () => redSpecial },
    rainbowPoops: { getChildren: () => redSpecial },
    collectGoldPoop() {}, collectDiamondPoop() {}, collectTopazPoop() {}, collectRainbowPoop() {},
    spawnGoldPoop() {},
    // GameScene.checkMissedSpawnPoints 와 같은 순회 (점수 1점마다 마일스톤 호출)
    addAbilityBonus(n) {
      const to = redScore + n;
      for (let sc = redScore + 1; sc <= to; sc++) {
        redScore = sc;
        red.onScoreMilestone(sc, redApi);
      }
      redScore = to;
    },
  };
  const red = new RedAbility(0);
  red.onCreate(redApi);
  await sleep(80);
  const redOrbit = live.sprites;              // 궤도에 뜬 참새 수

  // ── 참새가 머리를 파고들지 않는가 ────────────────────────────────────────
  //
  // 가장 위험한 건 **아래쪽 반원**이다. 머리 꼭대기는 표시 상자의 위가 아니라
  // 원화의 빈칸만큼 아래다 — 상자 기준으로 재면 안 겹치는데 실제로는 겹친다.
  // 두 값 모두 scripts/measure-orbit.py 실측 (독립 출처).
  const SPARROW_BELOW = 11.8;   // 참새가 제 중심보다 아래로 내려오는 최대치(표시 px)
  const HEAD_INSET_H  = 0.1731; // red_front 의 머리 위 빈칸 / 표시 높이
  const headTop = redPlayer.y - redPlayer.displayHeight * (0.5 - HEAD_INSET_H);
  let orbitClear = Infinity;    // 가장 아래로 온 참새와 머리 꼭대기 사이 여유(px)
  let orbitMinGap = Infinity;   // 참새끼리의 최소 간격(px)
  // **가는 방향으로 뒤집는가.** 예전엔 '있는 자리'(cos>0)로 판단해서 절반 구간에서
  // 날갯짓하며 뒤로 나는 그림이 나왔다. 좌우 끝은 가로 속도가 0 이라 제외한다
  let flipWrong = 0;
  let flipChecked = 0;
  // 떨림은 **전환 간격**으로 본다 — 진짜 방향 전환은 반 바퀴(약 1300ms)에 한 번이다.
  // 횟수로 세면 몇 바퀴를 돌았는지에 따라 기준이 흔들린다
  let flipJitter = 0;
  let flipTurns = 0;
  const lastFlipAt = new Map<number, number>();
  const prevX = new Map<number, number>();
  const prevFlip = new Map<number, boolean>();
  for (let i = 0; i < 180; i++) {               // 한 바퀴(2600ms)보다 넉넉히
    red.onUpdate(redApi);
    const orb = (red as any).orbit as { ob: { x: number; y: number } }[];
    for (let k = 0; k < orb.length; k++) {
      const o = orb[k] as { ob: { x: number; y: number; flipX: boolean } };
      orbitClear = Math.min(orbitClear, headTop - (o.ob.y + SPARROW_BELOW));
      const px = prevX.get(k);
      if (px !== undefined) {
        const dx = o.ob.x - px;
        // 실제로 움직인 프레임만 본다 (좌우 끝의 속도 0 구간은 판단 대상이 아니다)
        if (Math.abs(dx) > 0.6) {
          flipChecked++;
          // 시트는 왼쪽을 본다 → 오른쪽으로 갈 때(dx > 0) 뒤집혀 있어야 한다
          if (o.ob.flipX !== dx > 0) flipWrong++;
        }
      }
      const pf = prevFlip.get(k);
      if (pf !== undefined && pf !== o.ob.flipX) {
        flipTurns++;
        const last = lastFlipAt.get(k);
        if (last !== undefined && Date.now() - last < 400) flipJitter++;
        lastFlipAt.set(k, Date.now());
      }
      prevX.set(k, o.ob.x);
      prevFlip.set(k, o.ob.flipX);
    }
    for (let a = 0; a < orb.length; a++) {
      for (let b = a + 1; b < orb.length; b++) {
        orbitMinGap = Math.min(orbitMinGap,
          Math.hypot(orb[a].ob.x - orb[b].ob.x, orb[a].ob.y - orb[b].ob.y));
      }
    }
    await sleep(16);
  }
  console.log('');
  console.log(`참새 궤도 — 머리 꼭대기(y=${headTop.toFixed(1)}, 표시 상자 위에서 `
    + `${(redPlayer.displayHeight * HEAD_INSET_H).toFixed(1)}px 아래)`);
  console.log(`  가는 방향으로 뒤집는가 — ${flipChecked}프레임 중 어긋남 ${flipWrong}회 · `
    + `방향 전환 ${flipTurns}회 중 400ms 안에 되뒤집힌 것 ${flipJitter}회 (떨림)`);
  console.log(`  아래쪽 참새와 머리 사이 여유 최소 ${orbitClear.toFixed(1)}px `
    + `(0 미만이면 파고든 것) · 참새끼리 최소 간격 ${orbitMinGap.toFixed(1)}px`);

  // 발사는 사람 손으로 다섯 번만 넣는다 — 그 이상 나갔다면 전부 자기 보너스가 굴린 것이다
  let redLaunchInputs = 0;
  for (let volley = 0; volley < RED_PARAMS.sparrowCount; volley++) {
    redRefill();
    redScore = (volley + 1) * RED_PARAMS.sparrowInterval - 1;
    redLaunchInputs++;
    redApi.addAbilityBonus(1);
    for (let i = 0; i < 14; i++) { red.onUpdate(redApi); await sleep(16); }
  }
  // 마무리가 끝날 때까지 (티라노 900+520+700 = 2120ms / 로봇 420+260+180+520 = 1380ms).
  // 트윈·예약이 스텁 클럭으로 도니 실제 경과가 더 걸린다 — 넉넉히 4초 돌린다
  //
  // **마무리가 시작되는 순간(티라노 등장)에 참새가 다시 차야 한다.** 예전엔 마무리가
  // 끝난 뒤에 채워서 2.1초 동안 머리 위가 비어 있었다
  let orbitAtStart = -1;
  let orbitDuring = 99;
  let sawFinishing = false;
  for (let i = 0; i < 250; i++) {
    red.onUpdate(redApi);
    const fin = (red as any).finishing as boolean;
    const n = ((red as any).orbit as unknown[]).length;
    if (fin && !sawFinishing) { sawFinishing = true; orbitAtStart = n; }
    if (fin) orbitDuring = Math.min(orbitDuring, n);
    await sleep(16);
  }
  console.log(`마무리 — 시작 순간 궤도 ${orbitAtStart}마리 (등장과 동시에 재장전), `
    + `마무리 도중 최소 ${orbitDuring}마리`);
  const redAfterFinish = live.sprites;
  const redSpecialAlive = redSpecial.filter(p => p.active).length;

  // ── 로봇이 화면 안에서 도는가 ────────────────────────────────────────────
  //
  // 로봇은 플레이어 위로 떨어진다. 플레이어가 화면 가장자리(x=23)에 붙어 있으면
  // 몸이 잘려 나갔다 — 로봇은 화면 전체를 지우니 서는 자리를 옮겨도 게임은 그대로다.
  // 그림 가로 비율은 scripts/cube/robot-stage-check.py 로 실측한 136/192 (독립 출처).
  const ROBOT_ART_W = 136 / 192;
  const robotHalf = RED_PARAMS.robotFrame * ROBOT_ART_W * 0.5;
  const robotEdges: number[] = [];
  for (const px of [23, redScene.scale.width / 2, redScene.scale.width - 23]) {
    const probe = new RedAbility(0);
    const probeApi = { ...redApi, player: { ...redPlayer, x: px } };
    probe.onCreate(probeApi);
    (probe as any).robotFinisher(probeApi);
    // 방금 만들어진 로봇 = tracked 의 마지막 스프라이트
    const all = [...(probe as any).tracked] as { x?: number; depth?: number }[];
    const robot = all.filter(o => o.depth === 7).pop();
    if (robot?.x !== undefined) {
      robotEdges.push(robot.x - robotHalf);                       // 왼쪽 가장자리
      robotEdges.push(redScene.scale.width - (robot.x + robotHalf)); // 오른쪽 여유
    }
    probe.onDestroy(probeApi);
  }
  const robotWorstEdge = robotEdges.length ? Math.min(...robotEdges) : -999;

  // **칼이 화면 위로 잘리는가.** 예비 동작(raise) 프레임이 칼을 가장 높이 든다 —
  // 프레임 중심에서 위로 85px, 아래로 84px (192 프레임 기준, robot-stage-check.py 실측).
  // 가장 좁고 짧은 흔한 모바일 세로 화면에서 본다. 착지 y 는 코드와 같은 H*0.42
  const ROBOT_RAISE_UP = 85 / 192;
  const ROBOT_ART_DOWN = 84 / 192;
  const NARROW = { w: 320, h: 568 };
  const robotLandY = NARROW.h * 0.42;
  const swordTopY = robotLandY - RED_PARAMS.robotFrame * ROBOT_RAISE_UP;
  const robotBotY = robotLandY + RED_PARAMS.robotFrame * ROBOT_ART_DOWN;
  // 강하 시작(y = -robotFrame)에서 그림 아래끝이 화면 위로 완전히 빠져 있어야 한다
  const robotStartBot = -RED_PARAMS.robotFrame + RED_PARAMS.robotFrame * ROBOT_ART_DOWN;
  console.log(`  좁은 화면 ${NARROW.w}x${NARROW.h} — 예비 동작 칼끝 y=${swordTopY.toFixed(0)} `
    + `· 아래끝 y=${robotBotY.toFixed(0)} (화면 ${NARROW.h}) `
    + `· 강하 시작 아래끝 y=${robotStartBot.toFixed(0)} (0 미만이어야 화면 밖)`);
  console.log('');
  console.log(`로봇 — 표시 높이 ${RED_PARAMS.robotFrame}px (그림 `
    + `${Math.round(RED_PARAMS.robotFrame * ROBOT_ART_W)}x`
    + `${Math.round(RED_PARAMS.robotFrame * 169 / 192)}px, 플레이어의 `
    + `${(RED_PARAMS.robotFrame * 169 / 192 / redPlayer.displayHeight).toFixed(2)}배) · `
    + `화면 가장자리까지 최소 ${robotWorstEdge.toFixed(1)}px (0 이상이면 안 잘린다)`);

  // ── 재진입 가드 — 점수를 1점씩 올려 **실제 코드**로 돌린다 ───────────────
  //
  // `award()` 가 `lastLaunchScore` 를 먼저 올리므로, 참새가 똥을 부순 보너스로는
  // 다음 발사가 안 걸린다. 다만 `sparrowPoints` 를 올리면 그만큼 **뒤이은 발사
  // 마일스톤을 더 많이 삼킨다** — 삼킨 뒤에도 정상 발사로 돌아오는지가 관건이다.
  const sgRed = new RedAbility(0);
  let sgScore = 0;
  let sgLaunches = 0;
  // 발사된 참새가 **위 보는 시트**로 갈아탔는가 (궤도는 옆모습 그대로여야 한다)
  const shotTex = new Set<string>();
  const orbitTex = new Set<string>();
  let sgMilestones = 0;
  let sgPoops: { x: number; y: number; active: boolean; recycle(): void }[] = [];
  const sgApi = {
    ...redApi,
    poops: { getChildren: () => sgPoops },
    addAbilityBonus(n) {
      const to = sgScore + n;
      for (let sc = sgScore + 1; sc <= to; sc++) {
        sgScore = sc;
        if (sc % RED_PARAMS.sparrowInterval === 0) sgMilestones++;
        const before = (sgRed as any).shots.length;
        sgRed.onScoreMilestone(sc, sgApi);
        if ((sgRed as any).shots.length > before) sgLaunches++;
      }
      sgScore = to;
    },
  };
  sgRed.onCreate(sgApi);
  // 자연 점수 1점씩. 발사된 참새 앞에 똥을 놓아 **반드시 맞게** 한다
  for (let sc = 1; sc <= 900; sc++) {
    sgScore = sc;
    if (sc % RED_PARAMS.sparrowInterval === 0) sgMilestones++;
    const before = (sgRed as any).shots.length;
    sgRed.onScoreMilestone(sc, sgApi);
    if ((sgRed as any).shots.length > before) {
      sgLaunches++;
      for (const sh of (sgRed as any).shots as { ob: { texture?: { key: string } } }[]) {
        if (sh.ob.texture?.key) shotTex.add(sh.ob.texture.key);
      }
      for (const o of (sgRed as any).orbit as { ob: { texture?: { key: string } } }[]) {
        if (o.ob.texture?.key) orbitTex.add(o.ob.texture.key);
      }
      sgPoops = [{ x: redPlayer.x, y: redPlayer.y - 120, active: true,
        recycle() { this.active = false; } }];
    }
    sgRed.onUpdate(sgApi);
    if (sc % 60 === 0) await sleep(16);       // 참새가 실제로 올라갈 시간
    // 마무리 연출은 건너뛴다 — 여기서 재는 건 **재진입 가드**지 연출이 아니다.
    // (startFinisher 가 등장과 동시에 채우므로 궤도가 빈 순간을 기다리면 안 된다.
    //  그러면 `finishing` 이 켜진 채로 남아 발사가 영영 막힌다)
    if ((sgRed as any).finishing) {
      (sgRed as any).finishing = false;
      if ((sgRed as any).orbit.length === 0) (sgRed as any).refillOrbit(sgApi);
    }
  }
  sgRed.onDestroy(sgApi);
  console.log('');
  console.log(`재진입 가드 — 자연 점수 900점 구간에서 마일스톤 ${sgMilestones}회 중 `
    + `실제 발사 ${sgLaunches}회 (점수 ${sgScore}, 참새 ${RED_PARAMS.sparrowPoints}점/개)`);
  // `fxPickSheetKey` 가 `_176x144.png` 를 떼므로 키는 `..._up` 으로 **끝난다**
  const upShots = [...shotTex].filter(k => k.endsWith('_up')).length;
  const sideOrbit = [...orbitTex].filter(k => !k.endsWith('_up')).length;
  console.log(`  발사 시트 — 올라가는 참새 ${upShots}/${shotTex.size}종이 위 보는 시트, `
    + `궤도 ${sideOrbit}/${orbitTex.size}종이 옆모습 시트`);
  console.log(`  가드가 없으면 발사가 마일스톤보다 많아진다(연쇄). `
    + `너무 적으면 가드가 발사를 굶긴 것이다`);

  // ── 티라노 포효: 보이는 링 = 지워지는 범위 · 한 프레임 회수량 ──────────
  //
  // 반경을 키우면 두 가지가 같이 틀어진다: (1) 그림보다 판정이 넓거나 좁아지면
  // "안 맞았는데 지워진다 / 맞았는데 안 지워진다" 가 되고, (2) 한 프레임에 회수되는
  // 똥이 늘어 `recycle()` 안의 타격 이펙트가 무더기로 터진다 (테드에서 짚은 함정).
  const roarW = redScene.scale.width;
  const roarR = roarW * RED_PARAMS.trexRadiusW;
  // 격자로 깔아 반경 **안팎**을 모두 덮는다. 경계 근처(±6px)는 판정 여부를 따지지 않는다
  const roarField = [];
  for (let gy = 40; gy < redScene.scale.height; gy += 46) {
    for (let gx = 20; gx < roarW; gx += 40) {
      roarField.push({ x: gx, y: gy, active: true, silent: null,
        recycle(quiet) { this.active = false; this.silent = quiet === true; } });
    }
  }
  const roarSpecial = roarField.slice(0, 8).map(q => ({ ...q, active: true, silent: null }));
  let roarFrameRecycles = 0;
  let roarMaxFrame = 0;
  for (const q of roarField) {
    const base = q.recycle.bind(q);
    q.recycle = (quiet) => { base(quiet); roarFrameRecycles++; };
  }
  // 링이 실제로 어느 배율까지 커지는지 — 트윈 설정을 가로채 읽는다
  const ringScales = [];
  const realTweenAdd = redScene.tweens.add;
  redScene.tweens.add = (cfg) => {
    if (cfg && typeof cfg.scaleX === 'number' && cfg.alpha === 0) ringScales.push(cfg.scaleX);
    return realTweenAdd.call(redScene.tweens, cfg);
  };
  const roarApi = { ...redApi, poops: { getChildren: () => roarField },
    goldPoops: { getChildren: () => roarSpecial },
    diamondPoops: { getChildren: () => roarSpecial },
    topazPoops: { getChildren: () => roarSpecial },
    rainbowPoops: { getChildren: () => roarSpecial },
    addAbilityBonus: () => {} };
  const roarX = roarW / 2;
  const roarY = redScene.scale.height - 96;
  const roarT0 = nowMs();
  (red as any).roar(roarApi, roarX, roarY);
  const roarMs = nowMs() - roarT0;
  roarMaxFrame = roarFrameRecycles;          // 포효는 한 프레임에 전부 건다
  redScene.tweens.add = realTweenAdd;

  // `proc-ring.png` 의 밝은 선 반지름 — scripts/measure-ring.py 로 실측한 값 (독립 출처)
  const RING_ART_R = 87.4;
  const ringOuter = (ringScales[0] ?? 0) * RING_ART_R;
  let inCleared = 0; let inAlive = 0; let outCleared = 0; let outAlive = 0;
  for (const q of roarField) {
    const d = Math.hypot(q.x - roarX, q.y - roarY);
    if (Math.abs(d - roarR) <= 6) continue;         // 경계 픽셀은 따지지 않는다
    if (d < roarR) { if (q.active) inAlive++; else inCleared++; }
    else { if (q.active) outAlive++; else outCleared++; }
  }
  const roarLoud = roarField.filter(q => q.silent === false).length;
  console.log('');
  console.log(`티라노 포효 — 화면 폭 ${roarW} → 반경 ${Math.round(roarR)}px `
    + `(화면 폭의 ${Math.round(RED_PARAMS.trexRadiusW * 100)}%)`);
  console.log(`  보이는 링 반지름 ${ringOuter.toFixed(1)}px vs 판정 반경 ${roarR.toFixed(1)}px `
    + `— 차이 ${Math.abs(ringOuter - roarR).toFixed(1)}px`);
  console.log(`  반경 안 ${inCleared + inAlive}개 중 ${inCleared}개 제거 / 남은 ${inAlive} · `
    + `반경 밖 ${outCleared + outAlive}개 중 ${outCleared}개 제거 (0 이어야 한다)`);
  console.log(`  한 프레임 회수 ${roarMaxFrame}개 · 그 중 시끄러운 반납 ${roarLoud}개 `
    + `(0 이어야 타격 이펙트가 안 터진다) · 포효 한 번 ${roarMs.toFixed(3)}ms`);
  console.log(`  특수 똥 ${roarSpecial.filter(q => q.active).length}/${roarSpecial.length} 그대로`);

  // 로봇과의 차별 — 로봇은 Infinity 라 화면 전체를 지운다
  const robotField = roarField.map(q => ({ x: q.x, y: q.y, active: true,
    recycle() { this.active = false; } }));
  (red as any).clearPoops({ ...roarApi, poops: { getChildren: () => robotField } },
    roarX, roarY, Infinity);
  const robotCleared = robotField.filter(q => !q.active).length;
  const trexCleared = inCleared + outCleared;
  console.log(`  로봇과의 차별 — 티라노 ${trexCleared}/${robotField.length}개 `
    + `(${Math.round(100 * trexCleared / robotField.length)}%) vs 로봇 `
    + `${robotCleared}/${robotField.length}개 (100%)`);

  red.onDestroy(redApi);
  await sleep(SETTLE_MS);
  const redSettled = snapshot(redScene);
  console.log(fmt('[R] 레드 정리 후', redSettled));
  console.log('참새 궤도 %d마리 · 발사 입력 %d회 · 최종 점수 %d · 마무리 후 스프라이트 %d · 특수똥 생존 %d/3',
    redOrbit, redLaunchInputs, redScore, redAfterFinish, redSpecialAlive);
  redScene.__clock.stop();

  // ── 하이디: 동반자 뿌요 ──────────────────────────────────────────────
  //
  // 뿌요는 **상시 화면에 있다** (태이와 같다). 그래서 보는 것이 셋이다.
  //  (1) 상시 비용 — 매 프레임 도는 것이 있으니 가만히 걸어다닐 때가 공짜여야 한다
  //  (2) 회오리 회수 — 비행이 끝나면 링·줄기가 한 장도 안 남아야 한다
  //  (3) 재진입 가드 — 경로의 똥 보너스가 다음 발동을 연쇄로 부르면 안 된다
  const hScene = createFakeScene();
  preloadFxAssets(hScene);
  for (const f of HEIDI_SHEETS) hScene.textures.__addAsset(fxPickSheetKey(f));
  const hPlayer = { x: 180, y: 560, active: true, displayWidth: 45, displayHeight: 80 };
  const POOPS = 40;
  let hPoops = Array.from({ length: POOPS }, (_, i) => ({
    x: 20 + (i % 10) * 34, y: 300 + Math.floor(i / 10) * 60, active: true,
    recycle() { this.active = false; },
  }));
  // 특수 똥 — HeidiAbility 는 `api.poops`(일반 똥 전용) 만 본다
  const hSpecial = Array.from({ length: 8 }, (_, i) => ({
    x: 40 + i * 38, y: 420, active: true, recycle() { this.active = false; },
  }));
  let hScore = 0;
  let hMilestones = 0;
  let hFires = 0;
  const heidi = new HeidiAbility(0);
  const hApi = {
    scene: hScene,
    player: hPlayer,
    poops: { getChildren: () => hPoops },
    goldPoops: { getChildren: () => hSpecial },
    diamondPoops: { getChildren: () => hSpecial },
    topazPoops: { getChildren: () => hSpecial },
    rainbowPoops: { getChildren: () => hSpecial },
    collectGoldPoop() {}, collectDiamondPoop() {}, collectTopazPoop() {}, collectRainbowPoop() {},
    spawnGoldPoop() {},
    addAbilityBonus(n) {
      const to = hScore + n;
      for (let sc = hScore + 1; sc <= to; sc++) {
        hScore = sc;
        if (sc % HEIDI_PARAMS.puyoInterval === 0) hMilestones++;
        // **발동은 예약(pending)으로 잡는다.** 점수가 차도 거리가 모자라면 바로
        // 웅크리지 않으므로, 'crouch' 로 세면 재진입 가드가 늘 0 이 되어 검사가 죽는다
        const before = (heidi as any).pending;
        heidi.onScoreMilestone(sc, hApi);
        if (!before && (heidi as any).pending) hFires++;
      }
      hScore = to;
    },
  };
  heidi.onCreate(hApi);
  const hBase = snapshot(hScene);
  console.log('');
  console.log(fmt('[H0] 하이디 발동 전', hBase));

  // (1) 상시 비용 — 가만히 걸어다니는 200프레임
  const idleCost = [];
  for (let i = 0; i < 200; i++) {
    const t0 = nowMs();
    heidi.onUpdate(hApi);
    idleCost.push(nowMs() - t0);
    await sleep(16);
  }
  idleCost.sort((a, b) => a - b);
  const hIdleP50 = idleCost[Math.floor(idleCost.length / 2)];
  const hIdleMax = idleCost[idleCost.length - 1];
  const hWander = (heidi as any).puyo?.x;

  // (2) 발동 — 마일스톤을 자연스럽게 넘긴다.
  // 뿌요는 **현재 위치에서 먼 쪽 화면 끝**까지 도약해 벽을 짚고,
  // 내려오면서 **반대편까지 날라차기**로 가로지른다 (crouch → jump → wall → kick → walk)
  let hMaxSprites = 0;
  const hFlyCost = [];
  const hFireX = (heidi as any).puyo?.x ?? 0;
  const hW = hScene.scale.width;
  const hExpectRight = hFireX < hW / 2;     // 먼 쪽 = 왼쪽 거리 < 오른쪽 거리
  let hApex = Infinity;                      // 점프 정점의 y (작을수록 높다)
  let hLandX = 0;
  let hSawJump = false;
  let hWallX = NaN;                          // 벽을 짚은 자리
  const hPhases: string[] = [];              // 상태가 바뀐 순서 (중복 제거)
  hScore = HEIDI_PARAMS.puyoInterval - 1;
  hApi.addAbilityBonus(1);
  for (let i = 0; i < 160; i++) {
    const t0 = nowMs();
    heidi.onUpdate(hApi);
    hFlyCost.push(nowMs() - t0);
    hMaxSprites = Math.max(hMaxSprites, live.sprites);
    const st = (heidi as any).state as string;
    const p = (heidi as any).puyo;
    if (hPhases[hPhases.length - 1] !== st) hPhases.push(st);
    // **'kick' 도 비행 상태다** — 발동의 뒷절반이라 반드시 지난다
    if (st === 'jump' || st === 'kick') {
      hSawJump = true;
      hApex = Math.min(hApex, p?.y ?? 0);
      hLandX = p?.x ?? 0;
    }
    if (st === 'wall') hWallX = p?.x ?? 0;
    await sleep(16);
  }
  const hBackState = (heidi as any).state as string;
  const hBackX = (heidi as any).puyo?.x ?? 0;
  const hGround = hPlayer.y + hPlayer.displayHeight / 2;
  hFlyCost.sort((a, b) => a - b);
  const hFlyP50 = hFlyCost[Math.floor(hFlyCost.length / 2)];
  const hFlyMax = hFlyCost[hFlyCost.length - 1];
  const hCleared = hPoops.filter(p => !p.active).length;
  const hAlive = hPoops.filter(p => p.active).length;
  const hSpecialAlive = hSpecial.filter(p => p.active).length;
  const hAfterFly = live.sprites;

  console.log(`뿌요 — 배회 p50 ${hIdleP50.toFixed(4)}ms / 최대 ${hIdleMax.toFixed(3)}ms · `
    + `점프 p50 ${hFlyP50.toFixed(4)}ms / 최대 ${hFlyMax.toFixed(3)}ms `
    + `(똥 ${POOPS}개 거리 판정)`);
  console.log(`  경로의 일반 똥 ${POOPS}개 중 ${hCleared}개 제거, ${hAlive}개 생존 · `
    + `특수 똥 ${hSpecial.length}개 중 ${hSpecialAlive}개 그대로`);
  console.log(`  동시 최대 스프라이트 ${hMaxSprites} · `
    + `살아있는 스프라이트 ${hAfterFly} (뿌요 1마리만 남아야 한다)`);
  console.log(`  발동 x=${hFireX.toFixed(0)} (화면 ${hW}) → 먼 쪽 `
    + `${hExpectRight ? '오른쪽' : '왼쪽'} · 벽 x=${hWallX.toFixed(0)} · `
    + `착지 x=${hLandX.toFixed(0)} · 정점이 바닥에서 ${(hGround - hApex).toFixed(0)}px 위 · `
    + `복귀 상태 '${hBackState}'`);
  console.log(`  거쳐 간 상태 — ${hPhases.join(' → ')}`);
  console.log(`  재진입 가드 — 마일스톤 ${hMilestones}회 중 실제 발동 ${hFires}회 `
    + `(보너스가 연쇄를 부르면 발동이 더 많아진다)`);

  // (3) **날라차기는 확률이 아니라 발동의 뒷절반이다.** 예전에는 보통 점프와 확률로
  // 갈렸다 (puyoKickChance). 지금은 벽을 짚고 내려오는 구간이 항상 kick 이므로,
  // "매번 네 토막을 순서대로 지나고, 하강 구간이 더 세다"를 못박는다
  let seqOk = 0;
  const RUNS = 6;
  let lastSeq = '';
  // **양쪽 벽을 번갈아 짚는가.** 한때 착지 자리에서 다시 "먼 쪽"을 고르는 바람에
  // 날라차기가 데려다 놓은 반대편에서 늘 같은 벽이 먼 쪽이 되어 **한쪽에만 붙었다**
  const wallRuns: string[] = [];   // 판마다 짚은 벽을 순서대로 (판이 바뀌면 끊는다)
  // **도약 거리.** 번갈아 짚게 하고 나니 착지 자리 바로 옆 벽이 목표가 되어
  // 코앞으로 폴짝 뛰는 판이 생겼다 — 경로에 똥이 없다. 짧은 도약이 하나도 없어야 한다
  const runways: number[] = [];
  for (let run = 0; run < RUNS; run++) {
    const probe = new HeidiAbility(0);
    let pPoops = Array.from({ length: 24 }, (_, i) => ({
      x: 20 + (i % 8) * 40, y: 340 + Math.floor(i / 8) * 50, active: true,
      recycle() { this.active = false; },
    }));
    let pScore = 0;
    const pApi = {
      ...hApi, poops: { getChildren: () => pPoops },
      addAbilityBonus(n) {
        const to = pScore + n;
        for (let sc = pScore + 1; sc <= to; sc++) { pScore = sc; probe.onScoreMilestone(sc, pApi); }
        pScore = to;
      },
    };
    probe.onCreate(pApi);
    pScore = HEIDI_PARAMS.puyoInterval - 1;
    pApi.addAbilityBonus(1);
    const seq: string[] = [];
    const sides: string[] = [];
    let prevSt = '';
    // 발동을 **세 번** 태운다 — 한 번만 보면 번갈아 가는지 알 수 없다
    for (let fire = 0; fire < 3; fire++) {
      if (fire > 0) {
        // 지운 똥 보너스가 **재진입 가드**(lastFireScore)를 밀어 올려 놨다.
        // 그 위의 첫 배수로 올라가야 다음 발동이 삼켜지지 않는다
        const I = HEIDI_PARAMS.puyoInterval;
        pScore = Math.ceil(((probe as any).lastFireScore + 1) / I) * I - 1;
        pApi.addAbilityBonus(1);
      }
      // 발동은 **거리가 찰 때까지 미뤄진다** — 물러서서 달려올 프레임을 넉넉히 준다
      for (let i = 0; i < 420; i++) {
        probe.onUpdate(pApi);
        const st = (probe as any).state as string;
        if (seq[seq.length - 1] !== st) seq.push(st);
        if (st === 'jump' && prevSt !== 'jump') {     // 도약에 **막 들어선** 프레임
          const f = (probe as any).from;
          const t = (probe as any).to;
          runways.push(Math.abs(t.x - f.x));
        }
        prevSt = st;
        if (st === 'wall') {
          const side = (probe as any).wallRight ? 'R' : 'L';
          if (sides[sides.length - 1] !== side) sides.push(side);
        }
        await sleep(6);
      }
    }
    lastSeq = seq.join(' → ');
    wallRuns.push(sides.join(''));
    if (lastSeq.includes('crouch → jump → wall → kick → walk')) seqOk++;
    probe.onDestroy(pApi);
    pPoops = [];
  }
  const minRun = runways.length ? Math.min(...runways) : 0;
  const needRun = hScene.scale.width * HEIDI_PARAMS.puyoMinRunW
    - HEIDI_PARAMS.puyoWallMargin - 30;   // 짚는 자리는 화면 끝에서 조금 안쪽이다
  console.log(`  도약 거리 — ${runways.length}회 중 가장 짧은 것 ${minRun.toFixed(0)}px `
    + `(화면 ${hScene.scale.width} · 하한 ${needRun.toFixed(0)}px)`);
  const sideRuns = wallRuns.join(' ');
  // 판마다 **세 번 다 짚고**, 같은 글자가 연달아 나오지 않아야 한다.
  // 판끼리 이어 붙여 놓고 세면 판 경계에서 겹친 L 이 묻혀 구멍이 생긴다
  const alternates = wallRuns.length === RUNS
    && wallRuns.every(r => r.length === 3 && !/LL|RR/.test(r));
  console.log(`  짚은 벽 순서 — ${sideRuns} (L 왼쪽 / R 오른쪽, 판마다 3회)`);
  console.log(`  벽차기 — ${RUNS}번 중 ${seqOk}번이 crouch → jump → wall → kick → walk `
    + `(마지막: ${lastSeq}) · 하강 판정 반경 ${HEIDI_PARAMS.puyoKickHitR} vs `
    + `${HEIDI_PARAMS.puyoHitR} · 점수 ${HEIDI_PARAMS.puyoKickPoints} vs `
    + `${HEIDI_PARAMS.puyoPoints}점/개`);

  heidi.onDestroy(hApi);
  hPoops = [];
  await sleep(SETTLE_MS);
  const hSettled = snapshot(hScene);
  console.log(fmt('[H1] 하이디 정리 후', hSettled));
  hScene.__clock.stop();

  // ── Codex 재현 조건 회귀 ────────────────────────────────────────────────
  //
  // w4 가 **메모리에서 실제로 실행해** 잡아낸 결함들이다. 하네스가 못 잡았던 것이라
  // 그 조건을 그대로 못박는다. "고쳤다"가 아니라 **"그 조건에서 안 터진다"** 를 본다.
  console.log('');
  console.log('Codex 재현 조건');

  // (C1) 레드 — 보너스가 다음 배수를 넘길 때 추가 발사.
  //      last=50 · 점수 90 · +25 → 100 도달. 기준선만 올려서는 100 > 75 라 통과했다
  const cScene = createFakeScene();
  preloadFxAssets(cScene);
  for (const f of RED_SHEETS) cScene.textures.__addAsset(fxPickSheetKey(f));
  const cPlayer = { x: 180, y: 560, active: true, displayWidth: 47, displayHeight: 80 };
  let cScore = 90;
  let cLaunches = 0;
  const cRed = new RedAbility(0);
  const cRedApi: any = {
    scene: cScene, player: cPlayer,
    poops: { getChildren: () => [] },
    goldPoops: { getChildren: () => [] }, diamondPoops: { getChildren: () => [] },
    topazPoops: { getChildren: () => [] }, rainbowPoops: { getChildren: () => [] },
    collectGoldPoop() {}, collectDiamondPoop() {}, collectTopazPoop() {}, collectRainbowPoop() {},
    spawnGoldPoop() {},
    addAbilityBonus(n: number) {
      const to = cScore + n;
      for (let sc = cScore + 1; sc <= to; sc++) {
        cScore = sc;
        const before = (cRed as any).shots.length;
        cRed.onScoreMilestone(sc, cRedApi);
        if ((cRed as any).shots.length > before) cLaunches++;
      }
      cScore = to;
    },
  };
  cRed.onCreate(cRedApi);
  await sleep(60);
  (cRed as any).lastLaunchScore = 50;
  (cRed as any).award(cRedApi, RED_PARAMS.sparrowPoints);   // 실제 보너스 경로
  const redReentry = cLaunches;
  console.log(`  [C1] 레드 last=50 · 점수 90 · +${RED_PARAMS.sparrowPoints} → 점수 ${cScore} · `
    + `보너스 중 발사 ${redReentry}회 (0 이어야 한다)`);

  // (C2) 레드 포효 링 — 보험 타이머(lifeMs)가 트윈보다 먼저 오면 onComplete 가 안 불려
  //      파괴된 참조가 tracked 에 남는다. 스텁의 killTweensOf 가 no-op 이라 안 잡혔다
  (cRed as any).roar(cRedApi, cPlayer.x, cPlayer.y);
  await sleep(750);
  const ringZombies = [...(cRed as any).tracked].filter((o: any) => !o.scene).length;
  console.log(`  [C2] 포효 750ms 뒤 tracked 안의 파괴된 참조 ${ringZombies}개 (0 이어야 한다) · `
    + `링 보험 ${RED_PARAMS.trexRingDelayMs + RED_PARAMS.trexRingMs + 120}ms vs `
    + `트윈 ${RED_PARAMS.trexRingDelayMs + RED_PARAMS.trexRingMs}ms`);
  cRed.onDestroy(cRedApi);
  cScene.__clock.stop();

  // (C3) 테드 — 보너스가 다음 배수를 넘길 때 추가 낙하. last=60 · 점수 100 · +20 → 120
  const cTedScene = createFakeScene();
  preloadFxAssets(cTedScene);
  cTedScene.textures.__addAsset('fxpick_chess');
  const cTed = new TedAbility(0);
  let tScore = 100;
  let tDrops = 0;
  const cTedApi: any = {
    scene: cTedScene, player: { x: 180, y: 520, scaleX: 1, scaleY: 1 },
    poops: { getChildren: () => [] },
    addAbilityBonus(n: number) {
      const to = tScore + n;
      for (let sc = tScore + 1; sc <= to; sc++) {
        tScore = sc;
        const before = (cTed as any).flying;
        cTed.onScoreMilestone(sc, cTedApi);
        if ((cTed as any).flying > before) tDrops++;
      }
      tScore = to;
    },
  };
  (cTed as any).lastChessScore = 60;
  (cTed as any).awardBonus(cTedApi, TED_PARAMS.chessPoopPoints);  // 실제 보너스 경로
  const tedReentry = tDrops;
  console.log(`  [C3] 테드 last=60 · 점수 100 · +${TED_PARAMS.chessPoopPoints} → 점수 ${tScore} · `
    + `보너스 중 낙하 ${tedReentry}개 (0 이어야 한다)`);

  // (C4) 테드 마무리 — 흡수 중 **프레임이 한 번 건너뛰면** 발산 예약이 빈 spreadReady 를
  //      쏘고 영구 정지했다 (stage="blast", ready=10, spreading=0 이 3초 뒤에도 동일).
  //      cubeT0 를 옮겨 490ms → 600ms 점프를 그대로 만든다
  (cTed as any).landed = Array.from({ length: TED_PARAMS.chessStackMax }, (_, i) => {
    const q = cTedScene.add.image(40 + i * 30, 560, 'fxpick_chess', 0);
    q.displayWidth = 54; q.displayHeight = 72;
    return q;
  });
  (cTed as any).clearBoard(cTedApi);
  // **흡수가 끝나기 직전**이어야 한다. 정확히 chessSuckMs 로 잡으면 그 프레임에서
  // 이미 u=1 이라 말이 다 채워지고, 건너뛰기가 재현되지 않는다 (Codex 는 490ms 를 썼다)
  const skipFrom = TED_PARAMS.chessSuckMs - 10;
  const skipTo = TED_PARAMS.chessSuckMs + TED_PARAMS.spreadHoldMs + 10;
  (cTed as any).cubeT0 = Date.now() - skipFrom;
  cTed.onUpdate(cTedApi);
  (cTed as any).cubeT0 = Date.now() - skipTo;                    // **예약 시각을 건너뛴다**
  cTed.onUpdate(cTedApi);
  // 퍼짐은 금방 끝나 배열이 다시 빈다 — **최대치**를 봐야 "쏘기는 했다"를 알 수 있다
  let spreadOut = 0;
  for (let i = 0; i < 40; i++) {
    cTed.onUpdate(cTedApi);
    spreadOut = Math.max(spreadOut, (cTed as any).spreading.length);
    await sleep(16);
  }
  const stuckReady = (cTed as any).spreadReady.length;
  console.log(`  [C4] 흡수 중 ${skipFrom}ms → ${skipTo}ms 프레임 건너뜀 · `
    + `중앙에 남은 말 ${stuckReady}개 (0 이어야 한다) · 퍼진 말 최대 ${spreadOut}개`);
  cTed.onDestroy(cTedApi);
  cTedScene.__clock.stop();

  // (C5) 레드 참새 — **프레임이 밀리면 똥을 뚫고 지나가지 않는가.**
  //      Codex 가 "충돌을 직접 거리로 재는 것 자체는 문제가 아니다" 로 철회하면서
  //      이동 중 누락만 별도 검증 대상으로 남겼다. 620px/s 에 판정 지름이 44px 이라
  //      한 프레임이 71ms 를 넘으면 지금 좌표만 보는 판정으로는 통과해 버린다
  const tScene2 = createFakeScene();
  preloadFxAssets(tScene2);
  for (const f of RED_SHEETS) tScene2.textures.__addAsset(fxPickSheetKey(f));
  const SLOW_MS = 100;                                   // 10fps 로 밀린 프레임
  tScene2.game.loop.delta = SLOW_MS;
  const tPlayer2 = { x: 180, y: 560, active: true, displayWidth: 47, displayHeight: 80 };
  const step = RED_PARAMS.sparrowSpeed * (SLOW_MS / 1000);
  // 참새가 **두 프레임 사이 한가운데**를 지나게 똥을 놓는다 — 뚫린다면 여기서 뚫린다
  const tunnelPoops = [{
    x: tPlayer2.x, y: tPlayer2.y - step * 1.5, active: true,
    recycle() { this.active = false; },
  }];
  const tRed2 = new RedAbility(0);
  let t2Score = 0;
  const tApi2: any = {
    scene: tScene2, player: tPlayer2,
    poops: { getChildren: () => tunnelPoops },
    goldPoops: { getChildren: () => [] }, diamondPoops: { getChildren: () => [] },
    topazPoops: { getChildren: () => [] }, rainbowPoops: { getChildren: () => [] },
    collectGoldPoop() {}, collectDiamondPoop() {}, collectTopazPoop() {}, collectRainbowPoop() {},
    spawnGoldPoop() {},
    addAbilityBonus(n: number) { t2Score += n; },
  };
  tRed2.onCreate(tApi2);
  await sleep(60);
  tRed2.onScoreMilestone(RED_PARAMS.sparrowInterval, tApi2);
  for (let i = 0; i < 12; i++) { tRed2.onUpdate(tApi2); await sleep(4); }
  const tunnelled = tunnelPoops[0].active;
  console.log(`  [C5] 프레임 ${SLOW_MS}ms(한 프레임 ${step.toFixed(0)}px, 판정 지름 `
    + `${RED_PARAMS.sparrowHitR * 2}px) · 경로 위 똥 ${tunnelled ? '뚫고 지나감' : '맞음'}`);
  tRed2.onDestroy(tApi2);
  tScene2.__clock.stop();

  // ── 레드 밸런스: 참새가 경로의 똥을 전부 부순다 ───────────────────────────
  //
  // 사람 판정 "레드가 점수내기 어렵다". 원인은 **한 번 발사의 성과가 0 아니면 1개**
  // 였다는 것이다 (첫 히트에서 참새가 소모됐다). 지금은 경로 전체를 쓴다.
  //
  // 같은 똥 배치 위에서 **옛 규칙과 새 규칙을 나란히** 잰다 —
  // 옛 규칙: 반경 22 · 첫 하나만 · 25점 / 새 규칙: 반경 30 · 전부 · 30점
  const OLD_R = 22;
  const OLD_POINTS = 25;
  const bScene = createFakeScene();
  preloadFxAssets(bScene);
  for (const f of RED_SHEETS) bScene.textures.__addAsset(fxPickSheetKey(f));
  bScene.game.loop.delta = 100;              // 한 프레임 62px — 선분 판정이라 결과는 같다
  const BW = bScene.scale.width;
  const BH = bScene.scale.height;
  const bPlayer = { x: BW / 2, y: 560, active: true, displayWidth: 47, displayHeight: 80 };
  const TRIALS = 400;               // 60 으로는 판마다 ±20% 씩 흔들려 전후 비교가 안 됐다

  /** 똥 N개를 화면에 무작위로 흩는다. 참새는 플레이어 x 에서 위로 곧장 난다 */
  const scatter = (n: number) => Array.from({ length: n }, () => ({
    x: 20 + Math.random() * (BW - 40),
    y: 40 + Math.random() * (bPlayer.y - 80),
    active: true,
    recycle() { this.active = false; },
  }));

  const densities = [6, 10, 14];
  const balance: { n: number; now: number; old: number; maxOne: number;
                   killsNow: number[]; killsOld: number[] }[] = [];
  let guardLaunches = 0;                     // 커진 보너스가 추가 발사를 부르는가
  let massRecycleMax = 0;                    // 한 프레임에 회수된 똥 최대 개수
  let massFrameMax = 0;                      // 그 프레임의 비용(ms)

  for (const n of densities) {
    let sumNow = 0;
    let sumOld = 0;
    let maxOne = 0;
    const killsNow: number[] = [];
    const killsOld: number[] = [];
    for (let trial = 0; trial < TRIALS; trial++) {
      const field = scatter(n);
      // 옛 규칙의 성과 — **같은 배치**에서 세로선 위 반경 22 안에 하나라도 있으면 1개
      const oldKill = field.some(q => Math.abs(q.x - bPlayer.x) <= OLD_R) ? 1 : 0;
      sumOld += oldKill;
      killsOld.push(oldKill);

      const ab = new RedAbility(0);
      let bScore = 0;
      let framePeak = 0;
      const bApi: any = {
        scene: bScene, player: bPlayer,
        poops: { getChildren: () => field },
        goldPoops: { getChildren: () => [] }, diamondPoops: { getChildren: () => [] },
        topazPoops: { getChildren: () => [] }, rainbowPoops: { getChildren: () => [] },
        collectGoldPoop() {}, collectDiamondPoop() {}, collectTopazPoop() {},
        collectRainbowPoop() {}, spawnGoldPoop() {},
        addAbilityBonus(m: number) {
          const to = bScore + m;
          for (let sc = bScore + 1; sc <= to; sc++) {
            bScore = sc;
            const before = (ab as any).shots.length;
            ab.onScoreMilestone(sc, bApi);
            if ((ab as any).shots.length > before) guardLaunches++;
          }
          bScore = to;
        },
      };
      ab.onCreate(bApi);
      (ab as any).lastLaunchScore = RED_PARAMS.sparrowInterval - 1;
      bScore = RED_PARAMS.sparrowInterval;
      ab.onScoreMilestone(RED_PARAMS.sparrowInterval, bApi);   // 한 마리 발사
      // 참새가 화면 위로 빠져나갈 때까지. 한 프레임에 몇 개를 회수하는지도 같이 잰다
      for (let i = 0; i < 20 && (ab as any).shots.length > 0; i++) {
        const aliveBefore = field.filter(q => q.active).length;
        const t0 = nowMs();
        ab.onUpdate(bApi);
        const cost = nowMs() - t0;
        const killed = aliveBefore - field.filter(q => q.active).length;
        if (killed > massRecycleMax) { massRecycleMax = killed; massFrameMax = cost; }
        else if (killed === massRecycleMax) massFrameMax = Math.max(massFrameMax, cost);
        framePeak = Math.max(framePeak, cost);
      }
      const killedTotal = field.filter(q => !q.active).length;
      sumNow += killedTotal;
      killsNow.push(killedTotal);
      maxOne = Math.max(maxOne, killedTotal);
      ab.onDestroy(bApi);
      void framePeak;
    }
    balance.push({ n, now: sumNow / TRIALS, old: sumOld / TRIALS, maxOne, killsNow, killsOld });
  }
  bScene.__clock.stop();

  console.log('');
  console.log(`레드 밸런스 — 발사 한 번의 성과 (똥 배치 무작위, 판마다 ${TRIALS}회)`);
  console.log('  화면 똥 | 옛 규칙(r22·첫하나·25점)  | 지금(r30·전부·30점)      | 한 마리 최대');
  for (const b of balance) {
    const oldPt = b.old * OLD_POINTS;
    const nowPt = b.now * RED_PARAMS.sparrowPoints;
    console.log(`  ${String(b.n).padStart(6)}개 | ${b.old.toFixed(2)}개 ${oldPt.toFixed(1)}점`
      + `        | ${b.now.toFixed(2)}개 ${nowPt.toFixed(1)}점`
      + `      | ${b.maxOne}개 (${b.maxOne * RED_PARAMS.sparrowPoints}점)`);
  }
  const mid = balance[1];
  const gain = mid.old > 0
    ? (mid.now * RED_PARAMS.sparrowPoints) / (mid.old * OLD_POINTS) : Infinity;
  const bonusMid = mid.now * RED_PARAMS.sparrowPoints;
  const oldBonusMid = mid.old * OLD_POINTS;
  console.log(`  똥 ${mid.n}개 기준 발사당 기대 점수 ${oldBonusMid.toFixed(1)} → `
    + `${bonusMid.toFixed(1)}점 (${gain.toFixed(2)}배)`);

  /**
   * 마무리가 얼마나 빨리 오는가 — **자연 점수**로 잰다.
   *
   * 보너스로 들어온 마일스톤은 빗장이 삼키므로 발사를 직접 부르지는 않는다.
   * 대신 **점수를 배수 너머로 밀어 올려** 다음 배수까지 남은 거리를 줄인다.
   * 평균 보너스에 `% 50` 을 씌우면 안 된다 (평균의 나머지는 나머지의 평균이 아니다) —
   * 실제로 잰 **분포**에서 뽑아 5발을 돌린다
   */
  const simFinish = (kills: number[], points: number) => {
    const I = RED_PARAMS.sparrowInterval;
    let total = 0;
    const RUNS = 20000;
    for (let r = 0; r < RUNS; r++) {
      let score = 0;
      let natural = 0;
      for (let i = 0; i < RED_PARAMS.sparrowCount; i++) {
        const next = Math.floor(score / I) * I + I;   // 다음 발사 배수
        natural += next - score;                      // 여기까지는 손으로 벌어야 한다
        score = next + kills[(Math.random() * kills.length) | 0] * points;
      }
      total += natural;
    }
    return total / RUNS;
  };
  const finishOld = simFinish(mid.killsOld, OLD_POINTS);
  const finishNow = simFinish(mid.killsNow, RED_PARAMS.sparrowPoints);
  console.log(`  마무리(참새 ${RED_PARAMS.sparrowCount}마리 소진)까지 필요한 **자연** 점수 `
    + `${finishOld.toFixed(0)}점 → ${finishNow.toFixed(0)}점 `
    + `(${(finishOld / finishNow).toFixed(2)}배 빨라짐)`);
  console.log(`  커진 보너스 중 추가 발사 ${guardLaunches}회 (0 이어야 한다) · `
    + `한 프레임 최대 회수 ${massRecycleMax}개 / 그 프레임 ${massFrameMax.toFixed(3)}ms`);

  /**
   * **대량 회수의 진짜 비용.** 위 숫자(0.00x ms)는 참새 쪽 계산만 잰 것이다 —
   * 하네스의 가짜 똥은 `recycle()` 에서 타격 이펙트를 안 만든다.
   * 실기에서는 `PoolablePoopBase.recycle()` 이 똥 하나마다
   * `playFx('impactHit')` 을 깐다. 그래서 그 비용을 여기서 따로 잰다
   * (Codex 가 ⑤번으로 지적한 항목 — 참새가 한 마리로 여러 개를 부수게 되면서 개수가 늘었다).
   */
  const fxScene = createFakeScene();
  preloadFxAssets(fxScene);
  preloadFxSheet(fxScene, 'impactHit');
  const HITS = balance[2].maxOne;                  // 실측한 **최악의 한 마리**
  const IMPACT_CAP = 6;                            // vfx.ts 의 impactHit.maxConcurrent
  const fxBase = snapshot(fxScene);
  const fxT0 = nowMs();
  let fxPlayed = 0;
  for (let i = 0; i < HITS; i++) {
    if (playFx(fxScene, 'impactHit', 40 + i * 40, 300)) fxPlayed++;
  }
  const fxCost = nowMs() - fxT0;
  const fxPeak = snapshot(fxScene);
  await sleep(SETTLE_MS);
  const fxSettled = snapshot(fxScene);
  fxScene.__clock.stop();
  console.log(`  타격 이펙트 ${HITS}장 한 프레임 — ${fxCost.toFixed(3)}ms · `
    + `실제 재생 ${fxPlayed}장 (동시 상한 ${IMPACT_CAP} 에 잘린 것 ${HITS - fxPlayed}장) · `
    + `동시 스프라이트 ${fxPeak.liveSprites} · 정리 후 ${fxSettled.liveSprites}`);
  if (HITS > IMPACT_CAP) {
    console.log(`    ** 참새 한 마리가 상한(${IMPACT_CAP})보다 많이 부술 수 있다 — `
      + `가장 늦게 부순 것 ${HITS - IMPACT_CAP}개는 타격 이펙트 없이 사라진다. `
      + `상한은 화면이 하얘지는 것을 막는 장치라 동작 자체는 의도대로다`);
  }
  void fxBase;





  console.log('\n누적 생성: sprites=%d emitters=%d layers=%d', created.sprites, created.emitters, created.layers);

  console.log('공통 연출 상한: 요청 %d회 중 %d회 재생, %d회는 상한으로 무시됨',
    capStat.requested, capStat.played, capStat.requested - capStat.played);

  // 표에 적힌 파티클 텍스처가 실제로 있는가. 없으면 게임은 안 죽지만 매 판 콘솔에
  // "Failed to process file" 이 뜬다 — 실제로 fx_sword_beam 두 장이 그러고 있었다
  const fsMod = await import('node:fs');
  const missingAssets = Object.entries(FX_PARTICLE_ASSETS)
    .filter(([, file]) => !fsMod.existsSync(`public/${FX_ASSET_DIR}${file}`))
    .map(([k, file]) => `${k}(${file})`);
  if (missingAssets.length) console.log('** 없는 파티클 파일: ' + missingAssets.join(', '));

  const checks = [
    [`[C1] 레드 — 자기 보너스가 추가 발사를 안 부른다 (발사 ${redReentry}회)`,
      redReentry === 0],
    [`[C2] 레드 — 포효 링이 tracked 에 시체를 안 남긴다 (${ringZombies}개)`,
      ringZombies === 0],
    [`[C2b] 포효 링 보험이 트윈보다 길다 (${ROAR_RING_LIFE_MS}ms > `
      + `${RED_PARAMS.trexRingDelayMs + RED_PARAMS.trexRingMs}ms)`,
      ROAR_RING_LIFE_MS > RED_PARAMS.trexRingDelayMs + RED_PARAMS.trexRingMs],
    [`[C3] 테드 — 자기 보너스가 추가 낙하를 안 부른다 (낙하 ${tedReentry}개)`,
      tedReentry === 0],
    [`[C4] 테드 — 프레임을 건너뛰어도 마무리가 안 막힌다 (중앙 잔류 ${stuckReady}개, `
      + `퍼짐 ${spreadOut}개)`,
      stuckReady === 0 && spreadOut > 0],
    [`[C5] 프레임이 ${SLOW_MS}ms 로 밀려도 참새가 똥을 안 뚫는다`, !tunnelled],
    [`[B1] 한 마리가 여러 개를 부순다 (한 마리 최대 ${balance[2].maxOne}개)`,
      balance[2].maxOne >= 2],
    [`[B2] 발사당 기대 성과가 옛 규칙보다 높다 `
      + `(${mid.old.toFixed(2)}개 → ${mid.now.toFixed(2)}개)`,
      mid.now > mid.old],
    [`[B3] 커진 보너스가 추가 발사를 안 부른다 (${guardLaunches}회)`, guardLaunches === 0],
    [`[B4] 대량 회수 한 프레임이 예산 안 (${massRecycleMax}개 / `
      + `${massFrameMax.toFixed(3)}ms < 2ms)`,
      massFrameMax < 2],
    [`[B5] 타격 이펙트 ${HITS}장을 한 프레임에 깔아도 예산 안 `
      + `(${fxCost.toFixed(3)}ms < 4ms)`, fxCost < 4],
    // **상한이 물리는 것이 정상이다** — 화면이 하얘지지 않게 하는 장치다.
    // 여기서 보는 것은 "상한이 지켜지는가"이지 "안 잘리는가"가 아니다
    [`[B6] 타격 이펙트 동시 상한이 지켜진다 (요청 ${HITS} → 재생 ${fxPlayed} `
      + `≤ ${IMPACT_CAP})`,
      fxPlayed === Math.min(HITS, IMPACT_CAP)],
    ['[B7] 타격 이펙트가 전부 회수됨', isZero(fxSettled)],
    [`[18] 파티클 텍스처 표의 파일이 전부 존재 (없는 것 ${missingAssets.length}개)`,
      missingAssets.length === 0],
    ['[3] 이펙트 종료 후 기준선 복귀', isZero(settled)],
    ['[3a] 나이트 검기가 실제로 떠 있었음', knightPeak.liveSprites > settled.liveSprites],
    ['[3b] 나이트 + K 빔 종료 후 기준선 복귀 (반복 트윈 포함)', isZero(knightSettled)],
    ['[5] 시계 정지 중에도 회수 완료', isZero(frozen)],
    ['[7] shutdown 시 전량 회수', isZero(afterRestart)],
    ['[4] 발동 중에는 실제로 살아 있었음', midFlight.liveSprites + midFlight.liveEmitters > 0],
    ['[6] 재시작 직전에도 살아 있었음', beforeRestart.liveSprites + beforeRestart.liveEmitters > 0],
    ['[8] 단발 발동 sweep 누락 0', single.sweepCreated === single.sweepRequested],
    ['[9] 단발 발동 잔상 누락 0 (대상 3 전부)',
      single.trailCreated === single.trailRequested && single.trailCreated === 3],
    ['[10] 스트레스 구간에서도 sweep/잔상 누락 0',
      stress.sweepCreated === stress.sweepRequested && stress.trailCreated === stress.trailRequested],
    ['[11] 이펙트가 똥의 현재 위치에 난다 (오차 ≤ 30px)', cutOffset <= 30],
    [`[T1] 말 ${TED_PARAMS.chessStackMax}개가 전부 사방으로 퍼짐`,
      maxSpreading === TED_PARAMS.chessStackMax],
    ['[T2] 말의 도착 시각 편차 ≤ 1프레임(33ms)', arriveSpread <= 33],
    // 플레이어가 움직여도 목표는 화면 중앙 고정이다 — 추적이 아니라 **고정**을 검증한다
    ['[T3] 플레이어가 움직여도 말·조각이 화면 중앙에 도착 (오차 ≤ 2px)',
      arriveOffset <= 2 && playerSwing > 50],
    ['[T4] 큐브 연출 종료 후 기준선 복귀 (0)', isZero(tedAfter)],
    [`[T16] ${REPEAT}회 반복 발동해도 스프라이트가 안 쌓임 (매회 0 복귀)`, repeatClean],
    [`[T17] 회차마다 만드는 오브젝트 수가 안 늘어남 (편차 ${bornSpread}개 ≤ 12)`,
      bornSpread <= 12],
    ['[T18] 연출 도중에 절차 텍스처를 굽지 않음 (미리 구워 둠)',
      lateBuilds.length === 0],
    [`[R16] 발사하면 위 보는 시트로 갈아탐 (${upShots}/${shotTex.size}종)`,
      shotTex.size > 0 && upShots === shotTex.size],
    [`[R17] 궤도는 옆모습 시트 그대로 (${sideOrbit}/${orbitTex.size}종)`,
      orbitTex.size > 0 && sideOrbit === orbitTex.size],
    [`[R14] 궤도 참새가 **가는 방향**으로 뒤집힘 (어긋남 ${flipWrong}/${flipChecked}프레임)`,
      flipChecked > 100 && flipWrong === 0],
    [`[R15] 좌우 끝에서 뒤집힘이 안 떨림 (전환 ${flipTurns}회 중 떨림 ${flipJitter}회)`,
      flipTurns > 0 && flipJitter === 0],
    [`[R21] 좁은 화면에서 칼이 화면 위로 안 잘림 (칼끝 y=${swordTopY.toFixed(0)})`,
      swordTopY >= 0 && robotBotY <= NARROW.h],
    [`[R22] 강하 시작이 화면 밖 (아래끝 y=${robotStartBot.toFixed(0)})`,
      robotStartBot < 0],
    [`[R20] 로봇이 화면 밖으로 안 잘림 (가장자리까지 최소 ${robotWorstEdge.toFixed(1)}px)`,
      robotEdges.length === 6 && robotWorstEdge >= 0],
    [`[R18] 마무리 **시작**에 참새가 다시 참 (${orbitAtStart}/${RED_PARAMS.sparrowCount}마리)`,
      orbitAtStart === RED_PARAMS.sparrowCount],
    [`[R19] 마무리 도중에도 궤도가 안 빔 (최소 ${orbitDuring}마리)`,
      orbitDuring === RED_PARAMS.sparrowCount],
    ['[R12] 참새 보너스가 발사를 연쇄시키지 않음 (발사 ≤ 마일스톤)',
      sgLaunches <= sgMilestones],
    [`[R13] 가드가 발사를 굶기지 않음 (발사 ${sgLaunches} ≥ 마일스톤 ${sgMilestones} 의 절반)`,
      sgLaunches * 2 >= sgMilestones],
    [`[R10] 아래쪽 참새가 머리를 안 파고듦 (여유 ${orbitClear.toFixed(1)}px > 0)`,
      orbitClear > 0],
    // 호 길이 등분으로 14.1 → 18.5px 가 됐다. 등각으로 되돌리면 바로 깨진다
    [`[R11] 참새가 서로 뭉치지 않음 (최소 간격 ${orbitMinGap.toFixed(1)}px ≥ 17px)`,
      orbitMinGap >= 17],
    ['[R6] 보이는 링 = 지워지는 범위 (오차 ≤ 2px)',
      Math.abs(ringOuter - roarR) <= 2],
    ['[R7] 반경 안은 전부 지워지고 밖은 하나도 안 지워짐',
      inAlive === 0 && outCleared === 0 && inCleared > 0],
    ['[R8] 포효는 조용히 반납 — 타격 이펙트가 무더기로 안 터짐', roarLoud === 0],
    [`[R9] 티라노(${Math.round(100 * trexCleared / robotField.length)}%)가 `
      + '로봇(100%)보다 명확히 좁음',
      trexCleared < robotCleared * 0.8 && trexCleared > 0],
    [`[T19] 말이 전부 화면 밖까지 감 — 가장 짧은 사거리 ${Math.round(minReach)}px `
      + `≥ 중앙→모서리 ${Math.round(cornerDist)}px`,
      minReach >= cornerDist],
    // 화면 전체가 아니라 **말이 지나간 자리만** 지워진다 — 일부는 살아남아야 맞다
    ['[T5] 퍼지는 말이 지나간 똥만 제거 (일부 생존)',
      burstCost.cleared > 0 && burstCost.alive > 0],
    ['[T6] 특수 똥은 하나도 안 지워짐', burstCost.special === specialPoops.length],
    ['[T7] 파동 4겹이 전부 나감 (maxConcurrent 에 안 잘림)', waveCount === 4],
    // 말 10개면 360px 화면에서 칸너비가 30px 다. 이상적인 균등 배치가 30px 간격이고
    // 층화는 그 절반(칸너비 × (1 - chessLandJitter))을 보장한다
    ['[T8] 착지가 층화로 흩어짐 — 최소 간격이 모든 판에서 14px 이상',
      landOk.every(v => v.min >= 14)],
    ['[T9] 동시 비행 상한이 한 프레임 보너스를 막지 않음 (상한 이상 낙하)',
      aliveCost.dropped >= Math.min(aliveCost.cap, aliveCost.attempts)],
    ['[T10] 파열 정액 보너스가 낙하를 연쇄시키지 않음', burstDrops === 0],
    ['[T11] 똥 파괴 보너스가 낙하를 연쇄시키지 않음', smashDrops === 0],
    ['[T12] 가드가 영구적이지 않음 — 보너스 뒤 정상 낙하', laterDrops === 1],
    [`[T14] 퍼지는 말 ${seenDirs}개가 **모든 방향에서** 머리를 앞세움`,
      seenDirs === TED_PARAMS.chessStackMax && headDot > 0.999],
    ['[T15] 판정 끝점이 보이는 머리끝과 일치 (≤ 1px)', headErr <= 1],
    [`[T13] 판본 '${CUBE_VARIANT}' 에서 큐브 시트를 안 올림 (VRAM 0)`,
      CUBE_VARIANT !== 'none' || cubeSheetsLoaded === 0],
    ['[12] 옅은 알파 + 가산 조합 0건 (밝은 배경에서 묻히는 조합)', faintAdditive.length === 0],
    ['[13] 상시 가산 이펙트가 블룸 레이어를 붙잡지 않음', persistBloom === 0],
    ['[15a] 레거시 오라·빗줄기·소각이 실제로 떠 있었음',
      legacyPeak.liveSprites + legacyPeak.liveEmitters > 0],
    ['[15b] 레거시 종료 후 기준선 복귀', isZero(legacySettled)],
    ['[15c] 레거시 정리 후 빗줄기 타이머가 더 뱉지 않음', legacyQuiet],
    // 이미터는 각자 렌더 패스를 갖는 무거운 오브젝트다. 상한이 없던 시절
    // 레거시가 똥 4마리를 동시에 태우며 42개까지 띄웠고 그게 렉의 원인이었다
    ['[16] 파티클 이미터 동시 상한(14) 준수', legacyPeak.liveEmitters <= 14],
    ['[14] 상시 이펙트 파기 시 보험 타이머까지 회수', persistCleared.timeouts === 0],
    ['[17a] K 초사이언 자기 보너스 재진입 폭주 없음 (2초에 발사 ≤ 5회)', kCascade <= 5],
    ['[17b] K 정리 후 기준선 복귀', isZero(kSettled)],
    // 레드 — 참새가 부순 똥의 보너스(15점)가 발사 간격(50점)을 스스로 넘기는 되먹임.
    // 입력 5회 대비 점수가 폭주하지 않아야 한다 (테드·K 와 같은 방어)
    ['[R1] 참새가 실제로 궤도에 뜸', redOrbit >= RED_PARAMS.sparrowCount],
    ['[R2] 참새 보너스가 발사를 연쇄시키지 않음 (5회 입력에 점수 ≤ 2000)', redScore <= 2000],
    ['[R3] 마무리 후 궤도가 다시 채워짐', redAfterFinish >= RED_PARAMS.sparrowCount],
    ['[R4] 특수 똥은 하나도 안 지워짐 (광역·전체 삭제 모두)', redSpecialAlive === 3],
    ['[R5] 레드 정리 후 기준선 복귀', isZero(redSettled)],
    ['[H1] 뿌요가 배회 중 살아 있음 (스프라이트 1)', hAfterFly === 1],
    [`[H14] 벽을 화면 끝에서 짚었다 (x=${hWallX.toFixed(0)}, 화면 ${hW})`,
      Number.isFinite(hWallX)
      && (hExpectRight ? hWallX > hW * 0.8 : hWallX < hW * 0.2)],
    [`[H15] 날라차기가 벽 반대편에 착지 (벽 ${hExpectRight ? '오른쪽' : '왼쪽'} → `
      + `착지 x=${hLandX.toFixed(0)})`,
      hExpectRight ? hLandX < hW / 2 : hLandX > hW / 2],
    // 도약이 먼 쪽으로 갔는지는 **벽을 짚은 자리**로 본다 — 착지는 그 반대편이다
    [`[H9] 먼 쪽으로 점프 (x=${hFireX.toFixed(0)} → ${hExpectRight ? '오른쪽' : '왼쪽'})`,
      hExpectRight ? hWallX > hFireX : hWallX < hFireX],
    [`[H10] 착지가 화면 안 (x=${hLandX.toFixed(0)}, 화면 ${hW})`,
      hLandX > 0 && hLandX < hW],
    [`[H11] 착지 후 배회로 돌아옴 (상태 '${hBackState}')`,
      hBackState === 'walk' || hBackState === 'idle'],
    [`[H12] 매번 crouch → jump → wall → kick → walk (${seqOk}/${RUNS})`, seqOk === RUNS],
    [`[H16] 양쪽 벽을 번갈아 짚는다 (${wallRuns[0]} …)`, alternates],
    [`[H17] 코앞으로 폴짝 뛰는 발동이 없다 (가장 짧은 도약 ${minRun.toFixed(0)}px `
      + `≥ ${needRun.toFixed(0)}px)`,
      runways.length === RUNS * 3 && minRun >= needRun],
    ['[H13] 하강 날라차기가 도약 구간보다 세다 (반경·점수)',
      HEIDI_PARAMS.puyoKickHitR > HEIDI_PARAMS.puyoHitR
      && HEIDI_PARAMS.puyoKickPoints > HEIDI_PARAMS.puyoPoints],
    [`[H2] 배회 비용이 사실상 0 (p50 ${hIdleP50.toFixed(4)}ms < 0.05ms)`, hIdleP50 < 0.05],
    [`[H3] 점프 한 프레임이 예산 안 (최대 ${hFlyMax.toFixed(3)}ms < 2ms)`, hFlyMax < 2],
    ['[H4] 점프 경로의 똥만 제거 (일부 생존)', hCleared > 0 && hAlive > 0],
    ['[H5] 특수 똥은 하나도 안 지워짐', hSpecialAlive === hSpecial.length],
    [`[H6] 점프가 실제로 떴다 (정점이 바닥에서 ${(hGround - hApex).toFixed(0)}px 위)`,
      hSawJump && hGround - hApex > 40],
    [`[H7] 재진입 가드 — 발동(${hFires}) ≤ 마일스톤(${hMilestones})`, hFires <= hMilestones],
    ['[H8] 하이디 정리 후 기준선 복귀', isZero(hSettled)],
  ];
  console.log('');
  let ok = true;
  for (const [name, pass] of checks) {
    console.log('%s %s', pass ? 'PASS' : 'FAIL', name);
    if (!pass) ok = false;
  }
  console.log('');
  process.exit(ok ? 0 : 1);
}

main();
