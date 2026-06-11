-- =====================================================
-- MIGRACIÓN 005: soporte para Expo Push Notifications
-- =====================================================

-- Tabla de tokens push por usuario (un usuario puede tener varios dispositivos)
CREATE TABLE IF NOT EXISTS push_tokens (
    id          BIGSERIAL    PRIMARY KEY,
    usuario_id  UUID         NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token       VARCHAR(200) NOT NULL UNIQUE,
    plataforma  VARCHAR(20)  NOT NULL DEFAULT 'EXPO',
    activo      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_usuario ON push_tokens(usuario_id) WHERE activo = TRUE;

-- Extender el canal permitido en la tabla de audit de notificaciones
ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS notificaciones_canal_check;
ALTER TABLE notificaciones
    ADD CONSTRAINT notificaciones_canal_check
    CHECK (canal IN ('EMAIL','TELEGRAM','EXPO_PUSH'));
