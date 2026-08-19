const express = require('express');
const { query } = require('../dbClient');
const router = express.Router();

/**
 * GET /api/movimientos_materiales
 * Endpoint MOCK (Fase A)
 */
router.get('/', async (req, res) => {
  try {
    const { anio, mes, bodega, origen } = req.query;

    // TODO: Implementar SQL real cuando se defina la estructura de crisolweb.movimientos_todos_materiales
    // Se utilizarán parámetros para filtros (anio, mes, bodega, origen)
    
    // Retornamos un MOCK por ahora
    const mockData = [
      { id: 1, fecha: '2026-08-15', material: 'MOCK-01', cantidad: 500, origen: 'Recepción', bodega: 'Bodega Principal' },
      { id: 2, fecha: '2026-08-16', material: 'MOCK-02', cantidad: -20, origen: 'Salida a producción', bodega: 'Bodega Insumos' }
    ];

    res.json({
      ok: true,
      data: mockData,
      total: 2,
      meta: {
        filtros_recibidos: { anio, mes, bodega, origen },
        nota: 'Datos MOCK. Implementación SQL pendiente de estructura de base de datos.'
      }
    });

  } catch (err) {
    console.error('GET /api/movimientos_materiales error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/movimientos_materiales/filtros
 * Obtiene las opciones disponibles para Bodegas y Orígenes (MOCK Fase A)
 */
router.get('/filtros', async (req, res) => {
  try {
    // TODO: Consultar `SELECT DISTINCT bodega FROM ...` 
    // TODO: Consultar `SELECT DISTINCT origen FROM ...`
    
    res.json({
      ok: true,
      bodegas: ['Bodega Principal', 'Bodega Insumos', 'Bodega Cuarentena'],
      origenes: ['Ajuste de inventario', 'Recepción', 'Salida a producción', 'Traslado']
    });
  } catch (err) {
    console.error('GET /api/movimientos_materiales/filtros error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
