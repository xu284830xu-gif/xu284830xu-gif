$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (-not $env:PORT) { $env:PORT = '8787' }
if (-not $env:HOST) { $env:HOST = '0.0.0.0' }
node --env-file-if-exists=.env server/server.mjs
