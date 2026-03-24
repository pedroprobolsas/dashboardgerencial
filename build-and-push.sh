#!/bin/bash
# ══════════════════════════════════════════════════════════════
#  build-and-push.sh — Construye la imagen Docker y la sube a
#  GitHub Container Registry (ghcr.io) para despliegue en Swarm
#
#  Uso:
#    ./build-and-push.sh          → tag: latest
#    ./build-and-push.sh v1.1     → tag: v1.1 + latest
#
#  Requisitos previos (una sola vez):
#    1. Crear un Personal Access Token en GitHub:
#       GitHub → Settings → Developer settings → Personal access tokens
#       → Tokens (classic) → New token → Scope: write:packages
#    2. Autenticarse:
#       echo TU_GITHUB_TOKEN | docker login ghcr.io -u pedroprobolsas --password-stdin
# ══════════════════════════════════════════════════════════════
set -e

IMAGE="ghcr.io/pedroprobolsas/dashboardgerencial"
TAG="${1:-latest}"

echo ""
echo "══════════════════════════════════════════"
echo "  Probolsas Dashboard — Build & Push"
echo "  Imagen: ${IMAGE}:${TAG}"
echo "══════════════════════════════════════════"
echo ""

# ── 1. Build ──────────────────────────────────────────────────────────────────
echo "▶ Construyendo imagen..."
docker build \
  --target production \
  --tag "${IMAGE}:${TAG}" \
  --tag "${IMAGE}:latest" \
  --file Dockerfile \
  .

echo "✓ Build completado"
echo ""

# ── 2. Push ───────────────────────────────────────────────────────────────────
echo "▶ Subiendo ${IMAGE}:${TAG} a ghcr.io..."
docker push "${IMAGE}:${TAG}"

if [ "${TAG}" != "latest" ]; then
  echo "▶ Subiendo ${IMAGE}:latest..."
  docker push "${IMAGE}:latest"
fi

echo ""
echo "✓ Push completado"
echo ""
echo "══════════════════════════════════════════"
echo "  Siguiente paso en Portainer:"
echo "  Stacks → probolsas-dashboard"
echo "  → Update the stack → Pull latest image"
echo "  → Update"
echo "══════════════════════════════════════════"
echo ""
