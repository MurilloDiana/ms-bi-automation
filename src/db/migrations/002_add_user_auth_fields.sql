-- =====================================================
-- MIGRACIÓN 002: campos de autenticación en usuarios
-- =====================================================

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS firstname     VARCHAR(75),
    ADD COLUMN IF NOT EXISTS lastname      VARCHAR(75),
    ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
