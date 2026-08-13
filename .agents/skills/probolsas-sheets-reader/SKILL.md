---
name: probolsas-sheets-reader
description: >
  Skill especializada para leer, mapear y resolver columnas de Google Sheets en el Dashboard Gerencial de Probolsas S.A.S.
  USAR SIEMPRE que el backend (kpis.js o cualquier archivo del proyecto dashboardgerencial) necesite leer datos de Google Sheets,
  resolver nombres de columnas, depurar KPIs que muestran $0 o valores incorrectos, agregar nuevas hojas como fuente de datos,
  o blindar la capa de datos contra cambios de nombre de columnas. También activar cuando el usuario reporte que un KPI
  no muestra datos, cuando se agregue una nueva hoja al sistema, o cuando se construya cualquier endpoint nuevo que lea Sheets.
  Esta skill contiene el mapa completo de todas las hojas del proyecto, sus columnas reales, los filtros críticos,
  y el patrón de resolución robusta de columnas que evita fallos silenciosos.
---

# Probolsas Sheets Reader — Skill de Lectura Robusta de Google Sheets

## Contexto del Proyecto

**Proyecto:** Dashboard Gerencial Probolsas — `ippgerencia.probolsas.co`
**Stack backend:** Node.js 20 + Express 4.18 + Google Sheets API v4
**Archivo principal:** `backend/kpis.js`
**Cliente Sheets:** `backend/sheetsClient.js` (métodos: `readRange`, `appendRow`, `updateRowById`)

### Dos Spreadsheets como base de datos

| ID | Nombre lógico | Hojas principales |
|----|---------------|-------------------|
| SP1 | Operativa | `Facturacion_OP`, `LISTADO_DE_INGRESOS`, `Metas_Gerencia`, `Costo_por_Orden`, hojas de cierre |
| SP2 | Cartera & Egresos | `CarteraPorPagarDetalladaPorTercero`, `Consecutivo_de_egresos`, `Cierre_Cartera` |

---

## REGLA FUNDAMENTAL — Nunca fallar silenciosamente

Todo acceso a columnas de Sheets DEBE usar la función centralizada `resolverColumna`.
**Prohibido** usar `headers.findIndex(h => h === 'NombreExacto')` directo sin candidatos alternativos.

```javascript
/**
 * Resuelve el índice de una columna buscando múltiples nombres candidatos.
 * Loggea advertencia si no encuentra ninguno — nunca falla silenciosamente.
 *
 * @param {string[]} headers - Array de headers de la hoja
 * @param {string[]} candidatos - Nombres posibles en orden de prioridad
 * @param {string} contexto - Nombre descriptivo para el log (ej: 'fecha egresos')
 * @returns {number} índice encontrado o -1
 */
function resolverColumna(headers, candidatos, contexto) {
  const idx = headers.findIndex(h => candidatos.includes(h));
  if (idx === -1) {
    console.warn(`[SHEETS WARNING] Columna "${contexto}" no encontrada. Buscaba: [${candidatos.join(', ')}]. Headers disponibles: [${headers.join(', ')}]`);
  } else {
    console.log(`[SHEETS OK] Columna "${contexto}" → "${headers[idx]}" (índice ${idx})`);
  }
  return idx;
}
```

**Implementar esta función en `kpis.js` y usarla en TODOS los `findIndex` de columnas críticas.**

---

## Mapa Completo de Hojas y Columnas

> Para detalle completo de cada hoja ver: `references/hojas-detalle.md`

### Resumen rápido de columnas críticas por hoja

| Hoja | Columna fecha | Columna valor | Filtros activos |
|------|--------------|---------------|-----------------|
| `Facturacion_OP` | `FechaContable` → `Fecha` → `FECHA` | `ValorFacturado` | Ninguno adicional |
| `LISTADO_DE_INGRESOS` | `Fecha` → `FECHA` → `FechaContable` | `ValorRecibido` | `IngresoLiquidacion === ''` (solo filas base) |
| `Consecutivo_de_egresos` | **`Fecha1`** → `Fecha` → `FECHA` → `FechaContable` | **`NetoPagar2`** → `Valor` → `Neto` | `EgresoLiquidacion === 'Base Exenta'` Y `MedioPago1` NO contiene `'CRUCE'` |
| `CarteraPorPagarDetalladaPorTercero` | `FechaVencimiento` → `Fecha` | `SaldoPendiente` → `Valor` | Solo filas con saldo > 0 |
| `Costo_por_Orden` | `Fecha` → `FechaOP` | `CostoTotal` → `Valor` | Cuidado: columnas `Textbox` son subtotales — NO sumar |
| `Metas_Gerencia` | N/A | Por nombre de meta en col A, valor en col B | Leer como key-value |

---

## Patrón de Parseo de Fechas

**Problema conocido:** Las fechas en Sheets pueden venir en múltiples formatos según configuración regional.

```javascript
/**
 * Parsea fecha desde string de Google Sheets.
 * Soporta: DD/MM/YYYY (Colombia), YYYY-MM-DD (ISO), MM/DD/YYYY (US — evitar)
 */
function parseFecha(str) {
  if (!str) return null;

  // Formato Colombia: DD/MM/YYYY
  const col = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (col) return { d: +col[1], m: +col[2], y: +col[3] };

  // Formato ISO: YYYY-MM-DD
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { d: +iso[3], m: +iso[2], y: +iso[1] };

  // Formato US (MM/DD/YYYY) — sheets configuradas en inglés
  // ADVERTENCIA: Ambiguo con DD/MM/YYYY. Loggear si se detecta.
  console.warn(`[FECHA WARNING] Formato de fecha ambiguo o no reconocido: "${str}"`);
  return null;
}

// Zona horaria Colombia siempre
function hoyColombia() {
  const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  return { d: ahora.getDate(), m: ahora.getMonth() + 1, y: ahora.getFullYear() };
}

function esFechaHoy(str) {
  const f = parseFecha(str);
  if (!f) return false;
  const hoy = hoyColombia();
  return f.d === hoy.d && f.m === hoy.m && f.y === hoy.y;
}

function esFechaMes(str, mes, año) {
  const f = parseFecha(str);
  if (!f) return false;
  return f.m === mes && f.y === año;
}
```

---

## Filtros Críticos por Hoja

### `Consecutivo_de_egresos` — Los dos filtros que nunca deben faltar

```javascript
// FILTRO 1: Solo filas "Base Exenta" — estas son los egresos reales contabilizados
// Valores posibles en producción: 'Base Exenta' (con mayúsculas exactas)
const esBaseExenta = row[iEgrLiq]?.trim() === 'Base Exenta';

// FILTRO 2: Excluir cruces contables — no son egresos de caja real
const noCruce = !row[iMedioPago]?.toUpperCase().includes('CRUCE');

// Solo sumar si pasa AMBOS filtros
if (esBaseExenta && noCruce) {
  total += parseFloat(row[iValE]) || 0;
}
```

### `LISTADO_DE_INGRESOS` — Filtro de filas base

```javascript
// Solo filas donde IngresoLiquidacion está vacía = ingreso base sin distribución
const esFilaBase = !row[iIngrLiq] || row[iIngrLiq].trim() === '';
```

### `Costo_por_Orden` — Cuidado con Textbox

```javascript
// Las columnas llamadas "Textbox" son subtotales por proveedor — NO incluir en suma por orden
// Filtrar filas donde la columna de tipo sea 'Textbox' o similar
const esSubtotal = row[iTipo]?.toLowerCase().includes('textbox');
if (esSubtotal) continue; // skip
```

---

## Protocolo de Diagnóstico cuando un KPI muestra $0

Seguir este orden exacto:

**Paso 1 — Verificar que la hoja se está leyendo**
```javascript
console.log('[DEBUG] Total filas leídas de [HOJA]:', rows.length);
```
Si `rows.length === 0`: problema de permisos o nombre de hoja incorrecto.

**Paso 2 — Verificar resolución de columnas**
```javascript
console.log('[DEBUG] Índices resueltos:', { iValor, iFecha, iFiltro1, iFiltro2 });
console.log('[DEBUG] Headers disponibles:', headers);
```
Si algún índice es `-1`: la columna tiene nombre diferente. Ver mapa de columnas arriba.

**Paso 3 — Verificar formato de fechas**
```javascript
// Imprimir las primeras 3 fechas reales de la hoja
rows.slice(0, 3).forEach((r, i) => console.log(`[DEBUG] Fecha fila ${i}:`, r[iFecha]));
```

**Paso 4 — Verificar filtros**
```javascript
let conteoTotal = 0, conteoFiltro1 = 0, conteoFiltro2 = 0, conteoFinal = 0;
rows.forEach(row => {
  conteoTotal++;
  if (/* filtro 1 */) { conteoFiltro1++;
    if (/* filtro 2 */) { conteoFiltro2++;
      if (esFechaMes(row[iFecha], mes, año)) conteoFinal++;
    }
  }
});
console.log('[DEBUG] Embudo filtros:', { conteoTotal, conteoFiltro1, conteoFiltro2, conteoFinal });
```

---

## Agregar una Nueva Hoja al Sistema

Cuando se incorpore una nueva hoja de Sheets como fuente de datos:

1. **Documentar en `references/hojas-detalle.md`**: nombre de hoja, spreadsheet (SP1/SP2), todas las columnas con nombre exacto y tipo de dato.

2. **Usar siempre `resolverColumna`** para cada columna que se lea.

3. **Identificar filtros**: ¿hay filas de subtotal? ¿hay tipos de registro que excluir? ¿hay columnas con nombres no estándar como `Fecha1`, `NetoPagar2`?

4. **Agregar al mapa de hojas** en este SKILL.md (tabla resumen arriba).

5. **Probar con log de diagnóstico** antes de conectar al frontend.

---

## Bugs Conocidos y Resueltos

| Fecha | Bug | Causa | Fix |
|-------|-----|-------|-----|
| 2026-03-28 | Egresos siempre $0 en Vistazo Diario | Columna fecha se llama `Fecha1` no `Fecha` | Agregar `'Fecha1'` como primer candidato en `resolverColumna` |
| 2026-03-28 | Flujo neto mes inflado | Dependía de egresos que era 0 | Se corrige automáticamente al corregir egresos |

---

## Referencias

- `references/hojas-detalle.md` — Esquema completo columna por columna de cada hoja
- `references/filtros-negocio.md` — Reglas de negocio detrás de cada filtro (por qué existe cada uno)

---

## Protocolo para Hojas Nuevas — Checklist Obligatorio

Ejecutar estos 6 pasos ANTES de escribir cualquier lógica de KPI para una hoja nueva.

### PASO 1 — Auditoría inicial
```javascript
const rawData = await sheetsClient.readRange(ID, 'Hoja!A1:ZZ5');
const headers = rawData[0];
console.log('[NUEVA HOJA] Headers:', headers);
console.log('[NUEVA HOJA] Columnas Textbox:', headers.filter(h => h.includes('Textbox')));
console.log('[NUEVA HOJA] Muestra fila 1:', rawData[1]);
```

### PASO 2 — Detectar patrón de duplicación
Buscar columnas con nombres: `Liquidacion`, `DetalleLiquidacion`, `EgresoLiquidacion`, `IngresoLiquidacion`, `TipoFila`.
Si existe → ejecutar `detectarPatronDeduplicacion(rows, headers)` (ver sección Sistema de Deduplicación).
Si un mismo ID aparece múltiples veces → hay duplicación. Identificar qué columna discrimina la fila real.

### PASO 3 — Identificar formato numérico
| Valor de muestra | Parser |
|-----------------|--------|
| `"$75.970.920,19"` | `parsearPeso(str)` — quitar `$` `.`; `,`→`.` |
| `"49.000,00"` | `parsearNumCOP(str)` — quitar `.`; `,`→`.` |
| `"417,21"` | `parseFloat(str.replace(',','.'))` |
| `297143` | directo |

### PASO 4 — Identificar formato de fecha
| Muestra | Formato | Alerta |
|---------|---------|--------|
| `"15/03/2026"` | DD/MM/YYYY | normal |
| `"1/11/2025"` | D/M/YYYY | sin ceros |
| `"6/1/2026"` | M/D/YYYY | ⚠️ MES primero — solo COTIZACIONES |
| `"30/12/9999"` | inválida | ignorar siempre |

### PASO 5 — Validar dato real vs esperado
Calcular el total del mes y comparar manualmente contra Google Sheets antes de conectar al frontend.

### PASO 6 — Documentar en la skill
Agregar la hoja nueva a: tabla resumen SKILL.md + `references/hojas-detalle.md` + bugs si aplica.

---

## Sistema de Deduplicación — El Problema Central

### Por qué existe la duplicación
El sistema contable de Probolsas genera distribuciones automáticas por cada transacción.
Cada pago, cobro o cuenta genera múltiples filas para distribuir impuestos y retenciones.

**Regla universal:** En cualquier hoja con duplicación, existe exactamente UNA fila real.
Las demás son distribuciones contables. La fila real se identifica por una columna discriminadora.

### Los 3 patrones confirmados

**PATRÓN A — Columna vacía = fila base**
```
Hoja: LISTADO_DE_INGRESOS
Columna: IngresoLiquidacion
Fila real: valor VACÍO (null/NaN/'')
Factor: 7x — sin filtro el total se multiplica por 7
```

**PATRÓN B — Valor específico = fila base**
```
Hojas: Consecutivo_de_egresos, Cuentas_por_pagar
Columna: EgresoLiquidacion / DetalleLiquidacion
Fila real: valor === 'Base Exenta' (exacto, case-sensitive)
Factor: 10-15x
Filtro extra: MedioPago NO contiene 'CRUCE'
```

**PATRÓN C — Columnas Textbox = totales globales**
```
Hojas: Costo_por_Orden, Cuentas_por_pagar
Columnas: cualquier TextboxNN
Razón: mismo valor acumulado global en TODAS las filas — no usar para KPIs individuales
```

### Función universal de deduplicación

```javascript
function deduplicarFilas(rows, headers, patronHoja) {
  if (patronHoja === 'ninguno') return rows;

  if (patronHoja === 'vacío_base') {
    const iLiq = resolverColumna(headers,
      ['IngresoLiquidacion','Liquidacion','TipoFila'], 'discriminador');
    if (iLiq === -1) return rows;
    const filtradas = rows.filter(r => !r[iLiq] || r[iLiq].trim() === '');
    console.log(`[DEDUP] vacío_base: ${rows.length} → ${filtradas.length} filas reales`);
    return filtradas;
  }

  if (patronHoja === 'base_exenta') {
    const iLiq = resolverColumna(headers,
      ['EgresoLiquidacion','DetalleLiquidacion','Liquidacion'], 'discriminador');
    const iMedio = resolverColumna(headers,
      ['MedioPago1','MedioPago','Medio'], 'medio de pago');
    if (iLiq === -1) return rows;
    const filtradas = rows.filter(r => {
      const esBase = r[iLiq]?.trim() === 'Base Exenta';
      const noCruce = iMedio === -1 || !r[iMedio]?.toUpperCase().includes('CRUCE');
      return esBase && noCruce;
    });
    console.log(`[DEDUP] base_exenta: ${rows.length} → ${filtradas.length} filas reales`);
    return filtradas;
  }
  return rows;
}
```

### Función para detectar patrón automáticamente en hoja nueva

```javascript
function detectarPatronDeduplicacion(rows, headers) {
  const candidatos = ['Liquidacion','EgresoLiquidacion','IngresoLiquidacion',
    'DetalleLiquidacion','TipoFila','Tipo','Categoria'];

  for (const candidato of candidatos) {
    const idx = headers.findIndex(h => h === candidato);
    if (idx === -1) continue;
    const valores = [...new Set(rows.map(r => r[idx] || ''))];
    const proporcionVacios = rows.filter(r => !r[idx] || r[idx].trim() === '').length / rows.length;
    console.log(`[DETECT] "${candidato}" tiene ${valores.length} valores únicos: ${valores.slice(0,6).join(', ')}`);

    if (valores.includes('Base Exenta')) {
      console.log(`[DETECT] → PATRÓN B sugerido: 'base_exenta' via "${candidato}"`);
      return { patron: 'base_exenta', columna: candidato };
    }
    if (proporcionVacios > 0 && proporcionVacios < 0.3) {
      console.log(`[DETECT] → PATRÓN A sugerido: 'vacío_base' via "${candidato}"`);
      return { patron: 'vacío_base', columna: candidato };
    }
  }

  const textboxCols = headers.filter(h => h.includes('Textbox'));
  if (textboxCols.length > 0)
    console.log(`[DETECT] → PATRÓN C: ${textboxCols.length} columnas Textbox a ignorar`);

  console.log('[DETECT] → Sin patrón claro. Revisar manualmente con Pedro.');
  return { patron: 'ninguno', columna: null };
}
```
