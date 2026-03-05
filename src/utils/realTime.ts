/**
 * 모듈 로드 시점(페이지 초기화)에 원본 Date.now를 캡처합니다.
 * 콘솔에서 Date.now / performance.now / rAF를 조작해도 영향받지 않습니다.
 */
const _origDateNow = Date.now;

export const realNow = (): number => _origDateNow.call(Date);
