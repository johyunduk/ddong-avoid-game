import Phaser from 'phaser';

/**
 * **판이 시작된 뒤 텍스처를 한 장씩 나눠 올린다** (렉 조사 #5 — 판 시작 한 프레임에 몰면 GPU 업로드로 끊긴다).
 *
 * 한 장을 로더에 걸고 → 다 받으면(COMPLETE) `gapMs` 쉬고 → 다음 장. 이미 있는 키는 건너뛴다
 * (다시 하기 · 다른 화면에서 미리 받아 둔 경우). 매 프레임 능력의 onUpdate 에서 {@link step} 을 부른다.
 *
 * **판이 끝나면 {@link stop}** — 남은 큐를 버리고, 받는 중이던 한 장은 도착하면 바로 지운다.
 * 판이 끝난 뒤 늦게 도착한 텍스처가 다음 판의 캐릭터 해제(GameScene.releasePreviousCharacter)와 엇갈려
 * 지운 키를 다시 살리거나, 끝난 씬에 로드가 걸리지 않게 한다.
 *
 * 하네스 스텁처럼 로더에 start 가 없으면 걸자마자 다 받은 것으로 친다 (스텁은 키를 즉시 넣는다).
 */
export interface StagedItem {
  /** 다 올라왔는지 볼 텍스처 키 */
  key: string;
  /** 로더에 거는 일 (scene.load.spritesheet 등) — start 는 여기서 부르지 않는다 */
  enqueue: (scene: Phaser.Scene) => void;
}

export class StagedLoader {
  private queue: StagedItem[];
  private inflight: string | null = null;
  private nextAt: number;
  private stopped = false;

  private readonly scene: Phaser.Scene;
  private readonly gapMs: number;
  /** 한 장이 올라올 때마다 (애니메이션 등록 등) */
  private readonly onLoaded: (key: string) => void;

  constructor(
    scene: Phaser.Scene,
    items: StagedItem[],
    gapMs: number,
    startMs: number,
    onLoaded: (key: string) => void = () => {},
  ) {
    this.scene = scene;
    this.gapMs = gapMs;
    this.onLoaded = onLoaded;
    this.queue = items.filter(it => !scene.textures.exists(it.key));
    this.nextAt = scene.time.now + startMs;
    if (typeof scene.load.start !== 'function') {
      // 스텁 — 걸자마자 들어온다
      for (const it of this.queue) { it.enqueue(scene); this.onLoaded(it.key); }
      this.queue = [];
    }
  }

  /** 남은 것이 없고 받는 중도 아니다 */
  get done(): boolean {
    return this.queue.length === 0 && this.inflight === null;
  }

  step(): void {
    if (this.stopped || this.inflight !== null || this.scene.time.now < this.nextAt) return;
    let it = this.queue.shift();
    while (it && this.scene.textures.exists(it.key)) it = this.queue.shift();
    if (!it) return;
    const key = it.key;
    this.inflight = key;
    it.enqueue(this.scene);
    // 실패(404 등)해도 COMPLETE 는 온다 — 그 장만 빠지고 나머지는 계속
    this.scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.inflight = null;
      if (this.stopped) {
        // 판이 끝난 뒤 도착 — 바로 지운다 (다음 판의 해제와 엇갈리지 않게)
        if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
        return;
      }
      this.nextAt = this.scene.time.now + this.gapMs;
      this.onLoaded(key);
    });
    this.scene.load.start();
  }

  /** 판이 끝났다 — 큐를 버린다. 받는 중이던 한 장은 도착하는 대로 지운다 */
  stop(): void {
    this.stopped = true;
    this.queue = [];
  }
}
