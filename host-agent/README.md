# Probolsas Host Agent

Agente ligero en Node.js que se ejecuta en el host del VPS para orquestar los pipelines de datos desde fuera del clúster de Docker.

## Prerrequisitos
- Node.js 20+
- UFW activo (opcional pero muy recomendado)

## Instalación

1. Copiar este directorio a `/opt/host-agent`.
2. Ejecutar `npm install` dentro del directorio.
3. Crear un archivo `/opt/host-agent/.env` y añadir el token compartido:
   ```env
   HOST_AGENT_TOKEN=tu_token_seguro_aqui
   ```
4. Crear el servicio de systemd `/etc/systemd/system/host-agent.service`:
   ```ini
   [Unit]
   Description=Probolsas Host Agent
   After=network.target

   [Service]
   Type=simple
   User=root
   WorkingDirectory=/opt/host-agent
   ExecStart=/usr/bin/node server.js
   Restart=always
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   ```
5. Iniciar y habilitar el servicio:
   ```bash
   systemctl daemon-reload
   systemctl enable --now host-agent
   ```

## Seguridad de Red (IMPORTANTE)

El servidor Express escucha nativamente en `0.0.0.0:3999`. Dado que la IP pública y la IP LAN de tu VPS son la misma (`147.93.44.250`), el puerto **3999 queda expuesto a internet** a menos que configures UFW para bloquear el tráfico externo y solo permitir el puente local de Docker.

**Configurar UFW:**
```bash
# Denegar tráfico desde el exterior al puerto 3999
sudo ufw deny 3999/tcp

# Permitir explícitamente a las subredes de Docker acceder al puerto (ej. red bridge o redes de Swarm)
# Reemplaza '172.17.0.0/16' por el rango de tu red docker si es distinto
sudo ufw allow from 172.17.0.0/16 to any port 3999
sudo ufw allow from 10.0.0.0/8 to any port 3999
```

## URL para el Dashboard

En la configuración del Swarm para el dashboard, carga la variable así:
```
HOST_AGENT_URL=http://147.93.44.250:3999
```
Asegúrate de haber denegado el puerto públicamente en el firewall del VPS.
