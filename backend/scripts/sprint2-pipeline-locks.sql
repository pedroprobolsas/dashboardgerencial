-- Sprint 2: Locks y Auditoría de Pipelines

CREATE TABLE IF NOT EXISTS app_ops.pipeline_locks (
  pipeline_id       VARCHAR(64) PRIMARY KEY,
  status            VARCHAR(16) NOT NULL,  -- 'idle' | 'in_progress' | 'completed' | 'failed'
  locked_by_user_id INT,
  locked_at         TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  last_error        TEXT,
  FOREIGN KEY (locked_by_user_id) REFERENCES app_ops.usuarios(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON app_ops.pipeline_locks TO probolsas_user;

CREATE TABLE IF NOT EXISTS app_ops.action_logs (
  id             BIGSERIAL PRIMARY KEY,
  usuario_id     INT NOT NULL REFERENCES app_ops.usuarios(id),
  accion         VARCHAR(64) NOT NULL,        -- 'RETRY_PIPELINE'
  recurso        VARCHAR(128) NOT NULL,       -- 'crisolweb' | 'siigo_saldos'
  origen         VARCHAR(32) NOT NULL,        -- 'dashboard_web' | 'chatgpt_mcp' | 'api'
  resultado      VARCHAR(16),                 -- 'success' | 'failed' | 'in_progress'
  detalle        JSONB,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_logs_creado ON app_ops.action_logs (creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_action_logs_recurso ON app_ops.action_logs (recurso, creado_en DESC);

GRANT SELECT, INSERT, UPDATE ON app_ops.action_logs TO probolsas_user;
GRANT USAGE, SELECT ON SEQUENCE app_ops.action_logs_id_seq TO probolsas_user;

-- Insertar filas iniciales para los locks si no existen
INSERT INTO app_ops.pipeline_locks (pipeline_id, status)
VALUES 
  ('crisolweb', 'idle'),
  ('siigo_saldos', 'idle')
ON CONFLICT (pipeline_id) DO NOTHING;
