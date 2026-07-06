# =============================================================================
# sync_and_launch.ps1 — Sync local project to GCP VM and restart services
# VM: mostafafaouzi89@34.90.176.247
# Remote path: ~/sdn-controller
# =============================================================================

$SSH_KEY    = "$env:USERPROFILE\.ssh\id_rsa"
$REMOTE     = "mostafafaouzi89@34.90.176.247"
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
Write-Host "`n[2/4] Syncing backend..." -ForegroundColor Blue
Sync-Dir -LocalPath $LOCAL_BACK `
         -RemotePath $REMOTE_DIR `
         -Excludes @("venv", "__pycache__", "*.pyc", ".git", "trash", "*.log", "node_modules", ".pytest_cache", "clab-*")

# Step 3: Sync frontend
Write-Host "`n[3/4] Syncing frontend..." -ForegroundColor Blue
Sync-Dir -LocalPath $LOCAL_FRONT `
         -RemotePath "$REMOTE_DIR/frontend" `
         -Excludes @("node_modules", "dist", ".git", "trash", ".cache")

# Step 4: Rebuild and restart Docker containers
# - docker-compose v1 on VM: stop/rm first to avoid ContainerConfig bug with --force-recreate
# - Docker owns port 8000 exclusively (no bare uvicorn)
Write-Host "`n[4/4] Rebuilding and restarting Docker services..." -ForegroundColor Blue
Invoke-SSH "cd $REMOTE_DIR && docker-compose stop app celery-worker flower frontend && docker-compose rm -f app celery-worker flower frontend && docker rm -f sdn_flower sdn_frontend 2>/dev/null; docker-compose build --no-cache app celery-worker flower frontend 2>&1 | tail -30 && docker-compose up -d app celery-worker flower frontend"

# ─── Final status ─────────────────────────────────────────────────
Write-Host "`n============================================" -ForegroundColor Magenta
Write-Host "  Deployment Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Backend API:  https://34.90.176.247:8000/"  -ForegroundColor Cyan
Write-Host "  Swagger Docs: https://34.90.176.247:8000/docs" -ForegroundColor Cyan
Write-Host "  Frontend:     http://34.90.176.247:8080/"   -ForegroundColor Cyan
Write-Host "  Flower:       http://34.90.176.247:5555/ (admin/admin)" -ForegroundColor Cyan
Write-Host ""
Invoke-SSH "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | head -22"
