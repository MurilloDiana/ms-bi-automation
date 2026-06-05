# Arquitectura — MS BI y Automatización

> Documento de arquitectura del microservicio. Incluye los 4 niveles del modelo **C4**, un diagrama de **secuencia** del flujo principal y el **diagrama entidad–relación** de la base de datos.
>
> Todos los diagramas están en sintaxis **Mermaid** y se renderizan directamente en GitHub, GitLab, Notion, VS Code (con la extensión *Markdown Preview Mermaid Support*) o en [mermaid.live](https://mermaid.live).

---

## 1. Visión general

El microservicio centraliza tres responsabilidades:

1. **BI / Reportería** — expone KPIs y reportes parametrizados sobre el ciclo de vida del activo fijo y la operación de mantenimiento.
2. **Automatización** — bot de Telegram que actúa como canal de captura de solicitudes (FSM conversacional) y notificaciones por correo cuando cambia el estado de la solicitud.
3. **Procesamiento batch** — jobs programados (cron) que generan snapshots mensuales de depreciación lineal y disparan alertas para solicitudes pendientes con prioridad alta.

Stack: **Node.js 20 + Express + PostgreSQL 16**. Despliegue objetivo: **Render** (free tier) con `PostgreSQL` administrado. Local: **Docker Compose**.

---

## 2. C4 — Nivel 1: Diagrama de Contexto

Muestra el sistema desde fuera: quién lo usa y con qué sistemas externos habla.

```mermaid
C4Context
    title Contexto del Sistema — MS BI y Automatización

    Person(empleado, "Empleado", "Reporta fallas de activos<br/>desde Telegram")
    Person(tecnico, "Técnico de mantenimiento", "Atiende solicitudes,<br/>cambia estados")
    Person(supervisor, "Supervisor / Gerencia", "Consulta KPIs y reportes<br/>desde dashboard web")

    System(ms_bi, "MS BI y Automatización", "Reportería, alertas y bot de captura<br/>de solicitudes de mantenimiento")

    System_Ext(telegram, "Telegram Bot API", "Mensajería conversacional")
    System_Ext(smtp, "Proveedor SMTP", "Envío de correos transaccionales<br/>(Gmail / Mailgun / SendGrid)")
    System_Ext(frontend, "Dashboard Frontend", "SPA que consume los endpoints REST")

    Rel(empleado, telegram, "Envía /nueva,<br/>describe la falla")
    Rel(telegram, ms_bi, "Webhook / long-polling", "HTTPS")
    Rel(ms_bi, smtp, "Envía notificaciones", "SMTP/TLS")
    Rel(ms_bi, empleado, "Notifica por email<br/>cuando inicia el mantenimiento", "Email")

    Rel(tecnico, frontend, "Atiende solicitudes,<br/>cambia estado", "HTTPS")
    Rel(supervisor, frontend, "Consulta KPIs y reportes", "HTTPS")
    Rel(frontend, ms_bi, "Llama endpoints REST", "JSON/HTTPS")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

**Lectura:** el empleado nunca toca el dashboard; su único punto de contacto es Telegram. El dashboard es para técnicos y supervisores. El microservicio orquesta todo.

---

## 3. C4 — Nivel 2: Diagrama de Contenedores

Muestra los procesos desplegables del sistema y su comunicación.

```mermaid
C4Container
    title Contenedores — MS BI y Automatización

    Person(empleado, "Empleado")
    Person(tecnico, "Técnico / Supervisor")

    System_Boundary(ms_bi, "MS BI y Automatización") {
        Container(api, "API REST", "Node.js + Express", "Expone /api/v1/solicitudes,<br/>/api/v1/kpis, /api/v1/reportes")
        Container(bot, "Telegram Bot Worker", "node-telegram-bot-api", "FSM conversacional,<br/>polling o webhook")
        Container(cron, "Cron Worker", "node-cron", "Snapshot mensual de<br/>depreciación + alertas")
        ContainerDb(db, "PostgreSQL", "PostgreSQL 16", "Esquema operativo +<br/>vistas materializables de KPI")
    }

    System_Ext(tg_api, "Telegram Bot API")
    System_Ext(smtp, "SMTP")
    System_Ext(front, "Frontend SPA")

    Rel(empleado, tg_api, "Mensajes")
    Rel(tg_api, bot, "Webhook / polling", "HTTPS")
    Rel(bot, db, "Lee/escribe solicitudes", "TCP/5432")

    Rel(tecnico, front, "HTTPS")
    Rel(front, api, "REST", "JSON/HTTPS")
    Rel(api, db, "Lee/escribe", "TCP/5432")
    Rel(api, smtp, "Notifica<br/>inicio de mantenimiento", "SMTP/TLS")

    Rel(cron, db, "Genera snapshots,<br/>lee pendientes", "TCP/5432")
    Rel(cron, tg_api, "Envía alertas a técnicos", "HTTPS")
    Rel(cron, smtp, "Notificaciones", "SMTP/TLS")

    UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
```

**Notas de despliegue:**

- En **Render free** los tres contenedores (`api`, `bot`, `cron`) se empaquetan en **un solo proceso Node** (`server.js`) por límites del plan. La separación lógica se mantiene en código (`src/bots/`, `src/jobs/`, `src/app.js`) para que sea trivial extraerlos a procesos independientes cuando el volumen lo justifique.
- En producción el bot usa **webhook**; en local, **polling**.

---

## 4. C4 — Nivel 3: Diagrama de Componentes

Zoom dentro del proceso Node. Muestra la separación por capas.

```mermaid
C4Component
    title Componentes — Proceso Node.js

    Container_Boundary(api, "API REST + Bot + Cron (proceso Node)") {

        Component(routes, "Routes Layer", "Express Router", "/solicitudes, /kpis, /reportes")
        Component(ctrl, "Controllers", "Express handlers", "Adapta HTTP <-> dominio")
        Component(valid, "Validators", "Joi schemas", "Valida payloads e inputs")
        Component(mw, "Middlewares", "Express", "errorHandler, requestLogger,<br/>rateLimit, helmet, cors")

        Component(svc_maint, "MaintenanceService", "JS module", "Reglas de negocio<br/>de solicitudes")
        Component(svc_kpi, "KpiService", "JS module", "Orquesta KPIs y reportes,<br/>cache en memoria 60s")
        Component(svc_email, "EmailService", "Nodemailer", "Envía + persiste<br/>notificaciones")
        Component(svc_tg, "TelegramService", "node-telegram-bot-api", "Envía mensajes,<br/>persiste notificación")
        Component(svc_dep, "DepreciationService", "JS module", "Cálculo lineal de<br/>depreciación")

        Component(repo, "Repositories", "node-postgres", "maintenance, asset,<br/>user, kpi")
        Component(bot, "Telegram FSM Bot", "Stateful in-memory", "/start /vincular<br/>/nueva /cancelar")
        Component(jobs, "Cron Jobs", "node-cron", "depreciation@02:00<br/>alertas@*/30 min")
    }

    ContainerDb(db, "PostgreSQL", "DB")
    System_Ext(tg, "Telegram Bot API")
    System_Ext(smtp, "SMTP")

    Rel(routes, mw, "usa")
    Rel(routes, valid, "usa")
    Rel(routes, ctrl, "delega")
    Rel(ctrl, svc_maint, "invoca")
    Rel(ctrl, svc_kpi, "invoca")

    Rel(svc_maint, repo, "lee/escribe")
    Rel(svc_maint, svc_email, "notifica inicio/fin")
    Rel(svc_maint, svc_tg, "confirma a usuario")
    Rel(svc_kpi, repo, "consulta vistas")
    Rel(svc_dep, repo, "upsert snapshots")

    Rel(bot, svc_maint, "crea solicitudes")
    Rel(bot, svc_tg, "responde al usuario")
    Rel(jobs, svc_dep, "ejecuta mensual")
    Rel(jobs, svc_tg, "alerta técnicos")

    Rel(repo, db, "SQL", "TCP")
    Rel(svc_email, smtp, "SMTP")
    Rel(svc_tg, tg, "HTTPS")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

**Convenciones:**

- **Routes** no contiene lógica de negocio.
- **Services** no conocen Express (`req/res`).
- **Repositories** son la única capa que ejecuta SQL.
- **Validators** desacoplan la validación del controlador.

---

## 5. C4 — Nivel 4: Diagrama de Código (clases / módulos clave)

Vista detallada de los módulos núcleo. Como JavaScript no tiene clases formales en todas las capas, se modelan las firmas reales.

```mermaid
classDiagram
    class MaintenanceController {
        +crear(req, res, next)
        +listar(req, res, next)
        +obtener(req, res, next)
        +cambiarEstado(req, res, next)
    }

    class MaintenanceService {
        -repo: MaintenanceRepository
        -emailSvc: EmailService
        -tgSvc: TelegramService
        +crearSolicitud(payload) Solicitud
        +cambiarEstado(id, nuevoEstado, tecnicoId, nota) Solicitud
        -notificarInicio(solicitud) void
        -notificarFinalizacion(solicitud) void
    }

    class MaintenanceRepository {
        -pool: pg.Pool
        +crear(data) Solicitud
        +obtenerPorId(id) Solicitud
        +listar(filtros, paginacion) Solicitud[]
        +cambiarEstado(id, estado, tecnicoId, nota) Solicitud
        +marcarNotificado(id, tipo) void
    }

    class DepreciationService {
        +calcularDepreciacionMensual(activo) number
        +generarSnapshotMensual(periodo) Resultado
        +generarHistoricoCompleto() Resultado
    }

    class KpiService {
        -cache: Map
        +obtenerDashboardKpis() KpiPayload
        +obtenerReporte(tipo, params) ReportePayload
        -invalidarCache() void
    }

    class TelegramFSMBot {
        -sessions: Map~chatId, Estado~
        +iniciarPolling() void
        +configurarWebhook(url) void
        -onMessage(msg) void
        -manejarNueva(chatId, texto) void
    }

    class CronJobs {
        +iniciar() void
        -jobDepreciacion() void
        -jobAlertasPendientes() void
    }

    MaintenanceController --> MaintenanceService
    MaintenanceService --> MaintenanceRepository
    MaintenanceService --> EmailService
    MaintenanceService --> TelegramService
    KpiService --> KpiRepository
    DepreciationService --> AssetRepository
    TelegramFSMBot --> MaintenanceService
    CronJobs --> DepreciationService
    CronJobs --> TelegramService
```

---

## 6. Diagrama de secuencia — Flujo principal (CU-10)

Desde que el empleado abre Telegram hasta que recibe el correo de "su solicitud está siendo atendida".

```mermaid
sequenceDiagram
    autonumber
    actor E as Empleado
    participant TG as Telegram Bot API
    participant Bot as Telegram FSM Bot
    participant MS as MaintenanceService
    participant Repo as MaintenanceRepository
    participant DB as PostgreSQL
    actor T as Técnico
    participant API as API REST
    participant Email as EmailService
    participant SMTP as SMTP Provider

    Note over E,DB: Fase 1 — Captura de la solicitud por Telegram

    E->>TG: /vincular juan@empresa.com
    TG->>Bot: update
    Bot->>Repo: vincularChatId(email, chatId)
    Repo->>DB: UPDATE usuarios SET telegram_chat_id
    Bot-->>E: "Cuenta vinculada ✅"

    E->>TG: /nueva
    TG->>Bot: update
    Bot-->>E: "¿Qué activo está fallando? Envía su código o nombre"
    E->>TG: "PC-RECEP-01"
    TG->>Bot: update
    Bot->>Repo: buscarActivoPorCodigo("PC-RECEP-01")
    Repo->>DB: SELECT activos WHERE codigo ILIKE
    DB-->>Repo: { id, nombre, area_id }
    Bot-->>E: "Describe el problema"
    E->>TG: "No enciende, hace ruido al cable"
    TG->>Bot: update
    Bot->>MS: crearSolicitud({ activo, descripcion, canal: TELEGRAM })
    MS->>Repo: crear(...)
    Repo->>DB: INSERT solicitudes_mantenimiento
    DB-->>Repo: { id, codigo: "SOL-2026-000123" }
    MS-->>Bot: solicitud
    Bot-->>E: "Registrada con código SOL-2026-000123 ✅"

    Note over T,SMTP: Fase 2 — Técnico atiende desde el dashboard

    T->>API: PATCH /api/v1/solicitudes/123/estado<br/>{ estado: "EN_PROCESO" }
    API->>MS: cambiarEstado(123, EN_PROCESO, tecnicoId)
    MS->>Repo: cambiarEstado(...)
    Repo->>DB: UPDATE solicitudes (estado, fecha_inicio,<br/>fecha_estimada_fin = now + 3 days)
    Repo->>DB: INSERT historial_estados_solicitud
    DB-->>Repo: solicitud actualizada
    MS->>MS: ¿notificado_inicio = false?
    MS->>Email: enviarMantenimientoEnProceso(solicitud)
    Email->>SMTP: sendMail(to: solicitante.email, ...)
    SMTP-->>Email: 250 OK
    Email->>DB: INSERT notificaciones (canal: EMAIL, estado: ENVIADA)
    MS->>Repo: marcarNotificado(123, 'inicio')
    MS-->>API: solicitud
    API-->>T: 200 OK
    SMTP-->>E: 📧 "Su solicitud SOL-2026-000123 está siendo atendida.<br/>Estará lista el 2026-06-01"
```

**Puntos clave:**

- El campo `fecha_estimada_fin` se calcula automáticamente como `now() + 3 días` cuando el estado pasa a `EN_PROCESO`.
- La bandera `notificado_inicio` garantiza **idempotencia**: si el técnico re-guarda la solicitud, el correo no se duplica.
- La notificación se persiste en `notificaciones` para trazabilidad y reintentos.

---

## 7. Diagrama Entidad–Relación (ER)

Modelo de datos completo. Las **vistas** materializables de KPI se documentan en `KPIS_AND_REPORTS.md`.

```mermaid
erDiagram
    AREAS ||--o{ USUARIOS : "trabajan en"
    AREAS ||--o{ ACTIVOS : "ubicados en"
    CATEGORIAS_ACTIVO ||--o{ ACTIVOS : "clasifica"
    USUARIOS ||--o{ SOLICITUDES_MANTENIMIENTO : "solicita"
    USUARIOS ||--o{ SOLICITUDES_MANTENIMIENTO : "atiende (tecnico)"
    ACTIVOS ||--o{ SOLICITUDES_MANTENIMIENTO : "afectado en"
    ACTIVOS ||--o{ DEPRECIACION_MENSUAL : "snapshot de"
    SOLICITUDES_MANTENIMIENTO ||--o{ HISTORIAL_ESTADOS_SOLICITUD : "registra"
    SOLICITUDES_MANTENIMIENTO ||--o{ NOTIFICACIONES : "genera"
    USUARIOS ||--o{ NOTIFICACIONES : "dirigida a"

    AREAS {
        uuid id PK
        varchar nombre UK
        varchar codigo UK
        text descripcion
        timestamptz created_at
        timestamptz updated_at
    }

    USUARIOS {
        uuid id PK
        varchar email UK
        varchar nombre
        varchar apellido
        varchar rol "EMPLEADO|TECNICO|SUPERVISOR|ADMIN"
        uuid area_id FK
        bigint telegram_chat_id UK
        boolean activo
        timestamptz created_at
        timestamptz updated_at
    }

    CATEGORIAS_ACTIVO {
        uuid id PK
        varchar nombre UK
        int vida_util_anios
        numeric valor_residual_pct
    }

    ACTIVOS {
        uuid id PK
        varchar codigo UK
        varchar nombre
        uuid categoria_id FK
        uuid area_id FK
        numeric valor_adquisicion
        date fecha_adquisicion
        varchar estado "OPERATIVO|EN_MANTENIMIENTO|DADO_DE_BAJA"
        timestamptz created_at
        timestamptz updated_at
    }

    SOLICITUDES_MANTENIMIENTO {
        uuid id PK
        varchar codigo UK "SOL-YYYY-NNNNNN"
        uuid solicitante_id FK
        uuid tecnico_id FK "nullable"
        uuid activo_id FK
        varchar tipo "CORRECTIVO|PREVENTIVO"
        varchar prioridad "BAJA|MEDIA|ALTA|CRITICA"
        varchar estado "PENDIENTE|ASIGNADA|EN_PROCESO|COMPLETADA|CANCELADA"
        text descripcion
        text diagnostico
        varchar canal_origen "WEB|TELEGRAM|EMAIL"
        timestamptz fecha_solicitud
        timestamptz fecha_inicio "nullable"
        timestamptz fecha_estimada_fin "nullable"
        timestamptz fecha_fin "nullable"
        numeric costo_total
        boolean notificado_inicio
        boolean notificado_fin
        timestamptz created_at
        timestamptz updated_at
    }

    HISTORIAL_ESTADOS_SOLICITUD {
        uuid id PK
        uuid solicitud_id FK
        varchar estado_anterior
        varchar estado_nuevo
        uuid cambiado_por FK
        text nota
        timestamptz fecha_cambio
    }

    DEPRECIACION_MENSUAL {
        uuid id PK
        uuid activo_id FK
        date periodo "primer dia del mes"
        numeric valor_inicial
        numeric depreciacion_mes
        numeric depreciacion_acumulada
        numeric valor_libros
        timestamptz created_at
    }

    NOTIFICACIONES {
        uuid id PK
        uuid solicitud_id FK
        uuid usuario_id FK
        varchar canal "EMAIL|TELEGRAM"
        varchar tipo "INICIO|FIN|ALERTA"
        varchar estado "PENDIENTE|ENVIADA|FALLIDA"
        text asunto
        text mensaje
        text error
        timestamptz fecha_envio
        timestamptz created_at
    }
```

### Restricciones e índices relevantes

| Constraint | Tabla | Detalle |
|---|---|---|
| `UNIQUE(activo_id, periodo)` | `depreciacion_mensual` | Garantiza un solo snapshot por activo por mes; permite UPSERT idempotente. |
| `CHECK (estado IN ...)` | `solicitudes_mantenimiento` | Estados válidos a nivel BD. |
| `IDX(estado, fecha_solicitud)` | `solicitudes_mantenimiento` | Soporta el job de alertas (pendientes > 4h). |
| `IDX(tecnico_id, estado)` | `solicitudes_mantenimiento` | Soporta dashboard del técnico. |
| `IDX(activo_id, periodo DESC)` | `depreciacion_mensual` | Consulta de valor libros vigente. |
| `IDX(telegram_chat_id)` | `usuarios` | Resolución rápida en cada update del bot. |

---

## 8. Decisiones de arquitectura (ADR resumidos)

| # | Decisión | Razón | Alternativa descartada |
|---|---|---|---|
| 1 | Monorepo con un solo proceso Node | Render free permite un único worker; separación lógica preservada en carpetas | Microservicios independientes (mayor costo) |
| 2 | Polling de Telegram en dev / webhook en prod | Dev necesita NAT-friendly; prod necesita eficiencia | Solo webhook (rompe en local) |
| 3 | KPIs como **vistas** SQL | El optimizador de Postgres cachea planes, código de servicio queda limpio | Cómputo en JS (más lento, duplica lógica) |
| 4 | FSM del bot en memoria | Volumen esperado bajo (< 100 sesiones concurrentes) | Redis (overkill en free tier) |
| 5 | Depreciación lineal precomputada (snapshot mensual) | Reportes históricos rápidos, auditables | Cálculo on-the-fly (más lento, sin trazabilidad) |
| 6 | Idempotencia por flags `notificado_inicio` / `notificado_fin` | Evita correos duplicados ante reintentos | Tabla de outbox (más complejo para el alcance actual) |
| 7 | Validación con **Joi** en routes | Cliente recibe errores claros antes de tocar capa de negocio | Validación dentro del servicio (acopla) |

---

## 9. Operabilidad

- **Healthcheck:** `GET /health` → verifica conexión a PostgreSQL.
- **Logs:** `pino` con `pino-pretty` en desarrollo y JSON estructurado en producción.
- **Métricas operativas mínimas:** se exponen como KPIs (ver `KPIS_AND_REPORTS.md`).
- **Apagado controlado:** `server.js` captura `SIGTERM` / `SIGINT`, detiene cron, drena el pool de PG, cierra el bot.

---

## 10. Cómo navegar los diagramas

- Para edición y exportación a PNG/SVG, copiar el bloque ` ```mermaid ... ``` ` a [mermaid.live](https://mermaid.live).
- En VS Code: instalar **Markdown Preview Mermaid Support** y abrir el preview con `Ctrl+Shift+V`.
- En GitHub/GitLab: se renderizan inline al hacer push del archivo.
