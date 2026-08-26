INSERT INTO app_ops.parametros (clave, valor, unidad, descripcion, categoria, vigente_desde, modificado_por)
SELECT 'kpi_cumplimiento_margen', 5, '%', 'Margen de cumplimiento de cantidad para KPIs', 'KPIs', '2026-07-01', 'sistema@probolsas.com'
WHERE NOT EXISTS (SELECT 1 FROM app_ops.parametros WHERE clave = 'kpi_cumplimiento_margen' AND vigente_desde = '2026-07-01');

INSERT INTO app_ops.parametros (clave, valor, unidad, descripcion, categoria, vigente_desde, modificado_por)
SELECT 'kpi_cumplimiento_incentivo_positivo', 2000, 'COP', 'Incentivo positivo por cumplir margen de cantidad', 'KPIs', '2026-07-01', 'sistema@probolsas.com'
WHERE NOT EXISTS (SELECT 1 FROM app_ops.parametros WHERE clave = 'kpi_cumplimiento_incentivo_positivo' AND vigente_desde = '2026-07-01');

INSERT INTO app_ops.parametros (clave, valor, unidad, descripcion, categoria, vigente_desde, modificado_por)
SELECT 'kpi_cumplimiento_incentivo_negativo', -4000, 'COP', 'Incentivo negativo por no cumplir margen de cantidad', 'KPIs', '2026-07-01', 'sistema@probolsas.com'
WHERE NOT EXISTS (SELECT 1 FROM app_ops.parametros WHERE clave = 'kpi_cumplimiento_incentivo_negativo' AND vigente_desde = '2026-07-01');
