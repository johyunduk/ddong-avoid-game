import { defineConfig } from 'vite';

// 웹 빌드 결과물 위치. vercel.json 의 outputDirectory 가 이 폴더를 그대로 내보낸다 —
// 둘이 어긋나면 운영 사이트가 빈 화면으로 배포된다.
// 예전에는 앱인토스 granite build 가 vite 의 dist/ 결과를 dist/web 으로 옮겨서 이 위치를 정했다 (2026-11-01 토스 연동 걷어냄).
// npm run preview 도 이 폴더를 띄운다.
export default defineConfig({
  build: {
    outDir: 'dist/web',
  },
});
