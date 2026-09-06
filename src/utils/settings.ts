const BGM_MUTED_KEY = 'ddong_bgm_muted';

export function isBgmMuted(): boolean {
  return localStorage.getItem(BGM_MUTED_KEY) === 'true';
}

export function setBgmMuted(muted: boolean): void {
  localStorage.setItem(BGM_MUTED_KEY, String(muted));
}

// ── VFX 품질 ──────────────────────────────────────────────────────────
// 블룸(postFX)은 WebGL 전용 화면 패스라 저사양 기기에서 부담이 될 수 있다.
// 기본값 ON, 저장된 값이 'false' 일 때만 OFF.
const FX_BLOOM_KEY = 'ddong_fx_bloom';

export function isFxBloomEnabled(): boolean {
  return localStorage.getItem(FX_BLOOM_KEY) !== 'false';
}

export function setFxBloomEnabled(enabled: boolean): void {
  localStorage.setItem(FX_BLOOM_KEY, String(enabled));
}
