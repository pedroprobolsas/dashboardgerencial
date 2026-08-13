# Filtros de Negocio — Por qué existe cada filtro

Este archivo explica la lógica contable y operativa detrás de cada filtro
en el dashboard. Es esencial leerlo antes de modificar cualquier filtro.

---

## Por qué `EgresoLiquidacion === 'Base Exenta'` en egresos

### El problema contable
En el sistema de Probolsas, cada pago registrado en `Consecutivo_de_egresos`
genera automáticamente múltiples filas de distribución contable.

Por ejemplo, un pago de $20.000.000 a un proveedor genera:
- 1 fila con `EgresoLiquidacion = 'Base Exenta'` y `NetoPagar2 = 20.000.000`
- 1 fila para descuentos comerciales
- 1 fila para energía eléctrica extorsión 60%
- 1 fila para energía eléctrica gravada
- 1 fila para impresión 15%
- 1 fila para sellado 20%
- 1 fila para R/FTE 1, R/FTE 11%, R/FTE 2, etc.
- 1 fila para R/ICA, R/IVA

**Total: 10-15 filas para UN solo pago real.**

Si se suman todas las filas del mes, el total de egresos se multiplica 10-15x.
Solo la fila `Base Exenta` representa el egreso real de caja.

### Regla de negocio
> `Base Exenta` = el egreso "bruto" antes de distribuciones contables.
> Es el único valor que representa salida real de dinero.

---

## Por qué excluir `MedioPago1` que contiene `'CRUCE'`

### El problema operativo
Los "cruces" son compensaciones contables entre facturas y notas crédito,
o entre deudas y acreencias del mismo tercero.

Ejemplo: Si Probolsas le debe $10M a un proveedor pero ese proveedor
también le debe $3M a Probolsas, se hace un "cruce" de $3M que reduce
ambas deudas sin que salga dinero real del banco.

**Un cruce no es un egreso de caja — es un ajuste contable.**

Incluirlos inflaría el total de egresos con movimientos que nunca
implicaron salida de dinero.

---

## Por qué `IngresoLiquidacion === ''` en ingresos

### El mismo principio
Igual que egresos, cada cobro registrado en `LISTADO_DE_INGRESOS`
genera múltiples filas de distribución contable (por impuestos, retenciones, etc.)

Solo la fila con `IngresoLiquidacion` vacía es el ingreso base real.
Las demás son distribuciones del mismo cobro.

---

## Por qué ignorar columnas `Textbox` en `Costo_por_Orden`

### Subtotales automáticos
El sistema que exporta `Costo_por_Orden` genera subtotales automáticos
por cada proveedor o grupo. Estos subtotales aparecen en filas especiales
con el tipo `Textbox`.

Si se suman junto con las filas de detalle, el costo total se duplica
porque el subtotal ya incluye todas las filas anteriores del grupo.

**Regla:** Filtrar cualquier fila donde el campo de tipo/descripción
contenga la palabra `Textbox`.

---

## Reglas de negocio para KPIs de producción

### Eficiencia de producción
```
Eficiencia = (Valor Producido / Presupuesto de Producción) × 100
```
- Verde: ≥ 100% (produjo igual o más de lo presupuestado)
- Amarillo: 85% - 99%
- Rojo: < 85%

### Margen bruto
```
Margen = ((Ventas - Costo Producción) / Ventas) × 100
```
- Verde: ≥ 35%
- Amarillo: 28% - 34%
- Rojo: < 28%

### Runway de caja
```
Runway = Flujo disponible / (Egresos mensuales / 30)
```
Expresa en días cuánto tiempo puede operar la empresa con el flujo actual.
- Verde: ≥ 30 días
- Amarillo: 15 - 29 días
- Rojo: < 15 días

---

## Notas para el desarrollador

Antes de agregar un nuevo KPI o modificar un filtro existente:

1. **Consultar este archivo** — puede haber una razón contable no obvia
2. **Preguntar a gerencia** si el filtro no está documentado aquí
3. **Documentar aquí** cualquier nuevo filtro que se agregue con su justificación
4. **Nunca eliminar un filtro** sin confirmar con gerencia que la lógica cambió

Los filtros incorrectos pueden llevar a decisiones gerenciales basadas
en datos inflados o deflados. En manufactura esto impacta directamente
en precios, márgenes y flujo de caja.
