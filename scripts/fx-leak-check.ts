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
import Phaser, { live, created, createFakeScene, arcSpawns, beamSpawns } from 'phaser';
import { MaehwaAbility } from '../src/abilities/MaehwaAbility';
import { KnightAbility } from '../src/abilities/KnightAbility';
import { KAbility } from '../src/abilities/KAbility';
import { LegacyAbility } from '../src/abilities/LegacyAbility';
import { LEGACY_PARAMS, K_PARAMS } from '../src/config/abilityParams';
import { beam, fxSprite, getFxStats, preloadFxAssets, playFx, getFxCounters, resetFxCounters } from '../src/utils/vfx';

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

function isZero(s) {
  return s.sprites === 0 && s.emitters === 0 && s.timeouts === 0 && s.activeSlots === 0
    && s.bloomRefs === 0 && s.bloomChildren === 0
    && s.liveSprites === 0 && s.liveEmitters === 0;
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

  console.log('\n누적 생성: sprites=%d emitters=%d layers=%d', created.sprites, created.emitters, created.layers);

  console.log('공통 연출 상한: 요청 %d회 중 %d회 재생, %d회는 상한으로 무시됨',
    capStat.requested, capStat.played, capStat.requested - capStat.played);

  const checks = [
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
