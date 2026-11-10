# 一键推送：先在 GitHub 上加好 SSH 公钥、并建好空仓库 exam-analyzer
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Administrator\Documents\deepseek-harness\default-workspace\exam-analyzer-repo'

Write-Host '== 检查 SSH 是否已授权 ==' -ForegroundColor Cyan
$probe = ssh -o BatchMode=yes -T git@github.com 2>&1
if ($probe -match 'successfully authenticated') {
    Write-Host 'SSH 已授权' -ForegroundColor Green
} else {
    Write-Host 'SSH 还没授权：请先把公钥加到 https://github.com/settings/keys' -ForegroundColor Yellow
    Write-Host ($probe | Select-Object -First 2)
    exit 1
}

Set-Location $repo
Write-Host '== 当前提交 ==' -ForegroundColor Cyan
git log --oneline | Select-Object -First 3

Write-Host '== 推送 ==' -ForegroundColor Cyan
git push -u origin main

Write-Host '完成：https://github.com/codeforbuddy/exam-analyzer' -ForegroundColor Green
