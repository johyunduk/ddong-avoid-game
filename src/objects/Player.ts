import Phaser from 'phaser';

export default class Player extends Phaser.Physics.Arcade.Sprite {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private speed: number;
  private baseSpeed: number; // 기본 속도 저장
  private texturePrefix: string;
  private leftKeyDown: boolean = false;
  private rightKeyDown: boolean = false;
  private touchLeft: boolean = false;
  private touchRight: boolean = false;
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  // 캔버스 DOM 이벤트 (scene.input 우회 → 게임오브젝트 pointerdown 과 충돌 없음)
  private readonly canvas: HTMLCanvasElement;
  private canvasRect: DOMRect;
  private readonly onTouchTrack: (e: TouchEvent) => void;
  private readonly onInputEnd: () => void;
  private readonly onMouseDown: (e: MouseEvent) => void;
  private readonly onMouseMove: (e: MouseEvent) => void;
  private readonly onResize: () => void;

  // 현재 텍스처 방향 캐시 — setTexture를 매 프레임 호출하지 않기 위해
  private currentDir: string = 'front';

  // 아이템 효과 상태
  private isInvincible: boolean = false;
  private speedBoostActive: boolean = false;

  // 효과 타이머
  private invincibleTimer?: Phaser.Time.TimerEvent;
  private speedBoostTimer?: Phaser.Time.TimerEvent;
  private rainbowTimer?: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene, x: number, y: number, speed: number = 300, texturePrefix: string = '', displayW: number = 50, displayH: number = 80) {
    // 기본 텍스처는 front (정면)
    super(scene, x, y, `${texturePrefix}front`);
    this.speed = speed;
    this.baseSpeed = speed; // 기본 속도 저장
    this.texturePrefix = texturePrefix;

    // 씬에 추가
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // 캐릭터 크기 설정
    this.setDisplaySize(displayW, displayH);

    // 히트박스: 텍스처 해상도와 무관하게 world pixel 크기 고정
    // setSize/setOffset 은 frame pixel 단위이므로 scaleX/Y 로 역산
    // 목표 world 크기: 16×40 px, 중앙 정렬
    const sx = this.scaleX;
    const sy = this.scaleY;
    this.setSize(16 / sx, 40 / sy);
    this.setOffset((displayW - 16) / 2 / sx, (displayH - 40) / 2 / sy);

    // 물리 설정
    this.setCollideWorldBounds(true);
    this.setImmovable(true);

    // Phaser 키보드 입력
    this.cursors = scene.input.keyboard!.createCursorKeys();

    // window 레벨 키보드 이벤트 (canvas 포커스와 무관하게 동작)
    this.onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') this.leftKeyDown = true;
      if (e.key === 'ArrowRight') this.rightKeyDown = true;
    };
    this.onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') this.leftKeyDown = false;
      if (e.key === 'ArrowRight') this.rightKeyDown = false;
    };
    // capture: true → window capture phase는 이벤트 전파 최우선 단계
    // Vercel Preview 툴바 등 외부 스크립트가 ArrowLeft/Right를 가로채도 우선 실행됨
    window.addEventListener('keydown', this.onKeyDown, { capture: true });
    window.addEventListener('keyup', this.onKeyUp, { capture: true });

    // 터치/마우스를 캔버스 DOM 이벤트로 직접 추적
    // — scene.input.on() 을 쓰면 Phaser 내부 입력 파이프라인과 충돌해 게임오브젝트
    //   pointerdown(버튼 등)이 무시되는 버그가 발생하므로 DOM 레벨에서 처리
    this.canvas = scene.game.canvas;
    this.canvasRect = this.canvas.getBoundingClientRect();

    const applyDir = (clientX: number) => {
      const gameX = (clientX - this.canvasRect.left) * (scene.scale.width / this.canvasRect.width);
      const cx = scene.scale.width / 2;
      const newLeft  = gameX < cx;
      const newRight = gameX > cx;
      if (newLeft === this.touchLeft && newRight === this.touchRight) return;
      this.touchLeft  = newLeft;
      this.touchRight = newRight;
    };

    this.onTouchTrack = (e: TouchEvent) => {
      if (e.touches.length > 0) applyDir(e.touches[0].clientX);
    };
    this.onInputEnd  = () => { this.touchLeft = false; this.touchRight = false; };
    this.onMouseDown = (e: MouseEvent) => { applyDir(e.clientX); };
    this.onMouseMove = (e: MouseEvent) => { if (e.buttons > 0) applyDir(e.clientX); };
    this.onResize    = () => { this.canvasRect = this.canvas.getBoundingClientRect(); };

    const canvas = this.canvas;
    canvas.addEventListener('touchstart',  this.onTouchTrack, { passive: true });
    canvas.addEventListener('touchend',    this.onInputEnd);
    canvas.addEventListener('touchcancel', this.onInputEnd);
    canvas.addEventListener('touchmove',   this.onTouchTrack, { passive: true });
    canvas.addEventListener('mousedown',   this.onMouseDown);
    canvas.addEventListener('mouseup',     this.onInputEnd);
    canvas.addEventListener('mousemove',   this.onMouseMove);
    window.addEventListener('resize',      this.onResize);

    // shutdown은 restart/stop/destroy 시 항상 먼저 호출됨 → 한 번만 등록으로 충분
    scene.events.once('shutdown', this.removeListeners, this);
  }

  private removeListeners() {
    window.removeEventListener('keydown', this.onKeyDown, { capture: true });
    window.removeEventListener('keyup', this.onKeyUp, { capture: true });
    const canvas = this.canvas;
    canvas.removeEventListener('touchstart',  this.onTouchTrack);
    canvas.removeEventListener('touchend',    this.onInputEnd);
    canvas.removeEventListener('touchcancel', this.onInputEnd);
    canvas.removeEventListener('touchmove',   this.onTouchTrack);
    canvas.removeEventListener('mousedown',   this.onMouseDown);
    canvas.removeEventListener('mouseup',     this.onInputEnd);
    canvas.removeEventListener('mousemove',   this.onMouseMove);
    window.removeEventListener('resize',      this.onResize);
  }

  update() {
    let isMoving = false;
    let nextDir: string = this.currentDir;

    // 좌우 이동 (Phaser 키보드 OR window 레벨 키보드 둘 다 체크)
    if (this.cursors.left.isDown || this.leftKeyDown) {
      this.setVelocityX(-this.speed);
      nextDir = 'left';
      isMoving = true;
    } else if (this.cursors.right.isDown || this.rightKeyDown) {
      this.setVelocityX(this.speed);
      nextDir = 'right';
      isMoving = true;
    } else {
      this.setVelocityX(0);
    }

    if (this.touchLeft) {
      this.setVelocityX(-this.speed);
      nextDir = 'left';
      isMoving = true;
    } else if (this.touchRight) {
      this.setVelocityX(this.speed);
      nextDir = 'right';
      isMoving = true;
    }

    // 멈춰있을 때는 정면 이미지
    if (!isMoving && this.body?.velocity.x === 0) {
      nextDir = 'front';
    }

    // 방향이 실제로 바뀔 때만 setTexture 호출 (매 프레임 호출 방지)
    if (nextDir !== this.currentDir) {
      this.setTexture(`${this.texturePrefix}${nextDir}`);
      this.currentDir = nextDir;
    }
  }

  // 텍스처 프리픽스 변경 (골드 스프라이트 전환 등)
  setTexturePrefix(prefix: string): void {
    this.texturePrefix = prefix;
    this.setTexture(`${prefix}${this.currentDir}`);
  }

  getTexturePrefix(): string {
    return this.texturePrefix;
  }

  // 영구 기본 속도 보너스 추가 (구미 꼬리 능력 등)
  addPermanentSpeed(amount: number) {
    this.baseSpeed += amount;
    this.speed = this.speedBoostActive ? this.baseSpeed * 2 : this.baseSpeed;
  }

  // 헤르메스 신발 효과: 10초간 속도 2배 증가
  activateSpeedBoost(duration: number = 10000) {
    // 기존 타이머가 있으면 제거
    if (this.speedBoostTimer) {
      this.speedBoostTimer.remove();
    }

    // 속도 증가 (2배)
    this.speedBoostActive = true;
    this.speed = this.baseSpeed * 2;

    // 시각적 피드백: 노란색 틴트
    this.setTint(0xffff00);

    // 일정 시간 후 원래 속도로 복구
    this.speedBoostTimer = this.scene.time.addEvent({
      delay: duration,
      callback: () => {
        this.speedBoostActive = false;
        this.speed = this.baseSpeed;
        // 무적이 아니면 틴트 제거
        if (!this.isInvincible) {
          this.clearTint();
        } else {
          // 무적 효과만 남김
          this.setTint(0x00ffff);
        }
      },
      callbackScope: this
    });
  }

  // 무지개 별 효과: 5초간 무적
  activateInvincibility(duration: number = 5000) {
    // 기존 타이머가 있으면 제거
    if (this.invincibleTimer) {
      this.invincibleTimer.remove();
    }
    if (this.rainbowTimer) {
      this.rainbowTimer.remove();
    }

    // 무적 활성화
    this.isInvincible = true;

    // 무지개 색상 배열 (빨주노초파남보)
    const rainbowColors = [
      0xff0000, // 빨강
      0xff7700, // 주황
      0xffff00, // 노랑
      0x00ff00, // 초록
      0x00ffff, // 하늘
      0x0000ff, // 파랑
      0xff00ff  // 보라
    ];

    let colorIndex = 0;

    // 무지개 색상 순환 효과 (150ms마다 색상 변경)
    this.rainbowTimer = this.scene.time.addEvent({
      delay: 150,
      callback: () => {
        this.setTint(rainbowColors[colorIndex]);
        colorIndex = (colorIndex + 1) % rainbowColors.length;
      },
      callbackScope: this,
      loop: true
    });

    // 일정 시간 후 무적 해제
    this.invincibleTimer = this.scene.time.addEvent({
      delay: duration,
      callback: () => {
        this.isInvincible = false;
        // 무지개 타이머 정지
        if (this.rainbowTimer) {
          this.rainbowTimer.remove();
          this.rainbowTimer = undefined;
        }
        // 속도 증가가 아니면 틴트 제거
        if (!this.speedBoostActive) {
          this.clearTint();
        } else {
          // 속도 증가 효과만 남김
          this.setTint(0xffff00);
        }
      },
      callbackScope: this
    });
  }

  // 무적 상태 확인
  getIsInvincible(): boolean {
    return this.isInvincible;
  }

  // 시각 효과 없는 단순 무적 (센티넬 보호막 흡수용)
  setInvincibleBriefly(duration: number): void {
    if (this.invincibleTimer) {
      this.invincibleTimer.remove();
    }
    this.isInvincible = true;
    this.invincibleTimer = this.scene.time.addEvent({
      delay: duration,
      callback: () => { this.isInvincible = false; },
      callbackScope: this,
    });
  }

  // 효과 정리 (씬 종료 시)
  cleanupEffects() {
    if (this.speedBoostTimer) {
      this.speedBoostTimer.remove();
    }
    if (this.invincibleTimer) {
      this.invincibleTimer.remove();
    }
    if (this.rainbowTimer) {
      this.rainbowTimer.remove();
    }
  }
}
