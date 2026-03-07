import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import { GLITCH_PARAMS } from '../config/abilityParams';

/**
 * 글리치 (SR) — 분신 소환
 * ★0: 200점마다 1개  / ★1: 180점마다 1개
 * ★2: 160점마다 2개  / ★3: 140점마다 2개 + 분신 소멸 시 주변 일반 똥 2개 파괴
 */
export class GlitchAbility extends BaseAbility {
  private ghost?: Phaser.Physics.Arcade.Sprite;
  private posHistory: Array<{ x: number; y: number }> = [];
  private readonly TRAIL_FRAMES = 12; // ~0.2초 딜레이 (60fps 기준)


  override onCreate(api: GameSceneAPI): void {
    if (!api.isClassicMode) return;

    // 초기 위치는 플레이어와 동일하게 (히스토리가 쌓이면서 자연스럽게 딜레이 생김)
    this.ghost = api.scene.physics.add.sprite(api.player.x, api.player.y, 'glitch_front');
    this.ghost.setDisplaySize(60, 80).setAlpha(0.45).setDepth(5);

    // 중력 비활성화
    const body = this.ghost.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);

    // 일반 똥은 통과 (overlap 없음)
    // 특수 똥은 분신이 닿으면 전체 수집 처리 (카운트++, 점수, 획득 텍스트)
    const makeCollect = (
      collectFn: (p: Phaser.Physics.Arcade.Sprite) => void,
    ): Phaser.Types.Physics.Arcade.ArcadePhysicsCallback =>
      (_, p) => {
        const sp = p as Phaser.Physics.Arcade.Sprite;
        if (!sp.active) return;
        collectFn(sp);
      };
    api.scene.physics.add.overlap(this.ghost, api.goldPoops,    makeCollect(p => api.collectGoldPoop(p)));
    api.scene.physics.add.overlap(this.ghost, api.diamondPoops, makeCollect(p => api.collectDiamondPoop(p)));
    api.scene.physics.add.overlap(this.ghost, api.topazPoops,   makeCollect(p => api.collectTopazPoop(p)));
    api.scene.physics.add.overlap(this.ghost, api.rainbowPoops, makeCollect(p => api.collectRainbowPoop(p)));
  }

  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    if (!api.isClassicMode) return;
    if (score % GLITCH_PARAMS.collectInterval === 0) {
      this.collectSpecialWithGhost(api, GLITCH_PARAMS.collectCount);
    }
  }

  override onUpdate(api: GameSceneAPI): void {
    if (!this.ghost || !api.isClassicMode) return;
    // 현재 플레이어 위치를 히스토리에 기록
    this.posHistory.push({ x: api.player.x, y: api.player.y });
    if (this.posHistory.length > this.TRAIL_FRAMES) {
      // TRAIL_FRAMES 이전의 위치로 이동 → 약 0.2초 지연 잔상 효과
      const target = this.posHistory.shift()!;
      this.ghost.x = target.x;
      this.ghost.y = target.y;
    } else {
      // 히스토리가 쌓이기 전까지는 플레이어 위치 유지
      this.ghost.x = api.player.x;
      this.ghost.y = api.player.y;
    }
  }

  private collectSpecialWithGhost(api: GameSceneAPI, count: number): void {
    if (!this.ghost) return;

    const allSpecial = [
      ...api.goldPoops.getChildren(),
      ...api.diamondPoops.getChildren(),
      ...api.topazPoops.getChildren(),
      ...api.rainbowPoops.getChildren(),
    ].filter(p => (p as Phaser.GameObjects.GameObject).active) as Phaser.Physics.Arcade.Sprite[];

    if (allSpecial.length === 0) return;

    const targets = allSpecial.slice(0, count);

    targets.forEach(target => {
      const attackGhost = api.scene.add
        .image(target.x, target.y, 'glitch_front')
        .setDisplaySize(60, 80)
        .setAlpha(1.0)
        .setDepth(6);

      api.scene.time.delayedCall(1000, () => {
        attackGhost.destroy();
        if (!target.active) return;
        if (api.goldPoops.contains(target))         api.collectGoldPoop(target);
        else if (api.diamondPoops.contains(target)) api.collectDiamondPoop(target);
        else if (api.topazPoops.contains(target))   api.collectTopazPoop(target);
        else if (api.rainbowPoops.contains(target)) api.collectRainbowPoop(target);
      });
    });
  }
}
