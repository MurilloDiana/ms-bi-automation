'use strict';

const { query } = require('../config/database');

// Mapeo category → categoria_id legacy (por nombre)
const CATEGORY_TO_NOMBRE = {
    ELECTRONIC_EQUIPMENT: 'Computadoras',
    HVAC_EQUIPMENT:       'Climatizacion',
    FIXTURES:             'Mobiliario',
    OTHERS:               'Equipos de Oficina',
};

// Mapeo status → estado legacy (para KPI views)
const STATUS_TO_ESTADO = {
    ACTIVE:             'OPERATIVO',
    IN_STORAGE:         'FUERA_DE_SERVICIO',
    LOST:               'FUERA_DE_SERVICIO',
    DAMAGED:            'FUERA_DE_SERVICIO',
    RETIRED:            'DADO_DE_BAJA',
    UNDER_MAINTENANCE:  'EN_MANTENIMIENTO',
};

async function crear({ name, description, acquisitionDate, category, location, status, areaId }) {
    // Resolver categoria_id por nombre
    const catRow = await query(
        'SELECT id FROM categorias_activo WHERE nombre = $1 LIMIT 1',
        [CATEGORY_TO_NOMBRE[category]]
    );
    const categoriaId = catRow.rows[0]?.id ?? 2; // fallback Computadoras

    // Resolver area_id (usar la primera disponible si no se provee)
    let resolvedAreaId = areaId;
    if (!resolvedAreaId) {
        const areaRow = await query('SELECT id FROM areas ORDER BY id LIMIT 1');
        resolvedAreaId = areaRow.rows[0]?.id ?? 1;
    }

    // Generar código único a partir del mayor número existente
    const maxRow = await query(
        `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(codigo,'[^0-9]','','g') AS INTEGER)), 0) + 1 AS next_seq
         FROM activos WHERE codigo ~ '^ACT-'`
    );
    const seq   = parseInt(maxRow.rows[0].next_seq);
    const codigo = `ACT-${String(seq).padStart(5, '0')}`;

    const estado = STATUS_TO_ESTADO[status] ?? 'OPERATIVO';

    const r = await query(
        `INSERT INTO activos
            (codigo, nombre, descripcion, categoria_id, area_id,
             fecha_adquisicion, valor_compra, estado,
             ubicacion, category, status)
         VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,$10)
         RETURNING id, codigo, nombre AS name, descripcion AS description,
                   fecha_adquisicion AS "acquisitionDate",
                   ubicacion AS location, category, status, created_at`,
        [
            codigo, name, description ?? null, categoriaId, resolvedAreaId,
            acquisitionDate, estado, location ?? null, category, status,
        ]
    );
    return r.rows[0];
}

async function listar() {
    const r = await query(
        `SELECT a.id, a.codigo, a.nombre AS name, a.descripcion AS description,
                a.fecha_adquisicion AS "acquisitionDate",
                a.ubicacion AS location, a.category, a.status,
                a.area_id AS "areaId", ar.nombre AS "areaName",
                a.categoria_id AS "categoryId", c.nombre AS "categoryName",
                a.created_at, a.updated_at
         FROM activos a
         JOIN categorias_activo c ON c.id = a.categoria_id
         JOIN areas ar           ON ar.id = a.area_id
         ORDER BY a.created_at DESC`
    );
    return r.rows;
}

async function buscarPorCodigoONombre(termino) {
    const r = await query(
        `SELECT id, codigo, nombre, estado, area_id
         FROM activos
         WHERE codigo ILIKE $1 OR nombre ILIKE $1
         ORDER BY codigo
         LIMIT 10`,
        [`%${termino}%`]
    );
    return r.rows;
}

async function obtenerPorId(id) {
    const r = await query(
        `SELECT a.*, c.nombre AS categoria_nombre, c.vida_util_anios, c.valor_residual_pct,
                ar.nombre AS area_nombre
         FROM activos a
         JOIN categorias_activo c ON c.id = a.categoria_id
         JOIN areas ar           ON ar.id = a.area_id
         WHERE a.id = $1`,
        [id]
    );
    return r.rows[0] || null;
}

async function listarTodos() {
    const r = await query(
        `SELECT a.*, c.nombre AS categoria_nombre, c.vida_util_anios, c.valor_residual_pct,
                ar.nombre AS area_nombre
         FROM activos a
         JOIN categorias_activo c ON c.id = a.categoria_id
         JOIN areas ar           ON ar.id = a.area_id
         WHERE a.estado <> 'DADO_DE_BAJA'`
    );
    return r.rows;
}

async function cambiarEstado(id, nuevoEstado) {
    const r = await query(
        'UPDATE activos SET estado = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
        [id, nuevoEstado]
    );
    return r.rows[0] || null;
}

module.exports = { crear, listar, buscarPorCodigoONombre, obtenerPorId, listarTodos, cambiarEstado };
