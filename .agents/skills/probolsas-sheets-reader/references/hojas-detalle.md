# hojas-detalle

# Detalle Completo de Hojas Google Sheets — Probolsas
> Última actualización: 2026-03-28 — Validado contra CSVs reales exportados de Sheets

---

## MAPA DE COMPLEJIDADES POR HOJA

| Hoja | Filas aprox | Complejidad | Riesgo principal |
|------|-------------|-------------|-----------------|
| `LISTADO_DE_INGRESOS` | 39.000+ | ALTA | 7 filas por cobro — solo 1 es base real |
| `Costo_por_Orden` | 257 | ALTA | 30 columnas Textbox = totales globales — NUNCA sumar |
| `Consecutivo_de_egresos` | variable | ALTA | 10-15 filas por egreso + columna `Fecha1` no estándar |
| `Cuentas_por_pagar` | 4.800+ | MEDIA-ALTA | 13 filas por factura + Textboxes acumulados |
| `CarteraPorPagarDetalladaPorTercero` | 123 | MEDIA | Fechas `30/12/9999` + DiasVencidos corruptos |
| `COTIZACIONES` | 692 | MEDIA | Fecha formato M/D/YYYY (US) + estados como columnas X |
| `Facturacion_OP` | variable | BAJA | Nombre columna fecha puede variar |
| `Metas_Gerencia` | ~15 | BAJA | Key-value simple |

---

## RESUMEN DE FORMATOS — Referencia rápida

### Formatos numéricos por hoja

| Hoja | Ejemplo | Parser necesario |
|------|---------|-----------------|
| `Facturacion_OP` | `"$75.970.920,19"` | quitar `$` y `.`; `,`→`.` |
| `LISTADO_DE_INGRESOS` | `"$2.925.200"` | quitar `$` y `.` |
| `Costo_por_Orden` | `"$75.970.920,19"` | quitar `$` y `.`; `,`→`.` |
| `Consecutivo_de_egresos` | `"$20.000.000,00"` | quitar `$` y `.`; `,`→`.` |
| `Cuentas_por_pagar` | `"49.000,00"` | quitar `.`; `,`→`.` (sin `$`) |
| `COTIZACIONES` | `"417,21"` | solo `,`→`.` |
| `CarteraPorPagarDetalladaPorTercero` | `297143` | ya numérico |

### Formatos de fecha por hoja

| Hoja | Ejemplo | Formato | Alerta |
|------|---------|---------|--------|
| `Facturacion_OP` | `"15/03/2026"` | DD/MM/YYYY | normal |
| `LISTADO_DE_INGRESOS` | `"1/11/2025"` | D/M/YYYY | ⚠️ sin ceros |
| `Consecutivo_de_egresos` | `"30/12/2025"` | DD/MM/YYYY | normal |
| `Costo_por_Orden` | `"13/3/2025"` | D/M/YYYY | ⚠️ sin ceros |
| `COTIZACIONES` | `"6/1/2026"` | M/D/YYYY | ⚠️ MES primero (formato US) |
| `CarteraPorPagarDetalladaPorTercero` | `"02/03/2026"` | DD/MM/YYYY | normal |
| `Cuentas_por_pagar` | `"30/12/2025"` | DD/MM/YYYY | normal |

**Función parseFecha robusta para todas las hojas:**
```javascript
function parseFecha(str, formatoHoja) {
  if (!str || str === '30/12/9999') return null;
  const partes = str.split('/');
  if (partes.length !== 3) return null;

  let d, m, y;
  if (formatoHoja === 'US') {
    // COTIZACIONES: M/D/YYYY
    [m, d, y] = partes.map(Number);
  } else {
    // Resto: D/M/YYYY o DD/MM/YYYY
    [d, m, y] = partes.map(Number);
  }
  if (!d || !m || !y) return null;
  return { d, m, y };
}
```

---

## SP1 — Spreadsheet Operativa

---

### `Facturacion_OP`
**Propósito:** Facturas de venta emitidas  
**Usado en:** KPI ventas del día, ventas mes, margen bruto

| Columna | Tipo | Notas |
|---------|------|-------|
| `FechaContable` | String DD/MM/YYYY | **Fecha principal** |
| `Fecha` | String | Alternativa |
| `FECHA` | String | Alternativa mayúsculas |
| `ValorFacturado` | String `"$X.XXX.XXX,XX"` | Parsear con función peso |

---

### `LISTADO_DE_INGRESOS`
**Propósito:** Cobros recibidos de clientes  
**Filas totales:** ~39.291 (mayoría son distribuciones contables)

| Columna | Tipo | Notas |
|---------|------|-------|
| `RowKey` | String | `"3702\|BASE"` — ID = consecutivo + pipe + tipo |
| `Consecutivo` | Integer | ID del cobro — se repite 7 veces |
| `Tercero` | String | Cliente |
| `Fecha` | String D/M/YYYY | ⚠️ Sin ceros: `"1/11/2025"` |
| `ValorRecibido` | String `"$2.925.200"` | **Valor real** |
| `ValorTotal` | String `"$5.362.645,75"` | Con IVA |
| `IngresoLiquidacion` | String o NaN | **FILTRO CRÍTICO** |
| `Mes` | String | `"noviembre"` — español minúsculas |
| `Año` | Integer | |

**⚠️ PATRÓN CONFIRMADO — 7 filas por cobro:**
```
Fila 1: IngresoLiquidacion = NaN/vacío          ← BASE REAL — USAR ESTA
Fila 2: "AJUSTE AL PESO GASTO"                   ← ignorar
Fila 3: "AJUSTE AL PESO ING"                     ← ignorar
Fila 4: "AUTORETENCION"                          ← ignorar
Fila 5: "R/FTE"                                  ← ignorar
Fila 6: "R/ICA"                                  ← ignorar
Fila 7: "R/IVA"                                  ← ignorar
```
Sin filtro → total inflado 7x.

---

### `COTIZACIONES`
**Propósito:** Cotizaciones por vendedor  
**Filas:** ~692

| Columna | Tipo | Notas |
|---------|------|-------|
| `RowKey` | String | `"3330-1"` |
| `Vendedor1` | String | Nombre completo |
| `Nro` | Integer | Número cotización |
| `FechaCreacion` | String M/D/YYYY | ⚠️ **FORMATO US — mes primero** `"6/1/2026"` = enero 6 |
| `VrUnit` | String `"417,21"` | Solo coma decimal — sin `$` ni puntos |
| `VrTotal` | String `"3337713,76"` | Igual |
| `Aprobado` | `"X"` o NaN | Estado aprobado |
| `Pendientes` | `"X"` o NaN | Estado pendiente |
| `Anuladas` | valor o NaN | Estado anulado |
| `MES` | String | `"enero"` — español minúsculas |

**⚠️ ADVERTENCIAS:**
1. **Fecha M/D/YYYY** — único caso en todo el sistema. `"6/1/2026"` = 6 de enero, NO 1 de junio.
2. **Estados como columnas separadas** — no hay columna `Estado`. Tres columnas booleanas.

```javascript
function estadoCotizacion(row, iAprobado, iPendiente, iAnulada) {
  if (row[iAprobado] === 'X') return 'aprobada';
  if (row[iPendiente] === 'X') return 'pendiente';
  if (row[iAnulada]) return 'anulada';
  return 'sin_estado';
}
```

---

### `Costo_por_Orden`
**Propósito:** Costos estimados vs ejecutados por orden  
**Filas:** ~257 órdenes  
**Columnas totales:** 58 (28 útiles + 30 Textbox)

**Columnas útiles:**

| Columna | Tipo | Notas |
|---------|------|-------|
| `NroOrdenProduccion1` | Integer | ID orden |
| `NombreTrabajo1` | String | Descripción producto |
| `Cliente1` | String | |
| `CostoTotalEstimado` | String `"$X"` | Costo presupuestado |
| `CostoTotalEjecutado1` | String `"$X"` | **Costo real ejecutado** |
| `ValorTotal1` | String `"$X"` | Valor de venta presupuestado |
| `ValorCumplido` | String `"$X"` | Valor de venta real |
| `Comision1` | String `"$X"` | Comisión calculada |
| `DifEjecutado` | String | Diferencia presupuesto-ejecutado |
| `Vendedor` | String | Nombre completo |
| `LineaProducto` | String | `"EMPAQUES_FLEXIBLES"`, `"MEZCLAS"`, etc. |
| `FechaInicioOP` | String D/M/YYYY | ⚠️ Sin ceros |
| `FechaFinOP` | String D/M/YYYY | ⚠️ Sin ceros |

**⚠️ ADVERTENCIA CRÍTICA — 30 columnas Textbox:**

```
Textbox17, Textbox18, Textbox20, Textbox22, Textbox23, Textbox24,
Textbox25, Textbox26, Textbox28, Textbox29, Textbox30, Textbox31,
Textbox32, Textbox44, Textbox45, Textbox47, Textbox50, Textbox52,
Textbox56, Textbox59, Textbox60, Textbox63, Textbox64, Textbox74,
Textbox77, Textbox78, Textbox82, Textbox84, Textbox88
```

**Son totales globales del reporte — el mismo valor en TODAS las filas.**  
Ejemplo: `Textbox17 = 1.548.806` es igual en la fila 1 y en la fila 257.  
**NUNCA usar para cálculos por orden de producción.**

---

### `Metas_Gerencia`
**Estructura key-value — Ver SKILL.md sección principal.**

---

## SP2 — Spreadsheet Cartera & Egresos

---

### `Consecutivo_de_egresos`
**Propósito:** Egresos/pagos realizados  

| Columna | Tipo | Notas |
|---------|------|-------|
| `Egreso1` | Integer | ID |
| `Tercero1` | String | Proveedor |
| `Fecha1` | String DD/MM/YYYY | ⚠️ **NOMBRE NO ESTÁNDAR** |
| `MedioPago1` | String | `EFECTIVO`, `BANCARIO`, `PSE`, `CRUCE` |
| `NetoPagar2` | String | ⚠️ **NOMBRE NO ESTÁNDAR** — valor del egreso |
| `EgresoLiquidacion` | String | **FILTRO CRÍTICO** |
| `NetoPagar3` | String | Acumulado global — NO usar |
| `Mes` | String | Español |
| `Año` | Integer | |

**Patrón 10-15 filas por egreso — ver SKILL.md principal.**

---

### `Cuentas_por_pagar`
**Propósito:** Cuentas por pagar pendientes a proveedores  
**Filas:** ~4.830

| Columna | Tipo | Notas |
|---------|------|-------|
| `DetalleLiquidacion` | String | **FILTRO CRÍTICO** — igual a EgresoLiquidacion |
| `Consecutivo1` | Integer | ID |
| `Tercero` | String | Proveedor |
| `NroFactura` | Integer | |
| `PeriodoRegistro` | String DD/MM/YYYY | Fecha registro |
| `Vencimiento` | String DD/MM/YYYY | Fecha vencimiento |
| `ValorNeto` | String `"49.000,00"` | ⚠️ Sin `$`, punto miles, coma decimal |
| `Valor2` | String | Valor individual — usar este |
| `Valor1` | String | Acumulado — NO usar para individual |
| `ValorNeto1` | String | Acumulado global — NO usar |
| `Textbox67`, `Textbox5`, `Textbox64` | String | Totales globales — NO usar |
| `Mes` | String | Español |
| `Año` | Integer | |

**⚠️ Filtro igual a egresos:** Solo `DetalleLiquidacion === 'Base Exenta'`

**Valores únicos confirmados de DetalleLiquidacion:**
```
'Base Exenta'                      ← USAR
'DESCUENTOS'                       ← ignorar
'Energía eléctrica extursión 60%'  ← ignorar
'Energia Electrica Gravada'        ← ignorar
'Energía Eléctrica impresión 15%'  ← ignorar
'Energía eléctrica sellado 20%'    ← ignorar
'R/FTE 1', 'R/FTE 11%', 'R/FTE 2', 'R/FTE 2.5', 'R/FTE 3.5', 'R/FTE 4'
'R/ICA', 'R/IVA'
```

---

### `CarteraPorPagarDetalladaPorTercero`
**Propósito:** Saldo de deuda por proveedor con antigüedad  
**Filas:** 123

| Columna | Tipo | Notas |
|---------|------|-------|
| `Proveedor` | String | Con `":"` al final — limpiar |
| `NroFactura` | Integer | |
| `FechaContable` | String DD/MM/YYYY | Con ceros |
| `FechaVencimiento` | String DD/MM/YYYY | ⚠️ Puede ser `"30/12/9999"` |
| `ValorTotal` | Float | Ya numérico |
| `Saldo` | Float | Ya numérico — puede ser negativo |
| `Por vencer` | Float | Monto aún no vencido |
| `DiasVencidos` | String | ⚠️ Puede tener puntos: `"2.912.357"` |
| `30` | Float | Saldo vencido 1-30 días |
| `60` | Float | Saldo vencido 31-60 días |
| `90` | Float | Saldo vencido 61-90 días |
| `100` | Float | Saldo vencido +90 días |
| `ValorTotal1` | String | Acumulado — NO usar |

**⚠️ ADVERTENCIAS CRÍTICAS:**

1. **`FechaVencimiento = '30/12/9999'`:** 18 filas = sin vencimiento definido. Tratar como indefinido, NO calcular días.

2. **`DiasVencidos` con puntos:** `"2.912.357"` no es 2 millones de días — es corrupción de datos. Filtrar > 3650.

3. **`Saldo` negativo:** 15 filas = anticipos o notas crédito. Excluir de deuda vencida.

4. **Nombre proveedor con `:` al final:** Siempre limpiar con `.replace(':', '').trim()`.

```javascript
// Parsers específicos para esta hoja
const parsearDiasVencidos = str => {
  const n = parseInt((str || '0').replace(/\./g, ''));
  return n > 3650 ? null : n; // null = dato inválido
};

const esFechaValida = str => str && str !== '30/12/9999';

const limpiarProveedor = str => (str || '').replace(':', '').trim();
```
