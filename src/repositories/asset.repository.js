'use strict';

const { query } = require('../config/database');

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

module.exports = { buscarPorCodigoONombre, obtenerPorId, listarTodos, cambiarEstado };
