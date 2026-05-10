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
import { KnightAbility } from './KnightAbility';
import { GumiAbility } from './GumiAbility';
import { MugiAbility } from './MugiAbility';

const R_IDS = ['log', 'swap', 'sum', 'fork', 'seed', 'session', 'branch', 'hook', 'socket', 'index'];

/** 캐릭터 ID에 맞는 Ability 인스턴스 반환 (awakeningLevel: 0~3) */
export function getCharacterAbility(id: string, awakeningLevel = 0): CharacterAbility {
  if (R_IDS.includes(id)) return new RGradeAbility(awakeningLevel);
  switch (id) {
    case 'miner':    return new MinerAbility(awakeningLevel);
    case 'hacker':   return new HackerAbility(awakeningLevel);
    case 'maehwa':   return new MaehwaAbility(awakeningLevel);
    case 'archieve': return new ArchieveAbility(awakeningLevel);
    case 'glitch':   return new GlitchAbility(awakeningLevel);
    case 'noise':    return new NoiseAbility(awakeningLevel);
    case 'sentinel': return new SentinelAbility(awakeningLevel);
    case 'legacy':   return new LegacyAbility(awakeningLevel);
    case 'knight':   return new KnightAbility(awakeningLevel);
    case 'gumi':     return new GumiAbility(awakeningLevel);
    case 'mugi':     return new MugiAbility(awakeningLevel);
    default:         return new BaseAbility(); // chibi 및 미등록 캐릭터
  }
}
