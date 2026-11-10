#!/usr/bin/env bash
# ops/install.sh — Instalador atómico, validado e idempotente para los scripts del VPS
set -euo pipefail

DRY_RUN=0
for arg in "$@"; do
  case "${arg}" in
    --dry-run|-n)
      DRY_RUN=1
      ;;
    *)
      echo "Uso: $0 [--dry-run|-n]" >&2
      echo "Variables opcionales: INSTALL_ROOT=/ruta/raiz (por defecto: /)" >&2
      exit 2
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="${SCRIPT_DIR}/manifest.tsv"
FILES_DIR="${SCRIPT_DIR}/files"
INSTALL_ROOT="${INSTALL_ROOT:-/}"
LOCK_FILE="${LOCK_FILE:-/var/lock/pipeline-crisolweb.lock}"

# 1. Bloqueo estricto en ventana de cargas: 10:30 a 13:30 hora Colombia (UTC-5)
BOGOTA_HM="$(TZ=America/Bogota date +%H%M)"
BOGOTA_NOW="$(TZ=America/Bogota date '+%Y-%m-%d %H:%M:%S %Z')"
if (( 10#${BOGOTA_HM} >= 1030 && 10#${BOGOTA_HM} <= 1330 )); then
  echo "❌ [ABORTADO] Hora actual en Colombia: ${BOGOTA_NOW}." >&2
  echo "   Prohibido desplegar o modificar archivos entre las 10:30 y las 13:30 (horario de cargas)." >&2
  exit 1
fi

# 2. Verificar que no haya una corrida del orquestador en curso (código 75)
check_pipeline_lock() {
  local lf="$1"
  if [[ -e "${lf}" ]] && command -v flock >/dev/null 2>&1; then
    if ! flock -n "${lf}" true 2>/dev/null; then
      echo "❌ [EN CURSO] El candado ${lf} está ocupado por una corrida activa. Saliendo con código 75." >&2
      exit 75
    fi
  fi
}

check_pipeline_lock "${LOCK_FILE}"
check_pipeline_lock "/tmp/pipeline-crisolweb.lock"

if [[ "${INSTALL_ROOT}" == "/" ]] && command -v pgrep >/dev/null 2>&1; then
  if pgrep -f "/root/pipeline-crisolweb.sh" >/dev/null 2>&1; then
    echo "❌ [EN CURSO] /root/pipeline-crisolweb.sh está en ejecución. Saliendo con código 75." >&2
    exit 75
  fi
fi

if [[ ! -f "${MANIFEST}" ]]; then
  echo "❌ No se encontró el manifiesto: ${MANIFEST}" >&2
  exit 1
fi

TMP_PYCACHE="$(mktemp -d)"
trap 'rm -rf "${TMP_PYCACHE}"' EXIT

validate_crond_file() {
  local file="$1"
  local base
  base="$(basename "${file}")"

  if [[ ! "${base}" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo "❌ [cron.d] Nombre inválido '${base}': solo se permiten letras, números, guiones y guiones bajos (sin puntos)." >&2
    return 1
  fi

  if [[ -n "$(tail -c 1 "${file}")" ]]; then
    echo "❌ [cron.d] El archivo ${file} debe terminar con salto de línea (LF)." >&2
    return 1
  fi

  local lineno=0
  local line=""
  while IFS= read -r line; do
    lineno=$((lineno + 1))
    # Comentarios o líneas vacías
    if [[ "${line}" =~ ^[[:space:]]*(#.*)?$ ]]; then
      continue
    fi
    # Asignación de variables de entorno (SHELL=, PATH=, TZ=, MAILTO=, etc.)
    if [[ "${line}" =~ ^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=.*$ ]]; then
      continue
    fi
    # Directivas especiales (@daily, @reboot, etc.) + usuario + comando
    if [[ "${line}" =~ ^[[:space:]]*@(reboot|yearly|annually|monthly|weekly|daily|midnight|hourly)[[:space:]]+[a-zA-Z0-9_.-]+[[:space:]]+.+$ ]]; then
      continue
    fi
    # 5 campos de tiempo + usuario + comando
    if [[ "${line}" =~ ^[[:space:]]*[^[:space:]#]+[[:space:]]+[^[:space:]]+[[:space:]]+[^[:space:]]+[[:space:]]+[^[:space:]]+[[:space:]]+[^[:space:]]+[[:space:]]+[a-zA-Z0-9_.-]+[[:space:]]+.+$ ]]; then
      continue
    fi
    echo "❌ [cron.d] Error de sintaxis en ${file}:${lineno}: ${line}" >&2
    return 1
  done < "${file}"

  return 0
}

echo "================================================================"
echo " [ops/install.sh] Inicio (${BOGOTA_NOW}) | DRY_RUN=${DRY_RUN} | ROOT=${INSTALL_ROOT}"
echo "================================================================"

# 3. Fase 1: Validar TODOS los archivos antes de tocar el sistema
echo "--- Fase 1: Validando sintaxis y formato ---"
VALIDATED=0

while IFS=$'\t' read -r rel_path mode owner_group; do
  [[ "${rel_path}" =~ ^[[:space:]]*(#.*)?$ ]] && continue
  src="${FILES_DIR}/${rel_path}"

  if [[ ! -f "${src}" ]]; then
    echo "❌ Falta archivo fuente en el repo: ${src}" >&2
    exit 1
  fi

  if grep -q $'\r' "${src}"; then
    echo "❌ El archivo ${src} contiene retornos de carro CRLF (\\r). Debe tener LF." >&2
    exit 1
  fi

  case "${rel_path}" in
    etc/cron.d/*)
      validate_crond_file "${src}"
      echo "  [OK cron.d]     ${rel_path}"
      ;;
    *.sh)
      bash -n "${src}"
      echo "  [OK bash -n]    ${rel_path}"
      ;;
    *.py)
      PYTHONPYCACHEPREFIX="${TMP_PYCACHE}" python3 -m py_compile "${src}"
      echo "  [OK py_compile] ${rel_path}"
      ;;
    *.mjs|*.js)
      if command -v node >/dev/null 2>&1; then
        node --check "${src}"
        echo "  [OK node]       ${rel_path}"
      else
        echo "  [OK archivo]    ${rel_path} (node no disponible en PATH para --check)"
      fi
      ;;
    *)
      echo "  [OK archivo]    ${rel_path}"
      ;;
  esac

  VALIDATED=$((VALIDATED + 1))
done < "${MANIFEST}"

echo "✅ ${VALIDATED} archivos validados correctamente."

# 4. Fase 2: Instalación atómica e idempotente con respaldo previo
echo ""
echo "--- Fase 2: Aplicando archivos ---"
TIMESTAMP="$(TZ=America/Bogota date +%Y%m%d-%H%M%S)"
INSTALLED=0
UNCHANGED=0
BACKUPS=0
PIPELINES_CHANGED=0

while IFS=$'\t' read -r rel_path mode owner_group; do
  [[ "${rel_path}" =~ ^[[:space:]]*(#.*)?$ ]] && continue
  src="${FILES_DIR}/${rel_path}"
  dst="${INSTALL_ROOT%/}/${rel_path}"
  owner="${owner_group%%:*}"
  group="${owner_group##*:}"
  norm_mode="$(printf '%04d' "$((10#${mode}))")"

  if [[ -f "${dst}" ]]; then
    cur_mode="$(printf '%04d' "$((10#$(stat -c '%a' "${dst}")))")"
    cur_owner="$(stat -c '%U:%G' "${dst}")"
    if cmp -s "${src}" "${dst}" && [[ "${cur_mode}" == "${norm_mode}" ]] && [[ "${cur_owner}" == "${owner_group}" ]]; then
      echo "  [SIN CAMBIOS] /${rel_path}"
      UNCHANGED=$((UNCHANGED + 1))
      continue
    fi
  fi

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    echo "  [DRY-RUN]     Instalaría /${rel_path} (${norm_mode} ${owner_group})"
    INSTALLED=$((INSTALLED + 1))
    continue
  fi

  mkdir -p "$(dirname "${dst}")"

  if [[ -f "${dst}" ]]; then
    bak="${dst}.bak-${TIMESTAMP}"
    cp -a "${dst}" "${bak}"
    echo "  [RESPALDO]    ${bak}"
    BACKUPS=$((BACKUPS + 1))
  fi

  tmp_dst="${dst}.tmp.$$"
  install -m "${norm_mode}" -o "${owner}" -g "${group}" "${src}" "${tmp_dst}"
  mv -f "${tmp_dst}" "${dst}"
  echo "  [INSTALADO]   /${rel_path} (${norm_mode} ${owner_group})"
  INSTALLED=$((INSTALLED + 1))

  if [[ "${rel_path}" == "opt/host-agent/pipelines.yml" ]]; then
    PIPELINES_CHANGED=1
  fi
done < "${MANIFEST}"

echo ""
echo "================================================================"
echo " Resumen: instalados=${INSTALLED} | sin_cambios=${UNCHANGED} | respaldos=${BACKUPS} | dry_run=${DRY_RUN}"
echo "================================================================"

if [[ "${PIPELINES_CHANGED}" -eq 1 ]]; then
  echo "ℹ️  AVISO: /opt/host-agent/pipelines.yml fue actualizado."
  echo "   Antes de reiniciar host-agent (systemctl restart host-agent), verifica que no haya"
  echo "   ninguna corrida en curso revisando app_ops.pipeline_locks y /var/log/pipeline-crisolweb.log."
fi

exit 0
