/**
 * 서버 사본 생성 — Edge Function 이 src/ 를 못 읽어서 필요한 것 둘.
 *
 *   - `src/utils/character.ts` + `src/utils/wallpaper.ts` → `supabase/functions/_shared/roster.ts`
 *   - `src/config/banners.ts` (그대로)                  → `supabase/functions/_shared/banners.ts`
 *
 * ## 왜 생성하는가
 *
 * Edge Function 은 Deno 로 돌고 `supabase/functions/` 밖을 번들에 넣지 못한다.
 * 그래서 서버는 `character.ts` 를 **import 할 수 없다.** 예전에는 그 자리에 명단을
 * 손으로 베껴 뒀고, 그게 어긋나서 레드로 플레이해도 랭킹에 치비로 저장됐다
 * (`validCharacterTypes` 에 red·ted·heidi 가 없었다).
 *
 * 베끼는 대신 **생성한다.** 정본은 `character.ts` 하나고, 이 스크립트가 서버용
 * 사본을 만든다. `scripts/check-roster.mjs` 가 둘이 어긋나면 실패시키므로
 * (verify.ps1 에 물려 있다) 사본이 낡은 채로 커밋될 수 없다.
 *
 * ## 왜 정규식으로 읽는가
 *
 * `character.ts` 는 Phaser 타입을 물고 있어 Node 에서 그냥 import 되지 않는다.
 * 손으로 쓰는 리터럴 배열이라 형태가 일정해서 정규식으로 충분하다 —
 * `scripts/publish-roster.py` 가 이미 같은 방식으로 읽고 있다.
 *
 *     node scripts/gen-roster.mjs           # 생성
 *     node scripts/gen-roster.mjs --check   # 생성물과 파일이 같은지만 확인
 *
 * ## 배너는 왜 그대로 옮기는가
 *
 * 화면의 확률 표와 서버의 추첨이 **같은 함수**(bannerRates · pityChoices)를 써야 해서다.
 * 그래서 정본 `banners.ts` 는 아무것도 import 하지 않게 써 두고 (명단은 인자로 받는다),
 * 여기서는 머리말만 붙여 글자 그대로 옮긴다. import 가 생기면 생성을 거부한다 —
 * Deno 에서 `src/` 경로가 풀리지 않아 배포 뒤에야 터진다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src', 'utils', 'character.ts');
const WP_SRC = join(ROOT, 'src', 'utils', 'wallpaper.ts');
const BANNER_SRC = join(ROOT, 'src', 'config', 'banners.ts');
const OUT = join(ROOT, 'supabase', 'functions', '_shared', 'roster.ts');
const BANNER_OUT = join(ROOT, 'supabase', 'functions', '_shared', 'banners.ts');

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

/** CRLF 로 저장돼 있어도 같은 정규식이 맞도록 줄바꿈을 통일해 읽는다 */
const readLF = (path) => readFileSync(path, 'utf8').split(CR + LF).join(LF);

/** `true` 표식 — 주석 · 문자열 속 글자는 세지 않는다 (마스크에서 본다) */
const flagOf = (block, key) => new RegExp(`(^|[{,\\s])${key}\\s*:\\s*true\\b`).test(maskCode(block));

/** `character.ts` 의 CHARACTERS 배열에서 (id, name, grade, unreleased, eventOnly, pickupOnly) 를 뽑는다 */
export function readRoster() {
  const text = readLF(SRC);
  const start = text.indexOf('export const CHARACTERS');
  if (start < 0) throw new Error('character.ts 에서 CHARACTERS 배열을 못 찾았다');
  const body = text.slice(start);

  // **항목 블록을 먼저 자르고, 블록마다 필드를 따로 읽는다.**
  //
  // 예전에는 `id → name → grade` 가 그 순서로 붙어 있다는 정규식 하나로 읽었다.
  // 그러면 순서를 바꾸거나 `id : 'x'` 처럼 공백을 넣은 항목이 **조용히 빠지고**,
  // 생성기와 검사기가 같은 패턴을 쓰니 둘이 함께 놓쳐 통과한다 — 지금 고치려는
  // 버그와 정확히 같은 실패 방식이다. 그래서 순서도 공백도 전제하지 않는다.
  const arr = sliceArray(body);
  const blocks = topLevelObjects(arr);
  if (blocks.length === 0) {
    throw new Error('CHARACTERS 에서 캐릭터 항목을 하나도 찾지 못했다 — 배열 형태가 바뀌었는지 확인해라');
  }

  const field = (block, key) => {
    const m = new RegExp(`(^|[{,\\s])${key}\\s*:\\s*['"]([^'"]*)['"]`).exec(block);
    return m ? m[2] : null;
  };

  const out = [];
  const broken = [];
  blocks.forEach((block, i) => {
    const id = field(block, 'id');
    const name = field(block, 'name');
    const grade = field(block, 'grade');
    // **블록은 있는데 필드를 못 읽으면 건너뛰지 않고 실패한다.** 조용히 빠지는 것이
    // 이 스크립트가 막으려는 바로 그 사고다
    if (!id || !name || !grade) {
      broken.push(`  ${i + 1}번째 항목: ${[!id && 'id', !name && 'name', !grade && 'grade'].filter(Boolean).join('·')} 를 읽지 못했다`);
      return;
    }
    out.push({
      id, name, grade,
      unreleased: flagOf(block, 'unreleased'), eventOnly: flagOf(block, 'eventOnly'), pickupOnly: flagOf(block, 'pickupOnly'),
    });
  });

  if (broken.length) {
    throw new Error(
      `CHARACTERS 항목 ${blocks.length}개 중 ${out.length}개만 읽었다:\n${broken.join('\n')}\n` +
      '  항목이 조용히 빠지면 그 캐릭터가 서버 명단에서 누락되고, 랭킹에 chibi 로 저장된다.',
    );
  }
  return out;
}

/**
 * `wallpaper.ts` 의 뽑기 배경화면 — WALLPAPERS 중 기본 제공(DEFAULT_WP_IDS)을 뺀 것 (= GACHA_WP_IDS).
 * (id, eventOnly) 를 정본 순서대로 돌려준다
 */
export function readGachaWallpapers() {
  const text = readLF(WP_SRC);
  const defaults = (/DEFAULT_WP_IDS\s*=\s*\[([^\]]*)\]/.exec(text)?.[1] ?? '').match(/wp_\w+/g) ?? [];
  if (defaults.length === 0) throw new Error('wallpaper.ts 에서 DEFAULT_WP_IDS 를 못 찾았다');
  const start = text.indexOf('export const WALLPAPERS');
  if (start < 0) throw new Error('wallpaper.ts 에서 WALLPAPERS 배열을 못 찾았다');
  const blocks = topLevelObjects(sliceArray(text.slice(start)));
  const out = [];
  blocks.forEach((block, i) => {
    const m = /(^|[{,\s])id\s*:\s*['"]([^'"]*)['"]/.exec(block);
    if (!m) throw new Error(`WALLPAPERS ${i + 1}번째 항목의 id 를 읽지 못했다 — 조용히 빠지면 서버 뽑기 풀에서 누락된다`);
    if (!defaults.includes(m[2])) out.push({ id: m[2], eventOnly: flagOf(block, 'eventOnly') });
  });
  if (out.length === 0) throw new Error('뽑기 배경화면을 하나도 읽지 못했다');
  return out;
}

/**
 * **문자열·주석 안을 공백으로 지운 사본.** 길이와 위치는 원본과 같다.
 *
 * 괄호 깊이를 셀 때 이걸 쓰고, 잘라낼 때는 원본을 쓴다. 안 그러면
 * `specialAbility: '... } ...'` 처럼 문자열 안에 든 괄호가 블록을 일찍 닫아
 * **뒤 항목이 통째로 빠진다** — 필드는 다 읽히니 예외도 안 난다 (리뷰 지적).
 * `//` 가 문자열 안에 있는 경우도 같은 이유로 여기서 함께 처리한다.
 */
export function maskCode(src, { keepStrings = false } = {}) {
  const out = src.split('');
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < src.length) {
    const ch = src[i];
    const nx = src[i + 1];
    if (ch === '/' && nx === '/') {
      let j = i + 2;
      while (j < src.length && src[j] !== '\n') j++;
      blank(i, j);
      i = j;
    } else if (ch === '/' && nx === '*') {
      let j = i + 2;
      while (j < src.length && !(src[j] === '*' && src[j + 1] === '/')) j++;
      blank(i, Math.min(j + 2, src.length));
      i = j + 2;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === quote) break;
        j++;
      }
      // `keepStrings` 면 문자열은 그대로 둔다 — 주석만 지운 사본이 필요할 때 쓴다
      // (배열 범위 안의 id 를 셀 때. 주석 속 id 를 세면 오탐이고, 문자열을 지우면 누락이다)
      if (!keepStrings) blank(i + 1, j);   // 따옴표 자체는 남긴다 — 리터럴 추출이 가능하게
      i = j + 1;
    } else {
      i++;
    }
  }
  return out.join('');
}

/**
 * `export const NAME ... = [ ... ];` 의 대괄호 안쪽만 잘라낸다 (CHARACTERS · WALLPAPERS).
 * **`=` 뒤에서 찾는다** — 앞에서 찾으면 타입 표기(`CharacterDef[]`)의 대괄호를 잡는다.
 */
function sliceArray(body) {
  const mask = maskCode(body);
  const eq = mask.indexOf('=');
  if (eq < 0) throw new Error('배열 선언에서 = 를 찾지 못했다');
  const open = mask.indexOf('[', eq);
  if (open < 0) throw new Error('배열의 여는 대괄호를 찾지 못했다');
  let depth = 0;
  for (let i = open; i < mask.length; i++) {
    const ch = mask[i];
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return body.slice(open + 1, i);
    }
  }
  throw new Error('배열이 닫히지 않았다');
}

/** 배열 안의 **최상위** `{ ... }` 덩어리들 (중첩 객체는 그 안에 포함된 채로) */
function topLevelObjects(arr) {
  const mask = maskCode(arr);   // 문자열 안의 괄호를 세지 않는다
  const out = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < mask.length; i++) {
    const ch = mask[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(arr.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return out;
}

export function render(roster, wallpapers) {
  const ids = roster.map(c => `  '${c.id}',`).join('\n');
  const grades = roster.map(c => `  ${(c.id + ':').padEnd(11)} '${c.grade}',`).join('\n');
  const flagged = roster.filter(c => c.unreleased || c.eventOnly || c.pickupOnly);
  const flags = flagged.map(c => {
    const f = [c.unreleased && 'unreleased: true', c.eventOnly && 'eventOnly: true', c.pickupOnly && 'pickupOnly: true']
      .filter(Boolean).join(', ');
    return `  ${(c.id + ':').padEnd(11)} { ${f} },`;
  }).join('\n');
  const wps = wallpapers.map(w => `  { id: '${w.id}'${w.eventOnly ? ', eventOnly: true' : ''} },`).join('\n');
  return `// 이 파일은 생성된 것이다. 손으로 고치지 마라.
//   생성: node scripts/gen-roster.mjs
//   정본: src/utils/character.ts 의 CHARACTERS · src/utils/wallpaper.ts 의 WALLPAPERS
//   검사: scripts/check-roster.mjs (verify.ps1 에 물려 있다)
//
// Edge Function 은 Deno 라 src/ 를 번들에 넣지 못한다. 그래서 서버가 캐릭터 명단을
// 알아야 할 때는 이 사본을 읽는다. 예전에는 명단을 손으로 베껴 뒀고, 그게 어긋나
// red·ted·heidi 로 플레이해도 랭킹에 chibi 로 저장됐다.

/** 게임에 등록된 캐릭터 id 전체 (${roster.length}종) */
export const CHARACTER_IDS: readonly string[] = [
${ids}
];

/** id → 등급 */
export const CHARACTER_GRADES: Readonly<Record<string, string>> = {
${grades}
};

/** 저장 허용 여부 — 모르는 id 는 거른다 */
export function isKnownCharacter(id: unknown): id is string {
  return typeof id === 'string' && CHARACTER_IDS.includes(id);
}

/** id → 뽑기 표식 — 미공개(unreleased) · 이벤트 전용(eventOnly) · 픽업 전용(pickupOnly). 표식이 있는 캐릭터만 적힌다 */
export const CHARACTER_FLAGS: Readonly<Record<string, { unreleased?: boolean; eventOnly?: boolean; pickupOnly?: boolean }>> = {
${flags}${flagged.length ? '\n' : ''}};

/** 뽑기 계산용 명단 — \`_shared/banners.ts\` 의 bannerRates · pityChoices 에 넘긴다 */
export const GACHA_ROSTER: readonly { id: string; grade: string; unreleased?: boolean; eventOnly?: boolean; pickupOnly?: boolean }[] =
  CHARACTER_IDS.map(id => ({ id, grade: CHARACTER_GRADES[id], ...CHARACTER_FLAGS[id] }));

/** 뽑기 배경화면 (기본 제공 배경 제외, ${wallpapers.length}종) — bannerRates 에 넘긴다 */
export const GACHA_WALLPAPERS: readonly { id: string; eventOnly?: boolean }[] = [
${wps}
];
`;
}

/** 배너 정의 서버 사본 — 머리말 + 정본 글자 그대로 */
export function renderBanners() {
  const src = readLF(BANNER_SRC);
  const code = maskCode(src);
  if (/(^|[;\s])import[\s{*'"(]/m.test(code) || /\brequire\s*\(/.test(code)) {
    throw new Error('src/config/banners.ts 에 import 가 있다 — 서버(Deno)로 그대로 옮길 수 없다. 명단은 인자로 받게 써라');
  }
  return `// 이 파일은 생성된 것이다. 손으로 고치지 마라.
//   생성: node scripts/gen-roster.mjs
//   정본: src/config/banners.ts (머리말 아래는 정본과 글자까지 같다)
//   검사: scripts/check-roster.mjs (verify.ps1 에 물려 있다)
//
// 화면의 확률 표와 서버의 추첨이 같은 bannerRates() 를 쓰도록 정본을 그대로 옮겨 둔다.
// 명단은 ./roster.ts 의 GACHA_ROSTER · GACHA_WALLPAPERS 를 넘긴다.

${src}`;
}

// `check-roster.mjs` 가 readRoster() 만 쓰려고 이 모듈을 import 한다.
// 가드가 없으면 import 만으로 파일을 생성해 버린다 — 검사가 대상을 고치면 안 된다.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

/** 생성물 [경로, 기대 내용, 설명] — check-roster.mjs 도 이걸로 비교한다 */
export function outputs() {
  const roster = readRoster();
  const wallpapers = readGachaWallpapers();
  return [
    [OUT, render(roster, wallpapers), `roster.ts (캐릭터 ${roster.length}종 · 뽑기 배경 ${wallpapers.length}종)`],
    [BANNER_OUT, renderBanners(), 'banners.ts (src/config/banners.ts 사본)'],
  ];
}

/** 파일이 기대 내용과 같은가 (줄바꿈 무시) */
export function isCurrent(path, next) {
  try {
    return readLF(path) === next;
  } catch {
    return false;
  }
}

function main() {
  const check = process.argv.includes('--check');
  let bad = 0;
  for (const [path, next, label] of outputs()) {
    const rel = path.slice(ROOT.length + 1).split('\\').join('/');
    if (check) {
      if (isCurrent(path, next)) {
        console.log(`OK    ${label} 최신`);
      } else {
        console.error(`FAIL  ${rel} 가 정본과 어긋난다 — node scripts/gen-roster.mjs 로 다시 생성해라.`);
        bad++;
      }
    } else {
      writeFileSync(path, next, 'utf8');
      console.log(`생성  ${rel} — ${label}`);
    }
  }
  if (bad) process.exit(1);
}
