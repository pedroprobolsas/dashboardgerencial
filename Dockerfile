# ============================================================
# Stage 1 — Build del frontend React (Vite + TypeScript)
# ============================================================
FROM node:20-alpine AS frontend-build

WORKDIR /frontend

# Instalar dependencias primero (aprovecha cache de capas)
COPY app/package*.json ./
RUN npm ci

# Copiar fuente y compilar
COPY app/ .
RUN npm run build
# → Resultado en /frontend/dist

# ============================================================
# Stage 2 — Servir el frontend con Nginx
#            + proxy inverso hacia el backend en /api
# ============================================================
FROM nginx:alpine AS frontend

# SPA compilada
COPY --from=frontend-build /frontend/dist /usr/share/nginx/html

# Configuración Nginx: SPA fallback + proxy /api → backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# ============================================================
# Stage 3 — Backend Express (Node.js 20)
# ============================================================
FROM node:20-alpine AS backend

WORKDIR /app

# Solo dependencias de producción
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Código fuente
COPY backend/src/ ./src/

EXPOSE 3001
CMD ["node", "src/index.js"]
