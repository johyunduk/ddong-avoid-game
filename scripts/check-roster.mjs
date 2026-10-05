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
import { fileURLToPath } from 'node:url';
import { maskCode, readRoster } from './gen-roster.mjs';

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
{
  const label = 'supabase/functions/_shared/roster.ts 가 character.ts 와 일치';
  const cur = (() => {
    try { return read('supabase', 'functions', '_shared', 'roster.ts'); } catch { return ''; }
  })();
  const got = [...cur.matchAll(/^ {2}'([^']+)',$/gm)].map(m => m[1]);
  const want = roster.map(c => c.id);
  if (got.join(',') !== want.join(',')) {
    fail(label, `node scripts/gen-roster.mjs 로 다시 생성해라 (생성물 ${got.length}종 / 정본 ${want.length}종)`);
  } else {
    // 등급까지 본다 — id 만 맞고 등급이 낡으면 뽑기 가중치가 옛 등급으로 남는다
    const badGrade = roster.filter(c => !new RegExp(`\\n {2}${c.id}:\\s+'${c.grade}',`).test(cur));
    if (badGrade.length) {
      fail(label, `등급이 어긋난다: ${badGrade.map(c => `${c.id}=${c.grade}`).join(', ')}`);
    } else {
      pass(label, `${want.length}종 · 등급 포함`);
    }
  }
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

// ── 3. 뽑기 풀 ────────────────────────────────────────────────────────
{
  const src = read('supabase', 'functions', 'gacha-pull', 'index.ts');
  subset('gacha-pull OBTAINABLE_IDS ⊆ 명단', literalList(src, 'OBTAINABLE_IDS'));
  const label = 'gacha-pull 이 등급을 _shared/roster.ts 에서 읽는다';
  if (!/from '\.\.\/_shared\/roster\.ts'/.test(src)) {
    fail(label, "import 가 없다 — 등급을 POOL 에 다시 적어 두면 character.ts 와 어긋난다");
  } else if (/grade:\s*'(R|SR|UR)'/.test(src)) {
    fail(label, '등급 리터럴이 POOL 에 되살아났다');
  } else {
    pass(label);
  }
}

// ── 4. 클라이언트 목록들 ──────────────────────────────────────────────
{
  const gacha = read('src', 'scenes', 'GachaScene.ts');
  subset('GachaScene SLIDESHOW_IDS ⊆ 명단', literalList(gacha, 'SLIDESHOW_IDS'));
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
    'supabase/functions/gacha-pull/index.ts#OBTAINABLE_IDS',    // 뽑기 가능 집합
    'src/scenes/GachaScene.ts#SLIDESHOW_IDS',                   // 배너 편집 순서
    'src/abilities/index.ts#R_IDS',                             // RGradeAbility 사용 집합
    'src/utils/charAnim.ts#CHARS_WITH_ANIM_SHEETS',             // 시트 보유 집합 (비캐릭터 포함)
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
