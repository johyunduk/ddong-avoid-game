import Phaser from 'phaser';

export default class Player extends Phaser.Physics.Arcade.Sprite {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private speed: number;
  private baseSpeed: number; // 기본 속도 저장
  private texturePrefix: string;

  // 아이템 효과 상태
  private isInvincible: boolean = false;
  private speedBoostActive: boolean = false;

  // 효과 타이머
  private invincibleTimer?: Phaser.Time.TimerEvent;
  private speedBoostTimer?: Phaser.Time.TimerEvent;
  private rainbowTimer?: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene, x: number, y: number, speed: number = 300, texturePrefix: string = '') {
    // 기본 텍스처는 front (정면)
    super(scene, x, y, `${texturePrefix}front`);
    this.speed = speed;
    this.baseSpeed = speed; // 기본 속도 저장
    this.texturePrefix = texturePrefix;

    // 씬에 추가
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // 캐릭터 크기 설정
    this.setDisplaySize(60, 80);

    // 히트박스를 몸통 중심부만 (더 작게)
    this.setSize(400, 550);
    this.setOffset(340,200);

    // 물리 설정
    this.setCollideWorldBounds(true);
    this.setImmovable(true);

    // 키보드 입력
    this.cursors = scene.input.keyboard!.createCursorKeys();
  }

  update() {
    let isMoving = false;

    // 좌우 이동
    if (this.cursors.left.isDown) {
      this.setVelocityX(-this.speed);
      this.setTexture(`${this.texturePrefix}left`); // 왼쪽 이미지
      isMoving = true;
    } else if (this.cursors.right.isDown) {
      this.setVelocityX(this.speed);
      this.setTexture(`${this.texturePrefix}right`); // 오른쪽 이미지
      isMoving = true;
    } else {
      this.setVelocityX(0);
    }

    // 터치/마우스 입력 처리 (화면 중앙 기준)
    if (this.scene.input.activePointer.isDown) {
      const pointerX = this.scene.input.activePointer.x;
      const screenCenter = this.scene.cameras.main.width / 2;

      if (pointerX < screenCenter) {
        this.setVelocityX(-this.speed);
        this.setTexture(`${this.texturePrefix}left`); // 왼쪽 이미지
        isMoving = true;
      } else if (pointerX > screenCenter) {
        this.setVelocityX(this.speed);
        this.setTexture(`${this.texturePrefix}right`); // 오른쪽 이미지
        isMoving = true;
      }
    }

    // 멈춰있을 때는 정면 이미지
    if (!isMoving && this.body?.velocity.x === 0) {
      this.setTexture(`${this.texturePrefix}front`);
    }
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
