/**
 * `src/utils/character.ts` → `supabase/functions/_shared/roster.ts` 생성.
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
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src', 'utils', 'character.ts');
const OUT = join(ROOT, 'supabase', 'functions', '_shared', 'roster.ts');

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

/** `character.ts` 의 CHARACTERS 배열에서 (id, name, grade, unreleased) 를 뽑는다 */
export function readRoster() {
  // CRLF 로 저장돼 있어도 같은 정규식이 맞도록 줄바꿈을 먼저 통일한다
  const text = readFileSync(SRC, 'utf8').split(CR + LF).join(LF);
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
    out.push({ id, name, grade, unreleased: /(^|[{,\s])unreleased\s*:\s*true/.test(block) });
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
 * `export const CHARACTERS ... = [ ... ];` 의 대괄호 안쪽만 잘라낸다.
 * **`=` 뒤에서 찾는다** — 앞에서 찾으면 타입 표기(`CharacterDef[]`)의 대괄호를 잡는다.
 */
function sliceArray(body) {
  const mask = maskCode(body);
  const eq = mask.indexOf('=');
  if (eq < 0) throw new Error('CHARACTERS 선언에서 = 를 찾지 못했다');
  const open = mask.indexOf('[', eq);
  if (open < 0) throw new Error('CHARACTERS 배열의 여는 대괄호를 찾지 못했다');
  let depth = 0;
  for (let i = open; i < mask.length; i++) {
    const ch = mask[i];
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return body.slice(open + 1, i);
    }
  }
  throw new Error('CHARACTERS 배열이 닫히지 않았다');
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

export function render(roster) {
  const ids = roster.map(c => `  '${c.id}',`).join('\n');
  const grades = roster.map(c => `  ${(c.id + ':').padEnd(11)} '${c.grade}',`).join('\n');
  return `// 이 파일은 생성된 것이다. 손으로 고치지 마라.
//   생성: node scripts/gen-roster.mjs
//   정본: src/utils/character.ts 의 CHARACTERS
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
`;
}

// `check-roster.mjs` 가 readRoster() 만 쓰려고 이 모듈을 import 한다.
// 가드가 없으면 import 만으로 파일을 생성해 버린다 — 검사가 대상을 고치면 안 된다.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
  const roster = readRoster();
  const next = render(roster);

  if (process.argv.includes('--check')) {
    let cur = '';
    try {
      cur = readFileSync(OUT, 'utf8');
    } catch {
      cur = '';
    }
    if (cur.split(CR + LF).join(LF) !== next) {
      console.error('FAIL  supabase/functions/_shared/roster.ts 가 character.ts 와 어긋난다.');
      console.error('      node scripts/gen-roster.mjs 로 다시 생성해라.');
      process.exit(1);
    }
    console.log(`OK    roster.ts 최신 (${roster.length}종)`);
  } else {
    writeFileSync(OUT, next, 'utf8');
    console.log(`생성  supabase/functions/_shared/roster.ts — ${roster.length}종`);
  }
}
