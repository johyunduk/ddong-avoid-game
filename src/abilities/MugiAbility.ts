import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { MUGI_PARAMS } from '../config/abilityParams';
import { ensureGlowDot } from '../utils/glowDot';

// 옆면 연꽃 꽃잎 정의: [rotDeg, width, height, color, depthOffset]
// 꽃잎 바닥이 한 점에 모이고 각도 방향으로 뻗어나가는 형태
const LOTUS_DEFS: [number, number, number, number, number][] = [
  [ -68, 11, 30, 0xfff8e1, 0 ],
  [  68, 11, 30, 0xfff8e1, 0 ],
  [ -46, 10, 27, 0xfffde7, 1 ],
  [  46, 10, 27, 0xfffde7, 1 ],
  [ -26,  9, 24, 0xffffff, 2 ],
  [  26,  9, 24, 0xffffff, 2 ],
  [ -10,  8, 21, 0xffffff, 3 ],
  [  10,  8, 21, 0xffffff, 3 ],
  [   0,  7, 18, 0xffffff, 4 ],
];

interface YeoijuOrb {
  gfx: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
}

export class MugiAbility extends BaseAbility {
  private lastYeoijuScore  = 0;
  private yeoijuCount      = 0;
  private yeoijus: YeoijuOrb[] = [];
  private counterText: Phaser.GameObjects.Text | null = null;
  private normalPrefix     = 'mugi_';
  private isGoldForm       = false;
  private auraTimer        = 0;
  private revivalAuraTimer = 0;

  // Revival state
  private revivalCharges     = 1;   // 0 or 1 (max stored)
  private totalRevivalsUsed  = 0;   // lifetime cap: 3
  private revivalChargeCount = 0;   // yeoijus collected toward recharge
  private revivalText: Phaser.GameObjects.Text | null = null;

  override onCreate(api: GameSceneAPI): void {
    this.lastYeoijuScore    = 0;
    this.yeoijuCount        = 0;
    this.yeoijus            = [];
    this.counterText        = null;
    this.normalPrefix       = api.player.getTexturePrefix();
    this.isGoldForm         = false;
    this.auraTimer          = 0;
    this.revivalAuraTimer   = 0;
    this.revivalCharges     = 1;
    ensureGlowDot(api.scene);
    this.totalRevivalsUsed  = 0;
    this.revivalChargeCount = 0;
    this.revivalText        = null;

    this.counterText = api.scene.add.text(8, 80, `여의주 0/${MUGI_PARAMS.goldThreshold}`, {
      fontSize: '11px',
      color: '#ff88cc',
      stroke: '#000000',
      strokeThickness: 3,
    }).setDepth(500).setAlpha(0.88);

    this.revivalText = api.scene.add.text(8, 95, '♡ 부활', {
      fontSize: '11px',
      color: '#ff66bb',
      stroke: '#000000',
      strokeThickness: 3,
    }).setDepth(500).setAlpha(0.88);
  }

  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    const interval = this.isGoldForm ? MUGI_PARAMS.yeoijuGoldInterval : MUGI_PARAMS.yeoijuInterval;
    if (score % interval === 0 && score > this.lastYeoijuScore) {
      this.lastYeoijuScore = score;
      this._spawnYeoiju(api);
    }
  }

  override onUpdate(api: GameSceneAPI): void {
    this._updateYeoijus(api);
    this._tickAura(api);
  }

  override onHitPoop(api: GameSceneAPI): boolean {
    if (this.revivalCharges > 0 && this.totalRevivalsUsed < 3) {
      this._revive(api);
      return true;
    }
    return false;
  }

  // ── 여의주 ──────────────────────────────────────────────────────────

  private _spawnYeoiju(api: GameSceneAPI): void {
    const scene = api.scene;
    const x = Phaser.Math.Between(30, 370);

    const gfx = scene.add.graphics().setDepth(150);
    // 구체 본체 (짙은 검붉)
    gfx.fillStyle(0x550000, 1);    gfx.fillCircle(0, 0, 11);
    // 내부 광원 — 중앙 살짝 아래 오프셋 (속에서 빛나는 느낌)
    gfx.fillStyle(0xaa1100, 0.95); gfx.fillCircle(1, 2, 8);
    gfx.fillStyle(0xdd2200, 0.80); gfx.fillCircle(1, 2, 5);
    gfx.fillStyle(0xff5500, 0.55); gfx.fillCircle(1, 3, 2.5);
    // 반사 하이라이트 — 왼쪽 위 (구슬 3D 효과)
    gfx.fillStyle(0xffffff, 0.90); gfx.fillCircle(-3.5, -3.5, 2.5);
    gfx.fillStyle(0xffffff, 0.40); gfx.fillCircle(-2.5, -5, 1);
    gfx.setPosition(x, -20);

    scene.tweens.add({
      targets: gfx, alpha: { from: 0.72, to: 1 },
      yoyo: true, repeat: -1, duration: 720, ease: 'Sine.easeInOut',
    });

    this.yeoijus.push({ gfx, x, y: -20 });
  }

  private _updateYeoijus(api: GameSceneAPI): void {
    const delta = api.scene.game.loop.delta * 0.001;
    const { player } = api;
    const fallDelta = (api.baseSpeed + api.difficultyLevel * 40) * delta;
    const r2 = MUGI_PARAMS.yeoijuCollectRadius ** 2;
    const remaining: YeoijuOrb[] = [];

    for (const orb of this.yeoijus) {
      orb.y += fallDelta;
      orb.gfx.setPosition(orb.x, orb.y);

      const dx = player.x - orb.x;
      const dy = player.y - orb.y;
      if (dx * dx + dy * dy < r2) {
        this._collectYeoiju(orb, api);
        continue;
      }
      if (orb.y > 660) { orb.gfx.destroy(); continue; }
      remaining.push(orb);
    }
    this.yeoijus = remaining;
  }

  private _collectYeoiju(orb: YeoijuOrb, api: GameSceneAPI): void {
    this._spawnCollectEffect(orb.x, orb.y, api.scene);
    orb.gfx.destroy();
    api.addAbilityBonus(80);

    // Revival recharge: runs regardless of gold form
    if (this.revivalCharges === 0 && this.totalRevivalsUsed < 3) {
      this.revivalChargeCount++;
      if (this.revivalChargeCount >= MUGI_PARAMS.goldThreshold) {
        this.revivalCharges = 1;
        this.revivalChargeCount = 0;
        this._playRechargeGlow(api.player.x, api.player.y, api.scene);
      }
      this._updateRevivalUI();
    }

    if (this.isGoldForm) {
      this._strikeThunder(api, false);
      return;
    }

    this.yeoijuCount++;
    this._updateCounter();

    if (this.yeoijuCount >= MUGI_PARAMS.goldThreshold) {
      this._transformGold(api);
    } else {
      this._strikeRedLightning(api);
    }
  }

  // ── 기운 (아우라) 이펙트 ─────────────────────────────────────────────

  private _tickAura(api: GameSceneAPI): void {
    const level = this.isGoldForm ? 4 : Math.floor(this.yeoijuCount / 10);
    const delta = api.scene.game.loop.delta;

    // 레벨별 검은/금색 기운
    if (level > 0) {
      this.auraTimer += delta;
      const interval = Math.max(70, 400 - level * 70);
      if (this.auraTimer >= interval) {
        this.auraTimer -= interval;
        const color = this.isGoldForm ? 0xffdd00 : 0x8800ff;
        for (let i = 0; i < level; i++) {
          this._spawnAuraWisp(api.player.x, api.player.y, color, level, api.scene);
        }
      }
    }

    // 부활 충전 시 흰색 기운 (레벨 무관, 항상 일정 속도)
    if (this.revivalCharges > 0 && this.totalRevivalsUsed < 3) {
      this.revivalAuraTimer += delta;
      if (this.revivalAuraTimer >= 180) {
        this.revivalAuraTimer -= 180;
        this._spawnAuraWisp(api.player.x, api.player.y, 0xffffff, 3, api.scene);
        this._spawnAuraWisp(api.player.x, api.player.y, 0xffffff, 3, api.scene);
      }
    }
  }

  // glow_dot + ADD 블렌드로 여우불 질감 표현
  private _spawnAuraWisp(px: number, py: number, color: number, level: number, scene: Phaser.Scene): void {
    const angle  = Math.random() * Math.PI * 2;
    const spread = 18 + level * 4;
    const ox = px + Math.cos(angle) * Phaser.Math.Between(8, spread);
    const oy = py + Math.sin(angle) * Phaser.Math.Between(8, spread * 0.6);
    const sz  = Phaser.Math.FloatBetween(3, 5 + level * 0.6);
    const glowScale = sz / 28;

    // 외곽 글로우 (ADD 블렌드 — 뒤 화면색에 색을 더함)
    const img = scene.add.image(ox, oy, 'glow_dot')
      .setDepth(6)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setScale(glowScale);

    // 코어: 흰색 glow_dot으로 중심 강조 (Graphics → Image, 드로우콜 제거)
    const core = scene.add.image(ox, oy, 'glow_dot')
      .setDepth(7)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffffff)
      .setScale(glowScale * 0.32);

    const tx  = ox + Phaser.Math.Between(-14, 14);
    const ty  = oy - Phaser.Math.Between(22, 44);
    const dur = Phaser.Math.Between(480, 860);

    scene.tweens.add({
      targets: img, x: tx, y: ty, alpha: 0, scale: glowScale * 0.3,
      duration: dur, ease: 'Quad.easeOut',
      onComplete: () => { if (img.active) img.destroy(); },
    });
    scene.tweens.add({
      targets: core, x: tx, y: ty, alpha: 0, scale: 0,
      duration: dur, ease: 'Quad.easeOut',
      onComplete: () => { if (core.active) core.destroy(); },
    });
  }

  private _spawnCollectEffect(x: number, y: number, scene: Phaser.Scene): void {
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const g = scene.add.graphics().setDepth(160);
      g.fillStyle(0xff3333, 1);
      g.fillCircle(0, 0, Phaser.Math.Between(2, 4));
      g.setPosition(x, y);
      scene.tweens.add({
        targets: g,
        x: x + Math.cos(angle) * Phaser.Math.Between(12, 28),
        y: y + Math.sin(angle) * Phaser.Math.Between(12, 28),
        alpha: 0, scale: 0,
        duration: Phaser.Math.Between(200, 360),
        ease: 'Quad.easeOut',
        onComplete: () => g.destroy(),
      });
    }
  }

  private _updateCounter(): void {
    if (!this.counterText) return;
    this.counterText.setText(`여의주 ${this.yeoijuCount}/${MUGI_PARAMS.goldThreshold}`);
  }

  private _updateRevivalUI(): void {
    if (!this.revivalText) return;
    if (this.totalRevivalsUsed >= 3) {
      this.revivalText.setText('(부활 소진)').setColor('#666666');
    } else if (this.revivalCharges > 0) {
      this.revivalText.setText(`♡ 부활 (${3 - this.totalRevivalsUsed}회 남음)`).setColor('#ff66bb');
    } else {
      this.revivalText
        .setText(`○ 부활 충전 ${this.revivalChargeCount}/${MUGI_PARAMS.goldThreshold}`)
        .setColor('#aaaaaa');
    }
  }

  // ── 황금 변신 ────────────────────────────────────────────────────────

  private _transformGold(api: GameSceneAPI): void {
    this.isGoldForm = true;
    this.yeoijus.forEach(orb => orb.gfx.destroy());
    this.yeoijus = [];
    this.counterText?.setVisible(false);
    this._strikeThunder(api, true);
  }

  private _resetGoldForm(api: GameSceneAPI): void {
    this.isGoldForm = false;
    this.yeoijuCount = 0;
    api.player.setTexturePrefix(this.normalPrefix);
    this.counterText?.setVisible(true);
    this._updateCounter();
  }

  // ── 황금 번개 ────────────────────────────────────────────────────────

  // applyGoldSprite: true → 변신 시 (180ms 딜레이 후 gold 텍스처 적용), false → 이미 변신 상태
  private _strikeThunder(api: GameSceneAPI, applyGoldSprite: boolean): void {
    const { scene, player } = api;
    const tx = player.x;
    const ty = player.y;

    scene.cameras.main.flash(600, 255, 230, 0, true);

    const g = scene.add.graphics().setDepth(310);

    const makePts = (startX: number) => {
      const pts: { x: number; y: number }[] = [{ x: startX, y: -10 }];
      for (let i = 1; i < 17; i++) {
        const t = i / 17;
        const spread = 70 * (1 - t * 0.65);
        pts.push({ x: tx + Phaser.Math.Between(-spread, spread), y: (ty + 20) * t - 10 });
      }
      pts.push({ x: tx, y: ty + 8 });
      return pts;
    };

    const drawBolt = () => {
      g.clear();
      const pts = makePts(tx + Phaser.Math.Between(-25, 25));
      g.lineStyle(44, 0xffaa00, 0.09); this._drawPolyline(g, pts);
      g.lineStyle(22, 0xffcc00, 0.32); this._drawPolyline(g, pts);
      g.lineStyle(9,  0xffee44, 0.80); this._drawPolyline(g, pts);
      g.lineStyle(3,  0xffffff, 1.00); this._drawPolyline(g, pts);
      [3, 7, 11].forEach(bi => {
        if (bi >= pts.length - 1) return;
        const bp = pts[bi]!;
        const dir = Math.random() < 0.5 ? 1 : -1;
        const len = Phaser.Math.Between(55, 105);
        const bPts = [
          { x: bp.x, y: bp.y },
          { x: bp.x + dir * len * 0.35 + Phaser.Math.Between(-18, 18), y: bp.y + len * 0.33 },
          { x: bp.x + dir * len * 0.68 + Phaser.Math.Between(-12, 12), y: bp.y + len * 0.65 },
          { x: bp.x + dir * len + Phaser.Math.Between(-8, 8),          y: bp.y + len },
        ];
        g.lineStyle(9,   0xffcc00, 0.40); this._drawPolyline(g, bPts);
        g.lineStyle(3,   0xffee44, 0.75); this._drawPolyline(g, bPts);
        g.lineStyle(1.5, 0xffffff, 0.90); this._drawPolyline(g, bPts);
      });
    };

    drawBolt();
    [50, 100, 150, 200].forEach(delay => {
      scene.time.delayedCall(delay, () => {
        if (!scene.sys.isActive() || !g.active) return;
        drawBolt();
      });
    });

    scene.tweens.add({
      targets: g, alpha: 0, delay: 240, duration: 380, ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });

    const impact = scene.add.graphics().setDepth(308);
    impact.fillStyle(0xffee00, 0.7);
    impact.fillCircle(tx, ty, 55);
    scene.tweens.add({
      targets: impact, scaleX: 2.8, scaleY: 2.8, alpha: 0,
      duration: 500, ease: 'Quad.easeOut',
      onComplete: () => impact.destroy(),
    });

    const ring = scene.add.graphics().setDepth(309);
    ring.lineStyle(4, 0xffffff, 1);
    ring.strokeCircle(tx, ty, 40);
    scene.tweens.add({
      targets: ring, scaleX: 3.5, scaleY: 3.5, alpha: 0,
      duration: 450, ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });

    scene.time.delayedCall(180, () => {
      if (!scene.sys.isActive()) return;
      // 변신 도중 부활로 isGoldForm이 해제됐을 수 있으므로 확인
      if (applyGoldSprite && this.isGoldForm) {
        api.player.setTexturePrefix('gold_mugi_');
      }
      this._clearPoops(api, () => true, 20);
    });
  }

  // ── 검붉은 번개 (변신 전) ────────────────────────────────────────────

  private _strikeRedLightning(api: GameSceneAPI): void {
    const { scene, player } = api;
    const tx = player.x;
    const ty = player.y;

    scene.cameras.main.flash(250, 120, 0, 0, true);

    const g = scene.add.graphics().setDepth(310);

    // _strikeThunder와 동일한 형태, 색만 검붉은 팔레트
    const makePts = (startX: number) => {
      const pts: { x: number; y: number }[] = [{ x: startX, y: -10 }];
      for (let i = 1; i < 17; i++) {
        const t = i / 17;
        const spread = 70 * (1 - t * 0.65);
        pts.push({ x: tx + Phaser.Math.Between(-spread, spread), y: (ty + 20) * t - 10 });
      }
      pts.push({ x: tx, y: ty + 8 });
      return pts;
    };

    const drawRed = () => {
      g.clear();
      const pts = makePts(tx + Phaser.Math.Between(-25, 25));
      g.lineStyle(30, 0x440000, 0.09); this._drawPolyline(g, pts);
      g.lineStyle(14, 0x880000, 0.32); this._drawPolyline(g, pts);
      g.lineStyle(6,  0x080000, 0.92); this._drawPolyline(g, pts); // 코어 바로 외곽 — 진한 검정
      g.lineStyle(2,  0xff3311, 1.00); this._drawPolyline(g, pts);
      [3, 7, 11].forEach(bi => {
        if (bi >= pts.length - 1) return;
        const bp = pts[bi]!;
        const dir = Math.random() < 0.5 ? 1 : -1;
        const len = Phaser.Math.Between(55, 105);
        const bPts = [
          { x: bp.x, y: bp.y },
          { x: bp.x + dir * len * 0.35 + Phaser.Math.Between(-18, 18), y: bp.y + len * 0.33 },
          { x: bp.x + dir * len * 0.68 + Phaser.Math.Between(-12, 12), y: bp.y + len * 0.65 },
          { x: bp.x + dir * len + Phaser.Math.Between(-8, 8),          y: bp.y + len },
        ];
        g.lineStyle(6,   0x880000, 0.40); this._drawPolyline(g, bPts);
        g.lineStyle(2,   0x080000, 0.88); this._drawPolyline(g, bPts);
        g.lineStyle(1,   0xff3311, 0.90); this._drawPolyline(g, bPts);
      });
    };

    drawRed();
    [55, 110, 165].forEach(delay => {
      scene.time.delayedCall(delay, () => {
        if (!scene.sys.isActive() || !g.active) return;
        drawRed();
      });
    });

    scene.tweens.add({
      targets: g, alpha: 0, delay: 210, duration: 300, ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });

    const impact = scene.add.graphics().setDepth(308);
    impact.fillStyle(0xaa0000, 0.55);
    impact.fillCircle(tx, ty, 35);
    scene.tweens.add({
      targets: impact, scaleX: 2.2, scaleY: 2.2, alpha: 0,
      duration: 380, ease: 'Quad.easeOut',
      onComplete: () => impact.destroy(),
    });

    scene.time.delayedCall(180, () => {
      if (!scene.sys.isActive()) return;
      this._clearPoops(api, p => Math.abs(p.x - tx) <= 60, 10);
    });
  }

  // ── 공통 유틸 ────────────────────────────────────────────────────────

  private _clearPoops(
    api: GameSceneAPI,
    filter: (p: Phaser.Physics.Arcade.Sprite) => boolean,
    pointsPerPoop: number,
  ): void {
    const { poops, scene } = api;
    const targets = (poops.getChildren() as Phaser.Physics.Arcade.Sprite[])
      .filter(p => p.active && filter(p));

    if (targets.length === 0) return;

    // 위치를 먼저 저장한 뒤 즉시 재활용 — 피버 타임이 얼어있는 똥을
    // 특수 똥으로 변환하는 race condition을 원천 차단
    const positions = targets.map(p => ({ x: p.x, y: p.y }));
    targets.forEach(p => (p as unknown as PoolablePoopBase).recycle());

    // 잽 이펙트는 저장된 위치에서 독립적으로 재생
    positions.forEach(({ x, y }) => this._spawnZapEffect(x, y, scene));

    scene.time.delayedCall(450, () => {
      if (!scene.sys.isActive()) return;
      api.addAbilityBonus(positions.length * pointsPerPoop);
    });
  }

  private _drawPolyline(g: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[]): void {
    g.beginPath();
    g.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
    g.strokePath();
  }

  private _spawnZapEffect(x: number, y: number, scene: Phaser.Scene): void {
    const g = scene.add.graphics().setDepth(206);

    const draw = () => {
      g.clear();
      const sparks = Phaser.Math.Between(3, 5);
      for (let i = 0; i < sparks; i++) {
        const color = Math.random() < 0.55 ? 0xffee00 : 0xffffff;
        g.lineStyle(Phaser.Math.FloatBetween(1.5, 2.5), color, 1);
        g.beginPath();
        let px = x + Phaser.Math.Between(-7, 7);
        let py = y + Phaser.Math.Between(-7, 7);
        g.moveTo(px, py);
        for (let j = 0; j < 3; j++) {
          px += Phaser.Math.Between(-10, 10);
          py += Phaser.Math.Between(-10, 10);
          g.lineTo(px, py);
        }
        g.strokePath();
      }
    };

    draw();
    const timer = scene.time.addEvent({ delay: 80, repeat: 5, callback: draw });
    scene.time.delayedCall(550, () => {
      timer.remove();
      if (g.active) g.destroy();
    });
  }

  // ── 부활 시스템 ──────────────────────────────────────────────────────

  private _revive(api: GameSceneAPI): void {
    this.revivalCharges--;
    this.totalRevivalsUsed++;

    if (this.isGoldForm) {
      this._resetGoldForm(api);
    }
    this._updateRevivalUI();

    const { poops, scene } = api;

    // 전체 똥 즉시 제거
    (poops.getChildren() as Phaser.Physics.Arcade.Sprite[])
      .filter(p => p.active)
      .forEach(p => (p as unknown as PoolablePoopBase).recycle());

    // 화면 중앙으로 이동 + 연꽃 소환
    const centerX = scene.scale.width / 2;
    api.player.setX(centerX);

    scene.cameras.main.flash(350, 255, 220, 240, true);
    api.player.setInvincibleBriefly(2500);
    this._playRevivalLotus(centerX, api.player.y, scene);
  }

  private _playRevivalLotus(px: number, py: number, scene: Phaser.Scene): void {
    const LS = 2.2;                // 연꽃 전체 스케일
    const cx = px;
    const cy = py + 38;            // 플레이어 발 바닥 (displayH=80 → 중심 +40, base offset -2)

    // 꽃받침
    const base = scene.add.graphics().setDepth(352).setScale(0);
    base.fillStyle(0x66bb6a, 0.85); base.fillEllipse(0, 0, 28 * LS, 9 * LS);
    base.fillStyle(0x81c784, 0.6);  base.fillEllipse(0, -2 * LS, 16 * LS, 5 * LS);
    base.setPosition(cx, cy + 2);
    scene.tweens.add({ targets: base, scale: 1, duration: 220, ease: 'Back.easeOut' });

    // 금빛 중앙 글로우
    const glow = scene.add.graphics().setDepth(353).setScale(0);
    glow.fillStyle(0xffd700, 0.20); glow.fillCircle(0, 0, 30 * LS);
    glow.fillStyle(0xffe082, 0.35); glow.fillCircle(0, 0, 18 * LS);
    glow.fillStyle(0xffffff, 0.55); glow.fillCircle(0, 0,  8 * LS);
    glow.setPosition(cx, cy - 14 * LS);
    scene.tweens.add({ targets: glow, scale: 1, duration: 320, ease: 'Back.easeOut' });

    // sin(t*π) 곡선으로 양 끝 뾰족한 꽃잎 폴리곤
    const petalPts = (w: number, h: number): { x: number; y: number }[] => {
      const N = 16;
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        pts.push({ x:  (w / 2) * Math.sin(t * Math.PI), y: h / 2 - t * h });
      }
      for (let i = N - 1; i >= 0; i--) {
        const t = i / N;
        pts.push({ x: -(w / 2) * Math.sin(t * Math.PI), y: h / 2 - t * h });
      }
      return pts;
    };

    // 꽃잎: 바닥 한 점에서 각도 방향으로 뻗어나가는 옆면 형태
    const petalGfxs: Phaser.GameObjects.Graphics[] = [];
    LOTUS_DEFS.forEach(([rotDeg, w, h, color, depthOff], idx) => {
      const sw = w * LS;
      const sh = h * LS;
      const rotRad = rotDeg * Math.PI / 180;
      const ppx = cx + Math.sin(rotRad) * (sh / 2);
      const ppy = (cy + 2) - Math.cos(rotRad) * (sh / 2);

      const g = scene.add.graphics().setDepth(353 + depthOff);
      g.fillStyle(color, 0.92);
      g.fillPoints(petalPts(sw, sh), true);
      g.fillStyle(0xffffff, 0.45);
      g.fillPoints(petalPts(sw * 0.35, sh * 0.65), true);
      g.fillStyle(0xffd700, 0.18);
      g.fillEllipse(0, -(sh * 0.3), sw * 0.55, sh * 0.22);
      g.setPosition(ppx, ppy).setRotation(rotRad).setScale(0);

      scene.tweens.add({ targets: g, scale: 1, delay: idx * 40, duration: 280, ease: 'Back.easeOut' });
      petalGfxs.push(g);
    });

    // 수술
    const stamen = scene.add.graphics().setDepth(359).setScale(0);
    stamen.fillStyle(0xffd700, 1); stamen.fillCircle(0, 0, 5 * LS);
    stamen.fillStyle(0xffff99, 0.9); stamen.fillCircle(0, 0, 3 * LS);
    stamen.fillStyle(0xffffff, 0.7); stamen.fillCircle(-1 * LS, -1.5 * LS, 1.5 * LS);
    stamen.setPosition(cx, cy - 20 * LS);
    scene.tweens.add({
      targets: stamen, scale: 1,
      delay: LOTUS_DEFS.length * 40 - 20, duration: 220, ease: 'Back.easeOut',
    });

    // 900ms 후 조용히 페이드아웃
    const allObjs: Phaser.GameObjects.Graphics[] = [...petalGfxs, glow, base, stamen];
    scene.time.delayedCall(900, () => {
      if (!scene.sys.isActive()) return;
      allObjs.forEach(obj => {
        scene.tweens.add({
          targets: obj, alpha: 0,
          duration: 500, ease: 'Quad.easeIn',
          onComplete: () => { if (obj.active) obj.destroy(); },
        });
      });
    });
  }

  private _playRechargeGlow(px: number, py: number, scene: Phaser.Scene): void {
    const g = scene.add.graphics().setDepth(320);
    g.lineStyle(4, 0xff88cc, 1);
    g.strokeCircle(px, py, 30);
    scene.tweens.add({
      targets: g, scaleX: 2.5, scaleY: 2.5, alpha: 0,
      duration: 500, ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });
  }

  // ── 정리 ─────────────────────────────────────────────────────────────

  override onDestroy(api: GameSceneAPI): void {
    this.yeoijus.forEach(orb => orb.gfx.destroy());
    this.yeoijus = [];
    this.counterText?.destroy();
    this.counterText = null;
    this.revivalText?.destroy();
    this.revivalText = null;
    if (this.isGoldForm) {
      api.player.setTexturePrefix(this.normalPrefix);
      this.isGoldForm = false;
    }
  }
}
