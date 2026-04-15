import Phaser from 'phaser';

/** 소프트 닷 텍스처를 최초 1회만 생성 — 이후엔 Phaser 텍스처 캐시에서 재사용 */
export function ensureGlowDot(scene: Phaser.Scene): void {
  if (scene.textures.exists('glow_dot')) return;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0,    'rgba(255,255,255,1.0)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  grad.addColorStop(0.7,  'rgba(255,255,255,0.2)');
  grad.addColorStop(1,    'rgba(255,255,255,0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  scene.textures.addCanvas('glow_dot', canvas);
}
