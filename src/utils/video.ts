import Phaser from 'phaser';

/**
 * Video GameObject를 파괴하면서 재생 중 생성된 내부 텍스처까지 제거한다.
 *
 * Phaser의 Video는 인스턴스마다 랜덤 UUID 키(_key)로 전역 TextureManager에
 * WebGL 텍스처를 등록하는데, preDestroy()가 이 텍스처를 지우지 않는다.
 * 그대로 destroy()만 하면 재생 1회마다 (해상도 × 4바이트)의 GPU 텍스처가
 * 게임 수명 내내 누적된다 (832×1504 영상 기준 회당 약 5MB).
 */
export function destroyVideo(vid: Phaser.GameObjects.Video | null | undefined): void {
  if (!vid) return;
  const scene = vid.scene as Phaser.Scene | undefined;
  const texKey = (vid as unknown as { _key?: string })._key;
  if (vid.active) vid.destroy();
  if (scene && texKey && scene.textures.exists(texKey)) {
    scene.textures.remove(texKey);
  }
}
