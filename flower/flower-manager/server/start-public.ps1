$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$cloudflared = Join-Path $PSScriptRoot 'bin\cloudflared.exe'
if (-not (Test-Path $cloudflared)) {
  Write-Host '正在下载 cloudflared...'
  New-Item -ItemType Directory -Path (Split-Path -Parent $cloudflared) -Force | Out-Null
  Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cloudflared -UseBasicParsing
}
if (-not $env:PORT) { $env:PORT = '8787' }
$server = Start-Process -FilePath 'node' -ArgumentList @('--env-file-if-exists=.env', 'server/server.mjs') -WorkingDirectory $root -PassThru -WindowStyle Hidden
try {
  Start-Sleep -Seconds 2
  Write-Host "本地服务: http://localhost:$($env:PORT)"
  Write-Host '正在创建临时公网地址，请查看下方 trycloudflare.com 链接：'
  & $cloudflared tunnel --url "http://localhost:$($env:PORT)" --no-autoupdate
} finally {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
}
