-- =====================================================
-- MS BI & AUTOMATION - SCHEMA INICIAL
-- Empresa: Material de Escritorio
-- Motor: PostgreSQL 14+
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- TABLAS MAESTRAS
-- =====================================================

CREATE TABLE IF NOT EXISTS areas (
    id              SERIAL PRIMARY KEY,
    codigo          VARCHAR(20)  NOT NULL UNIQUE,
    nombre          VARCHAR(100) NOT NULL,
    descripcion     TEXT,
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usuarios (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre          VARCHAR(150) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    telefono        VARCHAR(20),
    rol             VARCHAR(30)  NOT NULL CHECK (rol IN ('ADMIN','TECNICO','EMPLEADO','SUPERVISOR')),
    area_id         INTEGER      REFERENCES areas(id) ON DELETE SET NULL,
    telegram_chat_id BIGINT,
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_rol      ON usuarios(rol);
CREATE INDEX IF NOT EXISTS idx_usuarios_area     ON usuarios(area_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_telegram ON usuarios(telegram_chat_id);

CREATE TABLE IF NOT EXISTS categorias_activo (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL UNIQUE,
    vida_util_anios INTEGER      NOT NULL CHECK (vida_util_anios > 0),
    -- Metodo de depreciacion: LINEAL es el mas comun para muebles/equipos de oficina
    metodo_depreciacion VARCHAR(20) NOT NULL DEFAULT 'LINEAL' CHECK (metodo_depreciacion IN ('LINEAL','UNIDADES_PRODUCIDAS')),
    valor_residual_pct NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activos (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo          VARCHAR(30)  NOT NULL UNIQUE,
    nombre          VARCHAR(150) NOT NULL,
    descripcion     TEXT,
    categoria_id    INTEGER      NOT NULL REFERENCES categorias_activo(id) ON DELETE RESTRICT,
    area_id         INTEGER      NOT NULL REFERENCES areas(id) ON DELETE RESTRICT,
    responsable_id  UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
    fecha_adquisicion DATE       NOT NULL,
    valor_compra    NUMERIC(14,2) NOT NULL CHECK (valor_compra >= 0),
    estado          VARCHAR(20)  NOT NULL DEFAULT 'OPERATIVO'
                    CHECK (estado IN ('OPERATIVO','EN_MANTENIMIENTO','FUERA_DE_SERVICIO','DADO_DE_BAJA')),
    proveedor       VARCHAR(150),
    serie           VARCHAR(80),
    ubicacion       VARCHAR(150),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activos_estado     ON activos(estado);
CREATE INDEX IF NOT EXISTS idx_activos_area       ON activos(area_id);
CREATE INDEX IF NOT EXISTS idx_activos_categoria  ON activos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_activos_fecha_adq  ON activos(fecha_adquisicion);

-- =====================================================
-- MANTENIMIENTO
-- =====================================================

CREATE TABLE IF NOT EXISTS solicitudes_mantenimiento (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo          VARCHAR(20)  NOT NULL UNIQUE,
    solicitante_id  UUID         NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    tecnico_id      UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
    activo_id       UUID         NOT NULL REFERENCES activos(id) ON DELETE RESTRICT,
    area_id         INTEGER      NOT NULL REFERENCES areas(id) ON DELETE RESTRICT,
    tipo            VARCHAR(20)  NOT NULL DEFAULT 'CORRECTIVO'
                    CHECK (tipo IN ('PREVENTIVO','CORRECTIVO','PREDICTIVO')),
    prioridad       VARCHAR(10)  NOT NULL DEFAULT 'MEDIA'
                    CHECK (prioridad IN ('BAJA','MEDIA','ALTA','CRITICA')),
    estado          VARCHAR(20)  NOT NULL DEFAULT 'PENDIENTE'
                    CHECK (estado IN ('PENDIENTE','EN_PROCESO','COMPLETADO','CANCELADO','RECHAZADO')),
    descripcion     TEXT         NOT NULL,
    diagnostico     TEXT,
    solucion        TEXT,
    costo           NUMERIC(12,2) DEFAULT 0 CHECK (costo >= 0),
    fecha_solicitud TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    fecha_inicio    TIMESTAMPTZ,
    fecha_fin       TIMESTAMPTZ,
    fecha_estimada_fin DATE,
    canal_origen    VARCHAR(20)  NOT NULL DEFAULT 'WEB'
                    CHECK (canal_origen IN ('WEB','TELEGRAM','EMAIL','APP_MOVIL')),
    notificado_inicio BOOLEAN    NOT NULL DEFAULT FALSE,
    notificado_fin    BOOLEAN    NOT NULL DEFAULT FALSE,
    metadata        JSONB        DEFAULT '{}'::JSONB,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_estado     ON solicitudes_mantenimiento(estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_activo     ON solicitudes_mantenimiento(activo_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_area       ON solicitudes_mantenimiento(area_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_tecnico    ON solicitudes_mantenimiento(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_solicitante ON solicitudes_mantenimiento(solicitante_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_fecha      ON solicitudes_mantenimiento(fecha_solicitud DESC);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado_fecha ON solicitudes_mantenimiento(estado, fecha_solicitud DESC);

-- =====================================================
-- HISTORIAL DE ESTADOS (auditoria)
-- =====================================================

CREATE TABLE IF NOT EXISTS historial_estados_solicitud (
    id              BIGSERIAL    PRIMARY KEY,
    solicitud_id    UUID         NOT NULL REFERENCES solicitudes_mantenimiento(id) ON DELETE CASCADE,
    estado_anterior VARCHAR(20),
    estado_nuevo    VARCHAR(20)  NOT NULL,
    usuario_id      UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
    comentario      TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historial_solicitud ON historial_estados_solicitud(solicitud_id);

-- =====================================================
-- DEPRECIACION (snapshots mensuales)
-- =====================================================

CREATE TABLE IF NOT EXISTS depreciacion_mensual (
    id              BIGSERIAL    PRIMARY KEY,
    activo_id       UUID         NOT NULL REFERENCES activos(id) ON DELETE CASCADE,
    periodo         DATE         NOT NULL, -- siempre dia 1 del mes
    valor_inicio    NUMERIC(14,2) NOT NULL,
    depreciacion_mes NUMERIC(14,2) NOT NULL,
    depreciacion_acumulada NUMERIC(14,2) NOT NULL,
    valor_libro     NUMERIC(14,2) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (activo_id, periodo)
);

CREATE INDEX IF NOT EXISTS idx_depreciacion_periodo ON depreciacion_mensual(periodo);
CREATE INDEX IF NOT EXISTS idx_depreciacion_activo  ON depreciacion_mensual(activo_id);

-- =====================================================
-- NOTIFICACIONES (log)
-- =====================================================

CREATE TABLE IF NOT EXISTS notificaciones (
    id              BIGSERIAL    PRIMARY KEY,
    canal           VARCHAR(20)  NOT NULL CHECK (canal IN ('EMAIL','TELEGRAM')),
    destinatario    VARCHAR(200) NOT NULL,
    asunto          VARCHAR(200),
    mensaje         TEXT         NOT NULL,
    referencia_tipo VARCHAR(50),
    referencia_id   VARCHAR(80),
    estado          VARCHAR(20)  NOT NULL DEFAULT 'PENDIENTE'
                    CHECK (estado IN ('PENDIENTE','ENVIADO','ERROR')),
    error_detalle   TEXT,
    intentos        INTEGER      NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    sent_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notif_estado ON notificaciones(estado);
CREATE INDEX IF NOT EXISTS idx_notif_canal  ON notificaciones(canal);

-- =====================================================
-- TRIGGERS - updated_at automatico
-- =====================================================

CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['areas','usuarios','activos','solicitudes_mantenimiento'])
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS set_updated_at_%1$s ON %1$s;
             CREATE TRIGGER set_updated_at_%1$s
             BEFORE UPDATE ON %1$s
             FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();', t);
    END LOOP;
END $$;

-- =====================================================
-- TRIGGER de historial de estados
-- =====================================================

CREATE OR REPLACE FUNCTION trg_log_estado_solicitud() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO historial_estados_solicitud (solicitud_id, estado_anterior, estado_nuevo, usuario_id)
        VALUES (NEW.id, NULL, NEW.estado, NEW.solicitante_id);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
        INSERT INTO historial_estados_solicitud (solicitud_id, estado_anterior, estado_nuevo, usuario_id)
        VALUES (NEW.id, OLD.estado, NEW.estado, NEW.tecnico_id);
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_historial_estado ON solicitudes_mantenimiento;
CREATE TRIGGER trg_historial_estado
AFTER INSERT OR UPDATE OF estado ON solicitudes_mantenimiento
FOR EACH ROW EXECUTE FUNCTION trg_log_estado_solicitud();

-- =====================================================
-- VISTAS PARA KPIs - calculo optimizado en BD
-- =====================================================

-- KPI 1: Tasa de disponibilidad de activos
CREATE OR REPLACE VIEW v_kpi_disponibilidad_activos AS
SELECT
    COUNT(*)                                                            AS total_activos,
    COUNT(*) FILTER (WHERE estado = 'OPERATIVO')                        AS activos_operativos,
    COUNT(*) FILTER (WHERE estado = 'EN_MANTENIMIENTO')                 AS activos_en_mantenimiento,
    COUNT(*) FILTER (WHERE estado = 'FUERA_DE_SERVICIO')                AS activos_fuera_servicio,
    COUNT(*) FILTER (WHERE estado = 'DADO_DE_BAJA')                     AS activos_baja,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE estado = 'OPERATIVO') /
        NULLIF(COUNT(*) FILTER (WHERE estado <> 'DADO_DE_BAJA'), 0)
    , 2) AS tasa_disponibilidad_pct
FROM activos;

-- KPI 2: MTTR (Mean Time To Repair) en horas
CREATE OR REPLACE VIEW v_kpi_mttr AS
SELECT
    COUNT(*)                                                            AS solicitudes_completadas,
    ROUND(AVG(EXTRACT(EPOCH FROM (fecha_fin - fecha_inicio)) / 3600.0)::NUMERIC, 2) AS mttr_horas,
    ROUND(AVG(EXTRACT(EPOCH FROM (fecha_fin - fecha_inicio)) / 86400.0)::NUMERIC, 2) AS mttr_dias
FROM solicitudes_mantenimiento
WHERE estado = 'COMPLETADO'
  AND fecha_inicio IS NOT NULL
  AND fecha_fin    IS NOT NULL;

-- KPI 3: MTBF (Mean Time Between Failures) en dias - por activo
CREATE OR REPLACE VIEW v_kpi_mtbf AS
WITH fallas AS (
    SELECT
        activo_id,
        fecha_solicitud,
        LAG(fecha_solicitud) OVER (PARTITION BY activo_id ORDER BY fecha_solicitud) AS falla_anterior
    FROM solicitudes_mantenimiento
    WHERE tipo = 'CORRECTIVO'
)
SELECT
    ROUND(AVG(EXTRACT(EPOCH FROM (fecha_solicitud - falla_anterior)) / 86400.0)::NUMERIC, 2) AS mtbf_dias,
    COUNT(*) AS num_observaciones
FROM fallas
WHERE falla_anterior IS NOT NULL;

-- KPI 4: Costo total de mantenimiento por activo (top + agregados)
CREATE OR REPLACE VIEW v_kpi_costo_por_activo AS
SELECT
    a.id            AS activo_id,
    a.codigo,
    a.nombre        AS activo_nombre,
    ar.nombre       AS area_nombre,
    COUNT(s.id)     AS num_mantenimientos,
    COALESCE(SUM(s.costo), 0) AS costo_total,
    COALESCE(AVG(s.costo) FILTER (WHERE s.estado = 'COMPLETADO'), 0) AS costo_promedio
FROM activos a
JOIN areas ar               ON ar.id = a.area_id
LEFT JOIN solicitudes_mantenimiento s
       ON s.activo_id = a.id AND s.estado = 'COMPLETADO'
GROUP BY a.id, a.codigo, a.nombre, ar.nombre;

-- KPI 5: Cumplimiento de mantenimiento preventivo
CREATE OR REPLACE VIEW v_kpi_cumplimiento_preventivo AS
SELECT
    DATE_TRUNC('month', fecha_solicitud)::DATE AS periodo,
    COUNT(*) FILTER (WHERE tipo = 'PREVENTIVO')                              AS preventivos_total,
    COUNT(*) FILTER (WHERE tipo = 'PREVENTIVO' AND estado = 'COMPLETADO')    AS preventivos_completados,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE tipo = 'PREVENTIVO' AND estado = 'COMPLETADO')
        / NULLIF(COUNT(*) FILTER (WHERE tipo = 'PREVENTIVO'), 0)
    , 2) AS cumplimiento_pct
FROM solicitudes_mantenimiento
GROUP BY 1
ORDER BY 1 DESC;
