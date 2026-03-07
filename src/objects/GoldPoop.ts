import Phaser from 'phaser';
import { POOP_CONFIG } from '../config/poop';
import PoolablePoopBase from './PoolablePoopBase';

export default class GoldPoop extends PoolablePoopBase {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'gold_poop');

    this.setOrigin(0.5);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDisplaySize(POOP_CONFIG.gold.size, POOP_CONFIG.gold.size);
    this.setDepth(POOP_CONFIG.gold.depth);

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setSize(POOP_CONFIG.gold.hitbox, POOP_CONFIG.gold.hitbox);
      body.setCollideWorldBounds(false);
    }

    this.setActive(false).setVisible(false);
    if (body) body.setEnable(false);
  }
}
