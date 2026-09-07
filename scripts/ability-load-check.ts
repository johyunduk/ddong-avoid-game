/**
 * 능력별 부하 계측 하네스.
 *
 * fx-leak-check 가 "이펙트가 회수되는가"를 본다면, 이쪽은 **"발동이 스스로 번지는가"** 를 본다.
 *
 * GameScene.checkMissedSpawnPoints 는 점수를 **1점씩 순회하며** onScoreMilestone 을 부른다.
 * 그래서 능력이 준 보너스가 자기 발동 간격을 넘기면 그 자리에서 다음 발동이 걸리고,
 * 그 발동이 또 보너스를 준다 — K 초사이언이 이 되먹임으로 2초에 24회 발동했다.
 * 여기서는 그 루프를 그대로 재현해 캐릭터마다
 *
 *   · 증폭률   : 플레이로 번 1점이 실제 몇 점이 되는가
 *   · 발동 횟수: 30초치 플레이에서 능력이 몇 번 터지는가
 *   · 최대 동시: 그때 화면에 떠 있는 스프라이트·이미터·Graphics 수
 *
 * 를 잰다. Graphics 는 vfx 로 넘어가지 않은 손그림 경로의 잔량이다 (장당 배치가 끊긴다).
 *
 * 실행:  node scripts/run-ability-load-check.mjs
 */
// @ts-nocheck
import Phaser, { live, created, createFakeScene } from 'phaser';
import { getFxStats, preloadFxAssets } from '../src/utils/vfx';

import { ArchieveAbility } from '../src/abilities/ArchieveAbility';
import { GlitchAbility } from '../src/abilities/GlitchAbility';
import { GumiAbility } from '../src/abilities/GumiAbility';
import { HackerAbility } from '../src/abilities/HackerAbility';
import { KAbility } from '../src/abilities/KAbility';
import { KnightAbility } from '../src/abilities/KnightAbility';
import { LegacyAbility } from '../src/abilities/LegacyAbility';
import { MaehwaAbility } from '../src/abilities/MaehwaAbility';
import { MinerAbility } from '../src/abilities/MinerAbility';
import { MugiAbility } from '../src/abilities/MugiAbility';
import { NoiseAbility } from '../src/abilities/NoiseAbility';
import { SentinelAbility } from '../src/abilities/SentinelAbility';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// glowDot 은 캔버스에 그라디언트를 굽는다 — node 엔 DOM 이 없으므로 최소한만 흉내 낸다
globalThis.document = globalThis.document ?? {
  createElement: () => ({
    width: 0, height: 0,
    getContext: () => ({
      createRadialGradient: () => ({ addColorStop() {} }),
      fillRect() {}, set fillStyle(_v) {},
    }),
  }),
};

/** 실기 기준: 100ms 마다 1점. 30초치를 3초 안에 몰아 돌린다 */
const BASE_POINTS = 300;
/** 한 번의 점수 증가로 만들 수 있는 특수 똥 총량 (GameScene 과 같은 값) */
const SPAWN_BUDGET = 3;
/** 증폭률이 이 값을 넘으면 '자기 점수로 자기를 굴리고 있다'고 본다 */
const AMPLIFY_LIMIT = 12;

const CASES = [
  ['매화 (SR)',   () => new MaehwaAbility(0),   'maehwa'],
  ['루트 (SR)',   () => new HackerAbility(0),   'hacker'],
  ['광부 (SR)',   () => new MinerAbility(0),    'miner'],
  ['아카이브 (SR)', () => new ArchieveAbility(0), 'archieve'],
  ['글리치 (SR)', () => new GlitchAbility(0),   'glitch'],
  ['노이즈 (SR)', () => new NoiseAbility(0),    'noise'],
  ['센티넬 (SSR)', () => new SentinelAbility(0), 'sentinel'],
  ['나이트 (SSR)', () => new KnightAbility(0),  'knight'],
  ['구미 (SSR)',  () => new GumiAbility(0),     'gumi'],
  ['레거시 (UR)', () => new LegacyAbility(0),   'legacy'],
  ['무기 (UR)',   () => new MugiAbility(0),     'mugi'],
  ['K (UR)',      () => new KAbility(0),        'k'],
  ['K 초사이언',   () => new KAbility(0),        'k_ss'],
];

function makeScene() {
  const scene = createFakeScene();
  preloadFxAssets(scene);
  return scene;
}

/** 화면에 늘 몇 마리가 떠 있는 상태 — 광역기가 실제로 대상을 잡게 한다 */
function makePoops(n) {
  return Array.from({ length: n }, (_, i) => ({
    x: 40 + (i % 8) * 40,
    y: 120 + Math.floor(i / 8) * 70,
    active: true,
    recycle() { this.active = false; },
  }));
}

async function runCase(label, make, kind) {
  const scene = makeScene();
  const ability = make();

  // 능력들이 실제로 만지는 Player 표면 전부 (grep player.* 로 뽑은 목록)
  const player = {
    x: 150, y: 520, displayWidth: 48, displayHeight: 64, active: true,
    body: { velocity: { x: 0, y: 0 }, setAllowGravity() {} },
    addPermanentSpeed() {},
    getTexturePrefix() { return 'k_'; },
    setTexturePrefix() {},
    resize(w, h) { this.displayWidth = w; this.displayHeight = h; },
    setAlpha() { return this; },
    setDepth() { return this; },
    setInvincibleBriefly() {},
    setX(v) { this.x = v; return this; },
    setY(v) { this.y = v; return this; },
  };

  let poops = makePoops(12);
  let score = 0;
  let bonusTotal = 0;
  let fires = 0;
  let spawnedSpecials = 0;
  // GameScene 의 마커들 — 예산 없이 돌면 여기서 수십 개가 한 번에 튄다
  let lastGold = 0, lastDia = 0, lastTopaz = 0;

  // 장부는 프로세스 전역이라 앞 케이스의 잔여물을 빼고 이 케이스 몫만 센다
  const base = { sprites: live.sprites, emitters: live.emitters, graphics: live.graphics };
  const peak = { sprites: 0, emitters: 0, graphics: 0 };
  const sample = () => {
    peak.sprites = Math.max(peak.sprites, live.sprites - base.sprites);
    peak.emitters = Math.max(peak.emitters, live.emitters - base.emitters);
    peak.graphics = Math.max(peak.graphics, live.graphics - base.graphics);
  };

  const api = {
    scene, player,
    get score() { return score; },
    difficultyLevel: 1,
    baseSpeed: 200,
    poops: { getChildren: () => poops },
    goldPoops: { getChildren: () => [] },
    diamondPoops: { getChildren: () => [] },
    topazPoops: { getChildren: () => [] },
    rainbowPoops: { getChildren: () => [] },
    updateScore(n) { this.addAbilityBonus(n); },
    addAbilityBonus(n) {
      bonusTotal += n;
      advance(n);
    },
    spawnGoldPoop() {}, spawnGoldPoopAt() {}, spawnDiamondPoop() {},
    spawnTopazPoop() {}, spawnRainbowPoop() {},
    collectGoldPoop() {}, collectDiamondPoop() {}, collectTopazPoop() {},
    collectRainbowPoop() {},
  };

  /** GameScene.checkMissedSpawnPoints 와 같은 순회 (예산 포함) */
  function advance(n) {
    const intervals = ability.getSpawnIntervals();
    let budget = SPAWN_BUDGET;
    const to = score + n;
    for (let s = score + 1; s <= to; s++) {
      score = s;
      if (s % intervals.gold === 0 && s > lastGold) {
        if (budget > 0) { spawnedSpecials++; budget--; }
        lastGold = s;
      }
      if (s % intervals.diamond === 0 && s > lastDia) {
        if (budget > 0) { spawnedSpecials++; budget--; }
        lastDia = s;
      }
      if (s % intervals.topaz === 0 && s > lastTopaz) {
        if (budget > 0) { spawnedSpecials++; budget--; }
        lastTopaz = s;
      }
      const before = created.sprites + created.graphics;
      ability.onScoreMilestone(s, api);
      if (created.sprites + created.graphics > before) fires++;
    }
    score = to;
  }

  ability.onCreate(api);
  if (kind === 'k_ss') ability.onHitPoop(api);   // 초사이언 승계
  if (kind === 'sentinel') {
    // 보호막이 있어야 피격이 광역 제거로 이어진다 — 충전 구간을 먼저 지난다
    for (let s = 1; s <= 900; s++) ability.onScoreMilestone(s, api);
    score = 900;
  }

  // 실기와 같은 속도로 점수를 넣는다 — 1점씩, 프레임을 돌리며
  for (let i = 0; i < BASE_POINTS; i++) {
    advance(1);
    ability.onUpdate(api);
    if (i % 20 === 0) {
      ability.onAfterSpawnPoop(api);       // 스폰 훅 (레거시 불태우기 등)
      poops = makePoops(12);               // 화면은 늘 차 있다
    }
    if (i % 60 === 0 && kind === 'sentinel') ability.onHitPoop(api);
    sample();
    if (i % 10 === 0) await sleep(4);      // 트윈·타이머가 실제로 돌 시간을 준다
  }
  sample();

  ability.onDestroy(api);
  await sleep(400);
  sample();

  const amplify = score / BASE_POINTS;
  return {
    label,
    score, bonusTotal, fires, spawnedSpecials, amplify,
    peak: { ...peak },
  };
}

async function main() {
  console.log('=== 능력별 부하 계측 (플레이 점수 %d점 = 30초치) ===\n', BASE_POINTS);
  console.log(
    '%s  %s %s %s %s %s %s',
    '캐릭터'.padEnd(16), '최종점수'.padStart(9), '증폭'.padStart(7),
    '발동'.padStart(6), '특수똥'.padStart(7), '최대동시'.padStart(9), 'Graphics'.padStart(9),
  );
  console.log('-'.repeat(78));

  const results = [];
  for (const [label, make, kind] of CASES) {
    // 이미터·스프라이트 장부는 씬 단위라 케이스마다 새 씬을 쓴다
    const r = await runCase(label, make, kind);
    results.push(r);
    console.log(
      '%s  %s %s %s %s %s %s',
      r.label.padEnd(16),
      String(r.score).padStart(9),
      (r.amplify.toFixed(1) + '×').padStart(7),
      String(r.fires).padStart(6),
      String(r.spawnedSpecials).padStart(7),
      String(r.peak.sprites + r.peak.emitters).padStart(9),
      String(r.peak.graphics).padStart(9),
    );
  }

  console.log();
  let failed = 0;
  for (const r of results) {
    if (r.amplify > AMPLIFY_LIMIT) {
      console.log('FAIL %s — 증폭 %s× (한계 %d×): 자기 보너스가 자기 발동을 굴리고 있다',
        r.label, r.amplify.toFixed(1), AMPLIFY_LIMIT);
      failed++;
    }
  }
  if (failed === 0) console.log('PASS 모든 캐릭터가 증폭 한계(%d×) 안에 있다', AMPLIFY_LIMIT);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
