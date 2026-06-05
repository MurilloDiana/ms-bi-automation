# Guía de Despliegue

> Esta guía cubre, paso a paso: cómo crear el bot de Telegram, cómo configurar el SMTP, cómo levantar el proyecto en **Docker local**, y cómo desplegarlo gratis en **Render**. Se incluyen alternativas (Railway, Fly.io, Koyeb).

---

## 0. Requisitos previos

- Cuenta de **GitHub** (gratis)
- Cuenta de **Telegram**
- Cuenta de **Gmail** (o cualquier SMTP) con 2FA habilitado
- **Docker Desktop** instalado (para correr local)
- **Node.js 20+** (opcional, si no quieres usar Docker)

---

## 1. Crear el bot de Telegram

1. Abre Telegram y busca el contacto `@BotFather`.
2. Envía `/newbot`.
3. BotFather pide:
   - **Nombre visible** (ej: `Mantenimiento Empresa XYZ`)
   - **Username** que **debe terminar en `bot`** (ej: `mant_empresa_xyz_bot`)
4. BotFather responde con el **token**. Se ve así:

   ```
   7853245678:AAH-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

   👉 **Guarda este token**. Es lo que va en `TELEGRAM_BOT_TOKEN`.
5. (Opcional) Configura el bot con BotFather:
   - `/setdescription` → "Bot de gestión de solicitudes de mantenimiento de la empresa"
   - `/setcommands` → pegar:

     ```
     start - Iniciar conversación
     vincular - Vincular tu email corporativo
     nueva - Crear una nueva solicitud
     cancelar - Cancelar la captura actual
     ayuda - Ver ayuda
     ```

---

## 2. Configurar SMTP (Gmail)

> Si tu empresa ya tiene SMTP corporativo o usas Mailgun/SendGrid, sáltate este paso.

1. Ve a [https://myaccount.google.com/security](https://myaccount.google.com/security).
2. Activa **Verificación en 2 pasos** si no la tienes.
3. Una vez activa, en la misma pantalla aparece **Contraseñas de aplicaciones** → entra.
4. Crea una contraseña con el nombre `MS BI Automation`.
5. Google muestra una cadena de 16 caracteres como `abcd efgh ijkl mnop`. **Cópiala sin espacios**.

   👉 Esto va en `SMTP_PASS`.

**Variables resultantes:**

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tuempresa@gmail.com
SMTP_PASS=abcdefghijklmnop
SMTP_FROM="Mantenimiento <tuempresa@gmail.com>"
```

---

## 3. Configurar variables de entorno

En la raíz del proyecto:

```bash
cp .env.example .env
```

Edita `.env`:

```env
# --- App ---
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# --- Database ---
# Para Docker Compose usa DATABASE_URL; para Render reemplaza con el DATABASE_URL que te dé Render
DATABASE_URL=postgres://app:app@db:5432/ms_bi
DB_SSL=false

# --- Telegram ---
TELEGRAM_BOT_TOKEN=7853245678:AAH-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_MODE=polling
# En producción cambias a webhook y defines:
TELEGRAM_WEBHOOK_URL=

# --- SMTP ---
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tuempresa@gmail.com
SMTP_PASS=abcdefghijklmnop
SMTP_FROM="Mantenimiento <tuempresa@gmail.com>"

# --- Cron ---
ENABLE_CRON=true
JOBS_TZ=America/La_Paz

# --- Seguridad ---
CORS_ORIGINS=http://localhost:5173,http://localhost:3001
RATE_LIMIT_MAX=300
```

---

## 4. Levantar el proyecto en local con Docker

### 4.1. Arrancar PostgreSQL + API

```bash
docker compose up --build -d
```

Esto:
- Crea el contenedor `db` (PostgreSQL 16) y ejecuta las migraciones al iniciar (mount `./src/db/migrations` → `/docker-entrypoint-initdb.d`).
- Crea el contenedor `api` con la app Node.

### 4.2. Verificar que el contenedor `db` está sano

```bash
docker compose ps
docker compose logs db
```

Debes ver `database system is ready to accept connections`.

### 4.3. Generar los 2000+ datos de prueba

```bash
docker compose exec api npm run seed
```

Esto crea 12 áreas, 8 categorías, 60 usuarios (8 técnicos + 44 empleados + supervisores/admin), 250 activos, 1700 solicitudes históricas a lo largo de 18 meses, y ~8500 snapshots de depreciación. **Total: ~10500 registros.**

> El seed puede tardar 30–90 s la primera vez.

### 4.4. Verificar que la API responde

```bash
curl http://localhost:3000/health
```

Esperado:

```json
{ "ok": true, "data": { "status": "up", "db": "up" } }
```

### 4.5. Probar el bot

1. Abre Telegram, busca tu bot (`@mant_empresa_xyz_bot`) y dale `/start`.
2. Vincula tu email (que debe existir en la BD; el seed crea `empleado1@empresa.com` … `empleado44@empresa.com`):

   ```
   /vincular empleado1@empresa.com
   ```

3. Crea una solicitud:

   ```
   /nueva
   ```

   El bot pregunta el código del activo (`PC-001`, `IMP-001`, etc. — ver con `docker compose exec db psql -U app ms_bi -c "SELECT codigo FROM activos LIMIT 10"`), luego la descripción.

4. El bot confirma con un código `SOL-2026-NNNNNN`.

### 4.6. Probar el cambio de estado y la notificación

```bash
# Listar solicitudes pendientes y copiar un ID
curl 'http://localhost:3000/api/v1/solicitudes?estado=PENDIENTE&pageSize=3' | jq

# Asignar (necesitas tecnicoId — sale del seed)
TECNICO=$(docker compose exec -T db psql -U app -d ms_bi -tA -c "SELECT id FROM usuarios WHERE rol='TECNICO' LIMIT 1")
SOL=<id_de_la_solicitud>

# Cambiar a EN_PROCESO → dispara correo automático
curl -X PATCH "http://localhost:3000/api/v1/solicitudes/$SOL/estado" \
  -H 'Content-Type: application/json' \
  -d "{\"estado\":\"EN_PROCESO\",\"tecnicoId\":\"$TECNICO\"}"
```

Revisa tu inbox: debes recibir el correo "Su solicitud está siendo atendida".

### 4.7. Probar los KPIs

```bash
curl http://localhost:3000/api/v1/kpis/dashboard | jq
curl 'http://localhost:3000/api/v1/reportes/depreciacion?periodo=2026-05-01&page=1&pageSize=5' | jq
curl 'http://localhost:3000/api/v1/reportes/solicitudes-por-estado?desde=2026-01-01' | jq
```

### 4.8. Detener todo

```bash
docker compose down           # detiene
docker compose down -v        # detiene y BORRA los datos (útil para resetear)
```

---

## 5. Levantar sin Docker (Node directo)

Si prefieres correr Node nativo (más rápido para hot-reload), necesitas un PostgreSQL local.

```bash
# 1. Instala dependencias
npm install

# 2. Crea la BD (asumiendo psql instalado)
createdb ms_bi
psql ms_bi -f src/db/migrations/001_initial_schema.sql

# 3. Apunta .env a tu Postgres local
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ms_bi

# 4. Seed
npm run seed

# 5. Arranca con auto-reload
npm run dev
```

---

## 6. Despliegue gratuito en Render

**Por qué Render:** PostgreSQL administrado gratis (1 GB, suficiente para el seed) + un Web Service gratuito (con sleep tras 15 min de inactividad — lo mitigamos con un ping externo).

### 6.1. Subir el proyecto a GitHub

```bash
cd ms-bi-automation
git init
git add .
git commit -m "feat: MS BI y Automatización inicial"
git branch -M main
git remote add origin git@github.com:<tu_usuario>/ms-bi-automation.git
git push -u origin main
```

### 6.2. Crear la base de datos en Render

1. Entra a [https://dashboard.render.com](https://dashboard.render.com) y haz login con GitHub.
2. **New → PostgreSQL**.
3. Configura:
   - **Name:** `ms-bi-db`
   - **Database:** `ms_bi`
   - **User:** (dejar el por defecto)
   - **Region:** la más cercana (Oregon es la más usada en free).
   - **Plan:** Free.
4. Espera ~2 min a que aparezca como `available`.
5. En la página del servicio, copia el **Internal Database URL**. Tiene esta forma:

   ```
   postgres://ms_bi_user:xxxxxxxx@dpg-xxxxx-a/ms_bi
   ```

   👉 Este es el `DATABASE_URL` que usarás en el Web Service.

### 6.3. Crear el Web Service

1. **New → Web Service**.
2. Selecciona el repo de GitHub `ms-bi-automation`.
3. Configuración:

   | Campo | Valor |
   |---|---|
   | **Name** | `ms-bi-automation` |
   | **Region** | la misma que la BD |
   | **Branch** | `main` |
   | **Runtime** | **Docker** |
   | **Dockerfile Path** | `./Dockerfile` |
   | **Plan** | Free |

4. En **Environment Variables**, agrega:

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `PORT` | `3000` |
   | `DATABASE_URL` | el Internal Database URL del paso 6.2 |
   | `DB_SSL` | `true` |
   | `TELEGRAM_BOT_TOKEN` | tu token |
   | `TELEGRAM_MODE` | `webhook` |
   | `TELEGRAM_WEBHOOK_URL` | *(se llena en el paso siguiente)* |
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `587` |
   | `SMTP_SECURE` | `false` |
   | `SMTP_USER` | tu email |
   | `SMTP_PASSWORD` | tu app-password de Gmail |
   | `SMTP_FROM_NAME` | `BI Automation` |
   | `SMTP_FROM_EMAIL` | tu email |
   | `ENABLE_CRON` | `true` |
   | `CORS_ORIGIN` | `*` (o el dominio de tu frontend) |

5. **Create Web Service**. Render va a hacer build del Dockerfile.

### 6.4. Configurar el webhook de Telegram

Una vez Render te dé el dominio público (ej: `https://ms-bi-automation.onrender.com`):

1. Actualiza la env `TELEGRAM_WEBHOOK_URL` = `https://ms-bi-automation.onrender.com`.
2. **Manual Deploy → Deploy latest commit**.
3. La app, al arrancar en modo `webhook`, registra el webhook con Telegram automáticamente apuntando a `<URL>/webhook/telegram`.

Verifica:

```bash
curl "https://api.telegram.org/bot<TU_TOKEN>/getWebhookInfo"
```

Esperado: `url` igual a `https://ms-bi-automation.onrender.com/webhook/telegram`, `pending_update_count: 0`.

### 6.5. Ejecutar migración y seed en Render

Render incluye los migrations al arrancar el contenedor solo en Docker Compose local (porque ahí montamos los `.sql` en `/docker-entrypoint-initdb.d`). En el Postgres administrado de Render hay que correr las migraciones manualmente:

**Opción A — desde la shell de Render del Web Service:**

1. En el dashboard del Web Service → **Shell**.
2. Ejecuta:

   ```bash
   npm run migrate
   npm run seed
   ```

**Opción B — desde tu máquina con `psql`:**

1. En el dashboard de la BD, copia **External Database URL**.
2. Localmente:

   ```bash
   psql "<EXTERNAL_DATABASE_URL>" -f src/db/migrations/001_initial_schema.sql
   ```

3. Para el seed, exporta esa URL y corre:

   ```bash
   DATABASE_URL="<EXTERNAL_DATABASE_URL>" DB_SSL=true node src/db/seeds/seed.js
   ```

### 6.6. Evitar que el plan Free duerma

Render free duerme el contenedor tras **15 min sin tráfico**. Para evitarlo:

1. Crea una cuenta gratis en [UptimeRobot](https://uptimerobot.com).
2. Add **HTTP(s) Monitor** apuntando a `https://ms-bi-automation.onrender.com/health` cada 5 min.

Esto mantiene la app viva 24/7. La BD no duerme.

### 6.7. Probar producción

```bash
curl https://ms-bi-automation.onrender.com/health
curl https://ms-bi-automation.onrender.com/api/v1/kpis/dashboard
```

---

## 7. Alternativas de despliegue gratuito

| Plataforma | Pros | Contras |
|---|---|---|
| **Railway** | Sin sleep, deploy más rápido | Free tier limitado a $5 USD de crédito al mes |
| **Fly.io** | Sin sleep, regiones múltiples | Requiere CLI y `fly.toml` |
| **Koyeb** | Sin sleep, free permanente para 1 servicio | BD gratuita pequeña (256 MB) |
| **Render** | Postgres gratis, integrado a GitHub | Web service duerme |

### Railway (resumen)

```bash
npm i -g @railway/cli
railway login
railway init
railway add  # selecciona PostgreSQL
railway up
railway variables set TELEGRAM_BOT_TOKEN=...
railway run npm run migrate
railway run npm run seed
```

### Fly.io (resumen)

```bash
brew install flyctl
fly launch       # detecta el Dockerfile
fly postgres create
fly postgres attach <pg-app>
fly secrets set TELEGRAM_BOT_TOKEN=...
fly deploy
fly ssh console -C "npm run migrate && npm run seed"
```

---

## 8. Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:5432` | Postgres no levantó | `docker compose logs db` y revisar errores |
| Telegram no responde a `/start` | Token mal o webhook caído | `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo` |
| Webhook devuelve `last_error_message` | Render durmiendo en free tier | Activar UptimeRobot |
| Correos no llegan | App password de Gmail incorrecta | Regenerar y verificar con `SMTP_DEBUG=true` |
| Seed falla con "duplicate key" | Ya ejecutaste antes | `docker compose down -v` y reintenta |
| KPIs salen vacíos | No corriste el seed | `npm run seed` |
| `pg_isready` falla en producción | Falta `DB_SSL=true` | Render Postgres requiere SSL |

---

## 9. Mantenimiento posterior

- **Logs:** `docker compose logs -f api` (local) / dashboard de Render (producción).
- **Snapshots manuales de depreciación:** `npm run depreciation:run` (cubre el mes corriente).
- **Reset completo:** `docker compose down -v && docker compose up -d && docker compose exec api npm run seed`.
- **Backup de BD en Render:** automático diario en el plan Free (7 días de retención).

---

## 10. Checklist final antes de poner en producción

- [ ] Token de Telegram en variables de entorno (nunca commiteado).
- [ ] App password de Gmail en variables de entorno.
- [ ] `DB_SSL=true` en producción.
- [ ] `TELEGRAM_MODE=webhook` y `TELEGRAM_WEBHOOK_URL` definido.
- [ ] `CORS_ORIGINS` con el dominio real del frontend (sin `*`).
- [ ] UptimeRobot configurado.
- [ ] Migración + seed corridos.
- [ ] `curl /health` devuelve `db: up`.
- [ ] `getWebhookInfo` muestra el webhook activo.
- [ ] Prueba end-to-end: `/nueva` en Telegram → cambio de estado por API → correo recibido.
