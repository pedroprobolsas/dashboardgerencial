INSERT INTO app_ops.parametros (clave, valor, unidad, descripcion, categoria, modificado_por)
SELECT 'ratio_ajuste_inventario', 77, '%', 'Ratio inicial validado por Contabilidad para ajuste de inventario', 'Inventario', 'sistema@probolsas.com'
WHERE NOT EXISTS (
    SELECT 1 FROM app_ops.parametros WHERE clave = 'ratio_ajuste_inventario'
);
