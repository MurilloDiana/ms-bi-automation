'use strict';

const { query, withTransaction } = require('../config/database');

/**
 * Genera un codigo legible tipo SOL-2026-000123 usando un contador por anio.
 */
async function nextCodigo(client) {
    const r = await client.query(
        `SELECT 'SOL-' || to_char(NOW(), 'YYYY') || '-' ||
                LPAD(
                    (COALESCE(MAX(CAST(SPLIT_PART(codigo, '-', 3) AS INTEGER)), 0) + 1)::TEXT
                , 6, '0') AS codigo
         FROM solicitudes_mantenimiento
         WHERE codigo LIKE ('SOL-' || to_char(NOW(), 'YYYY') || '-%')`
    );
    return r.rows[0].codigo;
}

async function crear(data) {
    return withTransaction(async (client) => {
        const codigo = await nextCodigo(client);
        const sql = `
            INSERT INTO solicitudes_mantenimiento
                (codigo, solicitante_id, activo_id, area_id, tipo, prioridad,
                 descripcion, canal_origen, metadata)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING *`;
        const params = [
            codigo,
            data.solicitante_id,
            data.activo_id,
            data.area_id,
            data.tipo || 'CORRECTIVO',
            data.prioridad || 'MEDIA',
            data.descripcion,
            data.canal_origen || 'WEB',
            data.metadata ? JSON.stringify(data.metadata) : '{}',
        ];
        const r = await client.query(sql, params);
        return r.rows[0];
    });
}

async function obtenerPorId(id) {
    const sql = `
        SELECT s.*,
               u.nombre AS solicitante_nombre, u.email AS solicitante_email,
               t.nombre AS tecnico_nombre,     t.email AS tecnico_email,
               a.codigo AS activo_codigo,      a.nombre AS activo_nombre,
               ar.nombre AS area_nombre
        FROM solicitudes_mantenimiento s
        JOIN usuarios u   ON u.id  = s.solicitante_id
        LEFT JOIN usuarios t ON t.id = s.tecnico_id
        JOIN activos a    ON a.id  = s.activo_id
        JOIN areas   ar   ON ar.id = s.area_id
        WHERE s.id = $1`;
    const r = await query(sql, [id]);
    return r.rows[0] || null;
}

/**
 * Listado paginado con filtros. Usa LIMIT/OFFSET; los filtros pasan por placeholders
 * para evitar SQL injection.
 */
async function listar({ estado, tecnicoId, areaId, desde, hasta, page = 1, pageSize = 20 }) {
    const where = [];
    const params = [];
    let i = 1;

    if (estado)    { where.push(`s.estado    = $${i++}`); params.push(estado); }
    if (tecnicoId) { where.push(`s.tecnico_id = $${i++}`); params.push(tecnicoId); }
    if (areaId)    { where.push(`s.area_id   = $${i++}`); params.push(areaId); }
    if (desde)     { where.push(`s.fecha_solicitud >= $${i++}`); params.push(desde); }
    if (hasta)     { where.push(`s.fecha_solicitud <= $${i++}`); params.push(hasta); }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    const dataSql = `
        SELECT s.id, s.codigo, s.estado, s.tipo, s.prioridad, s.descripcion,
               s.fecha_solicitud, s.fecha_inicio, s.fecha_fin, s.costo,
               u.nombre  AS solicitante_nombre,
               t.nombre  AS tecnico_nombre,
               a.codigo  AS activo_codigo, a.nombre AS activo_nombre,
               ar.nombre AS area_nombre
        FROM solicitudes_mantenimiento s
        JOIN usuarios u   ON u.id = s.solicitante_id
        LEFT JOIN usuarios t ON t.id = s.tecnico_id
        JOIN activos a    ON a.id  = s.activo_id
        JOIN areas   ar   ON ar.id = s.area_id
        ${whereSql}
        ORDER BY s.fecha_solicitud DESC
        LIMIT $${i++} OFFSET $${i++}`;

    const countSql = `SELECT COUNT(*)::INT AS total FROM solicitudes_mantenimiento s ${whereSql}`;

    const [data, count] = await Promise.all([
        query(dataSql, [...params, pageSize, offset]),
        query(countSql, params),
    ]);

    return {
        items: data.rows,
        meta: {
            total: count.rows[0].total,
            page,
            pageSize,
            totalPages: Math.ceil(count.rows[0].total / pageSize),
        },
    };
}

/**
 * Cambia el estado de la solicitud y mueve fechas asociadas automaticamente.
 * Devuelve la fila actualizada o null si no existe.
 */
async function cambiarEstado(id, nuevoEstado, { tecnico_id = null, diagnostico = null, solucion = null, costo = null } = {}) {
    const sets = ['estado = $2', 'updated_at = NOW()'];
    const params = [id, nuevoEstado];
    let i = 3;

    if (nuevoEstado === 'EN_PROCESO') {
        sets.push(`fecha_inicio = COALESCE(fecha_inicio, NOW())`);
        sets.push(`fecha_estimada_fin = COALESCE(fecha_estimada_fin, (NOW() + INTERVAL '3 days')::DATE)`);
    }
    if (nuevoEstado === 'COMPLETADO') {
        sets.push(`fecha_fin = NOW()`);
    }
    if (tecnico_id)   { sets.push(`tecnico_id  = $${i++}`); params.push(tecnico_id); }
    if (diagnostico) { sets.push(`diagnostico = $${i++}`); params.push(diagnostico); }
    if (solucion)    { sets.push(`solucion    = $${i++}`); params.push(solucion); }
    if (costo !== null && costo !== undefined) {
        sets.push(`costo = $${i++}`);
        params.push(costo);
    }

    const sql = `UPDATE solicitudes_mantenimiento SET ${sets.join(', ')} WHERE id = $1 RETURNING *`;
    const r = await query(sql, params);
    return r.rows[0] || null;
}

async function marcarNotificado(id, campo) {
    if (!['notificado_inicio', 'notificado_fin'].includes(campo)) {
        throw new Error('Campo de notificacion invalido');
    }
    await query(`UPDATE solicitudes_mantenimiento SET ${campo} = TRUE WHERE id = $1`, [id]);
}

module.exports = { crear, obtenerPorId, listar, cambiarEstado, marcarNotificado };
