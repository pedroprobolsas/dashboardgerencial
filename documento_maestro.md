Lee este documento completo antes de escribir una sola línea de código. Respeta el stack, la arquitectura, los nombres exactos de columnas y el orden de fases. Muestra cada componente terminado antes de continuar con el siguiente. Pregunta si algo no está claro. Nunca asumas.

1. Contexto de la empresa
Campo
Detalle
Empresa
Probolsas S.A.S.
Sector
Manufactura y distribución de bolsas plásticas
Ciudad
Cúcuta, Colombia
Gerente
Pedro Ignacio Sandoval Varela
Herramientas actuales
Google Sheets, Apps Script, AppSheet, n8n
Perfil técnico
No es desarrollador. Tiene experiencia en automatización. Explicaciones simples siempre.
Idioma del proyecto
Todo en español — código comentado, mensajes de UI y respuestas del agente


2. Objetivo del proyecto
Construir una plataforma web integrada con dos componentes:
Componente 1 — Dashboard Gerencial
Panel exclusivo para el gerente con:
KPIs consolidados de todas las áreas en tiempo real
Gráficas interactivas con filtros temporales
Alertas automáticas por umbrales
Vista comparativa: datos del sistema vs informes reportados por líderes
Componente 2 — Sistema de Cierre Mensual
Formularios web por área donde cada líder ingresa sus resultados entre el día 1 y 5 de cada mes. Solo el gerente aprueba. Un informe no aprobado no aparece como dato oficial en el dashboard.
Por qué no es redundante
El dato del sistema dice qué pasó. El informe del líder explica por qué pasó. La diferencia entre ambos revela problemas operativos ocultos. Cada líder queda responsable de sus números con trazabilidad completa.

3. Stack tecnológico
Capa
Tecnología
Propósito
Fase
Frontend
React + Tailwind CSS
UI del dashboard y formularios
1
Lectura Sheets
gas-fakes + Google Sheets API
Conectar Antigravity con Google Sheets
1
Autenticación
Google OAuth 2.0
Login con cuenta Google corporativa
1
Base de datos actual
Google Sheets (múltiples IDs)
Fuente de verdad del negocio
1
Contenedores
Docker + docker-compose
Empaquetado de la aplicación
1
Automatizaciones
n8n (ya instalado en VPS)
Notificaciones WhatsApp y email
2
Archivos adjuntos
Google Drive
Documentos de soporte por área
2
Base de datos futura
Supabase (PostgreSQL)
Migración cuando Sheets sea insuficiente
3

Entornos
Entorno
Dónde
Cómo
Desarrollo
Local
npm run dev
Producción
VPS con Portainer
Docker Stack desplegado en Portainer

Dominio de producción
URL: https://ippgerencia.probolsas.co
DNS: CNAME ippgerencia → workstation.probolsas.co (ya configurado)
SSL: Let's Encrypt vía reverse proxy en el VPS
Patrón existente: ippchatwoot, ippportainer, ippsupabase-gestion — seguir el mismo patrón
⚠️ NO usar Vercel. El despliegue es exclusivamente en el VPS mediante Portainer Stack.

4. Fuentes de datos — Google Sheets
Spreadsheet 1
ID: 16JZW1sqvJcSRQTz0Xhe7XbW-Vqpn_JVWMLkDvW-kD6g
#
Pestaña
GID
Área
Acceso
Contenido
1
Facturacion_OP
633890332
Ventas
Lectura
Ventas por factura, márgenes, asesores
2
LISTADO_DE_FACTURAS
765107972
Ventas
Lectura
Consolidado mensual de ventas
3
Costo_por_Orden
1604502711
Producción
Lectura
Costos ejecutados vs presupuestados, márgenes
4
LISTADO_DE_INGRESOS
1161268090
Finanzas
Lectura
Consolidado mensual de ingresos, flujo de efectivo
5
RESUMEN
685665366
RRHH / Ventas
Lectura
Comisiones calculadas por período y asesor
6
Informes_cierre_mensual
334000286
Todas
Lectura y escritura
Resumen consolidado de todos los cierres
7
Cierre_Ventas
⏳ pendiente
Ventas
Lectura y escritura
Informe mensual ventas
8
Cierre_Finanzas
⏳ pendiente
Finanzas
Lectura y escritura
Informe mensual finanzas
9
Cierre_Produccion
⏳ pendiente
Producción
Lectura y escritura
Informe mensual producción
10
Cierre_Cartera
⏳ pendiente
Cartera
Lectura y escritura
Informe mensual cartera
11
Cierre_TalentoHumano
⏳ pendiente
RRHH
Lectura y escritura
Informe mensual talento humano

Spreadsheet 2
ID: 1XItFlGrzurFNYK5bzkOd2BPEwgNyHqcuC43SiVVLuzQ
#
Pestaña
GID
Área
Acceso
Contenido
12
Consecutivo_de_egresos
1858345227
Finanzas
Lectura
Gastos operativos por categoría
13
CarteraPorPagarDetalladaPorTercero
461170606
Cartera
Lectura
Cuentas por cobrar, vencimientos

📌 Los IDs nunca deben ir hardcodeados en el código. Siempre leerlos desde variables de entorno .env.

5. Estructura de datos — Columnas exactas por pestaña
⚠️ CRÍTICO: Usa exactamente estos nombres. No los traduzcas, abrevies ni cambies.
Cierre_Ventas
Columna
Tipo
Quién llena
ID_Registro
String autogenerado
Sistema
Período
String YYYY-MM
Sistema
Año
Número
Sistema
Mes
Número
Sistema
Responsable
String
Sistema (login)
Fecha_Envio
Timestamp
Sistema
Estado
Enum
Sistema
Total_Ventas_Mes
Número
Líder
Num_Facturas
Número entero
Líder
Clientes_Nuevos
Número entero
Líder
Pct_Cumplimiento_Meta
Porcentaje
Líder
Asesor_Mayor_Venta
String
Líder
Principal_Obstaculo
Texto largo
Líder
Plan_Accion_Siguiente_Mes
Texto largo (mín. 100 chars)
Líder
Comentarios_Generales
Texto libre
Líder
Link_Soporte
URL Google Drive
Líder
Comentario_Gerencia
Texto
Gerente
Fecha_Aprobacion
Timestamp
Sistema

Cierre_Finanzas
Columna
Tipo
Quién llena
ID_Registro
String autogenerado
Sistema
Período
String YYYY-MM
Sistema
Año
Número
Sistema
Mes
Número
Sistema
Responsable
String
Sistema (login)
Fecha_Envio
Timestamp
Sistema
Estado
Enum
Sistema
Total_Ingresos
Número
Líder
Total_Egresos
Número
Líder
Utilidad_Bruta
Número (calculado automático)
Sistema
Cuentas_Por_Pagar_Vigentes
Número
Líder
Obligaciones_Vencidas
Número
Líder
Flujo_Caja_Disponible
Número
Líder
Variacion_Vs_Mes_Anterior
Porcentaje (calculado)
Sistema
Comentario_Variaciones
Texto (obligatorio si desv. > 10%)
Líder
Comentarios_Generales
Texto libre
Líder
Link_Soporte
URL Google Drive
Líder
Comentario_Gerencia
Texto
Gerente
Fecha_Aprobacion
Timestamp
Sistema

Cierre_Produccion
Columna
Tipo
Quién llena
ID_Registro
String autogenerado
Sistema
Período
String YYYY-MM
Sistema
Año
Número
Sistema
Mes
Número
Sistema
Responsable
String
Sistema (login)
Fecha_Envio
Timestamp
Sistema
Estado
Enum
Sistema
Unidades_Producidas
Número
Líder
Pct_Eficiencia_Maquinas
Porcentaje
Líder
Horas_Paro_No_Programado
Número
Líder
Consumo_Materia_Prima_Kg
Número
Líder
Pct_Scrap
Porcentaje
Líder
Causas_Paro
Texto (obligatorio si paros > 0)
Líder
Inventario_Producto_Terminado
Número
Líder
Comentarios_Generales
Texto libre
Líder
Link_Soporte
URL Google Drive
Líder
Comentario_Gerencia
Texto
Gerente
Fecha_Aprobacion
Timestamp
Sistema

Cierre_Cartera
Columna
Tipo
Quién llena
ID_Registro
String autogenerado
Sistema
Período
String YYYY-MM
Sistema
Año
Número
Sistema
Mes
Número
Sistema
Responsable
String
Sistema (login)
Fecha_Envio
Timestamp
Sistema
Estado
Enum
Sistema
Cartera_Vigente
Número
Líder
Cartera_Vencida
Número
Líder
Recaudo_Mes
Número
Líder
Num_Clientes_Mora
Número entero
Líder
Cliente_Mayor_Deuda
String (obligatorio si mora > 0)
Líder
Acciones_Cobro
Texto largo (mín. 80 chars)
Líder
Comentarios_Generales
Texto libre
Líder
Link_Soporte
URL Google Drive
Líder
Comentario_Gerencia
Texto
Gerente
Fecha_Aprobacion
Timestamp
Sistema

Cierre_TalentoHumano
Columna
Tipo
Quién llena
ID_Registro
String autogenerado
Sistema
Período
String YYYY-MM
Sistema
Año
Número
Sistema
Mes
Número
Sistema
Responsable
String
Sistema (login)
Fecha_Envio
Timestamp
Sistema
Estado
Enum
Sistema
Total_Empleados
Número entero
Líder
Ingresos_Mes
Número entero
Líder
Retiros_Mes
Número entero
Líder
Horas_Extra
Número
Líder
Dias_Ausentismo
Número
Líder
Capacitaciones
Número entero
Líder
Incidentes_Seguridad
Número entero
Líder
Clima_Laboral
Texto libre
Líder
Comentarios_Generales
Texto libre
Líder
Link_Soporte
URL Google Drive
Líder
Comentario_Gerencia
Texto
Gerente
Fecha_Aprobacion
Timestamp
Sistema

Informes_cierre_mensual — GID: 334000286 (resumen consolidado)
Columna
Tipo
Descripción
ID_Registro
String
Autogenerado
Período
String YYYY-MM
Período del cierre
Año
Número
Extraído del período
Mes
Número
Extraído del período
Area
Enum
Ventas / Finanzas / Produccion / Cartera / TalentoHumano
Responsable
String
Nombre del líder
Fecha_Envio
Timestamp
Cuándo envió
Fecha_Aprobacion
Timestamp
Cuándo aprobó gerencia
Estado
Enum
BORRADOR / ENVIADO / APROBADO / RECHAZADO / VENCIDO
KPI_Principal
String
Nombre del KPI clave del área
Valor_KPI
Número
Valor reportado por el líder
Valor_Sistema
Número
Valor extraído del Sheets del software
Diferencia_Pct
Porcentaje
((Valor_KPI - Valor_Sistema) / Valor_Sistema) × 100
Alerta
Boolean
TRUE si Diferencia_Pct > 10%
Comentario_Gerencia
Texto
Comentario al aprobar o rechazar


6. Sistema de cierre mensual
Reglas de negocio
Formularios se abren el día 1 de cada mes a las 00:01
Fecha límite: día 5 a las 23:59
Pasado el día 5: formulario bloqueado → estado VENCIDO automático
Solo el gerente Pedro aprueba — sin niveles intermedios
Informe no aprobado = no visible en el dashboard oficial
Estados del informe
Estado
Asignado por
Cuándo
Acción siguiente
BORRADOR
Sistema
Al abrir el formulario
Líder completa y envía
ENVIADO
Sistema
Al hacer clic "Enviar"
Gerencia recibe notificación
APROBADO
Gerencia
Al aprobar en el dashboard
Aparece en datos oficiales
RECHAZADO
Gerencia
Al rechazar con comentario
Líder recibe notificación con motivo
VENCIDO
Sistema automático
Día 5 a las 23:59
Alerta a gerencia

Validaciones obligatorias
Diferencia valor reportado vs sistema > 10% → Comentario_Variaciones obligatorio
Horas_Paro_No_Programado > 0 → Causas_Paro obligatorio
Num_Clientes_Mora > 0 → Cliente_Mayor_Deuda obligatorio
Plan_Accion_Siguiente_Mes → mínimo 100 caracteres
Acciones_Cobro → mínimo 80 caracteres
Todos los campos numéricos → no negativos excepto Flujo_Caja_Disponible

7. Notificaciones automáticas — n8n
n8n ya está instalado y funcionando en el VPS de Probolsas. Conectar vía API de n8n.
Disparador
Canal
Destinatario
Mensaje
Día 1 del mes 08:00
WhatsApp + Email
Cada líder de área
"El informe de [Área] del mes [X] ya está disponible. Tienes hasta el día 5."
Día 3 del mes 08:00
WhatsApp
Líderes con estado BORRADOR
"Recordatorio: faltan 2 días para cerrar tu informe mensual."
Día 5 del mes 20:00
Email
Gerencia
Lista de áreas con informes pendientes
Al hacer clic "Enviar"
Email
Gerencia
"[Área] envió su informe de [Mes]. Pendiente tu aprobación."
Al aprobar
WhatsApp + Email
Líder del área
"Tu informe de [Mes] fue aprobado. [Comentario gerencia]"
Al rechazar
WhatsApp + Email
Líder del área
"Tu informe de [Mes] fue rechazado. Motivo: [Comentario]"


8. Dashboard gerencial
Acceso y seguridad
Exclusivo para el gerente (Pedro)
Login con Google OAuth 2.0
URL producción: https://ippgerencia.probolsas.co
Mobile first — debe verse perfectamente en celular
KPIs principales
KPI
Área
Fórmula
Alerta si...
Ventas del mes vs meta
Ventas
ventas_reales / meta × 100
< 80%
Margen bruto (%)
Finanzas
(ingresos - costos) / ingresos × 100
< umbral (cliente define)
Cartera vencida ($)
Cartera
Suma total cartera vencida
> umbral (cliente define)
Flujo de caja disponible
Finanzas
ingresos - egresos - obligaciones
Negativo
% Cierre mensual completado
Todas
informes aprobados / 5 × 100
< 100% después del día 7
Eficiencia producción (%)
Producción
Dato del informe producción
< 85%
Rotación de personal (%)
RRHH
(retiros / total_empleados) × 100
> 5% mensual

Vistas por área
Ventas: Gráfica barras mensual, ranking asesores, top 10 clientes, % cumplimiento meta
Finanzas: Flujo de caja, ingresos vs egresos mes a mes, obligaciones próximas a vencer
Cartera: Tabla por antigüedad de vencimiento, clientes en mora, recaudo del mes
Producción: Tendencia de eficiencia, paros por causa, scrap, inventario disponible
Talento Humano: Evolución planta, ausentismo, rotación, incidentes acumulados
Vista comparativa — Sistema vs Informe
Esta es la funcionalidad más importante del proyecto.
Para cada KPI mostrar tres columnas:
SISTEMA — valor extraído de Google Sheets del software
REPORTADO — valor ingresado por el líder
DIFERENCIA — variación porcentual
Regla visual de color:
0–5% → 🟢 verde
5–10% → 🟡 amarillo
10% → 🔴 rojo + ícono de alerta



Filtros
Período: mes actual / mes anterior / trimestre / año completo
Comparativo: mes actual vs mes anterior / vs mismo mes año anterior
Exportación
PDF: Informe gerencial completo con gráficas
Excel: Datos crudos de cualquier período
