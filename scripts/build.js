#!/usr/bin/env node

/**
 * Vercel 빌드 스크립트
 * - Vercel 환경 변수를 .env 파일로 생성
 * - granite build 실행
 */

import { writeFileSync, existsSync } from 'fs';
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

// granite build 실행
console.log('🚀 [Build] Running granite build...');
try {
  execSync('npm run build:granite', {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      // 환경 변수 명시적 전달
      VITE_GAME_SECRET_KEY: viteGameSecretKey || '',
      VITE_API_BASE_URL: viteApiBaseUrl || ''
    }
  });
  console.log('✅ [Build] Build completed successfully');
} catch (error) {
  console.error('❌ [Build] Build failed:', error.message);
  process.exit(1);
}
