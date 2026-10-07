import { CHARACTERS, getCharacterDef } from './character';
import { CHAR_ANIM_DIRS, hasAnimSheets, sheetTextureKey } from './charAnim';
import { fxPickSheetKey, fxTextureKeysOf } from './vfx';

/**
 * **캐릭터 한 명이 판에서 올리는 텍스처 키** — 판을 다른 캐릭터로 시작할 때 이전 캐릭터 몫을
 * `textures.remove` 하기 위한 목록이다 (렉·메모리 조사 #1, ddong-fx-work/perf-leak/REPORT.md).
 *
 * 무엇을 올리는지는 `GameScene.preload` 가 정한다 — 여기는 **그 규칙을 그대로 따라** 키만 계산한다.
 * preload 에 새 종류를 더하면 여기도 같이 더한다.
 *
 * - `own`      이 캐릭터만 쓰는 정확한 키. 지워도 된다
 * - `prefixes` 판 시작·발동 때 **코드가 굽는** 키의 접두사 (배경마다 이름이 달라 정확한 키를 미리 모른다).
 *              `textures.getTextureKeys()` 에서 이 접두사로 시작하는 키를 지운다
 * - `shared`   다른 캐릭터도 같은 키를 올린다 — **지우지 않는다** (다음 캐릭터가 바로 다시 쓴다)
 *
 * 다른 **씬**도 쓰는 키(`<id>_front` — 수집·뽑기 화면 카드)는 `own` 에 넣었다. 지워도 그 씬이
 * 들어올 때 `textures.exists` 로 확인하고 다시 받는다 (재다운로드 비용만 있다).
 *
 * 텍스처를 지울 때는 그 텍스처를 프레임으로 쓰는 **애니메이션도 같이** 지워야 한다
 * (`canim_<id>_*`, 능력이 등록한 `heidi_*`·`red_*`, vfx 의 `fx_anim_<키>_<텍스처>`).
 * 남겨 두면 다음에 그 캐릭터로 돌아왔을 때 이미 있는 애니메이션이 지워진 프레임을 가리킨다.
 */
export interface CharacterTextureKeys {
  own: string[];
  prefixes: string[];
  shared: string[];
}

/** 능력이 판 시작·발동 때 캔버스로 굽는 키의 접두사 (TedAbility 의 상수와 같은 값) */
const BAKED_PREFIXES: Record<string, string[]> = {
  // 착지 흙더미·균열 (배경 팔레트별 `_<서명>`) · 소닉붐 테두리 · 수묵 진한 먹·흰 눈동자·아지랑이
  ted: ['ted_land_mound_', 'ted_land_crack_', 'ted_sonic_rim', 'ted_ink_iris_haze_', 'ted_ink_iris_core_', 'ted_ink_burst'],
};

/** GameScene.preload 규칙을 따라 한 캐릭터의 키를 모은다 (공유 판정 전) */
function rawKeys(id: string): string[] {
  const def = getCharacterDef(id);
  const keys: string[] = [];
  // 플레이어 정적 스프라이트 — chibi 는 폴백 키(접두사 없음)를 쓴다 (GameScene.CHARS_WITH_SPRITES)
  if (id === 'chibi') keys.push('front', 'left', 'right');
  else keys.push(`${id}_front`, `${id}_left`, `${id}_right`);
  for (const k of def.extraSprites ?? []) keys.push(k);
  // 걷기 시트 (csheet) — 본인 + 동반자(extraSheets). GameScene.getAnimSheetId 는 스프라이트가 있으면 본인 id
  for (const sid of [id, ...(def.extraSheets ?? [])]) {
    if (!hasAnimSheets(sid)) continue;
    for (const dir of CHAR_ANIM_DIRS) keys.push(sheetTextureKey(sid, dir));
  }
  // 능력 시트 — 칸을 골라 쓰는 fxpick · 재생용 fx 시트(코드로 굽는 것 포함) · 한 장 그림 · 큰 그림 시트
  for (const f of def.extraFxSheets ?? []) keys.push(fxPickSheetKey(f));
  for (const k of def.extraFxAnims ?? []) keys.push(...fxTextureKeysOf(k));
  keys.push(...Object.keys(def.extraImages ?? {}), ...Object.keys(def.extraSpriteSheets ?? {}));
  // 액티브 버튼 얼굴 칩 — 원본 + 굽는 둥근 판 (GameScene: hud_facesrc_<id> → hud_face_<id>_22)
  keys.push(`hud_facesrc_${id}`, `hud_face_${id}_22`);
  return [...new Set(keys)];
}

let useCount: Map<string, number> | null = null;

/** 키마다 몇 캐릭터가 올리는가 — 한 번만 센다 (명단은 실행 중 안 바뀐다) */
function counts(): Map<string, number> {
  if (useCount) return useCount;
  useCount = new Map();
  for (const c of CHARACTERS) for (const k of rawKeys(c.id)) useCount.set(k, (useCount.get(k) ?? 0) + 1);
  return useCount;
}

export function getCharacterTextureKeys(id: string): CharacterTextureKeys {
  const n = counts();
  const own: string[] = [];
  const shared: string[] = [];
  for (const k of rawKeys(id)) ((n.get(k) ?? 0) > 1 ? shared : own).push(k);
  return { own, prefixes: BAKED_PREFIXES[id] ?? [], shared };
}
