#!/usr/bin/env node

/**
 * Vercel 빌드 스크립트
 * - Vercel 환경 변수를 .env 파일로 생성
 * - tsc (타입 검사) + vite build 실행 → dist/web
 */

import { writeFileSync, existsSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('🔧 [Build] Starting Vercel build process...');
console.log('📁 [Build] Root directory:', rootDir);

// Vercel 환경 변수 확인
const viteGameSecretKey = process.env.VITE_GAME_SECRET_KEY;
const viteApiBaseUrl = process.env.VITE_API_BASE_URL;

console.log('🔍 [Build] Checking environment variables...');
console.log('   - VITE_GAME_SECRET_KEY:', viteGameSecretKey ? '✅ Found' : '❌ Not found');
console.log('   - VITE_API_BASE_URL:', viteApiBaseUrl ? '✅ Found' : '❌ Not found');

// .env 파일 생성 (Vite가 읽을 수 있도록)
const envPath = join(rootDir, '.env');
let envContent = '';

if (viteGameSecretKey) {
  envContent += `VITE_GAME_SECRET_KEY=${viteGameSecretKey}\n`;
  console.log('✅ [Build] VITE_GAME_SECRET_KEY added to .env');
}

if (viteApiBaseUrl) {
  envContent += `VITE_API_BASE_URL=${viteApiBaseUrl}\n`;
  console.log('✅ [Build] VITE_API_BASE_URL added to .env');
}

if (envContent) {
  writeFileSync(envPath, envContent, 'utf8');
  console.log('📝 [Build] .env file created at:', envPath);
} else {
  console.warn('⚠️ [Build] No VITE_ environment variables found');
  console.warn('⚠️ [Build] Build will use default/fallback values');
}

// 타입 검사 + 웹 빌드 — 예전 granite.config.ts 의 web.commands.build('tsc && vite build')와 같은 일이다.
// granite build 는 먼저 dist/ 를 통째로 지우고, vite 가 dist/ 에 낸 결과를 dist/web 으로 옮겼다.
// 지우는 건 여기서 그대로 하고, dist/web 이라는 위치는 이제 vite.config.ts 의 build.outDir 가 정한다.
// 그 위치는 vercel.json 의 outputDirectory 와 같아야 한다 — 어긋나면 운영 사이트가 빈 화면으로 배포된다 (2026-11-01 토스 연동 걷어냄)
console.log('🚀 [Build] Running tsc + vite build...');
try {
  rmSync(join(rootDir, 'dist'), { recursive: true, force: true });
  for (const cmd of ['npx tsc', 'npx vite build']) {
    execSync(cmd, {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        // 환경 변수 명시적 전달
        VITE_GAME_SECRET_KEY: viteGameSecretKey || '',
        VITE_API_BASE_URL: viteApiBaseUrl || ''
      }
    });
  }
  console.log('✅ [Build] Build completed successfully');
} catch (error) {
  console.error('❌ [Build] Build failed:', error.message);
  process.exit(1);
}
