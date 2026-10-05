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

Write-Host '== 1/4 tsc --noEmit ==' -ForegroundColor Cyan
npx --no-install tsc --noEmit
if ($LASTEXITCODE -ne 0) { $failed += 'typecheck' }

Write-Host '== 2/4 npm run build ==' -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { $failed += 'build' }

Write-Host '== 3/4 캐릭터 명단 불변식 ==' -ForegroundColor Cyan
# 명단이 여러 곳에 흩어져 있고 어긋나도 아무 데서도 안 걸리던 것이 원인이었다 —
# 레드로 플레이해도 랭킹에 치비로 저장됐고, 그전엔 무기가 뽑기 풀에서 통째로 빠졌다.
node scripts/check-roster.mjs
if ($LASTEXITCODE -ne 0) { $failed += 'roster' }

Write-Host '== 4/4 캐릭터 에셋 참조 확인 ==' -ForegroundColor Cyan
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
