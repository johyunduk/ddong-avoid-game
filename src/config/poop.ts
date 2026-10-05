/**
 * 똥(장애물) 설정
 *
 * 모든 똥 오브젝트(일반, 금똥, 다이아똥, 토파즈똥)의 크기, 속도, 히트박스 등을 관리합니다.
 * 게임 밸런싱 조정 시 이 파일만 수정하면 됩니다.
 */

export interface PoopConfig {
  /** 일반 똥 설정 */
  normal: {
    /** 기본 낙하 속도 */
    baseSpeed: number;
    /** 난이도 레벨당 속도 증가량 */
    speedIncrement: number;
    /** 일반 똥 표시 크기 — 크리스마스 똥도 같다 (그림 몸통이 14종 모두 같아서 따로 키우지 않는다) */
    size: {
      /** 기본 크기 */
      normal: number;
      /** EXTREME 난이도 크기 */
      extreme: number;
    };
    /** 히트박스 **폭** (텍스처 px) — 몸통 상자 비율로 높이를 정하고 몸통 가운데에 둔다 (PoolablePoopBase.fitBodyToPoop).
     *  몸통 폭(180)과 같게 하면 몸통 전체가 판정이다 */
    hitbox: {
      /** 기본 히트박스 */
      normal: number;
      /** EXTREME 난이도 히트박스 */
      extreme: number;
    };
  };
  /** 금똥 설정 */
  gold: {
    /** 기본 낙하 속도 */
    baseSpeed: number;
    /** 일반 똥 대비 속도 조정량 (양수: 느림, 음수: 빠름) */
    speedReduction: number;
    /** 표시 크기 */
    size: number;
    /** 히트박스 크기 (수집하기 쉽게 조금 넉넉) */
    hitbox: number;
    /** 렌더링 깊이 (다른 오브젝트 위에 표시) */
    depth: number;
  };
  /** 다이아똥 설정 */
  diamond: {
    /** 기본 낙하 속도 */
    baseSpeed: number;
    /** 일반 똥 대비 속도 조정량 (양수: 느림, 음수: 빠름) */
    speedReduction: number;
    /** 표시 크기 */
    size: number;
    /** 히트박스 크기 (수집하기 쉽게 조금 넉넉) */
    hitbox: number;
    /** 렌더링 깊이 (다른 오브젝트 위에 표시) */
    depth: number;
  };
  /** 토파즈똥 설정 */
  topaz: {
    /** 기본 낙하 속도 */
    baseSpeed: number;
    /** 일반 똥 대비 속도 조정량 (양수: 느림, 음수: 빠름) */
    speedReduction: number;
    /** 표시 크기 */
    size: number;
    /** 히트박스 크기 (수집하기 쉽게 조금 넉넉) */
    hitbox: number;
    /** 렌더링 깊이 (다른 오브젝트 위에 표시) */
    depth: number;
  };
  /** 무지개똥 설정 */
  rainbow: {
    /** 기본 낙하 속도 */
    baseSpeed: number;
    /** 일반 똥 대비 속도 조정량 (양수: 느림, 음수: 빠름) */
    speedReduction: number;
    /** 표시 크기 */
    size: number;
    /** 히트박스 크기 (수집하기 쉽게 조금 넉넉) */
    hitbox: number;
    /** 렌더링 깊이 (다른 오브젝트 위에 표시) */
    depth: number;
  };
  /** 화면 밖 제거 기준 (화면 하단 + 이 값) */
  destroyOffset: number;
}

/**
 * 똥 기본 설정
 *
 * @example
 * // 일반 똥: 40x40px, 히트박스 500x500
 * // 금똥: 40x40px, 히트박스 450x450, 일반보다 30 느림
 * // 다이아똥: 40x40px, 히트박스 450x450, 일반보다 10 느림
 * // 토파즈똥: 40x40px, 히트박스 450x450, 일반보다 20 빠름 (speedReduction: -20)
 */
/**
 * 똥 그림의 **몸통 상자** — 텍스처(256x256 캔버스) 픽셀. 14종 전부 같다 (builder poops/body.json).
 * 장식(안경·모자·뿔·수염·리본·반짝이)은 이 상자 밖으로 나간다 — 충돌 판정은 이 상자만 기준으로 한다.
 * 그림을 바꾸면 body.json 의 body 값을 여기에 옮긴다
 */
export const POOP_BODY = { left: 38, top: 62, right: 218, bottom: 230 } as const;

export const POOP_CONFIG: PoopConfig = {
  normal: {
    baseSpeed: 200,
    speedIncrement: 40,
    size: {
      normal: 40,
      extreme: 38
    },
    hitbox: {
      normal: 125,
      extreme: 118
    }
  },
  gold: {
    baseSpeed: 200,
    speedReduction: 30,
    size: 40,
    hitbox: 125,
    depth: 100
  },
  diamond: {
    baseSpeed: 200,
    speedReduction: 10,
    size: 40,
    hitbox: 125,
    depth: 100
  },
  topaz: {
    baseSpeed: 200,
    speedReduction: -160, // 사용자 요청에 따라 20 더 빠르게 (-140에서 -160으로)
    size: 40,
    hitbox: 125,
    depth: 100
  },
  rainbow: {
    baseSpeed: 200,
    speedReduction: 0, // 토파즈보다 조금 더 빠르게
    size: 40,
    hitbox: 125,
    depth: 100
  },
  destroyOffset: 50
};
