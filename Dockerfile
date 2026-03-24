# ============================================================
# Stage 1 — Build del frontend React (Vite + TypeScript)
# ============================================================
FROM node:20 AS frontend-build

WORKDIR /frontend
COPY app/package*.json ./
RUN npm install
COPY app/ .
RUN npm run build
# → /frontend/dist

# ============================================================
# Stage 2 — Instalar dependencias del backend
# ============================================================
FROM node:20 AS backend-deps

WORKDIR /backend
COPY backend/package*.json ./
RUN npm ci --omit=dev

# ============================================================
# Stage 3 — Imagen de producción combinada
#            Nginx (frontend) + Express (backend) + Supervisor
# ============================================================
FROM node:20-alpine AS production

# Nginx + Supervisor para manejar dos procesos en un contenedor
RUN apk add --no-cache nginx supervisor

# ── Frontend ──────────────────────────────────────────────────────────────────
COPY --from=frontend-build /frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/http.d/default.conf

# Remover config por defecto de Alpine Nginx
RUN rm -f /etc/nginx/http.d/default.conf.apk-new 2>/dev/null || true

# ── Backend ───────────────────────────────────────────────────────────────────
COPY --from=backend-deps /backend/node_modules /backend/node_modules
COPY backend/src /backend/src

# ── Supervisor ────────────────────────────────────────────────────────────────
COPY supervisord.conf /etc/supervisord.conf

EXPOSE 80

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
