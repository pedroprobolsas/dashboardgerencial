# Pipeline de Datos del Dashboard

Este documento describe de dónde provienen los datos que alimentan el Dashboard Gerencial y cómo fluyen desde los sistemas de origen hasta la base de datos PostgreSQL (`probolsas_db`).

## Flujo de Sincronización (PostgreSQL)

El flujo para las tablas del esquema `crisolweb` (ej. `costo_por_orden`, `facturas`, `cartera_por_pagar`) es el siguiente:

1. **Origen:** Sistema Crisolweb.
2. **Extracción:** Scraper automatizado con Playwright (contenedor `OpenClaw`). Se ejecuta mediante un cronjob los **lunes, miércoles y viernes a las 9:05 AM**.
3. **Almacenamiento Temporal:** Los resultados de la extracción se guardan como archivos `.sql` en el directorio `sql_historico/`.
4. **Ingesta:** El script `sync-postgres-from-host.sh` toma los archivos `.sql` y los inyecta en el esquema `crisolweb` de la base de datos `probolsas_db`. Este proceso corre de forma independiente a las **9:20 AM**.

> [!WARNING]
> **Crons Independientes:** Los pasos de extracción (9:05) e ingesta (9:20) son crons separados. En el pasado estaban encadenados con `&&`, lo cual causó un fallo silencioso que dejó al dashboard sin datos nuevos por 84 días. No volver a agruparlos condicionalmente sin alertas sólidas.

## Reglas de Negocio y Fuentes Específicas

### Margen por OP (`crisolweb.costo_por_orden`)
* Es la fuente principal de la vista "Margen por OP".
* La columna `margen_pct` **viene calculada de origen** por Crisolweb y refleja la fórmula financiera oficial de la empresa. En el backend/frontend, este valor se debe usar *directamente*, sin intentar recalcularlo (ya que el "costo total" en el sistema incluye elementos adicionales como comisiones y gastos financieros que no se desglosan a nivel de API).

### Reporte de Control de Piso
* En el sistema, **'CW'** hace referencia al **costo de máquina** (energía, mantenimiento, cuadres, rodaje) y NO es un dato bruto del sistema.
* El costo cotizado agrupa el valor de **operario + máquina** de forma conjunta. Por este motivo, **no se pueden comparar por separado** de forma directa en los reportes de variaciones de costo.

## Troubleshooting

> [!TIP]
> **Si las vistas del dashboard (ej. Margen por OP) aparecen vacías o muestran el Empty State ("No hay órdenes registradas"):**
> 
> Lo primero que se debe revisar es el valor de `MAX(fecha)` directamente en la tabla afectada (ej. `SELECT MAX(fecha) FROM crisolweb.costo_por_orden;`) para verificar si el pipeline de extracción/ingesta se detuvo, **antes de asumir que el código del dashboard está roto**.
