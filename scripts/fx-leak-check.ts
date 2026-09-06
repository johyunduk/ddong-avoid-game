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
import Phaser, { live, created, createFakeScene, arcSpawns } from 'phaser';
import { MaehwaAbility } from '../src/abilities/MaehwaAbility';
import { KnightAbility } from '../src/abilities/KnightAbility';
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
    beam(scene, 60, 500, {
      angle: -Math.PI / 4, length: 780, thickness: 26,
      texture: 'fx_k_beam', blend: 'normal', alpha: 0.85,
      layers: [
        { thickness: 2.2, alpha: 0.26, dz: -1 },
        { thickness: 0.4, alpha: 0.9, dz: 1, texture: 'fx_k_beam_core' },
      ],
      waver: { thickness: 0.14, periodMs: 200 },
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
