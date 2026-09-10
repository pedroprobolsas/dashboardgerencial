-- Sprint 1: Módulo Estado de Datos
CREATE SCHEMA IF NOT EXISTS app_ops;
GRANT USAGE ON SCHEMA app_ops TO probolsas_user;

CREATE TABLE IF NOT EXISTS app_ops.pipeline_health (
  pipeline_id           VARCHAR(64) PRIMARY KEY,
  nombre_display        VARCHAR(128) NOT NULL,
  tabla_origen          VARCHAR(128) NOT NULL,
  columna_fecha         VARCHAR(64),
  es_snapshot           BOOLEAN NOT NULL DEFAULT FALSE,
  umbral_amarillo_dias  INT NOT NULL DEFAULT 2,
  umbral_rojo_dias      INT NOT NULL DEFAULT 3,
  ultima_fecha_datos    DATE,
  ultima_verificacion   TIMESTAMPTZ,
  estado                VARCHAR(16),
  estado_anterior       VARCHAR(16),
  dias_atraso           INT,
  mensaje               TEXT,
  activo                BOOLEAN NOT NULL DEFAULT TRUE
);

GRANT SELECT, INSERT, UPDATE ON app_ops.pipeline_health TO probolsas_user;

INSERT INTO app_ops.pipeline_health (pipeline_id, nombre_display, tabla_origen, columna_fecha, es_snapshot)
VALUES
  ('crisolweb_facturas', 'Facturas (Crisolweb)', 'crisolweb.facturas', 'fecha_creacion', false),
  ('crisolweb_egresos', 'Egresos (Crisolweb)', 'crisolweb.egresos_agrupados_concepto', 'fecha_contable', false),
  ('crisolweb_cartera_clientes', 'Cartera Clientes (Crisolweb)', 'crisolweb.cartera_vendedor', NULL, true),
  ('crisolweb_cartera_proveedores', 'Cartera Proveedores (Crisolweb)', 'crisolweb.cartera_por_pagar', NULL, true),
  ('crisolweb_costo_por_orden', 'Costo por OP (Crisolweb)', 'crisolweb.costo_por_orden', 'fecha', false),
  ('crisolweb_movimientos_materiales', 'Movimientos Materiales (Crisolweb)', 'crisolweb.movimientos_materiales', 'fecha', false),
  ('siigo_saldos_bancarios', 'Saldos Bancarios (SIIGO)', 'app_ops.saldos_cuentas_diarios', 'fecha_consulta', false),
  ('dashboard_ordenes_cumplidas', 'Órdenes Cumplidas', 'crisolweb.ordenes_cumplidas', 'fecha_cumplimiento', false)
ON CONFLICT (pipeline_id) DO NOTHING;
