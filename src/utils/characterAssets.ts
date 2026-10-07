import Phaser from 'phaser';
import { getCharacterDef } from './character';
import { getCharacterTextureKeys } from './characterTextures';
import { preloadCharSheets } from './charAnim';
import { loadFxPickSheet, preloadFxSheet } from './vfx';

/**
 * 판 캐릭터 에셋 — **올리기와 내리기를 한 곳에서** (렉·메모리 조사 #1 · #7, ddong-fx-work/perf-leak/REPORT.md).
 *
 * 전에는 판에 쓴 캐릭터 텍스처가 판이 끝나도 남았다. 캐릭터를 바꿀 때마다 쌓여 17종이면 GPU 약 289MB
 * (테드 +97MB · 하이디 +62MB). 이제 **다른 캐릭터로 판을 준비할 때** 이전 캐릭터 몫을 내린다 — 상한은 공통 + 캐릭터 하나.
 * 같은 캐릭터로 다시 하기 · 메뉴 왕복은 그대로 둔다.
 *
 * 어느 키가 그 캐릭터 몫인지는 characterTextures.getCharacterTextureKeys (fx) 가 정한다 — 공통 키(똥 · HUD · 배경)와
 * 여러 캐릭터가 같이 쓰는 키(shared)는 거기 안 들어 있으니 여기서 지울 일이 없다.
 *
 * **언제 지우나** — 다음 판을 준비하는 씬의 preload (난이도 화면 · GameScene). 그때는 이전 GameScene 이 이미
 * 끝나 그 텍스처를 그리는 오브젝트가 없다. 판 안에서나 버튼 처리 중에 지우면 남은 오브젝트가 사라진 텍스처를
 * 그리다 'glTexture' null 로 렌더러가 멈춘다 (게임오버 메인 메뉴 버그, a99cd14d).
 *
 * **미리 올리기 (#7)** — 난이도 화면 preload 에서도 loadCharacterAssets 를 부른다. 난이도를 고르는 동안 받아 두면
 * 판 첫 1초에 업로드가 몰리지 않는다. GameScene 은 이미 있으면 건너뛴다 (fallback).
 */

/** 지금 GPU 에 올라가 있는 판 캐릭터 — 모듈에 둔다 (씬이 바뀌어도 남아야 한다) */
let loadedCharId: string | null = null;

/** 이전 판 캐릭터와 다르면 그 캐릭터 전용 텍스처 · 그 텍스처를 쓰는 애니메이션을 내린다 */
export function releasePreviousCharacter(scene: Phaser.Scene, nextId: string): string[] {
  const prev = loadedCharId;
  loadedCharId = nextId;
  if (!prev || prev === nextId) return [];

  const { own, prefixes } = getCharacterTextureKeys(prev);
  // 다음 캐릭터도 쓰는 키는 남긴다 (own 은 정의상 한 캐릭터 몫이지만, 혹시 겹쳐도 안전하게)
  const keep = new Set(Object.values(getCharacterTextureKeys(nextId)).flat());
  const targets = new Set(own.filter(k => !keep.has(k)));
  if (prefixes.length) {
    for (const k of scene.textures.getTextureKeys()) if (prefixes.some(p => k.startsWith(p))) targets.add(k);
  }
  const removed: string[] = [];
  for (const k of targets) {
    if (scene.textures.exists(k)) { scene.textures.remove(k); removed.push(k); }
  }
  if (removed.length === 0) return removed;

  // 지운 텍스처를 프레임으로 쓰는 애니메이션도 지운다 — 남으면 그 캐릭터로 돌아왔을 때
  // 이미 있는 애니메이션(anims.exists)을 그대로 써서 지워진 프레임을 그린다
  const gone = new Set(removed);
  // (공개 API toJSON — 애니메이션마다 프레임의 key 가 텍스처 키다)
  const animKeys = scene.anims.toJSON().anims
    .filter(a => a.frames.some(f => gone.has(f.key)))
    .map(a => a.key);
  for (const k of animKeys) scene.anims.remove(k);
  return removed;
}

/**
 * 판 캐릭터 에셋 올리기 — 스프라이트 · 걷기 시트 · 동반자 시트 · 능력 시트 · 한 장 그림 · 큰 그림 시트 · 얼굴 칩.
 * 먼저 이전 캐릭터 몫을 내린다. preload 안에서 부른다 (이미 있는 키는 건너뛴다)
 */
export function loadCharacterAssets(scene: Phaser.Scene, charId: string, opts: { deferred?: boolean } = {}): void {
  releasePreviousCharacter(scene, charId);
  const def = getCharacterDef(charId);
  // 플레이어 스프라이트 — chibi 는 접두사 없는 폴백 키
  const p = charId === 'chibi' ? '' : `${charId}_`;
  const file = charId === 'chibi' ? 'chibi_' : p;
  for (const dir of ['front', 'left', 'right']) {
    if (!scene.textures.exists(`${p}${dir}`)) scene.load.image(`${p}${dir}`, `assets/players/${file}${dir}.webp`);
  }
  // 변신·동반자 등 추가 스프라이트 (mugi 황금변신, k 태이/초사이언 등)
  for (const key of def.extraSprites ?? []) {
    if (!scene.textures.exists(key)) scene.load.image(key, `assets/players/${key}.webp`);
  }
  // 캐릭터 애니메이션 시트 — 시트가 있는 캐릭터만, 없으면 조용히 건너뜀. 동반자 시트(k 의 태이 등)도
  preloadCharSheets(scene, charId);
  for (const id of def.extraSheets ?? []) preloadCharSheets(scene, id);
  // 능력이 프레임을 골라 쓰는 시트 (테드의 체스 말) · 전용 재생 시트 (테드의 체스 큐브)
  for (const f of def.extraFxSheets ?? []) loadFxPickSheet(scene, f);
  for (const key of def.extraFxAnims ?? []) preloadFxSheet(scene, key);
  // 능력 전용 한 장 그림 (테드 어센트 컷인 일러스트)
  for (const [key, path] of Object.entries(def.extraImages ?? {})) {
    if (!scene.textures.exists(key)) scene.load.image(key, path);
  }
  // 능력 전용 큰 그림 시트 (테드 수묵 컷신) — 칸 크기는 파일 이름 끝 `_WxH`. 한 변 2048 이하로 묶는다
  for (const [key, path] of Object.entries(def.extraSpriteSheets ?? {})) {
    const m = /_(\d+)x(\d+)\.\w+$/.exec(path);
    if (m && !scene.textures.exists(key)) scene.load.spritesheet(key, path, { frameWidth: Number(m[1]), frameHeight: Number(m[2]) });
  }
  // 판 시작 뒤 능력이 한 장씩 올리는 큰 시트 (테드 수묵 — deferredSpriteSheets, 렉 #5).
  // GameScene.preload 에서는 올리지 않는다 (판 시작 한 프레임에 다시 몰린다). 난이도 화면의 뒤 받기에서만 미리 받는다 —
  // 능력은 이미 있는 키를 건너뛴다
  if (opts.deferred) {
    for (const [key, path] of Object.entries(def.deferredSpriteSheets ?? {})) {
      const m = /_(\d+)x(\d+)\.\w+$/.exec(path);
      if (m && !scene.textures.exists(key)) scene.load.spritesheet(key, path, { frameWidth: Number(m[1]), frameHeight: Number(m[2]) });
    }
  }
  // 액티브 버튼 얼굴 칩 (ui/collection/face 128px — 얼굴 파일이 없는 캐릭터는 로드 실패로 넘어간다)
  if (!scene.textures.exists(`hud_facesrc_${charId}`)) scene.load.image(`hud_facesrc_${charId}`, `assets/ui/collection/face/${charId}.webp`);
}
