const BGM_MUTED_KEY = 'ddong_bgm_muted';

export function isBgmMuted(): boolean {
  return localStorage.getItem(BGM_MUTED_KEY) === 'true';
}

export function setBgmMuted(muted: boolean): void {
  localStorage.setItem(BGM_MUTED_KEY, String(muted));
}
