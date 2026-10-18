import Phaser from 'phaser';

/**
 * 짧게 살다 사라지는 연출 오브젝트 풀 (렉 수정 1차 5번, 2026-10-18).
 *
 * 레거시 불꽃 오라 · 무기 아우라 · 구미 불티 · K 스파크 · 하이디 팔괘 손바닥이 0.1~0.3초마다(또는 똥 수만큼 한 프레임에)
 * 오브젝트를 만들고 트윈 끝에 부수기를 되풀이했다. 다 쓴 것은 숨겨 두었다가(숨김 = 빈 칸) 다시 꺼내 쓴다.
 *
 * **보이는 것은 새로 만든 것과 같아야 한다** — 꺼낼 때 표시 목록 맨 위로 올리고 깊이를 다시 건다
 * (setDepth 가 깊이 정렬을 다시 건다 — bringToTop 만으로는 안 선다). 그래서 같은 깊이 안에서도 새로 만든 오브젝트와
 * 같은 겹침 순서다. 상한은 없다 — 동시에 보이는 수만큼만 늘어난다. 텍스처 · 블렌드 같은 고정 속성은 make 가,
 * 자리 · 크기 · 색 · 알파처럼 쓸 때마다 바뀌는 것은 꺼낸 쪽이 매번 다시 건다
 */
export class FxPool<T extends Phaser.GameObjects.Image> {
  private items: T[] = [];
  private readonly make: (scene: Phaser.Scene) => T;
  /** close 뒤 — 돌려받는 것은 숨기지 않고 부순다 */
  private closing = false;

  constructor(make: (scene: Phaser.Scene) => T) {
    this.make = make;
  }

  /** 빈 칸을 꺼내거나 새로 만든다 — 보이게 · 같은 깊이 안 맨 위 · 깊이 depth */
  get(scene: Phaser.Scene, depth: number): T {
    let o = this.items.find(i => i.active && !i.visible);
    if (o) {
      scene.children.bringToTop(o);
    } else {
      o = this.make(scene);
      this.items.push(o);
    }
    // 새로 만든 것도 보임을 직접 세운다 — 숨김(빈 칸) 판정이 visible 하나라 기본값에 기대지 않는다
    o.setVisible(true).setDepth(depth);
    return o;
  }

  /** 다 쓴 것을 돌려놓는다 (숨김). close 뒤면 부순다 */
  release(o: T): void {
    if (this.closing) { this.drop(o); return; }
    if (o.active) o.setVisible(false);
  }

  /** 지금 보이는(쓰는 중인) 수 — 동시 상한 판정용 */
  busy(): number {
    let n = 0;
    for (const i of this.items) if (i.active && i.visible) n++;
    return n;
  }

  /** 하나를 아예 부순다 (풀에서도 뺀다) */
  drop(o: T): void {
    this.items = this.items.filter(i => i !== o);
    o.scene?.tweens.killTweensOf(o);
    if (o.active) o.destroy();
  }

  /** 숨어 있는 것만 부순다 — 쓰는 중인 것은 그대로 (하이디: 팔괘가 끝나면 네지 텍스처를 놓아 준다) */
  dropIdle(): void {
    for (const o of [...this.items]) if (!o.active || !o.visible) this.drop(o);
  }

  /**
   * 판 끝 (onDestroy) — 숨은 것은 바로 부수고, 아직 떠 있는 것은 **예전처럼 트윈을 마저 돌고** 돌려받을 때 부순다.
   * 예전 fxSprite · add.image 연출도 판 끝에 끊지 않고 사라질 때까지 두었다 — 그 모습 그대로, 남는 것은 없게
   */
  close(): void {
    this.closing = true;
    this.dropIdle();
  }

  /** 전부 부순다 */
  destroy(): void {
    for (const o of this.items) {
      o.scene?.tweens.killTweensOf(o);
      if (o.active) o.destroy();
    }
    this.items = [];
  }
}
