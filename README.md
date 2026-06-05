# MS BI & Automation

Microservicio de **Reportería, Automatización y Notificaciones** para gestión de activos fijos y mantenimiento en una empresa de material de escritorio.

> Implementa el caso de uso **CU-10 — Generación de Reportes e Indicadores BI**, automatización de notificaciones por Telegram + Email, alertas de mantenimiento y depreciación de activos.

---

## Tabla de contenido

1. [Stack y arquitectura](#stack-y-arquitectura)
2. [Estructura del proyecto](#estructura-del-proyecto)
3. [Paso 1 — Prerrequisitos](#paso-1--prerrequisitos)
4. [Paso 2 — Crear el bot de Telegram](#paso-2--crear-el-bot-de-telegram-con-botfather)
5. [Paso 3 — Configurar SMTP de Gmail](#paso-3--configurar-smtp-de-gmail-app-password)
6. [Paso 4 — Variables de entorno](#paso-4--variables-de-entorno)
7. [Paso 5 — Levantar en local con Docker](#paso-5--levantar-en-local-con-docker-recomendado)
8. [Paso 6 — Levantar sin Docker](#paso-6--levantar-en-local-sin-docker)
9. [Paso 7 — Cargar datos de prueba](#paso-7--cargar-2000-datos-de-prueba)
10. [Paso 8 — Probar la API y el bot](#paso-8--probar-la-api-y-el-bot)
11. [Paso 9 — Desplegar en Render (dominio gratis)](#paso-9--desplegar-en-render-dominio-gratis)
12. [Endpoints de la API](#endpoints-de-la-api)
13. [KPIs y Reportes](#kpis-y-reportes)
14. [Diagramas](#diagramas)
15. [Troubleshooting](#troubleshooting)

---

## Stack y arquitectura

- **Lenguaje:** Node.js 20 + JavaScript
- **Framework:** Express 4
- **Base de datos:** PostgreSQL 16
- **Bot:** `node-telegram-bot-api` (polling en local, webhook en producción)
- **Email:** `nodemailer` (SMTP de Gmail)
- **Cron:** `node-cron` (depreciación mensual + alertas)
- **Validación:** `joi`
- **Logging:** `pino` con pretty-print en dev
- **Contenedores:** Docker + docker-compose
- **Despliegue:** Render (free tier) — alternativas: Railway, Fly.io, Koyeb

Arquitectura en **capas**: Routes → Controllers → Services → Repositories → DB. Esto desacopla la lógica de negocio de Express y de PostgreSQL, facilita testing y permite migrar a otro motor si fuera necesario.

---

## Estructura del proyecto

```
ms-bi-automation/
├── server.js                    # entrypoint - bootstrap del proceso
├── docker-compose.yml           # orquestacion local (postgres + api)
├── Dockerfile                   # imagen multi-stage para deploy
├── package.json
├── .env.example
├── src/
│   ├── app.js                   # configuracion del pipeline Express
│   ├── config/
│   │   ├── env.js               # variables de entorno tipadas
│   │   ├── database.js          # pool de conexiones a Postgres
│   │   └── logger.js            # pino logger
│   ├── routes/                  # definicion de rutas HTTP
│   ├── controllers/             # adaptan req/res al servicio
│   ├── services/                # logica de negocio (sin Express, sin SQL)
│   ├── repositories/            # acceso a datos (queries SQL parametrizadas)
│   ├── middlewares/             # error handler, validacion Joi
│   ├── validators/schemas.js    # schemas Joi reutilizables
│   ├── bots/telegram.bot.js     # bot conversacional con FSM en memoria
│   ├── jobs/index.js            # cron de depreciacion + alertas
│   ├── utils/                   # helpers (response, dates)
│   └── db/
│       ├── migrate.js           # ejecuta los .sql de migrations/
│       ├── migrations/          # esquema + vistas optimizadas para KPIs
│       └── seeds/seed.js        # genera 2000+ registros con faker
├── tests/                       # tests unitarios con Jest
└── docs/
    ├── ARCHITECTURE.md          # C4 + diagrama de secuencia + ER
    ├── KPIS_AND_REPORTS.md      # contrato de los 5 KPIs y 5 reportes
    └── DEPLOYMENT.md            # deploy en Render paso a paso
```

---

## Paso 1 — Prerrequisitos

Necesitas instalado en tu máquina:

- **Node.js ≥ 18** (recomendado 20 LTS) — verificar con `node -v`
- **Docker + Docker Compose** (opción recomendada) — verificar con `docker -v`
- **PostgreSQL 14+** (solo si NO usas Docker) — verificar con `psql --version`
- **Git** y una cuenta en **GitHub**
- Una cuenta en **Telegram** y otra en **Gmail**

---

## Paso 2 — Crear el bot de Telegram (con BotFather)

1. Abre Telegram y busca **@BotFather**.
2. Envía `/newbot`.
3. BotFather te pedirá:
   - **Nombre del bot** (lo que verán los usuarios). Ej: `BI Automation Empresa`.
   - **Username del bot**, debe terminar en `bot`. Ej: `bi_automation_empresa_bot`.
4. BotFather te responderá con un **token** parecido a `7889123456:AAH...xyz`. **Guárdalo**, irá en `TELEGRAM_BOT_TOKEN`.
5. (Opcional, recomendado) Configura comandos visibles:
   ```
   /setcommands
   ```
   Y pega:
   ```
   start - Mensaje de bienvenida
   vincular - Vincula tu cuenta de correo
   nueva - Crear una solicitud de mantenimiento
   cancelar - Cancelar el flujo actual
   ayuda - Mostrar la ayuda
   ```

---

## Paso 3 — Configurar SMTP de Gmail (App Password)

Gmail bloquea el login con tu contraseña normal desde aplicaciones. Hay que generar una **contraseña de aplicación** de 16 dígitos:

1. Activa la **verificación en dos pasos** en tu cuenta: https://myaccount.google.com/security
2. Ve a **App Passwords**: https://myaccount.google.com/apppasswords
3. Crea una nueva con nombre `BI Automation`.
4. Copia los 16 caracteres sin espacios. Eso va en `SMTP_PASSWORD`.

**Alternativas si no quieres usar Gmail:**
- **Brevo (Sendinblue)** — 300 emails/día gratis, SMTP simple
- **Mailtrap** — ideal para desarrollo (no envía emails reales, los captura)
- **Resend** — 100 emails/día gratis vía API

---

## Paso 4 — Variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y completa al menos:

```dotenv
TELEGRAM_BOT_TOKEN=7889123456:AAH...xyz
SMTP_USER=tu_correo@gmail.com
SMTP_PASSWORD=abcdwxyzabcdwxyz
SMTP_FROM_EMAIL=tu_correo@gmail.com
```

---

## Paso 5 — Levantar en local con Docker (recomendado)

Con un solo comando levantas Postgres + API:

```bash
docker compose up -d --build
```

Verifica que ambos contenedores están saludables:

```bash
docker compose ps
```

Espera a que `ms-bi-postgres` quede en estado `healthy`, luego aplica el esquema y carga el seed:

```bash
docker compose exec api npm run migrate
docker compose exec api npm run seed
```

Verifica el health check:

```bash
curl http://localhost:3000/health
```

Debería responder:
```json
{ "status": "ok", "db": "up", "uptime_s": 12.5, "env": "development" }
```

Para ver los logs del API en tiempo real:
```bash
docker compose logs -f api
```

---

## Paso 6 — Levantar en local sin Docker

```bash
# 1. Crear la base de datos manualmente
createdb bi_automation

# 2. Instalar dependencias
npm install

# 3. Aplicar el esquema
npm run migrate

# 4. Cargar datos de prueba
npm run seed

# 5. Iniciar en modo desarrollo (auto-reload con nodemon)
npm run dev
```

---

## Paso 7 — Cargar 2000+ datos de prueba

El seed genera:

| Tabla                       | Registros aprox. |
|-----------------------------|------------------|
| `areas`                     | 12               |
| `categorias_activo`         | 8                |
| `usuarios`                  | 60               |
| `activos`                   | 250              |
| `solicitudes_mantenimiento` | 1,700            |
| `depreciacion_mensual`      | ~8,500           |
| **Total**                   | **~10,500**      |

Distribución pensada para que los **5 KPIs** y **5 reportes** muestren datos realistas (mezcla de estados, prioridades, tipos preventivo/correctivo, costos variables, fechas distribuidas en 18 meses).

```bash
npm run seed
```

---

## Paso 8 — Probar la API y el bot

### API

```bash
# Listar solicitudes
curl http://localhost:3000/api/v1/solicitudes?page=1\&pageSize=10

# Obtener una solicitud por ID
curl http://localhost:3000/api/v1/solicitudes/<uuid>

# Cambiar estado a EN_PROCESO (esto dispara el email al solicitante)
curl -X PATCH http://localhost:3000/api/v1/solicitudes/<uuid>/estado \
  -H "Content-Type: application/json" \
  -d '{"estado":"EN_PROCESO","tecnico_id":"<uuid-tecnico>"}'

# Dashboard de KPIs
curl http://localhost:3000/api/v1/kpis/dashboard

# Lista de reportes disponibles
curl http://localhost:3000/api/v1/reportes

# Obtener un reporte especifico
curl "http://localhost:3000/api/v1/reportes/top-fallas?limit=5"
```

### Bot de Telegram

1. En Telegram, busca tu bot por su `@username` y envía `/start`.
2. Vincula tu cuenta: `/vincular empleado1@empresa.com` (debe existir en la BD; el seed crea `empleado1..44@empresa.com`).
3. Envía `/nueva` y sigue el flujo:
   - Te pedirá el código o nombre del activo (ej: `ACT-00001`).
   - Luego te pedirá la descripción del problema.
   - Quedará registrada con código `SOL-2026-XXXXXX`.
4. Para probar la notificación por email, cambia el estado vía API a `EN_PROCESO` — el email irá a la dirección del solicitante.

---

## Paso 9 — Desplegar en Render (dominio gratis)

[Render](https://render.com) ofrece web services gratuitos + PostgreSQL gratuito con HTTPS y dominio `.onrender.com`. **Ver guía detallada en [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)**.

Resumen rápido:

1. Sube el repo a GitHub.
2. En Render: **New** → **PostgreSQL** → plan Free → copia el `Internal Database URL`.
3. **New** → **Web Service** → conecta el repo → runtime `Docker` → asigna las env vars (incluyendo `DATABASE_URL` con el connection string anterior y `DB_SSL=true`).
4. En Build/Start: Render usa el `Dockerfile` directamente, no necesitas comandos extra.
5. Tras el primer deploy, en la pestaña **Shell** ejecuta:
   ```
   npm run migrate && npm run seed
   ```
6. Configura el webhook de Telegram (modo producción):
   ```
   TELEGRAM_MODE=webhook
   TELEGRAM_WEBHOOK_URL=https://tu-app.onrender.com
   ```
   El bot llamará a `setWebHook` automáticamente al arrancar.

**Alternativas equivalentes:** Railway, Fly.io, Koyeb (todas con BD gratuita y dominio incluido).

---

## Endpoints de la API

| Método | Endpoint                                  | Descripción                                  |
|--------|-------------------------------------------|----------------------------------------------|
| GET    | `/health`                                 | Healthcheck del servicio                     |
| POST   | `/api/v1/solicitudes`                     | Crear nueva solicitud de mantenimiento       |
| GET    | `/api/v1/solicitudes`                     | Listar solicitudes (paginado + filtros)      |
| GET    | `/api/v1/solicitudes/:id`                 | Detalle de una solicitud                     |
| PATCH  | `/api/v1/solicitudes/:id/estado`          | Cambiar estado (dispara notificaciones)      |
| GET    | `/api/v1/kpis/dashboard`                  | Todos los KPIs para el dashboard             |
| GET    | `/api/v1/reportes`                        | Lista de reportes disponibles                |
| GET    | `/api/v1/reportes/:tipo`                  | Obtener un reporte específico                |
| POST   | `/webhook/telegram`                       | Webhook para Telegram (modo producción)      |

### Formato estándar de respuesta

**Éxito:**
```json
{
  "success": true,
  "data": { ... },
  "meta": { "total": 42, "page": 1, "pageSize": 20 }
}
```

**Error:**
```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] }
}
```

---

## KPIs y Reportes

Para el **contrato detallado de cada KPI y reporte** (qué retorna, cómo consumirlo desde el frontend, ejemplos de payload), revisa **[`docs/KPIS_AND_REPORTS.md`](docs/KPIS_AND_REPORTS.md)**.

Resumen:

**5 KPIs** (todos en `/api/v1/kpis/dashboard`):
1. **Tasa de disponibilidad de activos** — % de activos operativos
2. **MTTR** — tiempo medio de reparación
3. **MTBF** — tiempo medio entre fallas
4. **Top 10 activos por costo de mantenimiento**
5. **Cumplimiento de mantenimiento preventivo** mensual

**5 Reportes** (cada uno en `/api/v1/reportes/<tipo>`):
1. `solicitudes-por-estado` — distribución mensual por estado
2. `depreciacion` — valor de libro y depreciación acumulada por activo
3. `top-fallas` — activos más problemáticos
4. `productividad-tecnico` — desempeño por técnico
5. `distribucion-area` — distribución de activos por área

---

## Diagramas

Todos en **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)**:

- C4 Nivel 1 — **Contexto**
- C4 Nivel 2 — **Contenedores**
- C4 Nivel 3 — **Componentes**
- C4 Nivel 4 — **Código** (capas internas del servicio)
- **Secuencia** del flujo Telegram → BD → notificación email
- **ER** (modelo entidad-relación)

Los diagramas están en **Mermaid** dentro del propio markdown, así se renderizan directo en GitHub/VS Code/Notion sin necesidad de exportar imágenes.

---

## Troubleshooting

| Problema                                       | Solución                                                                                |
|------------------------------------------------|-----------------------------------------------------------------------------------------|
| `ECONNREFUSED 127.0.0.1:5432`                  | Postgres no está corriendo. `docker compose up -d db`                                   |
| Bot no responde a `/start`                     | Verifica `TELEGRAM_BOT_TOKEN`. Logs: `docker compose logs -f api \| grep -i telegram`   |
| Emails no llegan                               | `SMTP_PASSWORD` debe ser un App Password de 16 dígitos sin espacios                     |
| `SELF_SIGNED_CERT_IN_CHAIN` en Render          | Ponte `DB_SSL=true` o usa `DATABASE_URL?sslmode=require`                                |
| Render duerme el servicio                      | El plan free duerme tras 15 min sin tráfico — usar UptimeRobot para hacer pings al `/health` |
| Webhook de Telegram no llega                   | El webhook requiere HTTPS público válido (Render lo da). En local usa polling.          |

---

## Licencia

MIT
