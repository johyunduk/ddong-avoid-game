import Phaser from 'phaser';

/**
 * Video GameObject를 파괴하면서 재생 중 생성된 내부 텍스처까지 제거한다.
 *
 * Phaser의 Video는 인스턴스마다 랜덤 UUID 키(_key)로 전역 TextureManager에
 * WebGL 텍스처를 등록하는데, preDestroy()가 이 텍스처를 지우지 않는다.
 * 그대로 destroy()만 하면 재생 1회마다 (해상도 × 4바이트)의 GPU 텍스처가
 * 게임 수명 내내 누적된다 (832×1504 영상 기준 회당 약 5MB).
 *
 * 요소도 비운다 — Phaser 는 요소를 뗄 때 src 속성만 지우고 load() 를 부르지 않아서, 요소가 받던 것 · 디코더를
 * GC 될 때까지 쥔다 (10연차면 영상 요소가 연달아 최대 11개). videoReel 과 같은 정리 (2026-10-18 렉 점검)
 */
export function destroyVideo(vid: Phaser.GameObjects.Video | null | undefined): void {
  if (!vid) return;
  const scene = vid.scene as Phaser.Scene | undefined;
  const texKey = (vid as unknown as { _key?: string })._key;
  const el = vid.video;
  if (vid.active) vid.destroy();
  releaseVideoElement(el);
  if (scene && texKey && scene.textures.exists(texKey)) {
    scene.textures.remove(texKey);
  }
}

/** 영상 요소를 비운다 — 멈추고 src 를 지우고 load() 로 받던 것 · 디코더를 놓게 한다. 두 번 불려도 된다 */
export function releaseVideoElement(el: HTMLVideoElement | null | undefined): void {
  if (!el) return;
  el.pause();
  el.removeAttribute('src');
  el.load();
}

/**
 * 누가 부수든 요소 · UUID 텍스처까지 놓게 한다 — 만든 직후(요소가 있을 때) 부른다.
 * 씬이 닫힐 때는 DisplayList 의 SHUTDOWN 리스너가 씬의 리스너보다 먼저 돌아 영상이 이미 부서져 있고,
 * 그때는 요소 · 씬이 비어 destroyVideo 로는 못 지운다 — 그래서 영상의 DESTROY 에서 잡아 둔 것으로 정리한다
 */
export function releaseOnDestroy<T extends Phaser.GameObjects.Video>(vid: T): T {
  const el = vid.video;
  const texKey = (vid as unknown as { _key?: string })._key;
  const textures = vid.scene.sys.textures;
  vid.once(Phaser.GameObjects.Events.DESTROY, () => {
    releaseVideoElement(el);
    if (texKey && textures.exists(texKey)) textures.remove(texKey);
  });
  return vid;
}
