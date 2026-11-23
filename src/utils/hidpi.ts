import Phaser from 'phaser';

/**
 * 또렷하게 그리기 — 캔버스를 화면 배율(devicePixelRatio)만큼 촘촘하게 그리고, 장면 코드는 지금처럼 CSS px 좌표로 쓴다.
 *
 * 전에는 캔버스가 CSS 크기(최대 480 × 720)로 그려지고 브라우저가 배율만큼 늘려 보여서 글자 · 그림이 흐렸다
 * (윈도우 150% 에서 1.5배, 폰은 2~3배. 대표 2026-11-23 「화질이 원래 저렇게 안 좋아?」).
 *
 * 방식 — Phaser 3.90 에는 해상도 설정이 없어서 카메라 확대로 한다:
 * - 게임 크기(캔버스 픽셀) = CSS 크기 × DPR. 보이는 크기는 Scale zoom 1/DPR 로 CSS 크기 그대로 (main.ts)
 * - 장면마다 메인 카메라 zoom DPR · origin (0,0) → 월드 좌표 = CSS px (setupHiDpiCamera, BaseScene · BootScene 의 create)
 * - 장면 코드가 읽는 scene.scale.width/height 는 CSS 값 (useCssScale — 장면에 꽂히는 scale 을 감싼다.
 *   Phaser 안쪽은 sys.scale 을 쓰니 그대로 기기 픽셀)
 * - 포인터 x/y(downX · upX 포함)도 CSS 값, camera.getWorldPoint 는 CSS 화면 좌표를 받는다 (installHiDpi).
 *   Phaser 안에서 pointer.x 를 읽는 곳은 InputManager.hitTest(→ getWorldPoint) · 끌기 문턱 · CameraManager 의
 *   카메라 아래 판정뿐이라(3.90 기준) 셋 다 그대로 맞는다
 * - 글자는 Text 기본 resolution = DPR 로 촘촘하게 굽는다 (gameFont)
 *
 * ponytail: DPR 은 시작할 때 한 번 정한다 — 창을 배율 다른 모니터로 옮기면 새로 고쳐야 맞는다.
 * 상한 2 — 3배 폰에서 픽셀 수가 9배가 되면 게임 중 GPU 부담이 크다(배터리 버벅임 선례, main.ts render 주석).
 * 캔버스에 한 번 구운 판(bakeButton 등 1배 텍스처)과 RenderTexture 는 CSS 크기로 구워져 아직 조금 무르다
 */
export const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

let installed = false;

/** 포인터 좌표를 CSS 값으로 · 카메라 getWorldPoint 가 CSS 화면 좌표를 받게 — main.ts 에서 게임을 만들기 전에 한 번 */
export function installHiDpi(): void {
  if (installed || DPR === 1) return;
  installed = true;
  const P = Phaser.Input.Pointer.prototype as unknown as { position: Phaser.Math.Vector2 };
  Object.defineProperty(P, 'x', {
    configurable: true,
    get(this: { position: Phaser.Math.Vector2 }) { return this.position.x / DPR; },
    set(this: { position: Phaser.Math.Vector2 }, v: number) { this.position.x = v * DPR; },
  });
  Object.defineProperty(P, 'y', {
    configurable: true,
    get(this: { position: Phaser.Math.Vector2 }) { return this.position.y / DPR; },
    set(this: { position: Phaser.Math.Vector2 }, v: number) { this.position.y = v * DPR; },
  });
  const Cam = Phaser.Cameras.Scene2D.BaseCamera.prototype;
  const getWorldPoint = Cam.getWorldPoint;
  Cam.getWorldPoint = function <O extends Phaser.Math.Vector2>(this: Phaser.Cameras.Scene2D.BaseCamera, x: number, y: number, output?: O): O {
    return getWorldPoint.call(this, x * DPR, y * DPR, output) as O;
  };
  // 카메라 아래 포인터 판정 — Phaser 는 pointer.x/y 를 카메라 뷰포트(기기 px)와 견준다. 기기 px 로 넘긴다
  // (안 그러면 DPR 2 에서 캔버스 밖 포인터도 카메라 안으로 잡힌다 — 리뷰 HiDPI 1회차)
  const CM = Phaser.Cameras.Scene2D.CameraManager.prototype;
  const below = CM.getCamerasBelowPointer;
  CM.getCamerasBelowPointer = function (this: Phaser.Cameras.Scene2D.CameraManager, pointer: Phaser.Input.Pointer) {
    return below.call(this, { x: pointer.x * DPR, y: pointer.y * DPR } as Phaser.Input.Pointer);
  };
  // 흔들림 — Phaser 는 강도에 camera.width(기기 px) 와 zoom 을 곱하고, 그 오프셋을 확대된 행렬에 옮긴다.
  // 그래서 CSS 화면에서는 DPR² 배로 커진다 (DPR 2 에서 4배). 강도를 DPR² 로 나눠 DPR 1 과 같은 크기로 (리뷰 HiDPI 1회차)
  const Cam2D = Phaser.Cameras.Scene2D.Camera.prototype;
  const shake = Cam2D.shake;
  Cam2D.shake = function (this: Phaser.Cameras.Scene2D.Camera, duration?: number, intensity?: number | Phaser.Math.Vector2,
    force?: boolean, callback?: Phaser.Types.Cameras.Scene2D.CameraShakeCallback, context?: unknown) {
    const k = 1 / (DPR * DPR);
    const i = intensity ?? 0.05;   // Phaser 기본값 (Shake.start)
    const scaled = typeof i === 'number' ? i * k : new Phaser.Math.Vector2(i.x * k, i.y * k);
    return shake.call(this, duration, scaled, force, callback, context);
  };
}

const proxies = new WeakMap<Phaser.Scale.ScaleManager, Phaser.Scale.ScaleManager>();

/** width · height 만 CSS 값으로 돌려주는 ScaleManager 겉 — 나머지(on · off · 이벤트 등)는 진짜에 그대로 */
function cssView(real: Phaser.Scale.ScaleManager): Phaser.Scale.ScaleManager {
  let p = proxies.get(real);
  if (!p) {
    p = new Proxy(real, {
      get(t, k) {
        if (k === 'width') return t.width / DPR;
        if (k === 'height') return t.height / DPR;
        const v = Reflect.get(t, k, t);
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
    proxies.set(real, p);
  }
  return p;
}

/**
 * 장면의 this.scale 을 CSS 값 겉으로 — 장면 constructor 에서 부른다.
 * Phaser 는 장면을 띄울 때 scene.scale = sys.scale 로 **대입**해 꽂으니, 그 대입을 받아 겉을 돌려준다
 */
export function useCssScale(scene: Phaser.Scene): void {
  if (DPR === 1) return;
  let real: Phaser.Scale.ScaleManager | undefined;
  Object.defineProperty(scene, 'scale', {
    configurable: true,
    get: () => (real ? cssView(real) : real),
    set: (v: Phaser.Scale.ScaleManager) => { real = v; },
  });
}

/** 메인 카메라를 DPR 배 · 왼쪽 위 기준으로 — 월드 좌표 = CSS px. 장면 create 맨 앞에서 (장면을 다시 띄우면 카메라가 새로 생긴다) */
export function setupHiDpiCamera(scene: Phaser.Scene): void {
  if (DPR === 1) return;
  scene.cameras.main.setOrigin(0, 0).setZoom(DPR);
}
