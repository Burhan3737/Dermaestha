<#
.SYNOPSIS
  One-click helper for Dermestha: set up, run, build, test, and prep-deploy.

.DESCRIPTION
  A convenience wrapper around the commands documented in onboarding/instructions.md.
  This script lives in onboarding/ but always runs commands from the PROJECT ROOT.
  It never pushes to git and never deploys (those require human approval per the repo rules).

.PARAMETER Task
  Which task to run. Use "-Task help" to list them. Default is "all".

.EXAMPLE
  .\onboarding\setup.ps1                      # full local setup, then launch the app (API + UI)
.EXAMPLE
  .\onboarding\setup.ps1 -Task setup          # set up everything but don't launch
.EXAMPLE
  .\onboarding\setup.ps1 -Task dev            # just launch API + Vite dev server (setup already done)
.EXAMPLE
  .\onboarding\setup.ps1 -Task seed-baseline  # wipe + load the richer baseline fixture (patients + appointments)
#>
[CmdletBinding()]
param(
  [ValidateSet(
    'help', 'all', 'setup', 'dev', 'build', 'docker',
    'seed', 'seed-baseline', 'bootstrap-admin', 'test', 'predeploy', 'stop', 'reset'
  )]
  [string]$Task = 'all'
)

$ErrorActionPreference = 'Stop'
# This script lives in onboarding/; anchor to the project root (its parent) so npm/docker/prisma run there.
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# -- small helpers ------------------------------------------------------------
function Info($m)  { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "OK  $m" -ForegroundColor Green }
function Warn($m)  { Write-Host "!!  $m" -ForegroundColor Yellow }

# Run a native command and stop the script if it returns a non-zero exit code.
function Run([string]$exe, [string[]]$cmdArgs) {
  Info "$exe $($cmdArgs -join ' ')"
  & $exe @cmdArgs
  if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $exe $($cmdArgs -join ' ')" }
}

# Create .env from .env.example on first run; warn (never auto-edit) on a port mismatch.
function Ensure-Env {
  if (-not (Test-Path '.env')) {
    Info 'No .env found - copying from .env.example'
    Copy-Item '.env.example' '.env'
    Warn 'Open .env and set SESSION_SECRET to a long random string before any real use.'
  } else {
    Ok '.env already exists'
  }
  $line = Select-String -Path '.env' -Pattern '^\s*DATABASE_URL=' | Select-Object -First 1
  if ($line -and $line.Line -notmatch ':5432/') {
    Warn "DATABASE_URL in .env does not use port 5432, which is what docker-compose publishes."
    Warn "If you use the Docker database, make the ports match (.env.example uses 5432)."
  }
}

# Wait until the Postgres container reports healthy (pg_isready), up to ~60s.
function Wait-Db {
  Info 'Waiting for Postgres to accept connections...'
  for ($i = 0; $i -lt 30; $i++) {
    & docker compose exec -T db pg_isready -U user -d dermestha 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { Ok 'Postgres is ready'; return }
    Start-Sleep -Seconds 2
  }
  throw 'Postgres did not become ready in time. Is Docker Desktop running?'
}

# -- task implementations -----------------------------------------------------
function Task-Setup {
  Run 'npm' @('install')
  Ensure-Env
  Run 'npx' @('prisma', 'generate')
  Run 'docker' @('compose', 'up', '-d', 'db')
  Wait-Db
  Run 'npx' @('prisma', 'migrate', 'deploy')
  Run 'npm' @('run', 'db:seed')
  Ok 'Setup complete. Demo logins use password "Password123" (admin@dermestha.dev). See onboarding/instructions.md section 5.'
}

# Launch the API and the Vite dev server, each in its own PowerShell window.
function Task-Dev {
  Info 'Launching API server (port 3000) in a new window...'
  Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root'; node --env-file=.env server/src/index.js"
  Info 'Launching Vite dev server in a new window...'
  Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root'; npm run dev:client"
  Ok 'Two windows launched. API + production-style UI: http://localhost:3000 (Vite hot-reload URL is printed in its window).'
  Ok 'Health check: http://localhost:3000/api/health'
}

function Task-Build {
  Run 'npm' @('run', 'build:client')
  Ok 'Client built to client/dist/. Starting Express to serve the SPA + API on :3000 (Ctrl+C to stop)...'
  Run 'node' @('--env-file=.env', 'server/src/index.js')
}

function Task-Docker {
  Ensure-Env
  Warn 'Docker runs the app + db, but migrations/seed are NOT automatic.'
  Warn 'After it is up, run (in another terminal): npx prisma migrate deploy ; npm run db:seed'
  Run 'docker' @('compose', 'up', '--build')
}

function Task-Seed         { Run 'npm' @('run', 'db:seed') }
function Task-SeedBaseline {
  Warn 'seed-baseline WIPES all data, then loads the baseline fixture (password "Test123!").'
  Run 'node' @('--env-file=.env', 'prisma/scripts/seed-baseline.js')
}

function Task-BootstrapAdmin {
  $email = Read-Host 'Admin email'
  $secure = Read-Host 'Admin password' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  $env:ADMIN_EMAIL = $email
  $env:ADMIN_PASSWORD = $plain
  try { Run 'node' @('--env-file=.env', 'prisma/scripts/bootstrap-admin.js') }
  finally { Remove-Item Env:ADMIN_EMAIL, Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue }
  Warn 'Rotate this password immediately after the first login.'
}

function Task-Test {
  Run 'npm' @('test')
  Run 'npm' @('--workspace', 'client', 'run', 'test')
}

# Local pre-deploy gate. Does NOT push or deploy - that needs human approval.
function Task-Predeploy {
  Run 'npm' @('run', 'build:client')
  Run 'npm' @('test')
  Run 'npm' @('run', 'lint')
  Ok 'Pre-deploy checks passed. Deploy itself (git push to Railway) requires human approval - see onboarding/instructions.md section 9.'
}

function Task-Stop  { Run 'docker' @('compose', 'down') }
function Task-Reset {
  Warn 'reset removes the database AND uploads volumes (all local data lost).'
  Run 'docker' @('compose', 'down', '-v')
}

function Task-Help {
  Write-Host ''
  Write-Host 'Dermestha setup.ps1 - tasks:' -ForegroundColor Cyan
  Write-Host '  all              (default) full local setup, then launch API + UI'
  Write-Host '  setup            install deps, .env, prisma generate, start db, migrate, seed'
  Write-Host '  dev              launch API server + Vite dev server (setup already done)'
  Write-Host '  build            build the client and serve it production-style on :3000'
  Write-Host '  docker           run the full stack (app + db) via docker compose'
  Write-Host '  seed             run the demo seed (doctors + admin, password Password123)'
  Write-Host '  seed-baseline    WIPE + load the richer baseline fixture (password Test123!)'
  Write-Host '  bootstrap-admin  create the production admin (prompts for email/password)'
  Write-Host '  test             run server + client test suites'
  Write-Host '  predeploy        local deploy gate: build + test + lint (does NOT push)'
  Write-Host '  stop             docker compose down (keep data)'
  Write-Host '  reset            docker compose down -v (DELETE db + uploads volumes)'
  Write-Host ''
  Write-Host 'Full guide: onboarding/instructions.md' -ForegroundColor Cyan
}

# -- dispatch -----------------------------------------------------------------
switch ($Task) {
  'help'            { Task-Help }
  'all'             { Task-Setup; Task-Dev }
  'setup'           { Task-Setup }
  'dev'             { Task-Dev }
  'build'           { Task-Build }
  'docker'          { Task-Docker }
  'seed'            { Task-Seed }
  'seed-baseline'   { Task-SeedBaseline }
  'bootstrap-admin' { Task-BootstrapAdmin }
  'test'            { Task-Test }
  'predeploy'       { Task-Predeploy }
  'stop'            { Task-Stop }
  'reset'           { Task-Reset }
}
