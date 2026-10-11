/**
 * **캐릭터 명단 불변식 검사.** `verify.ps1` 이 부른다.
 *
 * 정본은 `src/utils/character.ts` 의 `CHARACTERS` 하나다. 나머지 목록은 전부
 * 그 부분집합이거나 거기서 생성된 것이어야 한다. 하나라도 어긋나면 실패한다.
 *
 * ## 왜 필요한가
 *
 * 레드를 추가할 때 `character.ts`·가챠 POOL·영상 목록은 고쳤는데,
 * `leaderboard-submit` 의 화이트리스트를 빠뜨렸다. 서버는 모르는 id 를 조용히
 * `chibi` 로 바꿔 저장했고 — 에러도 로그도 없었다. **레드로 플레이했는데
 * 랭킹에는 치비로 올라갔다.** 같은 부류로 예전에 무기(UR)가 뽑기 풀에서
 * 통째로 빠져 사과문과 보상이 나간 적도 있다 (릴리스 노트 v2.7.1).
 *
 * 둘 다 "사람이 여러 곳을 손으로 맞춰야 하는데 어긋나도 아무 데서도 안 걸린다"가
 * 원인이다. 이 검사가 그 관문이다.
 *
 *     node scripts/check-roster.mjs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isCurrent, maskCode, outputs, readGachaWallpapers, readRoster } from './gen-roster.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);

const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8').split(CR + LF).join(LF);

/** dir 아래의 .ts 파일 전부 (재귀) */
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const roster = readRoster();
const ids = new Set(roster.map(c => c.id));
const failures = [];
const notes = [];

function pass(label, extra = '') {
  notes.push(`  OK   ${label}${extra ? '  — ' + extra : ''}`);
}
function fail(label, detail) {
  failures.push(`  FAIL ${label}${LF}         ${detail}`);
}

/**
 * 소스에서 `const NAME = [...]` / `const NAME = new Set([...])` 안의 문자열 리터럴을 뽑는다.
 *
 * **선언에 앵커를 건다.** 이름만 `indexOf` 로 찾으면 파일 위쪽 주석에 적힌 같은 이름이
 * 먼저 걸려 엉뚱한 배열을 읽는다 (charAnim.ts 가 정확히 그랬다).
 * `[^=]*` 가 `: readonly string[]` 같은 타입 표기를 건너뛴다 — 거기에는 `=` 가 없다.
 */
function literalList(src, name) {
  const decl = new RegExp(`const\\s+${name}\\b[^=]*=\\s*(?:new Set\\(\\s*)?\\[`).exec(src);
  if (!decl) return null;
  const open = decl.index + decl[0].length;
  const close = src.indexOf(']', open);
  if (close < 0) return null;
  return [...src.slice(open, close).matchAll(/'([^']+)'/g)].map(m => m[1]);
}

/** 목록이 명단의 부분집합인지 */
function subset(label, list, { allow = [] } = {}) {
  if (list === null) {
    fail(label, '목록을 찾지 못했다 — 이름이 바뀌었는지 확인해라 (검사가 헛돌면 안 된다)');
    return;
  }
  const extra = list.filter(id => !ids.has(id) && !allow.includes(id));
  if (extra.length) {
    fail(label, `명단에 없는 id: ${extra.join(', ')}`);
  } else {
    pass(label, `${list.length}개`);
  }
}

// ── 1. 생성물이 최신인가 ───────────────────────────────────────────────
// 글자 단위로 비교한다 — id · 등급만 보던 때는 eventOnly 같은 표식이 낡아도 통과했다.
// 등급이 낡으면 뽑기 가중치가 옛 등급으로, 표식이 낡으면 이벤트 셋이 상시 풀에 남는다
for (const [path, next, what] of outputs()) {
  const rel = path.slice(ROOT.length + 1).split('\\').join('/');
  const label = `${rel} 가 정본과 일치`;
  if (isCurrent(path, next)) pass(label, what);
  else fail(label, 'node scripts/gen-roster.mjs 로 다시 생성해라');
}

// ── 2. 서버가 명단을 베끼지 않는가 ─────────────────────────────────────
{
  const src = read('supabase', 'functions', 'leaderboard-submit', 'index.ts');
  const label = 'leaderboard-submit 이 명단을 _shared/roster.ts 에서 읽는다';
  if (!/from '\.\.\/_shared\/roster\.ts'/.test(src)) {
    fail(label, "import 가 없다 — 화이트리스트를 파일 안에 다시 베껴 두면 안 된다");
  } else if (/const validCharacterTypes\s*=\s*\[/.test(src)) {
    fail(label, '손으로 적은 validCharacterTypes 배열이 되살아났다');
  } else {
    pass(label);
  }
}

// ── 3. 뽑기 — 서버와 화면이 같은 배너 정본을 쓴다 ─────────────────────
// 예전에는 gacha-pull 에 풀(OBTAINABLE_IDS) · 가중치 · 배경 풀을 손으로 적고 화면 값과 맞는지 따로 검사했다.
// 지금은 둘 다 src/config/banners.ts 의 bannerRates 를 쓴다 (서버는 그 생성물 _shared/banners.ts — 위 1 이 글자 단위로 본다).
// 그래서 여기는 '손으로 적은 풀 · 가중치가 되살아나지 않았는가'와 '정본 함수를 부르는가'를 본다
{
  for (const fn of ['gacha-pull', 'gacha-exchange']) {
    const src = read('supabase', 'functions', fn, 'index.ts');
    const label = `${fn} 이 배너 · 명단을 _shared 생성물에서 읽는다`;
    const errs = [];
    if (!/from '\.\.\/_shared\/banners\.ts'/.test(src)) errs.push('_shared/banners.ts import 가 없다');
    if (!/from '\.\.\/_shared\/roster\.ts'/.test(src)) errs.push('_shared/roster.ts import 가 없다');
    if (/const\s+(OBTAINABLE_IDS|WP_POOL|POOL|WEIGHT_BY_GRADE|WP_DROP_CHANCE|SR_W|UR_W)\b/.test(src)) errs.push('손으로 적은 풀 · 가중치가 되살아났다');
    if (/grade:\s*'(R|SR|UR)'/.test(src)) errs.push('등급 리터럴이 되살아났다');
    if (errs.length) fail(label, errs.join(' · '));
    else pass(label);
  }
  {
    const src = read('supabase', 'functions', 'gacha-pull', 'index.ts');
    const label = 'gacha-pull 이 정본 bannerRates · drawSlots 로 뽑는다 (명단 = GACHA_ROSTER · GACHA_WALLPAPERS)';
    if (!/bannerRates\(\s*\w+\s*,\s*GACHA_ROSTER\s*,\s*GACHA_WALLPAPERS\s*\)/.test(src) || !/drawSlots\(/.test(src)) fail(label, '정본 함수 호출을 찾지 못했다');
    else pass(label);
  }
  {
    const src = read('supabase', 'functions', 'gacha-exchange', 'index.ts');
    const label = 'gacha-exchange 가 교환 후보를 정본 pityChoices 로 검증한다';
    if (!/pityChoices\(\s*banner\s*,\s*GACHA_ROSTER\s*\)/.test(src)) fail(label, 'pityChoices(banner, GACHA_ROSTER) 를 찾지 못했다');
    else pass(label);
  }
  {
    // 화면의 확률 표시도 같은 함수 · 같은 명단 — 숫자를 따로 적지 않는다
    const src = read('src', 'utils', 'gacha.ts');
    const label = '화면 확률(src/utils/gacha.ts)이 정본 bannerRates · pityChoices 를 쓴다';
    const errs = [];
    if (!/from '\.\.\/config\/banners'/.test(src)) errs.push('../config/banners import 가 없다');
    if (!/bannerRates\(\s*banner\s*,\s*CHARACTERS\s*,/.test(src)) errs.push('bannerRates(banner, CHARACTERS, …) 가 없다');
    if (/19\.3\s*\/\s*8|0\.7\s*\/\s*3|\bR:\s*8\b/.test(maskCode(src))) errs.push('등급 가중치 숫자가 되살아났다');
    if (errs.length) fail(label, errs.join(' · '));
    else pass(label);
  }
}

// ── 4. 클라이언트 목록들 ──────────────────────────────────────────────
{
  const gacha = read('src', 'scenes', 'GachaScene.ts');
  {
    // 진열 목록(신규 출시 + UR)은 캐릭터 정의에서 유도한다 — 손으로 적은 목록은 등급이 바뀌어도 안 따라온다
    const label = 'GachaScene 진열 캐릭터는 캐릭터 정의에서 유도한다';
    if (/const\s+SLIDESHOW_IDS/.test(gacha)) fail(label, '손으로 적은 SLIDESHOW_IDS 가 되살아났다 — gachaPool() 에서 유도해라');
    else pass(label);
  }
  const label = 'GachaScene CHARS_WITH_VIDS 는 캐릭터 정의에서 유도한다';
  if (/CHARS_WITH_VIDS\s*=\s*new Set\(\[/.test(gacha)) {
    fail(label, '손으로 적은 목록이 되살아났다 — videoKey 로 유도해라');
  } else {
    pass(label);
  }
}
{
  const game = read('src', 'scenes', 'GameScene.ts');
  const label = 'GameScene CHARS_WITH_SPRITES 는 캐릭터 정의에서 유도한다';
  if (/CHARS_WITH_SPRITES\s*=\s*\[/.test(game)) {
    fail(label, '손으로 적은 목록이 되살아났다 — CHARACTERS 에서 유도해라');
  } else {
    pass(label);
  }
}
{
  // R_IDS 는 `RGradeAbility` 를 쓰는 캐릭터 — 명단의 부분집합이면 된다.
  // (src/abilities/ 는 fx 담당이라 검사만 하고 고치지 않는다)
  const ab = read('src', 'abilities', 'index.ts');
  subset('abilities R_IDS ⊆ 명단', literalList(ab, 'R_IDS'));
}
{
  // 애니메이션 시트는 캐릭터가 아닌 것도 쓴다 (변신·동반자). 그건 예외로 둔다
  const anim = read('src', 'utils', 'charAnim.ts');
  subset('charAnim CHARS_WITH_ANIM_SHEETS ⊆ 명단 + 비캐릭터 시트',
    literalList(anim, 'CHARS_WITH_ANIM_SHEETS'),
    { allow: ['astronaut', 'gold_mugi', 'ktei', 'ktei_ss'] });
}

// ── 4-1. 뽑기 배너 (src/config/banners.ts) ───────────────────────────
// 정의서 v2 §6-1 · §1-3 의 검사. 정본 파일을 그대로 불러 같은 함수(bannerRates · pityChoices)로 잰다 —
// 화면과 서버가 쓰는 계산 그 자체를 검사해야 검사가 헛돌지 않는다
{
  const B = await import(pathToFileURL(join(ROOT, 'src', 'config', 'banners.ts')).href);
  const { SYNERGY_MAP } = await import(pathToFileURL(join(ROOT, 'src', 'config', 'synergyMap.ts')).href);
  const wps = readGachaWallpapers();
  const wpIds = wps.map(w => w.id);
  const byId = new Map(roster.map(c => [c.id, c]));
  const stdUR = B.standardPool(roster).filter(c => c.grade === 'UR').map(c => c.id);

  const ids = B.BANNERS.map(b => b.id);
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupIds.length) fail('배너 id 가 겹치지 않는다', dupIds.join(', '));
  else pass('배너 id 가 겹치지 않는다', `${ids.length}개`);
  if (!B.getBanner(B.DEFAULT_BANNER_ID)) fail('기본 배너가 있다', `'${B.DEFAULT_BANNER_ID}' 가 BANNERS 에 없다`);
  {
    // 없어진 id 는 지금 배너를 가리키고, 지금 배너 id 와 겹치지 않는다 (겹치면 그 배너를 영영 못 부른다)
    const label = '없어진 배너 id(BANNER_ALIASES)가 지금 배너로 이어진다';
    const bad = [...B.BANNER_ALIASES].filter(([from, to]) => ids.includes(from) || !ids.includes(to)).map(([f, t]) => `${f} → ${t}`);
    if (bad.length) fail(label, bad.join(', '));
    else pass(label, [...B.BANNER_ALIASES].map(([f, t]) => `${f} → ${t}`).join(', '));
  }
  {
    // 정의서 v2 §1-3 (가) — 픽업 전용(pickupOnly)
    const label = '픽업 전용(pickupOnly) 캐릭터가 뽑을 곳이 있고, 상시 UR 이 남는다';
    const errs = [];
    const both = roster.filter(c => c.pickupOnly && c.eventOnly).map(c => c.id);
    if (both.length) errs.push(`pickupOnly 와 eventOnly 가 함께 붙었다: ${both.join(', ')}`);
    const picked = new Set(B.BANNERS.filter(b => b.kind === 'pickup').flatMap(b => [...(b.pickupUR ? [b.pickupUR] : []), ...b.pickupSR]));
    const orphan = roster.filter(c => c.pickupOnly && !c.unreleased && !picked.has(c.id)).map(c => c.id);
    if (orphan.length) errs.push(`어느 픽업 배너의 픽업도 아니다 — 뽑을 곳이 없다: ${orphan.join(', ')}`);
    if (stdUR.length === 0) errs.push('상시 UR 이 하나도 없다');
    if (errs.length) fail(label, errs.join(LF + '         '));
    else pass(label, `픽업 전용 ${roster.filter(c => c.pickupOnly).map(c => c.id).join(', ') || '없음'} · 상시 UR ${stdUR.join(', ')}`);
  }
  {
    // 초보자 혜택은 상시 배너 하나에만 — gacha_starter 가 계정당 한 줄이라 둘이면 횟수를 나눠 쓴다
    const label = '초보자 설정은 상시 배너 하나에만 있다';
    const withStarter = B.BANNERS.filter(b => b.starter);
    if (withStarter.length > 1 || withStarter.some(b => b.kind !== 'standard')) fail(label, withStarter.map(b => `${b.id}(${b.kind})`).join(', '));
    else pass(label, withStarter.map(b => b.id).join(', ') || '없음');
  }

  // 정의서 §6-1 의 kind 별 천장 모양 (threshold 값은 정본이 정한다)
  const PITY_SHAPE = {
    standard: { track: () => 'standard', exchange: 'chooseUR' },
    pickup: { track: b => b.id, exchange: 'pickupUR' },
    event: { track: b => b.id, exchange: 'chooseSR' },
  };

  for (const b of B.BANNERS) {
    const errs = [];
    const picks = [...(b.pickupUR ? [b.pickupUR] : []), ...b.pickupSR];
    // 2. 픽업 id ⊆ 명단, 등급이 맞다
    if (b.pickupUR && byId.get(b.pickupUR)?.grade !== 'UR') errs.push(`pickupUR '${b.pickupUR}' 가 명단의 UR 이 아니다`);
    for (const id of b.pickupSR) if (byId.get(id)?.grade !== 'SR') errs.push(`pickupSR '${id}' 가 명단의 SR 이 아니다`);
    // 3. 상시 · 픽업은 이벤트 전용이 없고, 이벤트 배너의 픽업은 전부 이벤트 전용이다
    const evChars = picks.filter(id => byId.get(id)?.eventOnly);
    const evWps = b.pickupWP.filter(id => wps.find(w => w.id === id)?.eventOnly);
    if (b.kind === 'event') {
      if (b.pickupUR) errs.push('이벤트 배너에 픽업 UR 이 있다');
      if (evChars.length !== picks.length || picks.length === 0) errs.push('이벤트 배너의 픽업 캐릭터가 전부 eventOnly 가 아니다');
      if (evWps.length !== b.pickupWP.length) errs.push('이벤트 배너의 픽업 배경이 전부 eventOnly 가 아니다');
    } else if (evChars.length || evWps.length) {
      errs.push(`${b.kind} 배너에 eventOnly 가 있다: ${[...evChars, ...evWps].join(', ')}`);
    }
    if (b.kind === 'standard' && (picks.length || b.pickupWP.length)) errs.push('상시 배너에 픽업이 있다');
    if (b.kind === 'pickup' && (!b.pickupUR || b.pickupSR.length === 0)) errs.push('픽업 배너에 픽업 UR · SR 이 없다');
    // 4. 배경 id ⊆ 뽑기 배경 (GACHA_WP_IDS), 전용 배경은 그 배너 픽업 SR 의 시너지 짝 (정의서 §2-2)
    for (const id of b.pickupWP) if (!wpIds.includes(id)) errs.push(`pickupWP '${id}' 가 뽑기 배경화면이 아니다`);
    const unpaired = b.pickupWP.filter(wp => !b.pickupSR.some(sr => SYNERGY_MAP[`${wp}:${sr}`]));
    if (unpaired.length) errs.push(`pickupWP 가 픽업 SR 의 시너지 짝이 아니다: ${unpaired.join(', ')}`);
    // 6. 천장이 kind 와 맞고, 교환 후보가 비지 않았다. 'starter' kind 는 v2 에서 없어졌다 (초보자 = 상시의 starter 설정)
    const shape = PITY_SHAPE[b.kind];
    if (!shape) errs.push(`kind '${b.kind}' 는 v2 에 없다 — 초보자는 상시 배너의 starter 설정이다`);
    else if (!b.pity) errs.push('천장이 없다');
    else {
      if (b.pity.track !== shape.track(b)) errs.push(`pity.track '${b.pity.track}' ≠ '${shape.track(b)}'`);
      if (b.pity.exchange !== shape.exchange) errs.push(`pity.exchange '${b.pity.exchange}' ≠ '${shape.exchange}'`);
      if (!(Number.isInteger(b.pity.threshold) && b.pity.threshold > 0)) errs.push(`pity.threshold ${b.pity.threshold}`);
      if (B.pityChoices(b, roster).length === 0) errs.push('pityChoices 가 비었다');
    }
    if (!(Number.isInteger(b.price.single) && b.price.single > 0)) errs.push(`1회 가격 ${b.price.single}`);
    if (!(Number.isInteger(b.price.multi) && b.price.multi > 0)) errs.push(`10연 가격 ${b.price.multi}`);
    // 7. 초보자 설정 (정의서 v2 §3 · §6-1): 10연만 세므로 maxPulls 는 10연의 배수, 할인가는 보통 10연보다 싸다,
    //    보장 후보 ⊆ 상시 UR
    if (b.starter) {
      const s = b.starter;
      if (!(Number.isInteger(s.maxPulls) && s.maxPulls > 0 && s.maxPulls % B.PULL_COUNT.multi === 0)) errs.push(`starter.maxPulls ${s.maxPulls} 가 10연의 배수가 아니다`);
      if (!(Number.isInteger(s.multiPrice) && s.multiPrice > 0 && s.multiPrice < b.price.multi)) errs.push(`starter.multiPrice ${s.multiPrice} 가 보통 10연(${b.price.multi})보다 싼 양의 정수가 아니다`);
      const bad = s.pickFrom.filter(id => !stdUR.includes(id));
      if (bad.length || s.pickFrom.length === 0) errs.push(`starter.pickFrom 이 상시 UR 이 아니다: ${bad.join(', ') || '(비었다)'}`);
    }
    // 5. 확률 합 = 100% — 한 칸 · 10연 확정 칸 · 10연 실효
    let sums = '';
    try {
      const r = B.bannerRates(b, roster, wps);
      const sum = k => r.entries.reduce((s, e) => s + e.rate[k], 0);
      for (const k of ['slot', 'guarantee', 'multi']) {
        if (!(Math.abs(sum(k) - 100) <= 1e-9)) errs.push(`${k} 합 ${sum(k)} ≠ 100`);
      }
      sums = `종 ${r.entries.length} · UR ${r.byGrade.UR.slot.toFixed(4)}%`;
    } catch (e) {
      errs.push(`bannerRates 가 던졌다: ${e.message}`);
    }
    const label = `배너 ${b.id} (${b.kind})`;
    if (errs.length) fail(label, errs.join(LF + '         '));
    else pass(label, sums);
  }
}

// ── 5. 이름에 기대지 않는 복제 탐지 ───────────────────────────────────
// 위 검사들은 **알고 있는 변수 이름**만 본다. 이름을 바꿔 새 수동 목록을 만들면
// 그대로 통과한다 (리뷰 지적). 그래서 소스 전체에서 **캐릭터 id 문자열이 여러 개
// 늘어선 배열**을 찾아, 허용된 자리가 아니면 실패시킨다. 이름이 무엇이든 걸린다.
{
  const label = '알려지지 않은 캐릭터 명단 복제가 없다';
  // id 를 이만큼 이상 나열하면 '명단'으로 본다. 3 이면 등급별 소집합(UR 4종)도 걸린다
  const THRESHOLD = 3;

  /**
   * 예외는 **파일이 아니라 선언 이름 단위**다.
   *
   * 파일을 통째로 건너뛰면, 허용된 파일 안에 다른 이름으로 수동 목록을 하나 더
   * 만들었을 때 탐지기가 그 파일을 아예 안 본다 (리뷰 지적). `파일#선언이름` 으로
   * 좁히면 같은 파일이라도 **새 이름은 반드시 걸린다.**
   */
  const ALLOWED = new Set([
    'src/utils/character.ts#CHARACTERS',                        // 정본
    'supabase/functions/_shared/roster.ts#CHARACTER_IDS',       // 생성물
    'src/abilities/index.ts#R_IDS',                             // RGradeAbility 사용 집합
    'src/utils/charAnim.ts#CHARS_WITH_ANIM_SHEETS',             // 시트 보유 집합 (비캐릭터 포함)
    'src/data/releaseNotes.ts#RELEASE_NOTES',                   // 버전별 발표 기록 (값을 박아 둔다)
    'src/config/banners.ts#BANNERS',                            // 뽑기 배너 정본 (픽업 id 나열이 정당하다)
    'supabase/functions/_shared/banners.ts#BANNERS',            // 그 생성물
  ]);

  /**
   * 배열 범위는 **마스크**(문자열·주석을 공백으로 지운 사본)에서 찾고,
   * 리터럴은 **원본**에서 읽는다.
   *
   * 정규식으로 주석만 지우려 하면 문자열 안의 `//` 까지 지워서 배열이 잘리고,
   * 그 안의 복제 목록이 탐지를 빠져나간다 (리뷰 지적: `'foo//bar'`).
   * 마스크는 위치와 길이가 원본과 같아서 인덱스를 그대로 쓸 수 있다.
   */
  const arrayRanges = (mask) => {
    const out = [];
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] !== '[') continue;
      let depth = 0;
      for (let j = i; j < mask.length; j++) {
        if (mask[j] === '[') depth++;
        else if (mask[j] === ']') {
          depth--;
          if (depth === 0) { out.push([i + 1, j]); i = j; break; }
        }
      }
    }
    return out;
  };

  /**
   * 위치 i 를 감싸는 선언 이름 — 바로 앞의 `const|let|var NAME` 을 본다.
   * `readonly` 를 넣으면 안 된다: `: readonly string[]` 의 `string` 을 이름으로 잡는다.
   */
  const declNameBefore = (src, i) => {
    const head = src.slice(Math.max(0, i - 400), i);
    const ms = [...head.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)];
    return ms.length ? ms[ms.length - 1][1] : '(이름없음)';
  };

  const roots = [
    ...walk(join(ROOT, 'src')),
    ...walk(join(ROOT, 'supabase', 'functions')),
  ];
  const offenders = [];
  for (const abs of roots) {
    const rel = abs.slice(ROOT.length + 1).split('\\').join('/');
    const src = readFileSync(abs, 'utf8').split(CR + LF).join(LF);
    const mask = maskCode(src);                       // 범위 찾기용 (문자열·주석 제거)
    const noComments = maskCode(src, { keepStrings: true }); // id 세기용 (주석만 제거)
    for (const [from, to] of arrayRanges(mask)) {
      // 주석 안의 배열은 마스크에서 통째로 지워져 범위 자체가 잡히지 않는다.
      // 배열 **안쪽**의 주석은 noComments 로 지운다 — `[ /* 'red','k' */ 0 ]` 오탐 방지
      const known = [...noComments.slice(from, to).matchAll(/'([^']*)'/g)]
        .map(x => x[1]).filter(x => ids.has(x));
      if (known.length < THRESHOLD) continue;
      const name = declNameBefore(mask, from);
      if (ALLOWED.has(`${rel}#${name}`)) continue;
      offenders.push(`${rel} — ${name} 에 id ${known.length}개 나열 (${known.slice(0, 4).join(', ')}${known.length > 4 ? ' …' : ''})`);
    }
  }
  if (offenders.length) {
    fail(label, [...new Set(offenders)].join(LF + '         ') +
      LF + '         캐릭터 정의에서 유도하거나, 정당한 부분집합이면 check-roster.mjs 의 ALLOWED 에 `파일#선언이름` 으로 근거와 함께 넣어라');
  } else {
    pass(label, `${roots.length}개 파일 · 선언 단위 예외 ${ALLOWED.size}곳`);
  }
}

// ── 결과 ──────────────────────────────────────────────────────────────
console.log(notes.join(LF));
if (failures.length) {
  console.error(LF + failures.join(LF));
  console.error(LF + `캐릭터 명단 불변식 ${failures.length}건 위반.`);
  console.error('정본은 src/utils/character.ts 의 CHARACTERS 하나다.');
  process.exit(1);
}
console.log(`${LF}캐릭터 명단 불변식 통과 (${roster.length}종).`);
