const _KEY = 'extremeCharBest';
const _SIG_KEY = 'extremeCharBestSig';
const _SALT = 'ddong-extreme-char-v1';

function _djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(36);
}

function _sign(map: Record<string, number>): string {
  const str =
    Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',') + _SALT;
  return _djb2(str);
}

function _load(): Record<string, number> {
  try {
    const raw = localStorage.getItem(_KEY);
    const sig = localStorage.getItem(_SIG_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (sig && sig !== _sign(parsed)) {
      localStorage.removeItem(_KEY);
      localStorage.removeItem(_SIG_KEY);
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function _save(map: Record<string, number>): void {
  localStorage.setItem(_KEY, JSON.stringify(map));
  localStorage.setItem(_SIG_KEY, _sign(map));
}

export function getExtremeCharBest(charId: string): number {
  return _load()[charId] ?? 0;
}

export function updateExtremeCharBest(charId: string, score: number): void {
  const map = _load();
  if (score > (map[charId] ?? 0)) {
    map[charId] = score;
    _save(map);
  }
}
