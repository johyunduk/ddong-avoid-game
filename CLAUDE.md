# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Phaser 3 hyper-casual game ("Ddong Avoid Game") designed for Toss in-app integration. Players avoid falling obstacles and the difficulty increases over time.

## Development Commands

```bash
# Install dependencies
npm install

# Run development server (http://localhost:5173)
npm run dev

# Type check without emitting files
npx tsc --noEmit

# Build for production (outputs to dist/)
npm run build

# Preview production build
npm run preview
```

## TypeScript Configuration Constraints

This project uses **strict TypeScript settings** that require specific patterns:

### verbatimModuleSyntax = true
- Type-only imports MUST use the `type` keyword
- ✅ `import { type GameModeConfig } from '../types/GameMode'`
- ❌ `import { GameModeConfig } from '../types/GameMode'`

### erasableSyntaxOnly = true
- NO runtime-emitting TypeScript syntax allowed (no enums, namespaces, etc.)
- Use `const` objects with `as const` instead of enums
- ✅ `export const GameMode = { CLASSIC: 'classic' } as const`
- ❌ `export enum GameMode { CLASSIC = 'classic' }`

**Always run `npx tsc --noEmit` after making changes to verify TypeScript compliance.**

## Architecture

### Scene Flow
1. **ModeSelectScene** (entry point) → User selects game mode
2. **GameScene** → Main gameplay
3. Game over → Returns to ModeSelectScene

Both scenes are registered in `src/main.ts` with scene order: `[ModeSelectScene, GameScene]`.

### Game Configuration (main.ts)
- Canvas: 400×600px
- Background: #87CEEB (sky blue) - both scenes use `background.png` asset
- Physics: Arcade Physics with no gravity (falling objects have explicit Y velocity)
- World bounds: `physics.world.setBounds(15, 0, 370, 600)` - keeps player inside visible area
- Scale mode: FIT with auto-center

### Game Modes (types/GameMode.ts)
- **CLASSIC**: Standard mode (fully implemented)
- **ITEM**: Item-based mode (UI exists but disabled with "준비 중" label)

When adding item mode functionality:
1. Enable button in `ModeSelectScene.ts` by removing `isDisabled` check
2. Implement item spawning in `GameScene.spawnPoop()` method (see TODO comment at line 137-141)
3. Add item collision detection similar to poop collision

### Physics & Collision System

**Player Hitbox** (`objects/Player.ts:19-20`):
- Visual size: 60×80px
- Hitbox: 400×750px at offset (340, 200)
- Deliberately smaller than visual to make gameplay more forgiving
- Collides with world bounds

**Poop Hitbox** (`objects/Poop.ts:26`):
- Visual size: 40×40px
- Hitbox: 500×500px (much larger than visual)
- Does not collide with world bounds
- Auto-destroys when Y > screen height + 50

**Collision is detected via overlap** (GameScene.ts:64-70), not through collideWorldBounds.

### Difficulty Scaling
- Base difficulty: `difficultyLevel = 2`
- Every 10 seconds (GameScene.ts:101-106):
  - `difficultyLevel += 0.3`
  - Poop fall speed increases: `200 + (difficultyLevel * 40)` pixels/sec
  - Spawn delay decreases: `max(400ms, 1000 - (difficultyLevel * 80))`
- Each spawn creates 6 poops at random X positions between -200 to -20 Y

### Asset Loading

All assets are in `public/assets/`:
- `background.png` - City background (used in both scenes)
- `front.png`, `left.png`, `right.png` - Player sprites (directional)
- `poop.png` - Falling obstacle
- `poop.mp3` - Background music (loops at 0.5 volume)

Assets are loaded in scene `preload()` methods and referenced by string keys. The same asset key can be reused across scenes (cached by Phaser).

### Game State Management
- Score increases by 1 every 100ms (GameScene.ts:93-98)
- Game over state managed by `gameOver` boolean flag
- Physics pause on game over, resume on scene restart
- **IMPORTANT**: All sounds must be stopped with `this.sound.stopAll()` before scene transitions to prevent audio overlap

### Controls
- Keyboard: Left/Right arrow keys
- Touch/Mouse: Tap left/right side of screen (20px deadzone around player)
- Player speed: 300 px/sec constant

## Common Patterns

### Creating New Game Objects
```typescript
export default class NewObject extends Phaser.Physics.Arcade.Sprite {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'texture-key');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDisplaySize(width, height);
    // Hitbox: body.setSize() and setOffset()
  }

  update() {
    // Per-frame logic
  }
}
```

### Scene Transitions with Data
```typescript
// From scene A
this.scene.start('SceneB', { gameMode: GameMode.CLASSIC });

// In scene B
init(data: { gameMode?: GameMode }) {
  this.gameMode = data.gameMode;
}
```

### Adding New Scenes
1. Create scene class in `src/scenes/`
2. Import and add to scene array in `main.ts` config
3. Use `this.scene.start('SceneName')` to transition

## Future Toss SDK Integration

The codebase has placeholders for Toss Games SDK integration:
- Type definitions in `src/types/toss-sdk.d.ts`
- Mock utilities in `src/utils/tossSDK.ts`
- Commented code in `GameScene.hitPoop()` (line 204)

When integrating real Toss SDK:
1. Install `@toss/games-sdk`
2. Replace mock implementations in `utils/tossSDK.ts`
3. Uncomment SDK calls in GameScene
4. Register app in Toss Developer Console

npm run dev 는 내가 할거니 실행하지마