import Phaser from 'phaser';
import Poop from './Poop';
import { Difficulty } from '../types/GameMode';

export default class RainbowPoop extends Poop {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 1, Difficulty.HARD); // Pass default difficulty to match Poop constructor
    this.setTexture('rainbow_poop'); // Explicitly set rainbow poop texture
  }
}