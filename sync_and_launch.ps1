param (
    [switch]$FrontendOnly,
    [switch]$BackendOnly
)

$SYNC_BACKEND = $true
$SYNC_FRONTEND = $true

if ($FrontendOnly) {
    $SYNC_BACKEND = $false
}
if ($BackendOnly) {
    $SYNC_FRONTEND = $false
}

# =============================================================================
# sync_and_launch.ps1 — Sync local project to GCP VM and restart services
# VM: alkhairplateforme@34.91.122.174
# Remote path: ~/sdn-controller
# =============================================================================

$SSH_KEY    = "$env:USERPROFILE\.ssh\id_rsa"
$REMOTE     = "alkhairplateforme@34.32.194.240"
$REMOTE_DIR = "~/sdn-controller"
$SSH_OPTS   = "-i `"$SSH_KEY`" -o StrictHostKeyChecking=no -o ConnectTimeout=15"
$LOCAL_BACK = "c:\Users\mosta\OneDrive\Desktop\Antigravity\SDN-Front-End\backend"
$LOCAL_FRONT= "c:\Users\mosta\OneDrive\Desktop\Antigravity\SDN-Front-End\frontend"

function Invoke-SSH {
    param([string]$Cmd)
    Write-Host "`n[SSH] $Cmd" -ForegroundColor Cyan
    $result = & ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 $REMOTE "$Cmd"
    $result
}

function Sync-Dir {
    param([string]$LocalPath, [string]$RemotePath, [string[]]$Excludes)

    $dirName = Split-Path $LocalPath -Leaf
    $tarName = "${dirName}_sync.tar.gz"
    $localTar = "$env:TEMP\$tarName"
    $remoteTar = "/tmp/$tarName"

    Write-Host "`n[SYNC] Compressing $LocalPath ..." -ForegroundColor Yellow

    $excludeArgs = $Excludes | ForEach-Object { "--exclude=$_" }
    $parentPath  = Split-Path $LocalPath -Parent

    & tar -czf $localTar @excludeArgs -C $parentPath $dirName

    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] tar failed" -ForegroundColor Red; exit 1
    }

    Write-Host "[SYNC] Uploading to ${REMOTE}:${remoteTar} ..." -ForegroundColor Yellow
    & scp -i "$SSH_KEY" -o StrictHostKeyChecking=no $localTar "${REMOTE}:${remoteTar}"

    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] scp upload failed" -ForegroundColor Red; exit 1
    }

    Write-Host "[SYNC] Extracting on VM into $RemotePath ..." -ForegroundColor Yellow
    Invoke-SSH "mkdir -p $RemotePath && tar -xzf $remoteTar -C $RemotePath --strip-components=1 && rm $remoteTar"

    Remove-Item $localTar -Force
    Write-Host "[SYNC] Done: $LocalPath -> ${REMOTE}:$RemotePath" -ForegroundColor Green
}

# ─────────────────────────────────────────────────────────────────
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "  SDN Project Sync & Launch" -ForegroundColor Magenta
Write-Host "  Target: $REMOTE" -ForegroundColor Magenta
if ($FrontendOnly) { Write-Host "  Mode:   FRONTEND ONLY" -ForegroundColor Cyan }
elseif ($BackendOnly) { Write-Host "  Mode:   BACKEND ONLY" -ForegroundColor Cyan }
else { Write-Host "  Mode:   FULL (Frontend & Backend)" -ForegroundColor Cyan }
Write-Host "============================================" -ForegroundColor Magenta

# Step 1: Test SSH connectivity
Write-Host "`n[1/4] Testing SSH connection..." -ForegroundColor Blue
$test = & ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 $REMOTE "echo OK"
if ($test -ne "OK") {
    Write-Host "[ERROR] SSH connection failed. Check your key and VM status." -ForegroundColor Red
    exit 1
}
Write-Host "       SSH connection: OK" -ForegroundColor Green

# Step 2: Sync backend
if ($SYNC_BACKEND) {
    Write-Host "`n[2/4] Syncing backend..." -ForegroundColor Blue
    Sync-Dir -LocalPath $LOCAL_BACK `
             -RemotePath $REMOTE_DIR `
             -Excludes @("venv", "__pycache__", "*.pyc", ".git", "trash", "*.log", "node_modules", ".pytest_cache", "clab-*")
} else {
    Write-Host "`n[2/4] Skipping backend sync (-FrontendOnly specified)" -ForegroundColor DarkGray
}

# Step 3: Sync frontend
if ($SYNC_FRONTEND) {
    Write-Host "`n[3/4] Syncing frontend..." -ForegroundColor Blue
    Sync-Dir -LocalPath $LOCAL_FRONT `
             -RemotePath "$REMOTE_DIR/frontend" `
             -Excludes @("node_modules", "dist", ".git", "trash", ".cache")
} else {
    Write-Host "`n[3/4] Skipping frontend sync (-BackendOnly specified)" -ForegroundColor DarkGray
}

# Step 4: Rebuild and restart Docker containers
Write-Host "`n[4/4] Rebuilding and restarting Docker services..." -ForegroundColor Blue

$containers = @()
if ($SYNC_BACKEND) {
    $containers += "app", "celery-worker", "flower"
}
if ($SYNC_FRONTEND) {
    $containers += "frontend"
}
$containerList = $containers -join " "

# We also need to remove named containers to avoid conflict
$namedRm = ""
if ($SYNC_FRONTEND) { $namedRm += " docker rm -f sdn_frontend 2>/dev/null;" }
if ($SYNC_BACKEND) { $namedRm += " docker rm -f sdn_flower 2>/dev/null;" }

Invoke-SSH "cd $REMOTE_DIR && nohup sh -c 'docker-compose stop $containerList && docker-compose rm -f $containerList &&$namedRm docker-compose build $containerList 2>&1 | tail -30 && docker-compose up -d $containerList' > deploy.log 2>&1 & tail --pid=`$! -f deploy.log"

# ─── Final status ─────────────────────────────────────────────────
Write-Host "`n============================================" -ForegroundColor Magenta
Write-Host "  Deployment Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Backend API:  https://34.91.122.174:8000/"  -ForegroundColor Cyan
  Write-Host "  Swagger Docs: https://34.91.122.174:8000/docs" -ForegroundColor Cyan
  Write-Host "  Frontend:     http://34.91.122.174:8080/"   -ForegroundColor Cyan
  Write-Host "  Flower:       http://34.91.122.174:5555/ (admin/admin)" -ForegroundColor Cyan
Write-Host ""
Invoke-SSH "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | head -22"
