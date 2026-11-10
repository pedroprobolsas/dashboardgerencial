#!/usr/bin/env bash
# ops/check-secrets.sh — Verificación preventiva de secretos antes de commit
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

echo "================================================================"
echo " [check-secrets] Escaneo de seguridad previo a commit"
echo "================================================================"

FAILED=0

# 1. Verificar archivos prohibidos en staging o dentro de ops/files/
echo ""
echo "--- 1. Verificando archivos prohibidos (.env, .telegram-env, crisolweb-cron.sh, send-telegram.sh, .bak) ---"

STAGED_FILES="$(git diff --cached --name-only --diff-filter=ACMR || true)"
OPS_FILES=""
if [[ -d "ops/files" ]]; then
  OPS_FILES="$(find "ops/files" -type f 2>/dev/null || true)"
fi

ALL_TARGET_FILES="$(printf "%s\n%s\n" "${STAGED_FILES}" "${OPS_FILES}" | sed '/^$/d' | sort -u)"

while IFS= read -r f; do
  [[ -n "${f}" ]] || continue
  base="$(basename "${f}")"
  if [[ "${base}" == ".env" ]] || [[ "${base}" == ".telegram-env" ]] || [[ "${base}" =~ ^\.env\..* && ! "${base}" =~ \.example$ ]] || [[ "${base}" =~ \.env$ ]]; then
    echo "❌ BLOQUEADO: Archivo de entorno detectado: ${f}"
    FAILED=1
  fi
  if [[ "${base}" == "crisolweb-cron.sh" ]] || [[ "${base}" == "crisolweb-sync.js" ]] || [[ "${base}" == "crisolweb-sync-r5r8.js" ]] || [[ "${base}" == "send-telegram.sh" ]]; then
    echo "❌ BLOQUEADO: Script con token o URL pendiente de T9 detectado: ${f}"
    FAILED=1
  fi
  if [[ "${base}" =~ \.bak(-|$) ]]; then
    echo "❌ BLOQUEADO: Archivo de respaldo detectado: ${f}"
    FAILED=1
  fi
done <<< "${ALL_TARGET_FILES}"

if [[ "${FAILED}" -eq 0 ]]; then
  echo "✅ Ningún archivo prohibido (.env, .telegram-env, crisolweb-cron.sh, send-telegram.sh, .bak) en staging ni en ops/files/."
fi

# 2. Búsqueda obligatoria de palabras clave: TOKEN|PASS|KEY|SECRET|access_key
echo ""
echo "--- 2. Búsqueda de palabras clave (TOKEN|PASS|KEY|SECRET|access_key) ---"
if [[ -z "${ALL_TARGET_FILES}" ]]; then
  echo "(No hay archivos en staging ni en ops/files/ todavía)"
else
  KEYWORD_HITS=0
  while IFS= read -r f; do
    [[ -n "${f}" && -f "${f}" ]] || continue
    [[ "${f}" =~ package-lock\.json$|yarn\.lock$ ]] && continue
    if grep -n -i -E "TOKEN|PASS|KEY|SECRET|access_key" "${f}" >/dev/null 2>&1; then
      KEYWORD_HITS=$((KEYWORD_HITS + 1))
      echo "Archivo: ${f}"
      grep -n -i -E "TOKEN|PASS|KEY|SECRET|access_key" "${f}" | sed 's/^/  L/'
    fi
  done <<< "${ALL_TARGET_FILES}"
  if [[ "${KEYWORD_HITS}" -eq 0 ]]; then
    echo "✅ 0 coincidencias de palabras clave."
  else
    echo "ℹ️  Revisa manualmente la clasificación de los ${KEYWORD_HITS} archivos anteriores (nombre de variable vs valor literal)."
  fi
fi

# 3. Detección estricta de valores de secretos literales (falla con código 1 si encuentra alguno)
echo ""
echo "--- 3. Detección estricta de valores de secretos literales ---"
LITERAL_PATTERNS=(
  '[0-9]{8,10}:[A-Za-z0-9_-]{35}'
  'sk-[A-Za-z0-9_-]{20,}'
  '(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}'
  'github_pat_[A-Za-z0-9_]{20,}'
  '(AKIA|ASIA)[0-9A-Z]{16}'
  'AIza[0-9A-Za-z_-]{35}'
  '-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----'
  'postgres(ql)?://[^/:@[:space:]]+:[^@$[:space:]"'"'"']+@[a-zA-Z0-9._-]+'
)

COMBINED_LITERAL_REGEX="$(IFS='|'; echo "${LITERAL_PATTERNS[*]}")"

while IFS= read -r f; do
  [[ -n "${f}" && -f "${f}" ]] || continue
  [[ "${f}" =~ \.example$|README\.md$|check-secrets\.sh$ ]] && continue
  if grep -n -E "${COMBINED_LITERAL_REGEX}" "${f}" >/dev/null 2>&1; then
    echo "❌ SECRETO LITERAL DETECTADO en ${f}:"
    grep -n -E "${COMBINED_LITERAL_REGEX}" "${f}" | sed -E 's/([0-9]{8,10}:)[A-Za-z0-9_-]{35}/\1***/g; s/(://[^/:@]+:)[^@]+@/\1***@/g'
    FAILED=1
  fi
done <<< "${ALL_TARGET_FILES}"

if [[ "${FAILED}" -ne 0 ]]; then
  echo ""
  echo "❌ [check-secrets] FALLÓ: Se detectaron archivos prohibidos o secretos literales."
  exit 1
fi

echo "✅ [check-secrets] Verificación completada sin secretos literales."
exit 0
