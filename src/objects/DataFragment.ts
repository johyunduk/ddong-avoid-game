import Phaser from 'phaser';
import PoolablePoopBase from './PoolablePoopBase';

const SIZE = 28;
const HITBOX = 22;
const DEPTH = 5;

export default class DataFragment extends PoolablePoopBase {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'data_fragment');

    this.setOrigin(0.5);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDisplaySize(SIZE, SIZE);
    this.setDepth(DEPTH);

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setSize(HITBOX, HITBOX);
      body.setCollideWorldBounds(false);
    }

    this.setActive(false).setVisible(false);
    if (body) body.setEnable(false);
  }
}
