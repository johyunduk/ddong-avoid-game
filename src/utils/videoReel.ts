import Phaser from 'phaser';
import { getCharacterDef, type CharacterDef } from './character';
import { destroyVideo } from './video';

/**
 * 캐릭터 영상 줄 — 뽑기 로비(GachaScene) · 캐릭터 상세(CharacterSelectScene)가 같이 쓴다 (대표 2026-10-11 · 10-12).
 *
 * 규칙:
 * - **한 번에 영상 하나.** ids 를 차례로 한 번씩 재생하고, 끝나면 다음 캐릭터 일러스트로 짧게 크로스페이드(REEL_SEAM_FADE_MS)한 뒤
 *   그 캐릭터 영상을 처음부터 (일러스트 ≈ 영상 첫 프레임이라 이어져 보인다 — 끝 프레임에서 첫 프레임으로 툭 끊기지 않는다).
 *   같은 영상이면 같은 요소를 처음으로 돌려 다시 튼다 (다시 받지 않는다)
 * - **소리 없음** — setMute(true) · setVolume(0). loadURL 의 noAudio 는 요소만 음소거하고 Phaser 의 코드 음소거(_codeMuted)를
 *   세우지 않아서, 게임 소리를 켜면(GLOBAL_MUTE false) globalMute 가 음소거를 풀어 버린다
 * - **빈 화면 없음** — 첫 프레임 전 · 못 받음 · 자동재생 막힘 · 그림을 못 풂(metadata 의 videoWidth 0)이면 밑의 일러스트가 그대로 보인다.
 *   못 받은 캐릭터는 memo.failed, 자동재생 막힘은 memo.locked 에 적어 이 씬 실행 동안 다시 받지 않는다
 * - 영상은 anchor(바탕 일러스트) **바로 위**에 놓는다 — 위 · 아래 어둠 · 글자 · 버튼 밑. anchor 가 컨테이너 안이면 그 컨테이너 안에
 * - 화면 덮기(cover, 비율 유지 · 위쪽 focusY 기준) — 늘이지 않는다
 * - 내릴 때(destroy) 받던 것까지 끊는다 — Phaser 는 요소를 뗄 때 src 속성만 지워서 브라우저가 계속 받을 수 있다.
 *   그래서 src 를 지우고 load() 로 비운 뒤 destroyVideo (영상 텍스처(UUID 키)까지)
 * - 앱이 백그라운드로 가면 Phaser 가 게임과 같이 멈췄다 돌린다
 */

/** 첫 프레임이 나올 때 페이드 인 · 끝에서 다음 일러스트로 걷어 내는 크로스페이드 (ms) */
export const REEL_FADE_IN_MS = 250;
export const REEL_SEAM_FADE_MS = 500;

/** 씬이 실행 동안 들고 있는 기록 — init 에서 새로 만든다 */
export interface ReelMemo {
  /** 영상을 못 받은 캐릭터 — 다시 받지 않는다 */
  failed: Set<string>;
  /** 자동재생이 막혔다 (저전력 모드 등) — 다른 캐릭터 영상도 틀지 않는다 */
  locked: boolean;
}

export function newReelMemo(): ReelMemo {
  return { failed: new Set(), locked: false };
}

export interface VideoReelOptions {
  /** 차례로 돌 캐릭터 (하나면 자기를 되풀이) */
  ids: readonly string[];
  /** 영상을 그 바로 위에 놓을 바탕 일러스트 */
  anchor: Phaser.GameObjects.Image;
  /** 덮어 채울 칸 — anchor 와 같은 좌표계 (화면 또는 그 컨테이너). focusY = 세로 맞춤 기준 (0 위 ~ 1 아래) */
  area: { x: number; y: number; w: number; h: number; focusY: number };
  memo: ReelMemo;
  /** 영상 밑 바탕을 그 캐릭터 일러스트로 바꾸기 — 여럿을 번갈아 돌 때만 (크로스페이드의 도착 그림) */
  setBase?: ((def: CharacterDef, i: number) => void) | null;
  /** 영상 첫 프레임이 나왔다 (그 차례 캐릭터) */
  onFirstFrame?: (def: CharacterDef, i: number) => void;
  /** 이 차례 영상을 못 튼다 — 밑의 일러스트가 보인다 */
  onFallback?: () => void;
  /** 지금 다음 영상을 틀어도 되는가 — false 면 미뤘다가 resume() 때 이어 간다 (창이 떠 있을 때) */
  canPlay?: () => boolean;
}

export class VideoReel {
  /** 지금 차례 */
  i: number;
  /** 지금 영상 (없으면 null) */
  video: Phaser.GameObjects.Video | null = null;
  /** 창이 떠 있어 다음 영상을 미뤄 둠 */
  pending = false;
  private dead = false;
  private readonly scene: Phaser.Scene;
  private readonly opts: VideoReelOptions;

  constructor(scene: Phaser.Scene, opts: VideoReelOptions, start = 0) {
    this.scene = scene;
    this.opts = opts;
    this.i = start;
  }

  get ids(): readonly string[] { return this.opts.ids; }
  get anchor(): Phaser.GameObjects.Image { return this.opts.anchor; }

  start(): this {
    this.playClip();
    return this;
  }

  /** 그 차례로 바로 (사람이 골랐다) — 돌던 영상은 내린다 */
  jump(i: number): void {
    if (this.dead) return;
    this.i = i;
    this.pending = false;
    this.dropVideo();
    this.playClip();
  }

  /** 창이 떴다 — 영상을 멈춘다 */
  pause(): void {
    if (this.video?.active) this.video.setPaused(true);
  }

  /** 창이 닫혔다 — 미뤄 둔 다음 영상을 틀거나 멈춘 영상을 다시 */
  resume(): void {
    if (this.dead) return;
    if (this.pending) {
      this.pending = false;
      this.playClip();
    } else if (this.video?.active) {
      this.video.setPaused(false);
    }
  }

  /** 멈추고 내린다 (받던 것까지 끊는다). 다시 쓰지 않는다 */
  destroy(): void {
    this.dead = true;
    this.pending = false;
    this.dropVideo();
  }

  /** 지금 차례의 영상을 튼다 — 같은 영상이면 처음으로 돌려 다시, 아니면 새로 받는다. canPlay 가 false 면 미룬다 */
  private playClip(): void {
    if (this.dead) return;
    if (this.opts.canPlay && !this.opts.canPlay()) {
      this.pending = true;
      return;
    }
    const def = getCharacterDef(this.opts.ids[this.i]);
    const memo = this.opts.memo;
    if (!def.videoPath || memo.locked || memo.failed.has(def.id)) {
      this.opts.onFallback?.();
      return;
    }
    const vid = this.video;
    if (vid?.active && vid.video && vid.getData('path') === def.videoPath) {
      // 같은 영상 — 처음으로 돌려 다시 튼다. 일러스트(≈ 첫 프레임) 위로 첫 프레임이 나오면 짧게 페이드 인
      vid.video.requestVideoFrameCallback(() => {
        if (this.video === vid) this.scene.tweens.add({ targets: vid, alpha: 1, duration: REEL_FADE_IN_MS, ease: 'Quad.easeOut' });
      });
      vid.setCurrentTime(0);
      vid.play(false);
      return;
    }
    this.dropVideo();
    this.createVideo(def);
  }

  private createVideo(def: CharacterDef): void {
    const { anchor, area, memo } = this.opts;
    const path = def.videoPath ?? '';
    const vid = this.scene.add.video(area.x + area.w / 2, area.y).setOrigin(0.5, 0).setAlpha(0).setData('path', path);
    this.placeAboveAnchor(vid, anchor);
    this.video = vid;
    const fail = (locked: boolean) => () => {
      if (this.video !== vid) return;
      if (locked) memo.locked = true;
      else memo.failed.add(def.id);
      this.dropVideo();
      this.opts.onFallback?.();
    };
    vid.once('created', (_v: Phaser.GameObjects.Video, w: number, h: number) => {
      if (this.video !== vid || !w || !h) return;
      // 화면 덮기 — 일러스트와 같은 맞춤 (비율 유지, 위쪽 focusY 기준)
      const sc = Math.max(area.w / w, area.h / h);
      vid.setScale(sc).setY(area.y - (h * sc - area.h) * area.focusY);
      const i = this.i;
      this.opts.onFirstFrame?.(def, i);
      this.scene.tweens.add({
        targets: vid, alpha: 1, duration: REEL_FADE_IN_MS, ease: 'Quad.easeOut',
        onComplete: () => { if (this.video === vid) this.opts.setBase?.(def, i); },
      });
    });
    vid.on('complete', () => { if (this.video === vid) this.endClip(); });
    // 영상 트랙을 못 푼다 — 그 기기가 못 푸는 코덱이면 오류 없이 시간 · 소리만 흐르고 그림(videoWidth)이 0 이다.
    // 못 받음과 같이 일러스트로 둔다 (legacy · sentinel 이 HEVC 여서 실제로 그랬다 — 7355c449 에서 H.264 로 다시 인코딩)
    vid.once('metadata', () => { if (this.video === vid && vid.video && !vid.video.videoWidth) fail(false)(); });
    vid.once('locked', fail(true));
    vid.once('error', fail(false));
    vid.once('unsupported', fail(false));
    vid.loadURL(path, true);
    vid.setMute(true).setVolume(0);
    vid.play(false);
  }

  /**
   * anchor 바로 위로 — add.video 는 맨 위에 붙어서 그대로 두면 글자 · 버튼을 덮는다.
   * Phaser moveAbove 는 쓰지 않는다 — '이미 위에 있으면 그대로' 라서 맨 위에 붙은 새 영상은 안 내려온다 (두 번째 영상부터 화면을 덮었다)
   */
  private placeAboveAnchor(vid: Phaser.GameObjects.Video, anchor: Phaser.GameObjects.Image): void {
    if (!anchor.active) return;
    const parent = anchor.parentContainer;
    if (parent) {
      parent.addAt(vid, parent.getIndex(anchor) + 1);   // 컨테이너에 넣으면 화면 목록에서는 빠진다
      return;
    }
    const list = this.scene.children.list;
    list.splice(list.indexOf(vid), 1);
    list.splice(list.indexOf(anchor) + 1, 0, vid);
  }

  /** 영상 끝 — 밑에 다음 캐릭터 일러스트를 깔고(영상이 덮고 있어 안 보인다) 영상을 짧게 걷어 내 크로스페이드, 그다음 다음 영상 */
  private endClip(): void {
    const vid = this.video;
    if (!vid) return;
    const j = (this.i + 1) % this.opts.ids.length;
    this.opts.setBase?.(getCharacterDef(this.opts.ids[j]), j);
    this.scene.tweens.add({
      targets: vid, alpha: 0, duration: REEL_SEAM_FADE_MS, ease: 'Sine.easeInOut',
      onComplete: () => {
        if (this.dead || this.video !== vid) return;
        this.i = j;
        this.playClip();
      },
    });
  }

  private dropVideo(): void {
    const vid = this.video;
    this.video = null;
    if (!vid) return;
    this.scene.tweens.killTweensOf(vid);
    const el = vid.video;
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    destroyVideo(vid);
  }
}
