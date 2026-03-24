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

## Despliegue en Portainer (Docker)

### Variables de entorno requeridas en el stack

En Portainer → Stacks → Add stack → Web editor, define las siguientes variables de entorno antes de desplegar:

| Variable | Descripción |
|----------|-------------|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email de la cuenta de servicio |
| `GOOGLE_PRIVATE_KEY` | Clave privada completa (con `\n` literales) |
| `SPREADSHEET_ID_1` | ID de la hoja operativa |
| `SPREADSHEET_ID_2` | ID de la hoja de cartera/egresos |
| `META_VENTAS` | Meta de ventas en COP (ej: `450000000`) |

### docker-compose.yml (stack Portainer)

```yaml
version: '3.9'

services:
  backend:
    build:
      context: ./backend
    restart: unless-stopped
    environment:
      - GOOGLE_SERVICE_ACCOUNT_EMAIL=${GOOGLE_SERVICE_ACCOUNT_EMAIL}
      - GOOGLE_PRIVATE_KEY=${GOOGLE_PRIVATE_KEY}
      - SPREADSHEET_ID_1=${SPREADSHEET_ID_1}
      - SPREADSHEET_ID_2=${SPREADSHEET_ID_2}
      - META_VENTAS=${META_VENTAS}
      - PORT=3001
    ports:
      - "3001:3001"

  frontend:
    build:
      context: ./app
      args:
        - VITE_API_URL=http://backend:3001
    restart: unless-stopped
    ports:
      - "80:80"
    depends_on:
      - backend
```

### Pasos en Portainer

1. Conectar el repositorio GitHub como stack source (o pegar el YAML manualmente)
2. Definir las variables de entorno en la sección **Environment variables**
3. Deploy the stack
4. Acceder al dashboard en `http://<IP-VPS>:80`

---

## Endpoints de la API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/kpis?periodo=YYYY-MM` | KPIs del período (por defecto: mes actual) |
| `POST` | `/api/setup` | Crea pestañas en Sheets si no existen |
| `GET` | `/api/cierres/bandeja` | Bandeja de aprobaciones gerenciales |
| `GET` | `/api/cierres/prefill/:area?periodo=YYYY-MM` | Datos pre-llenados para formularios |
| `POST` | `/api/cierres/:area` | Enviar cierre mensual de un área |
| `PATCH` | `/api/cierres/:area/:id/estado` | Aprobar o rechazar un cierre |

Áreas válidas: `Ventas`, `Finanzas`, `Produccion`, `Cartera`, `TalentoHumano`

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
