import Phaser from 'phaser';

/** 떠오르며 사라지는 모양 — 지금 자리에서 dy 만큼 위로 · 알파 0 (ms · Phaser ease 이름) */
export interface ScoreTextRise {
  dy: number;
  duration: number;
  ease: string;
}

/**
 * 점수 글자 '+N' 풀 (렉 수정 1차 4번, 2026-10-18).
 *
 * 지급마다 `scene.add.text` 로 새로 만들면 Phaser Text 는 만들 때마다 글꼴을 재고(MeasureText — 캔버스 getImageData)
 * 캔버스 · GPU 텍스처를 새로 만든다. 노이즈 돌풍 · 아카이브 분수 · 글리치 틈은 똥을 지운 **프레임마다** 한 장씩이었다.
 * 한 번 만든 글자는 숨겨 두었다가 글자 · 자리만 바꿔 다시 쓴다 (글자가 같으면 다시 그리지도 않는다).
 *
 * **보이는 것은 전과 같다** — 동시에 떠 있는 수만큼 늘어나고(상한 없음), 다시 쓸 때 표시 목록 맨 위로 올려
 * 새로 만든 글자와 같은 겹침 순서가 된다. 스타일 · 원점 · 깊이 · 떠오르는 트윈은 만드는 쪽이 준 그대로
 */
export class ScoreTextPool {
  private readonly style: Phaser.Types.GameObjects.Text.TextStyle;
  private readonly depth: number;
  private readonly rise: ScoreTextRise;
  private free: Phaser.GameObjects.Text[] = [];
  private all = new Set<Phaser.GameObjects.Text>();
  /** close 뒤 — 다 떠오른 글자는 숨기지 않고 부순다 */
  private closing = false;

  constructor(style: Phaser.Types.GameObjects.Text.TextStyle, rise: ScoreTextRise, depth = 200) {
    this.style = style;
    this.rise = rise;
    this.depth = depth;
  }

  /** (x, y) 에 글자를 띄워 떠오르며 사라지게 한다 */
  show(scene: Phaser.Scene, x: number, y: number, text: string): void {
    let txt = this.free.pop();
    while (txt && !txt.active) txt = this.free.pop();   // 씬과 함께 파기된 것은 버린다
    if (txt) {
      txt.setText(text).setPosition(x, y).setAlpha(1).setVisible(true);
      // 맨 위로 옮기고 **깊이 정렬을 다시 건다** — bringToTop 만으로는 정렬 표시가 안 서서(List.bringToTop)
      // 다음 정렬까지 깊이가 더 높은 오브젝트 위에 그려진다. setDepth 가 queueDepthSort 를 건다 (Depth 컴포넌트)
      scene.children.bringToTop(txt);
      txt.setDepth(this.depth);
    } else {
      txt = scene.add.text(x, y, text, this.style).setOrigin(0.5).setDepth(this.depth);
      this.all.add(txt);
    }
    const t = txt;
    scene.tweens.add({
      targets: t, y: y - this.rise.dy, alpha: 0, duration: this.rise.duration, ease: this.rise.ease,
      onComplete: () => {
        if (this.closing) { this.all.delete(t); t.destroy(); return; }
        t.setVisible(false);
        this.free.push(t);
      },
    });
  }

  /**
   * 판 끝 — 숨은 글자는 바로 부수고, 떠오르는 중인 글자는 **마저 떠오르다 사라진 뒤** 부순다
   * (판 끝에 글자를 끊지 않던 능력 — 센티넬 방전 글자 — 의 모습 그대로)
   */
  close(): void {
    this.closing = true;
    for (const t of this.free) { this.all.delete(t); if (t.active) t.destroy(); }
    this.free = [];
  }

  /** 판 끝 — 트윈과 같이 전부 파기 */
  destroy(): void {
    for (const t of this.all) { t.scene?.tweens.killTweensOf(t); t.destroy(); }
    this.all.clear();
    this.free = [];
  }
}
