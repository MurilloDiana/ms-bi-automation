# KPIs y Reportes — Contrato para Frontend

> Este documento es el **contrato oficial** entre el microservicio y cualquier consumidor (dashboard web, app móvil, exportadores). Todos los endpoints están bajo `/api/v1` y devuelven JSON con la envoltura estándar:
>
> ```json
> { "ok": true, "data": <payload> }
> ```
>
> En caso de error:
>
> ```json
> { "ok": false, "error": { "code": "STRING", "message": "...", "details": [...] } }
> ```

**Empresa objetivo:** material de escritorio. Activos relevantes: PCs, impresoras, fotocopiadoras, plotters, sistemas de etiquetado, mobiliario de oficina.

---

## Índice

- [Endpoint maestro: Dashboard](#endpoint-maestro-dashboard)
- [5 KPIs](#5-kpis)
  - [KPI-1 — Tasa de Disponibilidad de Activos](#kpi-1--tasa-de-disponibilidad-de-activos)
  - [KPI-2 — MTTR (Mean Time To Repair)](#kpi-2--mttr-mean-time-to-repair)
  - [KPI-3 — MTBF (Mean Time Between Failures)](#kpi-3--mtbf-mean-time-between-failures)
  - [KPI-4 — Top 10 Activos por Costo de Mantenimiento](#kpi-4--top-10-activos-por-costo-de-mantenimiento)
  - [KPI-5 — Cumplimiento de Mantenimiento Preventivo](#kpi-5--cumplimiento-de-mantenimiento-preventivo)
- [5 Reportes](#5-reportes)
  - [REP-1 — Solicitudes por Estado](#rep-1--solicitudes-por-estado)
  - [REP-2 — Depreciación de Activos](#rep-2--depreciación-de-activos)
  - [REP-3 — Top de Fallas por Activo](#rep-3--top-de-fallas-por-activo)
  - [REP-4 — Productividad por Técnico](#rep-4--productividad-por-técnico)
  - [REP-5 — Distribución de Solicitudes por Área](#rep-5--distribución-de-solicitudes-por-área)

---

## Endpoint maestro: Dashboard

Devuelve los **5 KPIs en una sola llamada** (paralelizados internamente, cache en memoria de 60 s).

`GET /api/v1/kpis/dashboard`

**Respuesta:**

```json
{
  "ok": true,
  "data": {
    "generadoEn": "2026-05-28T20:15:00.000Z",
    "kpis": {
      "disponibilidad": { "...": "ver KPI-1" },
      "mttr": { "...": "ver KPI-2" },
      "mtbf": { "...": "ver KPI-3" },
      "topCostos": { "...": "ver KPI-4" },
      "cumplimientoPreventivo": { "...": "ver KPI-5" }
    }
  }
}
```

**Uso recomendado en frontend:** una sola llamada al cargar el dashboard, refresh manual con botón o auto-refresh cada 60–120 s.

---

# 5 KPIs

## KPI-1 — Tasa de Disponibilidad de Activos

**Pregunta de negocio:** ¿Qué porcentaje de los activos están operativos hoy?

**Fórmula:**

```
disponibilidad_% = (activos_operativos / total_activos_no_dados_de_baja) * 100
```

**Endpoint embebido** en `/dashboard`. No tiene endpoint individual (es un agregado simple).

**Payload:**

```json
{
  "totalActivos": 248,
  "operativos": 226,
  "enMantenimiento": 18,
  "dadosDeBaja": 4,
  "disponibilidadPct": 92.62
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `totalActivos` | int | Excluye `DADO_DE_BAJA` del denominador |
| `operativos` | int | Estado `OPERATIVO` |
| `enMantenimiento` | int | Estado `EN_MANTENIMIENTO` |
| `dadosDeBaja` | int | Informativo |
| `disponibilidadPct` | number | 2 decimales |

**Visualización sugerida:** gauge / KPI card grande con código de color (verde ≥ 95 %, amarillo 85–95 %, rojo < 85 %).

**Refresh:** cada vez que se abra el dashboard. El servicio cachea 60 s.

---

## KPI-2 — MTTR (Mean Time To Repair)

**Pregunta:** ¿Cuánto tarda en promedio reparar un activo desde que se inicia el trabajo hasta que se cierra?

**Fórmula:**

```
MTTR_horas = AVG(EXTRACT(EPOCH FROM (fecha_fin - fecha_inicio)) / 3600)
              WHERE estado = 'COMPLETADA'
              AND fecha_fin >= now() - INTERVAL '90 days'
```

**Payload:**

```json
{
  "ventanaDias": 90,
  "mttrHoras": 6.8,
  "muestraSolicitudes": 142,
  "porPrioridad": [
    { "prioridad": "CRITICA", "mttrHoras": 2.1, "n": 12 },
    { "prioridad": "ALTA",    "mttrHoras": 4.5, "n": 38 },
    { "prioridad": "MEDIA",   "mttrHoras": 7.2, "n": 71 },
    { "prioridad": "BAJA",    "mttrHoras": 12.4, "n": 21 }
  ]
}
```

**Visualización sugerida:** KPI card con el número grande + mini bar chart horizontal por prioridad.

**Refresh:** diario es suficiente; el servicio cachea 60 s para evitar martillazos.

---

## KPI-3 — MTBF (Mean Time Between Failures)

**Pregunta:** En promedio, ¿cuántas horas pasa un activo entre fallas?

**Fórmula:**

```
MTBF_horas_por_activo = horas_operativas_periodo / numero_de_fallas
horas_operativas_periodo = (dias_periodo * 24) - horas_en_mantenimiento
```

Se calcula por activo y se promedia.

**Payload:**

```json
{
  "ventanaDias": 180,
  "mtbfHoras": 720.5,
  "mtbfDias": 30.0,
  "activosEvaluados": 187,
  "porCategoria": [
    { "categoria": "Computadora de escritorio", "mtbfHoras": 540.2 },
    { "categoria": "Impresora multifunción",    "mtbfHoras": 380.1 },
    { "categoria": "Plotter",                   "mtbfHoras": 1240.0 }
  ]
}
```

**Visualización sugerida:** KPI card + tabla "Top peores 5 categorías" (las que tienen menor MTBF).

---

## KPI-4 — Top 10 Activos por Costo de Mantenimiento

**Pregunta:** ¿Qué activos son los más caros de mantener? (candidatos a reemplazo).

**Fórmula:**

```sql
SELECT activo, SUM(costo_total) AS gasto, COUNT(*) AS intervenciones
FROM solicitudes_mantenimiento
WHERE estado = 'COMPLETADA'
  AND fecha_fin >= now() - INTERVAL '365 days'
GROUP BY activo
ORDER BY gasto DESC
LIMIT 10
```

**Payload:**

```json
{
  "ventanaDias": 365,
  "monedaCodigo": "BOB",
  "items": [
    {
      "activoId": "9c2f...",
      "codigo": "IMP-CONT-03",
      "nombre": "Impresora Contabilidad 3",
      "categoria": "Impresora multifunción",
      "gastoTotal": 4250.00,
      "intervenciones": 9,
      "valorLibrosActual": 1820.00,
      "ratioGastoSobreValor": 2.34
    }
  ]
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `gastoTotal` | number | Suma de `costo_total` |
| `valorLibrosActual` | number | Último snapshot de `depreciacion_mensual` |
| `ratioGastoSobreValor` | number | `> 1` ⇒ candidato a baja |

**Visualización sugerida:** tabla con barras horizontales para `gastoTotal`. Resaltar en rojo cuando `ratioGastoSobreValor > 1`.

---

## KPI-5 — Cumplimiento de Mantenimiento Preventivo

**Pregunta:** ¿Estamos haciendo los mantenimientos preventivos planificados?

**Fórmula:**

```
cumplimiento_% = (preventivos_completados_en_periodo / preventivos_planificados_en_periodo) * 100
```

Para esta versión un activo se considera "planificado" si tiene > 365 días sin mantenimiento preventivo (regla configurable).

**Payload:**

```json
{
  "ventanaDias": 30,
  "planificados": 42,
  "ejecutados": 31,
  "atrasados": 11,
  "cumplimientoPct": 73.81,
  "porArea": [
    { "area": "Contabilidad", "planificados": 8, "ejecutados": 7, "cumplimientoPct": 87.5 },
    { "area": "Bodega",       "planificados": 12, "ejecutados": 6, "cumplimientoPct": 50.0 }
  ]
}
```

**Visualización sugerida:** KPI card grande + ranking por área con barra de progreso.

---

# 5 Reportes

Todos los reportes se sirven en:

`GET /api/v1/reportes/:tipo?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&...filtros`

Tipos válidos: `solicitudes-por-estado`, `depreciacion`, `top-fallas`, `productividad-tecnico`, `distribucion-area`.

Parámetros comunes opcionales:

| Param | Tipo | Default | Descripción |
|---|---|---|---|
| `desde` | `YYYY-MM-DD` | hace 90 días | Fecha inicial inclusiva |
| `hasta` | `YYYY-MM-DD` | hoy | Fecha final inclusiva |
| `formato` | `json` \| `csv` | `json` | Formato de salida |

---

## REP-1 — Solicitudes por Estado

**Uso:** seguimiento operativo. Pulso del backlog.

`GET /api/v1/reportes/solicitudes-por-estado?desde=2026-01-01&hasta=2026-05-28`

**Payload:**

```json
{
  "ventana": { "desde": "2026-01-01", "hasta": "2026-05-28" },
  "totales": {
    "PENDIENTE":  18,
    "ASIGNADA":   12,
    "EN_PROCESO": 9,
    "COMPLETADA": 184,
    "CANCELADA":  4
  },
  "porSemana": [
    {
      "semana": "2026-W01",
      "PENDIENTE": 3, "ASIGNADA": 2, "EN_PROCESO": 1,
      "COMPLETADA": 8, "CANCELADA": 0
    }
  ]
}
```

**Visualización sugerida:** stacked bar chart por semana + donut con totales.

---

## REP-2 — Depreciación de Activos

**Uso:** contabilidad / activos fijos.

`GET /api/v1/reportes/depreciacion?periodo=2026-05-01&areaId=...&categoriaId=...`

| Param | Tipo | Default | Descripción |
|---|---|---|---|
| `periodo` | `YYYY-MM-01` | mes actual | Snapshot a consultar |
| `areaId` | `uuid` | todas | Filtro |
| `categoriaId` | `uuid` | todas | Filtro |

**Payload:**

```json
{
  "periodo": "2026-05-01",
  "monedaCodigo": "BOB",
  "totales": {
    "valorAdquisicionAcumulado": 1840000.00,
    "depreciacionAcumulada": 612000.00,
    "valorLibrosTotal": 1228000.00
  },
  "items": [
    {
      "activoId": "...",
      "codigo": "PC-RECEP-01",
      "nombre": "PC Recepción 01",
      "area": "Recepción",
      "categoria": "Computadora de escritorio",
      "fechaAdquisicion": "2023-03-15",
      "valorAdquisicion": 6500.00,
      "valorResidualPct": 10,
      "vidaUtilAnios": 5,
      "depreciacionMensual": 97.50,
      "depreciacionAcumulada": 3120.00,
      "valorLibros": 3380.00
    }
  ],
  "paginacion": { "page": 1, "pageSize": 50, "total": 248 }
}
```

**Visualización sugerida:** tabla paginada + 3 KPI cards arriba con totales. Botón "Exportar CSV" usando `?formato=csv`.

---

## REP-3 — Top de Fallas por Activo

**Uso:** identificar activos problemáticos.

`GET /api/v1/reportes/top-fallas?desde=...&hasta=...&limit=20`

**Payload:**

```json
{
  "ventana": { "desde": "...", "hasta": "..." },
  "items": [
    {
      "activoId": "...",
      "codigo": "FOT-MARK-01",
      "nombre": "Fotocopiadora Marketing",
      "area": "Marketing",
      "categoria": "Fotocopiadora",
      "totalFallas": 14,
      "totalHorasFueraServicio": 87.5,
      "ultimaFalla": "2026-05-21T10:32:00Z",
      "principalDescripcion": "Atasco de papel recurrente"
    }
  ]
}
```

**Visualización sugerida:** tabla ordenada descendente por `totalFallas` con sparkline opcional.

---

## REP-4 — Productividad por Técnico

**Uso:** evaluación de desempeño del equipo de mantenimiento.

`GET /api/v1/reportes/productividad-tecnico?desde=...&hasta=...`

**Payload:**

```json
{
  "ventana": { "desde": "...", "hasta": "..." },
  "items": [
    {
      "tecnicoId": "...",
      "nombre": "Luis Pérez",
      "completadas": 42,
      "enProceso": 3,
      "canceladas": 1,
      "mttrHorasPromedio": 5.2,
      "cumplimientoSLAPct": 88.1,
      "costoTotalGestionado": 18450.00
    }
  ]
}
```

**Visualización sugerida:** tabla ordenable + bar chart comparando `mttrHorasPromedio` y `completadas`.

---

## REP-5 — Distribución de Solicitudes por Área

**Uso:** dónde se concentran las fallas; soporta planeación de reasignación de activos.

`GET /api/v1/reportes/distribucion-area?desde=...&hasta=...`

**Payload:**

```json
{
  "ventana": { "desde": "...", "hasta": "..." },
  "items": [
    {
      "areaId": "...",
      "nombre": "Contabilidad",
      "totalSolicitudes": 38,
      "porTipo": { "CORRECTIVO": 31, "PREVENTIVO": 7 },
      "porPrioridad": { "BAJA": 8, "MEDIA": 20, "ALTA": 8, "CRITICA": 2 },
      "costoTotal": 5840.00,
      "pctDelTotal": 18.6
    }
  ]
}
```

**Visualización sugerida:** treemap o donut chart por área + tabla detalle.

---

## Códigos de error estándar

| `error.code` | HTTP | Significado |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Joi rechazó el payload o los query params |
| `NOT_FOUND` | 404 | Recurso inexistente |
| `INVALID_STATE_TRANSITION` | 409 | Cambio de estado no permitido |
| `DUPLICATE` | 409 | Violación de UNIQUE (`23505` Postgres) |
| `FK_VIOLATION` | 409 | Recurso referenciado no existe |
| `RATE_LIMITED` | 429 | Demasiadas peticiones |
| `INTERNAL` | 500 | Falla no clasificada (siempre se registra con `requestId`) |

Todos los errores incluyen `requestId` para correlación con logs:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "El cuerpo de la solicitud es inválido",
    "details": [
      { "path": "descripcion", "message": "es obligatorio" }
    ]
  },
  "requestId": "01J8Q..."
}
```

---

## Convenciones de fechas y zonas horarias

- Todas las fechas se almacenan en **UTC** (`timestamptz`).
- Los KPIs y reportes consideran la zona horaria del servidor configurada en `JOBS_TZ` (default `America/La_Paz`).
- El frontend debe convertir a la TZ del usuario antes de mostrar.
- Los parámetros `desde` / `hasta` son **inclusivos** y se interpretan como fechas en `JOBS_TZ`.

---

## Paginación

Reportes que pueden devolver muchos registros (`depreciacion`, `top-fallas`, `productividad-tecnico`) aceptan:

| Param | Tipo | Default | Máx |
|---|---|---|---|
| `page` | int | 1 | — |
| `pageSize` | int | 50 | 200 |

Respuesta incluye:

```json
"paginacion": { "page": 1, "pageSize": 50, "total": 248, "totalPaginas": 5 }
```
