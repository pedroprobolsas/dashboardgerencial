#!/usr/bin/env bash
# ops/verify.sh — Verificación de solo lectura entre el repo (ops/files/) y el sistema (INSTALL_ROOT)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="${SCRIPT_DIR}/manifest.tsv"
FILES_DIR="${SCRIPT_DIR}/files"
INSTALL_ROOT="${INSTALL_ROOT:-/}"

if [[ ! -f "${MANIFEST}" ]]; then
  echo "❌ No se encontró el manifiesto: ${MANIFEST}" >&2
  exit 1
fi

echo "================================================================"
echo " [ops/verify.sh] Comparando ops/files/ contra ${INSTALL_ROOT} (solo lectura)"
echo "================================================================"

DIFFS=0
TOTAL=0

while IFS=$'\t' read -r rel_path mode owner_group; do
  [[ "${rel_path}" =~ ^[[:space:]]*(#.*)?$ ]] && continue
  TOTAL=$((TOTAL + 1))

  src="${FILES_DIR}/${rel_path}"
  dst="${INSTALL_ROOT%/}/${rel_path}"
  norm_mode="$(printf '%04d' "$((10#${mode}))")"

  if [[ ! -f "${src}" ]]; then
    echo "❌ [FALTA EN REPO] ${src}"
    DIFFS=$((DIFFS + 1))
    continue
  fi

  if [[ ! -f "${dst}" ]]; then
    echo "❌ [FALTA EN DESTINO] ${dst}"
    DIFFS=$((DIFFS + 1))
    continue
  fi

  src_sha="$(sha256sum "${src}" | awk '{print $1}')"
  dst_sha="$(sha256sum "${dst}" | awk '{print $1}')"
  dst_mode="$(printf '%04d' "$((10#$(stat -c '%a' "${dst}")))")"
  dst_owner="$(stat -c '%U:%G' "${dst}")"

  if [[ "${src_sha}" != "${dst_sha}" ]]; then
    echo "❌ [CONTENIDO DISTINTO] /${rel_path}"
    diff -u "${dst}" "${src}" || true
    DIFFS=$((DIFFS + 1))
  elif [[ "${dst_mode}" != "${norm_mode}" ]] || [[ "${dst_owner}" != "${owner_group}" ]]; then
    echo "❌ [METADATOS DISTINTOS] /${rel_path}: esperado=(${norm_mode} ${owner_group}), actual=(${dst_mode} ${dst_owner})"
    DIFFS=$((DIFFS + 1))
  else
    echo "✅ [IDÉNTICO] /${rel_path} | sha256=${src_sha:0:12}... | ${dst_mode} ${dst_owner}"
  fi
done < "${MANIFEST}"

echo "================================================================"
if [[ "${DIFFS}" -eq 0 ]]; then
  echo "✅ Resultado: ${TOTAL}/${TOTAL} archivos idénticos en contenido, permisos y dueño (0 diferencias)."
  exit 0
else
  echo "❌ Resultado: ${DIFFS} diferencias encontradas de ${TOTAL} archivos."
  exit 1
fi
