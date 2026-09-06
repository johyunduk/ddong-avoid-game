# 빠른 검증: 타입 검사만 (코드 변경 직후용)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Test-Path 'node_modules\typescript')) {
  Write-Host 'BLOCKED: 의존성이 설치되지 않았습니다. npm install 을 먼저 실행하세요.' -ForegroundColor Yellow
  exit 2
}

Write-Host '== tsc --noEmit ==' -ForegroundColor Cyan
npx --no-install tsc --noEmit
if ($LASTEXITCODE -ne 0) { Write-Host 'FAIL: 타입 오류' -ForegroundColor Red; exit 1 }

Write-Host 'PASS' -ForegroundColor Green
exit 0
