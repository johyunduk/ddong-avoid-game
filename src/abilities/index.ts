import type { CharacterAbility } from './types';
import { BaseAbility } from './BaseAbility';
import { RGradeAbility } from './RGradeAbility';
import { MinerAbility } from './MinerAbility';
import { HackerAbility } from './HackerAbility';
import { MaehwaAbility } from './MaehwaAbility';
import { ArchieveAbility } from './ArchieveAbility';
import { GlitchAbility } from './GlitchAbility';
import { NoiseAbility } from './NoiseAbility';
import { SentinelAbility } from './SentinelAbility';
import { LegacyAbility } from './LegacyAbility';

const R_IDS = ['log', 'swap', 'sum', 'fork', 'seed', 'session', 'branch', 'hook', 'socket', 'index'];

/** 캐릭터 ID에 맞는 Ability 인스턴스 반환 */
export function getCharacterAbility(id: string): CharacterAbility {
  if (R_IDS.includes(id)) return new RGradeAbility();
  switch (id) {
    case 'miner':    return new MinerAbility();
    case 'hacker':   return new HackerAbility();
    case 'maehwa':   return new MaehwaAbility();
    case 'archieve': return new ArchieveAbility();
    case 'glitch':   return new GlitchAbility();
    case 'noise':    return new NoiseAbility();
    case 'sentinel': return new SentinelAbility();
    case 'legacy':   return new LegacyAbility();
    default:         return new BaseAbility(); // chibi 및 미등록 캐릭터
  }
}
