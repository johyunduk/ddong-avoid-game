import Phaser from 'phaser';
import { POOP_CONFIG } from '../config/poop';
import PoolablePoopBase from './PoolablePoopBase';

export default class RainbowPoop extends PoolablePoopBase {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'rainbow_poop');

    this.setOrigin(0.5);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDisplaySize(POOP_CONFIG.rainbow.size, POOP_CONFIG.rainbow.size);
    this.setDepth(POOP_CONFIG.rainbow.depth);

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setSize(POOP_CONFIG.rainbow.hitbox, POOP_CONFIG.rainbow.hitbox);
      body.setCollideWorldBounds(false);
    }

    this.setActive(false).setVisible(false);
    if (body) body.setEnable(false);
  }
}
