# Operaciones y Pipelines de Datos del VPS (`ops/`)

> **Regla principal (vigente desde el 9 de noviembre de 2026):** Todo lo que corre en el VPS vive en Git, y nadie modifica el VPS a mano sin pasar por este repositorio y aplicar los cambios mediante `ops/install.sh`.

---

## 1. Arquitectura de cargas y horarios (Lunes a Viernes)

Toda la carga de datos del Dashboard Gerencial proviene de dos fuentes y escribe en una sola base de datos PostgreSQL (`probolsas_db`, esquemas `crisolweb.*` y `app_ops.*`):
- **Crisolweb (ERP):** Sin API; se descarga con navegador (Playwright) exclusivamente dentro del orquestador único (`pipeline-crisolweb.sh`) protegido con candado `flock`.
- **SIIGO Nube:** Ingresa únicamente por su API oficial (`siigo_api.py`), sin login web.

| Hora servidor (UTC−3) | Hora Colombia (UTC−5) | Tarea | Log / Salida |
| :--- | :--- | :--- | :--- |
| `12:35` | `10:35` | `siigo-saldos-api.py` | `/var/log/siigo-saldos-api.log` |
| `12:40` | `10:40` | `siigo-contable-api.py` | `/var/log/siigo-contable-api.log` |
| `14:00` | `12:00` | `pipeline-crisolweb.sh` (~19 min) | `/var/log/pipeline-crisolweb.log` |
| `15:00` | `13:00` | `check-frescura.sh` | Aviso por Telegram |

> ⚠️ **Ventana de bloqueo de despliegues:** Está prohibido ejecutar cambios o despliegues entre las **10:30 a. m. y la 1:30 p. m. (hora Colombia)**. `ops/install.sh` bloquea automáticamente cualquier ejecución en ese horario.

---

## 2. Inventario de archivos versionados (`ops/files/`)

La estructura dentro de `ops/files/` replica las rutas absolutas del VPS y está declarada en `ops/manifest.tsv` con sus permisos y dueño real:

| Ruta en el VPS | Copia en el repo | Qué hace | Quién lo llama | Cambio del 9/nov |
| :--- | :--- | :--- | :--- | :--- |
| `/etc/cron.d/probolsas-pipeline` | `ops/files/etc/cron.d/probolsas-pipeline` | Horarios de todas las cargas (4 tareas) | `cron` del sistema | Nuevo. El `crontab` de `root` quedó vacío |
| `/root/pipeline-crisolweb.sh` | `ops/files/root/pipeline-crisolweb.sh` | Orquestador de Crisolweb: 6 pasos en secuencia, candado `flock`, aviso por Telegram | `cron` 14:00 y botón Reintentar | Nuevo |
| `/root/sync-postgres-from-host.sh` | `ops/files/root/sync-postgres-from-host.sh` | Carga a Postgres los SQL de `sql_historico` | Paso 4 del orquestador | Reescrito: `ON_ERROR_STOP` y salida con error. Ya no carga `costo_por_orden_detalle` ni `cartera_vendedor` |
| `/root/run-sync-movimientos-materiales.sh` | `ops/files/root/run-sync-movimientos-materiales.sh` | Movimientos de materiales (wrapper en host), ventana de 7 días, aviso por Telegram | Paso 5 del orquestador | Límite de 300 s dentro del contenedor. Rango opcional `DESDE` / `HASTA` para rellenos |
| `/root/sync-movimientos-materiales.sh` | `ops/files/root/sync-movimientos-materiales.sh` | Movimientos de materiales (ejecución de sincronización) | Paso 5 del orquestador | Límite de 300 s dentro del contenedor. Rango opcional `DESDE` / `HASTA` para rellenos |
| `/root/trigger-detalle-op.sh` | `ops/files/root/trigger-detalle-op.sh` | Detalle de costeo por OP (PostCosteo) de OPs de 2026 sin detalle | Paso 6 del orquestador (6 OPs por día) | Reescrito: solo OPs de 2026, cantidad por parámetro, `ON_ERROR_STOP`, límite de tiempo interno |
| `/root/relleno-detalle-op.sh` | `ops/files/root/relleno-detalle-op.sh` | Relleno único del detalle por OP en tandas de 10 | Manual, con `systemd-run` | Nuevo, de un solo uso |
| `/root/check-frescura.sh` | `ops/files/root/check-frescura.sh` | Alarma: avisa si una tabla pasa más de 4 días sin datos nuevos (7 en CxP) o si hay OPs de 2026 con >7 días sin detalle | `cron` 15:00 | Reescrito: mide fechas del negocio, no fechas de carga |
| `/root/siigo_api.py` | `ops/files/root/siigo_api.py` | Cliente de la API oficial de SIIGO: token, balance de prueba y lectura del Excel | Los dos scripts de SIIGO | Nuevo |
| `/root/siigo-saldos-api.py` | `ops/files/root/siigo-saldos-api.py` | Saldos diarios de caja, bancos y fiducias → `app_ops.saldos_cuentas_diarios` | `cron` 12:35 y Reintentar SIIGO | Nuevo. Reemplaza a `siigo-saldos.js` |
| `/root/siigo-contable-api.py` | `ops/files/root/siigo-contable-api.py` | Finanzas (`saldos_contables_siigo`) y costos de producción (resumen y detalle por cuenta) | `cron` 12:40 y Reintentar SIIGO | Nuevo. Reemplaza a `siigo-saldos-contables-sync.js` y `siigo-costos-produccion-sync.js` |
| `/opt/host-agent/pipelines.yml` | `ops/files/opt/host-agent/pipelines.yml` | Pasos que ejecuta el botón Reintentar | Host Agent (`/opt/host-agent`, puerto 3999) | Reescrito: `crisolweb` llama al orquestador; `siigo_saldos` corre saldos y contabilidad |
| `/opt/host-agent/server.js` | `ops/files/opt/host-agent/server.js` | Servidor HTTP Express del Host Agent (puerto 3999) | `systemd` (`host-agent.service`) | Versión activa en el VPS |
| `/opt/host-agent/package.json` | `ops/files/opt/host-agent/package.json` | Dependencias de Node.js del Host Agent | `npm` / Host Agent | Versión activa en el VPS |
| `/opt/host-agent/package-lock.json` | `ops/files/opt/host-agent/package-lock.json` | Lockfile exacto de dependencias del Host Agent | `npm` / Host Agent | Versión activa en el VPS |
| `/etc/systemd/system/host-agent.service` | `ops/files/etc/systemd/system/host-agent.service` | Unidad systemd del Host Agent (`EnvironmentFile=/opt/host-agent/.env`) | `systemd` | Versión activa en el VPS |
| `/root/.openclaw/workspace/gen-upsert-sql.mjs` | `ops/files/root/.openclaw/workspace/gen-upsert-sql.mjs` | Genera los SQL de los reportes de Crisolweb (en el contenedor se ve en `/home/node/.openclaw/workspace/`) | Paso 2 del orquestador | Línea 53 comentada: `ordenes_cumplidas` sale de aquí |
| `/root/.openclaw/workspace/cron-ordenes-cumplidas.mjs` | `ops/files/root/.openclaw/workspace/cron-ordenes-cumplidas.mjs` | Órdenes cumplidas de los últimos 7 días (en el contenedor se ve en `/home/node/.openclaw/workspace/`) | Paso 3 del orquestador | Acepta `FI` / `FF` opcionales para rellenos |
| `/root/.openclaw/workspace/gen-sql-ordenes-cumplidas.mjs` | `ops/files/root/.openclaw/workspace/gen-sql-ordenes-cumplidas.mjs` | Genera el SQL de UPSERT de órdenes cumplidas a partir del CSV | `cron-ordenes-cumplidas.mjs` (Paso 3) | Dependencia directa en workspace |
| `/root/.openclaw/workspace/fetch-movimientos-v2.mjs` | `ops/files/root/.openclaw/workspace/fetch-movimientos-v2.mjs` | Descarga e inserta movimientos de materiales desde Crisolweb | `sync-movimientos-materiales.sh` (Paso 5) | Dependencia directa en workspace (`ubuntu:ubuntu`) |
| `/root/.openclaw/workspace/gen-detalle-op.mjs` | `ops/files/root/.openclaw/workspace/gen-detalle-op.mjs` | Descarga y genera el SQL del detalle de costeo por OP (PostCosteo) | `trigger-detalle-op.sh` (Paso 6) | Actualizado 9/nov: numera las líneas repetidas de una OP en vez de fallar |

---

## 3. Piezas activas fuera de Git hasta la Tarea T9 (Seguridad)

Los siguientes archivos están **activos en producción** pero se mantienen **fuera de Git** (y bloqueados en `.gitignore` y `ops/check-secrets.sh`) hasta completar la **Tarea T9**, donde se extraerán las credenciales y URLs sensibles a archivos protegidos (`chmod 600`):

1. **`/root/.openclaw/workspace/crisolweb-cron.sh`** (visto dentro del contenedor OpenClaw como `/home/node/.openclaw/workspace/crisolweb-cron.sh`):
   - **Rol:** Paso 1 del orquestador (`pipeline-crisolweb.sh`); ejecuta la descarga de los reportes R1–R4 (`crisolweb-sync.js`) y R5–R8 (`crisolweb-sync-r5r8.js`) de Crisolweb.
   - **Estado:** Pieza activa, fuera de Git hasta la T9 porque contiene el token de Telegram escrito en el script.
2. **`/root/.openclaw/workspace/crisolweb-sync.js` y `/root/.openclaw/workspace/crisolweb-sync-r5r8.js`**:
   - **Rol:** Scripts de Playwright invocados por `crisolweb-cron.sh` para descargar los reportes R1–R4 y R5–R8 de Crisolweb.
   - **Estado:** Piezas activas, fuera de Git hasta la T9 (mover las URLs de Google Apps Script `WEBAPP1` / `WEBAPP2` a un `.env`, ya que funcionan como credenciales).
3. **`/root/send-telegram.sh`**:
   - **Rol:** Script auxiliar invocado por la alarma (`check-frescura.sh`), el relleno y los scripts de SIIGO para enviar notificaciones a Telegram.
   - **Estado:** Pieza activa, fuera de Git hasta la T9.
4. **`/root/.telegram-env`**:
   - **Rol:** Archivo de entorno que almacena el token de Telegram en el VPS.
   - **Estado:** Pieza activa, fuera de Git (secreto).
5. **Archivos `.env`** (`/opt/host-agent/.env`, `/opt/probolsas/conciliacion/.env`, `/root/.hermes/scripts/.env.siigo`, `/etc/probolsas/siigo.env`, `/root/.openclaw/workspace/.env`, etc.):
   - **Estado:** Nunca se versionan bajo ninguna circunstancia.

---

## 4. Elementos retirados (sin borrar todavía en el VPS)

- **Scripts de SIIGO por navegador retirados de cron:** `siigo-saldos.js`, `siigo-saldos-contables-sync.js` y `siigo-costos-produccion-sync.js`.
- **Tablas que ya no se cargan ni se vigilan:** `crisolweb.tiempos_empleado` y `crisolweb.cartera_vendedor`.
- **Respaldos en el VPS:** archivos `*.bak-20261109` junto a cada script y tablas `app_ops.*_bak_20261109`.

---

## 5. Flujo de trabajo y herramientas

### Verificar antes de hacer commit (`ops/check-secrets.sh`)
```bash
bash ops/check-secrets.sh
```
Verifica que ningún `.env`, `.bak`, `crisolweb-cron.sh` ni `send-telegram.sh` esté en staging o en `ops/files/`, lista todas las apariciones de `TOKEN|PASS|KEY|SECRET|access_key` para inspección manual y bloquea cualquier secreto literal.

### Comparar el repositorio contra el VPS sin tocar nada (`ops/verify.sh`)
```bash
bash ops/verify.sh
```
Compara en modo solo lectura cada archivo de `ops/manifest.tsv` contra su ruta real en el sistema (`sha256sum`, `diff -u`, permisos octales y `usuario:grupo`).

### Instalar cambios en el VPS (`ops/install.sh`)
```bash
# 1. Simulación sin escribir nada
bash ops/install.sh --dry-run

# 2. Instalación real (como root, fuera del horario 10:30–13:30 Colombia)
sudo bash ops/install.sh
```
Comportamiento de `ops/install.sh`:
1. Aborta si la hora en Colombia (`TZ=America/Bogota`) está entre las `10:30` y las `13:30`.
2. Aborta con código `75` si el candado `flock` del orquestador está ocupado o `pipeline-crisolweb.sh` está corriendo.
3. Valida todos los archivos antes de tocar el sistema (`bash -n` para `.sh`, `python3 -m py_compile` sin dejar `__pycache__` para `.py`, `node --check` para `.mjs`, y validación de reglas de `/etc/cron.d/` incluyendo comentarios y variables `SHELL=`, `PATH=`, etc.).
4. Si un archivo ya es idéntico en contenido, permisos y dueño, lo salta (`[SIN CAMBIOS]`) sin generar respaldos innecesarios. Si cambia, respalda el anterior como `<archivo>.bak-AAAAMMDD-HHMMSS` e instala de forma atómica (`install` + `mv`).
