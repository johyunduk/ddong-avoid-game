import Phaser from 'phaser';

/**
 * 캐릭터 스프라이트 시트 애니메이션.
 *
 * 시트가 있는 캐릭터만 애니메이션으로 동작하고, 없으면 기존 정적 텍스처 경로를 그대로 쓴다.
 * 시트를 새로 넣을 때 손댈 곳은 `CHARS_WITH_ANIM_SHEETS` 한 줄이다.
 *
 * 에셋 규약: `public/assets/sheets/<id>_<dir>.png` + 같은 이름의 `.json`
 * JSON 에 frameWidth / frameHeight / frames / anims 가 들어 있다.
 */

const SHEET_DIR = 'assets/sheets/';

export const CHAR_ANIM_DIRS = ['front', 'left', 'right'] as const;
export type CharDir = typeof CHAR_ANIM_DIRS[number];
export type CharAnimName = 'idle' | 'walk' | 'hit';

/** 애니메이션 시트를 가진 캐릭터 (없는 캐릭터는 정적 텍스처로 동작) — 현재 전 캐릭터 */
export const CHARS_WITH_ANIM_SHEETS: readonly string[] = [
  'archieve', 'astronaut', 'branch', 'chibi', 'fork', 'glitch', 'gold_mugi',
  'gumi', 'hacker', 'hook', 'index', 'k', 'knight', 'ktei', 'ktei_ss',
  'legacy', 'log', 'maehwa', 'miner', 'mugi', 'noise', 'seed', 'sentinel',
  'session', 'socket', 'sum', 'swap',
];

interface SheetAnimDef {
  frames: number[];
  frameRate: number;
  repeat: number;
}

interface SheetDef {
  image?: string;
  frameWidth: number;
  frameHeight: number;
  frames?: string[];
  anims?: Record<string, SheetAnimDef>;
}

export function hasAnimSheets(id: string): boolean {
  return CHARS_WITH_ANIM_SHEETS.includes(id);
}

/** 시트 텍스처 키 — 기존 정적 텍스처 키와 겹치지 않게 접두사를 붙인다 */
export function sheetTextureKey(id: string, dir: CharDir): string {
  return `csheet_${id}_${dir}`;
}

function sheetJsonKey(id: string, dir: CharDir): string {
  return `csheetdef_${id}_${dir}`;
}

/** 애니메이션 키 (AnimationManager 는 전역이므로 캐릭터·방향까지 포함) */
export function charAnimKey(id: string, dir: CharDir, name: CharAnimName): string {
  return `canim_${id}_${dir}_${name}`;
}

/**
 * 씬 `preload()` 에서 호출. 시트가 없는 캐릭터면 아무것도 하지 않는다.
 *
 * 프레임 크기는 JSON 안에 있으므로 **JSON 먼저 → 도착하면 그 값으로 시트를 자른다**.
 * Phaser 로더는 진행 중에 추가된 파일을 같은 로드 사이클에서 처리한다.
 */
export function preloadCharSheets(scene: Phaser.Scene, id: string): void {
  if (!hasAnimSheets(id)) return;

  for (const dir of CHAR_ANIM_DIRS) {
    const texKey = sheetTextureKey(id, dir);
    if (scene.textures.exists(texKey)) continue; // 이미 로드됨 (씬 재시작 등)

    const jsonKey = sheetJsonKey(id, dir);
    const base = `${id}_${dir}`;

    // JSON 이 이미 캐시에 있으면(텍스처만 없는 경우) 바로 시트를 자른다
    const cached = scene.cache.json.get(jsonKey) as SheetDef | undefined;
    if (cached?.frameWidth && cached?.frameHeight) {
      scene.load.spritesheet(texKey, SHEET_DIR + (cached.image ?? `${base}.png`), {
        frameWidth: cached.frameWidth,
        frameHeight: cached.frameHeight,
      });
      continue;
    }

    scene.load.json(jsonKey, `${SHEET_DIR}${base}.json`);
    scene.load.once(`filecomplete-json-${jsonKey}`, () => {
      const def = scene.cache.json.get(jsonKey) as SheetDef | undefined;
      if (!def?.frameWidth || !def?.frameHeight) return;
      if (scene.textures.exists(texKey)) return;
      scene.load.spritesheet(texKey, SHEET_DIR + (def.image ?? `${base}.png`), {
        frameWidth: def.frameWidth,
        frameHeight: def.frameHeight,
      });
    });
  }
}

/**
 * JSON 정의로 애니메이션을 등록한다. 씬 `create()` 에서 호출.
 * @returns 세 방향 모두 준비됐으면 true — false 면 호출부는 정적 텍스처로 동작해야 한다
 */
export function ensureCharAnims(scene: Phaser.Scene, id: string): boolean {
  if (!hasAnimSheets(id)) return false;

  let ready = true;
  for (const dir of CHAR_ANIM_DIRS) {
    const texKey = sheetTextureKey(id, dir);
    const def = scene.cache.json.get(sheetJsonKey(id, dir)) as SheetDef | undefined;

    if (!scene.textures.exists(texKey) || !def?.anims) {
      ready = false;
      continue;
    }

    for (const name of Object.keys(def.anims)) {
      const animKey = charAnimKey(id, dir, name as CharAnimName);
      if (scene.anims.exists(animKey)) continue; // 전역 — 중복 생성 금지

      const a = def.anims[name];
      scene.anims.create({
        key: animKey,
        frames: a.frames.map(f => ({ key: texKey, frame: f })),
        frameRate: a.frameRate,
        repeat: a.repeat,
      });
    }
  }
  return ready;
}
