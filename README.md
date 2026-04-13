# Dashboard Gerencial — Probolsas S.A.S.

Dashboard de KPIs gerenciales en tiempo real conectado a Google Sheets, con flujo de cierre mensual por área y bandeja de aprobaciones para gerencia.

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + TypeScript + Tailwind CSS v4 + Vite |
| Backend | Node.js 20 + Express 4 |
| Datos | Google Sheets API v4 (Service Account) |
| Contenedor | Docker + Docker Compose |
| Despliegue | Portainer (stack YAML) |

## Estructura del repositorio

```
DashboardGerencial/
├── app/                  # Frontend React + Vite
│   ├── src/
│   │   ├── components/   # KPICard, Forms, Layout, Aprobaciones
│   │   ├── data/         # Tipos y mock fallback de KPIs
│   │   ├── services/     # Cliente HTTP (api.ts)
│   │   └── types/        # Interfaces compartidas
│   └── vite.config.ts    # Proxy /api → localhost:3001
├── backend/              # API Express
│   ├── src/
│   │   ├── index.js         # Servidor principal
│   │   ├── sheetsClient.js  # Wrapper Google Sheets API
│   │   └── routes/
│   │       ├── kpis.js      # GET /api/kpis
│   │       ├── cierres.js   # POST/PATCH/GET /api/cierres/*
│   │       └── setup.js     # POST /api/setup
│   └── .env.example      # Plantilla de variables de entorno
└── documento_maestro.md  # Especificación técnica completa
```

## Instalación local

### Prerrequisitos

- Node.js 20+
- Cuenta de servicio de Google Cloud con acceso a las hojas de cálculo
- Las dos hojas de Google Sheets compartidas con el email de la cuenta de servicio

### 1. Clonar y configurar el backend

```bash
cd backend
npm install
cp .env.example .env
# Editar .env con las credenciales reales
```

### 2. Variables de entorno (backend/.env)

```env
# Cuenta de servicio Google Cloud
GOOGLE_SERVICE_ACCOUNT_EMAIL=tu-cuenta@proyecto.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# IDs de las hojas de cálculo (URL: /spreadsheets/d/<ID>/edit)
SPREADSHEET_ID_1=<ID_hoja_operativa>
SPREADSHEET_ID_2=<ID_hoja_cartera_egresos>

# Umbrales de alerta (respaldo si no existen en Metas_Gerencia)
META_VENTAS=200000000
META_VENTAS_PCT_VERDE=90
META_VENTAS_PCT_AMARILLO=80
META_MARGEN_VERDE=35
META_MARGEN_AMARILLO=25
META_CARTERA_VERDE=30000000
META_CARTERA_AMARILLO=50000000
META_FLUJO_VERDE=5000000
META_CIERRE_VERDE=100
META_CIERRE_AMARILLO=60

PORT=3001
```

### 3. Inicializar hojas de cálculo

```bash
# Crea las pestañas necesarias en los spreadsheets si no existen
curl -X POST http://localhost:3001/api/setup
```

### 4. Iniciar el backend

```bash
cd backend
npm run dev        # modo desarrollo (hot reload)
# ó
npm start          # producción
```

### 5. Iniciar el frontend

```bash
cd app
npm install
npm run dev        # → http://localhost:5173
```

El frontend proxía `/api/*` al backend en `localhost:3001` (configurado en `vite.config.ts`).

---

## Despliegue en Portainer — Paso a paso

### Prerrequisitos en el servidor

- Docker + Portainer instalados
- Traefik corriendo con red externa `proxy` y certresolver `letsencrypt`
- DNS de `ippgerencia.probolsas.co` apuntando a la IP del servidor

Verificar que la red `proxy` existe:
```bash
docker network ls | grep proxy
# Si no existe:
docker network create proxy
```

---

### 1. Preparar el archivo `.env` en el servidor

```bash
# En el servidor (SSH)
mkdir -p /opt/probolsas-dashboard/backend
cd /opt/probolsas-dashboard

# Copiar .env.production.example como backend/.env y completar valores
nano backend/.env
```

El archivo `backend/.env` debe tener todos los valores de `.env.production.example` con las credenciales reales.

---

### 2. Crear el stack en Portainer

1. Ir a **Portainer → Stacks → + Add stack**
2. Nombre del stack: `probolsas-dashboard`
3. Seleccionar **Repository** como fuente:
   - Repository URL: `https://github.com/pedroprobolsas/dashboardgerencial`
   - Branch: `main`
   - Compose path: `docker-compose.yml`
4. En **Environment variables**, no es necesario agregar nada — las variables se leen desde `backend/.env` en el servidor (montado vía `env_file`)

> **Alternativa**: Si usas **Web editor**, pega el contenido de `docker-compose.yml` directamente.

5. Click **Deploy the stack**

---

### 3. Verificar el despliegue

```bash
# Ver logs del backend
docker logs probolsas-dashboard-backend -f

# Ver logs del frontend (Nginx)
docker logs probolsas-dashboard-frontend -f

# Health check del backend
curl https://ippgerencia.probolsas.co/api/health
```

El dashboard estará disponible en: **https://ippgerencia.probolsas.co**

---

### 4. Actualizar tras un git push

Cuando hay cambios en el código:

```bash
# Opción A — Desde Portainer UI
# Stacks → probolsas-dashboard → Pull and redeploy

# Opción B — Desde el servidor vía SSH
cd /opt/probolsas-dashboard
git pull origin main
docker compose build --no-cache
docker compose up -d
```

---

### Arquitectura del despliegue

```
Internet → Traefik (SSL + dominio)
               ↓ HTTPS
         [frontend: Nginx :80]
               ↓ proxy /api/*
         [backend: Express :3001]
               ↓ Google Sheets API v4
          Google Spreadsheets
```

- El backend **no** está expuesto a internet — solo accesible vía Nginx interno
- Traefik gestiona el certificado SSL automáticamente con Let's Encrypt
- La red `internal` (bridge) comunica frontend ↔ backend de forma aislada

---

## Endpoints de la API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/kpis?periodo=YYYY-MM` | KPIs del período (por defecto: mes actual) |
| `GET` | `/api/kpis?fecha=YYYY-MM-DD` | KPIs + vistazo diario para una fecha específica |
| `POST` | `/api/kpis/snapshot` | Guarda la foto del día en `Vistazo_Diario_Historico` |
| `POST` | `/api/setup` | Crea pestañas en Sheets si no existen |
| `GET` | `/api/cierres/bandeja` | Bandeja de aprobaciones gerenciales |
| `GET` | `/api/cierres/prefill/:area?periodo=YYYY-MM` | Datos pre-llenados para formularios |
| `POST` | `/api/cierres/:area` | Enviar cierre mensual de un área |
| `PATCH` | `/api/cierres/:area/:id/estado` | Aprobar o rechazar un cierre |

Áreas válidas: `Ventas`, `Finanzas`, `Produccion`, `Cartera`, `TalentoHumano`

---

## Vistazo Diario e Histórico

El componente **Vistazo Diario** permite consultar el historial operativo de días anteriores con carga instantánea.

### Fuente de Datos Históricos
Pestaña: `Vistazo_Diario_Historico` (en Spreadsheet 1)
Columnas (en orden):

| # | Columna | Descripción |
|---|---------|-------------|
| 1 | `Fecha` | YYYY-MM-DD — clave única |
| 2 | `Ventas_Dia` | Total facturado ese día |
| 3 | `Egresos_Dia` | Egresos pagados ese día |
| 4 | `Cobros_Dia` | Recaudo neto ese día |
| 5 | `Ventas_Mes_Acum` | Acumulado de ventas desde día 1 hasta esa fecha |
| 6 | `Egresos_Mes_Acum` | Acumulado de egresos desde día 1 hasta esa fecha |
| 7 | `Cobros_Mes_Acum` | Acumulado de cobros desde día 1 hasta esa fecha |
| 8 | `Meta_Ventas_Mes` | Meta vigente de ventas en ese momento |

> `Saldo_Neto` y `Flujo_Neto` no se almacenan — se calculan en el backend (`Cobros - Egresos`).

### Funcionamiento
- **Carga inicial:** El dashboard carga por defecto el día anterior (**ayer**).
- **Filtro:** Permite seleccionar cualquier fecha pasada para ver la "foto" de ese día.
- **Optimización:** Si la fecha existe en la hoja de histórico, la carga es instantánea. Si se consulta **Hoy**, el sistema calcula en tiempo real recorriendo las hojas maestras.
- **Snapshot automático:** `node-cron` ejecuta `POST /api/kpis/snapshot` todos los días a las **11:00 PM hora Colombia**, guardando la foto del día sin intervención manual.

---

## Áreas cubiertas y fuentes de datos


| KPI | Hoja origen | Columna clave |
|-----|-------------|---------------|
| Ventas vs meta | `Facturacion_OP` | `ValorFacturado` |
| Margen bruto | `Facturacion_OP` | `MARGEN` |
| Flujo de caja | `IngresoLiquidacion` + `Base Exenta` | `ValorRecibido` / `NetoPagar2` |
| Cartera vencida | `Cartera_Clientes` | `Saldo` (DiasVencidos < 0) |
| Cierre mensual | `Informes_cierre_mensual` | `Estado` |
| Eficiencia producción | `OrdenesProduccion` | `CostoEstimado/CostoTotalEjecutado1` |
| Rotación personal | `Cierre_TalentoHumano` | `Rotacion_Pct` |

---

## Licencia

Uso interno Probolsas S.A.S. — Todos los derechos reservados.
