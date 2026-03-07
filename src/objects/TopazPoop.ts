import Phaser from 'phaser';
import { POOP_CONFIG } from '../config/poop';
import PoolablePoopBase from './PoolablePoopBase';

export default class TopazPoop extends PoolablePoopBase {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'topaz_poop');

    this.setOrigin(0.5);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDisplaySize(POOP_CONFIG.topaz.size, POOP_CONFIG.topaz.size);
    this.setDepth(POOP_CONFIG.topaz.depth);

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setSize(POOP_CONFIG.topaz.hitbox, POOP_CONFIG.topaz.hitbox);
      body.setCollideWorldBounds(false);
    }

    this.setActive(false).setVisible(false);
    if (body) body.setEnable(false);
  }
}
