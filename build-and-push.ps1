# ══════════════════════════════════════════════════════════════
#  build-and-push.ps1 — Construye la imagen Docker y la sube a
#  GitHub Container Registry (ghcr.io)
#
#  Uso:
#    .\build-and-push.ps1           → tag: latest
#    .\build-and-push.ps1 -Tag v1.1 → tag: v1.1 + latest
#
#  Requisito previo (una sola vez):
#    1. Crear Personal Access Token en GitHub:
#       github.com → Settings → Developer settings
#       → Personal access tokens → Tokens (classic) → New token
#       → Scope: write:packages
#    2. Ejecutar login (reemplaza TU_TOKEN):
#       echo "TU_TOKEN" | docker login ghcr.io -u pedroprobolsas --password-stdin
# ══════════════════════════════════════════════════════════════

param(
    [string]$Tag = "latest"
)

$IMAGE = "ghcr.io/pedroprobolsas/dashboardgerencial"
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Probolsas Dashboard — Build & Push"      -ForegroundColor Cyan
Write-Host "  Imagen: ${IMAGE}:${Tag}"                 -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ── 1. Build ──────────────────────────────────────────────────────────────────
Write-Host "▶ Construyendo imagen..." -ForegroundColor Yellow

docker build `
    --target production `
    --tag "${IMAGE}:${Tag}" `
    --tag "${IMAGE}:latest" `
    --file Dockerfile `
    .

if ($LASTEXITCODE -ne 0) { Write-Error "Build fallido." }
Write-Host "✓ Build completado" -ForegroundColor Green
Write-Host ""

# ── 2. Push ───────────────────────────────────────────────────────────────────
Write-Host "▶ Subiendo ${IMAGE}:${Tag}..." -ForegroundColor Yellow
docker push "${IMAGE}:${Tag}"
if ($LASTEXITCODE -ne 0) { Write-Error "Push de :${Tag} fallido." }

if ($Tag -ne "latest") {
    Write-Host "▶ Subiendo ${IMAGE}:latest..." -ForegroundColor Yellow
    docker push "${IMAGE}:latest"
    if ($LASTEXITCODE -ne 0) { Write-Error "Push de :latest fallido." }
}

Write-Host ""
Write-Host "✓ Push completado" -ForegroundColor Green
Write-Host ""
Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Siguiente paso en Portainer:"            -ForegroundColor Cyan
Write-Host "  Stacks → probolsas-dashboard"            -ForegroundColor Cyan
Write-Host "  → Update → Pull latest image → Update"   -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
