-- Insertar un líder de prueba si no existe
INSERT INTO app_ops.lideres (nombre, area)
SELECT 'Carlos Producción (Prueba)', 'Producción'
WHERE NOT EXISTS (
    SELECT 1 FROM app_ops.lideres WHERE nombre = 'Carlos Producción (Prueba)'
);

-- Obtener el id del líder e insertar la definición del KPI
INSERT INTO app_ops.kpi_definiciones (nombre, lider_id, tipo_calculo)
SELECT 'Cumplimiento de Cantidad', id, 'cumplimiento_cantidad'
FROM app_ops.lideres 
WHERE nombre = 'Carlos Producción (Prueba)'
  AND NOT EXISTS (
      SELECT 1 FROM app_ops.kpi_definiciones 
      WHERE nombre = 'Cumplimiento de Cantidad' AND tipo_calculo = 'cumplimiento_cantidad'
  );
