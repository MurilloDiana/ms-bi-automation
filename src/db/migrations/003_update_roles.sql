-- =====================================================
-- MIGRACIÓN 003: nuevos roles del sistema
-- Mapeo: ADMIN→SUPERADMIN, SUPERVISOR→GERENTE,
--        EMPLEADO→OPERADOR, TECNICO sin cambio
-- =====================================================

-- 1. Eliminar constraint viejo primero para poder actualizar los datos
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;

-- 2. Migrar datos existentes al nuevo esquema de roles
UPDATE usuarios SET rol = 'SUPERADMIN' WHERE rol = 'ADMIN';
UPDATE usuarios SET rol = 'GERENTE'    WHERE rol = 'SUPERVISOR';
UPDATE usuarios SET rol = 'OPERADOR'   WHERE rol = 'EMPLEADO';

-- 3. Agregar el nuevo constraint con los roles actualizados
ALTER TABLE usuarios
    ADD CONSTRAINT usuarios_rol_check
    CHECK (rol IN ('SUPERADMIN','GERENTE','TECNICO','ASISTENTE','OPERADOR'));
