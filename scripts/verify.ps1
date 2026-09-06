# 전체 검증: 타입 검사 + 프로덕션 빌드 + 에셋 참조 확인
# 파이프라인의 "구현 완료" 판정 기준. Codex 리뷰 전에 반드시 통과시킨다.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$failed = @()

if (-not (Test-Path 'node_modules\typescript')) {
  Write-Host 'BLOCKED: 의존성이 설치되지 않았습니다. npm install 을 먼저 실행하세요.' -ForegroundColor Yellow
  exit 2
}

Write-Host '== 1/3 tsc --noEmit ==' -ForegroundColor Cyan
npx --no-install tsc --noEmit
if ($LASTEXITCODE -ne 0) { $failed += 'typecheck' }

Write-Host '== 2/3 npm run build ==' -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { $failed += 'build' }

Write-Host '== 3/3 캐릭터 에셋 참조 확인 ==' -ForegroundColor Cyan
$src = Join-Path $root 'src\utils\character.ts'
$missing = @()
if (Test-Path $src) {
  foreach ($m in [regex]::Matches((Get-Content $src -Raw), "'(assets/[^']+)'")) {
    $rel = $m.Groups[1].Value
    if (-not (Test-Path (Join-Path $root "public\$($rel -replace '/', '\')"))) { $missing += $rel }
  }
}
if ($missing.Count -gt 0) {
  Write-Host '누락된 에셋:' -ForegroundColor Red
  $missing | Sort-Object -Unique | ForEach-Object { Write-Host "  - public/$_" -ForegroundColor Red }
  $failed += 'assets'
}

if ($failed.Count -gt 0) {
  Write-Host "FAIL: $($failed -join ', ')" -ForegroundColor Red
  exit 1
}
Write-Host 'PASS' -ForegroundColor Green
exit 0
