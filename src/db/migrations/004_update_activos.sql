-- =====================================================
-- MIGRACIÓN 004: nuevos campos category y status en activos
-- =====================================================

-- 1. Agregar columna category con el nuevo enum
ALTER TABLE activos
    ADD COLUMN IF NOT EXISTS category VARCHAR(25)
    CHECK (category IN ('ELECTRONIC_EQUIPMENT','HVAC_EQUIPMENT','FIXTURES','OTHERS'));

-- 2. Agregar columna status con el nuevo enum
ALTER TABLE activos
    ADD COLUMN IF NOT EXISTS status VARCHAR(20)
    CHECK (status IN ('ACTIVE','IN_STORAGE','LOST','DAMAGED','RETIRED','UNDER_MAINTENANCE'));

-- 3. Poblar status desde estado existente
UPDATE activos SET status = CASE estado
    WHEN 'OPERATIVO'         THEN 'ACTIVE'
    WHEN 'EN_MANTENIMIENTO'  THEN 'UNDER_MAINTENANCE'
    WHEN 'FUERA_DE_SERVICIO' THEN 'DAMAGED'
    WHEN 'DADO_DE_BAJA'      THEN 'RETIRED'
    ELSE 'ACTIVE'
END;

-- 4. Poblar category desde categoria_id existente
UPDATE activos a
SET category = CASE c.nombre
    WHEN 'Impresoras'            THEN 'ELECTRONIC_EQUIPMENT'
    WHEN 'Computadoras'          THEN 'ELECTRONIC_EQUIPMENT'
    WHEN 'Laptops'               THEN 'ELECTRONIC_EQUIPMENT'
    WHEN 'Equipos Audiovisuales' THEN 'ELECTRONIC_EQUIPMENT'
    WHEN 'Equipos de Oficina'    THEN 'ELECTRONIC_EQUIPMENT'
    WHEN 'Climatizacion'         THEN 'HVAC_EQUIPMENT'
    WHEN 'Mobiliario'            THEN 'FIXTURES'
    ELSE 'OTHERS'
END
FROM categorias_activo c
WHERE c.id = a.categoria_id;
