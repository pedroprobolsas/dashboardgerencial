# Implementación de Módulo de KPIs e Incentivos (Fase 1)

## User Review Required
> [!IMPORTANT]
> El daemon de Docker local no está en ejecución o no expone el servicio PostgreSQL (`postgres_postgres`). Para cumplir con el requerimiento de ejecutar y mostrar el cálculo de julio y agosto, preparé un script que realiza exactamente esto de manera aislada, pero necesito que levantes los contenedores o ejecutes el script para ver el resultado en tu máquina.

## Propuesta de Esquema

### 1. Nuevas Tablas en `app_ops`
#### [NEW] Tabla: `app_ops.lideres`
*   `id` SERIAL PRIMARY KEY
*   `nombre` VARCHAR(255) NOT NULL
*   `area` VARCHAR(255) NOT NULL

#### [NEW] Tabla: `app_ops.kpi_definiciones`
*   `id` SERIAL PRIMARY KEY
*   `nombre` VARCHAR(255) NOT NULL
*   `lider_id` INTEGER NOT NULL REFERENCES app_ops.lideres(id) ON DELETE CASCADE
*   `tipo_calculo` VARCHAR(100) NOT NULL (ej: 'cumplimiento_cantidad')

### 2. Nuevos Parámetros en `app_ops.parametros`
*   `kpi_cumplimiento_margen`: Valor `5` (unidad: `%`, categoría: `KPIs`, vigente_desde: `2026-07-01`)
*   `kpi_cumplimiento_incentivo_positivo`: Valor `2000` (unidad: `COP`, categoría: `KPIs`, vigente_desde: `2026-07-01`)
*   `kpi_cumplimiento_incentivo_negativo`: Valor `-4000` (unidad: `COP`, categoría: `KPIs`, vigente_desde: `2026-07-01`)

### 3. Lógica de Cálculo del KPI 'Cumplimiento de Cantidad'
La lógica obtiene las OPs en `crisolweb.ordenes_cumplidas` para el mes requerido.
*   **Fórmula:** `cantidad_cumplida / NULLIF(cantidad_pedida, 0)`
*   **Margen:** Se considera **DENTRO del margen** si la diferencia porcentual absoluta contra 100% (1.0) es menor o igual al margen configurado (5%). Es decir, el ratio está entre `0.95` y `1.05`.
*   **Fuera de margen:** Si es menor a `0.95` o mayor a `1.05`.

## Open Questions
> [!WARNING]
> ¿Confirmas que el margen del 5% funciona bidireccionalmente (se acepta desde 95% hasta 105%)?
> ¿Deseas que asigne un `vigente_desde` específico diferente al 1 de Julio para estos parámetros iniciales?

## Script de Verificación para Julio y Agosto
Como el Docker no respondió localmente, creé el archivo `backend/scripts/test-kpi-1.js`. Al aprobar este plan, por favor ejecuta en tu terminal:
```bash
cd backend
node scripts/test-kpi-1.js
```
Esto arrojará los datos exactos que pides con el modelo que estructuré, usando los parámetros versionados.
