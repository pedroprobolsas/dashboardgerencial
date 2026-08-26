CREATE TABLE IF NOT EXISTS app_ops.lideres (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    area VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS app_ops.kpi_definiciones (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    lider_id INTEGER NOT NULL REFERENCES app_ops.lideres(id) ON DELETE CASCADE,
    tipo_calculo VARCHAR(100) NOT NULL
);
