import Phaser from 'phaser';

/**
 * 게임 기본 글꼴 — **한 곳에서** 정한다 (2026-10-07 대표 지시).
 *
 * 전에는 Phaser 기본값(Courier)이라 영어·숫자(GAME OVER · 점수)가 타자기체로 나오고 한글만 시스템 대체 글꼴이었다.
 * 이제 모든 Text 의 기본 글꼴은 DdongSans — Pretendard(SIL OFL 1.1)를 게임 글자로 줄이고 이름을 바꾼 것
 * (public/fonts/OFL.txt · scripts/make-game-font.py). 글꼴에 없는 글자(이모지 · 일부 기호)는 뒤의 시스템 글꼴로 나온다.
 *
 * - installGameFont(): main.ts 에서 게임을 만들기 전에 한 번. fontFamily 를 따로 주지 않은 Text 는 전부 이 글꼴
 * - loadGameFont(): BootScene 이 기다린다. 글꼴이 오기 전에 글자를 구우면 대체 글꼴로 구워진 채 남는다
 *   (Phaser Text 는 글꼴이 나중에 와도 다시 굽지 않는다). 실패하거나 늦어도 게임은 뜬다 — 그때는 시스템 글꼴
 */
export const GAME_FONT_FAMILY = 'DdongSans';
/** Text · DOM 공용 글꼴 목록 — DdongSans 가 없으면 기기 한글 글꼴로 */
export const GAME_FONT = `${GAME_FONT_FAMILY}, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif`;

const FILES: [weight: string, file: string][] = [['400', 'DdongSans-Regular.woff2'], ['700', 'DdongSans-Bold.woff2']];

let installed = false;

/** fontFamily(또는 font)를 주지 않은 Text 의 기본 글꼴을 GAME_FONT 로 */
export function installGameFont(): void {
  if (installed) return;
  installed = true;
  type StyleIn = Phaser.Types.GameObjects.Text.TextStyle | undefined;
  const proto = Phaser.GameObjects.TextStyle.prototype as unknown as {
    setStyle: (this: Phaser.GameObjects.TextStyle, style: StyleIn, updateText?: boolean, setDefaults?: boolean) => Phaser.GameObjects.Text;
  };
  const setStyle = proto.setStyle;
  proto.setStyle = function (style, updateText, setDefaults) {
    // 처음 만들 때(setDefaults)만 기본값을 바꾼다 — 나중에 setStyle 로 일부만 고칠 때 글꼴을 되돌리지 않게
    if (setDefaults && (!style || (style.fontFamily === undefined && style.font === undefined))) {
      style = { ...(style ?? {}), fontFamily: GAME_FONT };
    }
    return setStyle.call(this, style, updateText, setDefaults);
  };
}

/**
 * 글꼴 두 굵기(400 · 700)를 불러와 document.fonts 에 넣는다 — CSS(DOM 입력칸)에서도 같은 이름으로 쓴다.
 * timeoutMs 안에 안 끝나면 기다리지 않고 false (게임은 시스템 글꼴로 뜬다)
 */
export async function loadGameFont(timeoutMs = 3000): Promise<boolean> {
  if (typeof FontFace === 'undefined' || !document.fonts) return false;
  const base = import.meta.env.BASE_URL ?? './';
  const load = Promise.all(FILES.map(async ([weight, file]) => {
    const face = new FontFace(GAME_FONT_FAMILY, `url(${base}fonts/${file}) format('woff2')`, { weight, display: 'block' });
    document.fonts.add(await face.load());
  })).then(() => true).catch((e) => { console.warn('[font] 게임 글꼴을 못 불러왔다 — 시스템 글꼴로', e); return false; });
  const timeout = new Promise<boolean>(res => setTimeout(() => res(false), timeoutMs));
  return Promise.race([load, timeout]);
}
