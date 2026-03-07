import Phaser from 'phaser';
import { POOP_CONFIG } from '../config/poop';
import PoolablePoopBase from './PoolablePoopBase';

export default class DiamondPoop extends PoolablePoopBase {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'diamond_poop');

    this.setOrigin(0.5);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDisplaySize(POOP_CONFIG.diamond.size, POOP_CONFIG.diamond.size);
    this.setDepth(POOP_CONFIG.diamond.depth);

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setSize(POOP_CONFIG.diamond.hitbox, POOP_CONFIG.diamond.hitbox);
      body.setCollideWorldBounds(false);
    }

    this.setActive(false).setVisible(false);
    if (body) body.setEnable(false);
  }
}
