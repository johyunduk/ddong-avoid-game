import { BaseAbility } from './BaseAbility';
import type { SpecialPoopType } from './types';

/**
 * R등급 공통 — 특수 똥(금·다이아·토파즈·무지개) 수집 시 +1점
 */
export class RGradeAbility extends BaseAbility {
  override onCollectSpecial(_type: SpecialPoopType): number {
    return 1;
  }
}
