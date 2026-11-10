# Probolsas Host Agent

> ⚠️ **Fuente de verdad en este repositorio:**
> Los archivos reales e instalados en producción del Host Agent viven en `ops/files/` y se gestionan exclusivamente mediante `ops/install.sh`:
> - `ops/files/opt/host-agent/server.js` → `/opt/host-agent/server.js`
> - `ops/files/opt/host-agent/package.json` → `/opt/host-agent/package.json`
> - `ops/files/opt/host-agent/package-lock.json` → `/opt/host-agent/package-lock.json`
> - `ops/files/opt/host-agent/pipelines.yml` → `/opt/host-agent/pipelines.yml`
> - `ops/files/etc/systemd/system/host-agent.service` → `/etc/systemd/system/host-agent.service`

---

## Cómo instalar o actualizar el Host Agent en el VPS

1. Verificar qué cambiaría sin tocar el sistema:
   ```bash
   bash ops/install.sh --dry-run
   ```
2. Aplicar los archivos validados desde `ops/` (fuera del horario de cargas de 10:30 a 13:30 hora Colombia):
   ```bash
   sudo bash ops/install.sh
   ```
3. Si cambió `/etc/systemd/system/host-agent.service`, recargar systemd:
   ```bash
   sudo systemctl daemon-reload
   ```
4. Si cambió `server.js` o `pipelines.yml`, **antes de reiniciar el servicio** confirmar que no haya una corrida en curso revisando `app_ops.pipeline_locks` o `/var/log/pipeline-crisolweb.log`, y luego reiniciar:
   ```bash
   sudo systemctl restart host-agent
   ```

## Variables de entorno (`/opt/host-agent/.env` — fuera de Git)

El servicio carga `/opt/host-agent/.env` mediante `EnvironmentFile=/opt/host-agent/.env` en systemd:
```env
HOST_AGENT_TOKEN=tu_token_seguro_aqui
```
*(Nunca versionar `/opt/host-agent/.env` ni `/opt/host-agent/node_modules`)*.
