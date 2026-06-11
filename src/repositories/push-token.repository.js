'use strict';

const { query } = require('../config/database');

async function upsert(usuarioId, token) {
    const sql = `
        INSERT INTO push_tokens (usuario_id, token)
        VALUES ($1, $2)
        ON CONFLICT (token) DO UPDATE
            SET usuario_id = EXCLUDED.usuario_id,
                activo     = TRUE,
                updated_at = NOW()
        RETURNING *`;
    const r = await query(sql, [usuarioId, token]);
    return r.rows[0];
}

async function desactivar(token) {
    const r = await query(
        `UPDATE push_tokens SET activo = FALSE, updated_at = NOW()
         WHERE token = $1 RETURNING id`,
        [token]
    );
    return r.rows[0] || null;
}

async function obtenerPorUsuario(usuarioId) {
    const r = await query(
        `SELECT token FROM push_tokens WHERE usuario_id = $1 AND activo = TRUE`,
        [usuarioId]
    );
    return r.rows.map(row => row.token);
}

async function obtenerPorRoles(roles) {
    if (!roles.length) return [];
    const placeholders = roles.map((_, i) => `$${i + 1}`).join(',');
    const sql = `
        SELECT DISTINCT pt.token
        FROM push_tokens pt
        JOIN usuarios u ON u.id = pt.usuario_id
        WHERE u.rol IN (${placeholders})
          AND u.activo   = TRUE
          AND pt.activo  = TRUE`;
    const r = await query(sql, roles);
    return r.rows.map(row => row.token);
}

module.exports = { upsert, desactivar, obtenerPorUsuario, obtenerPorRoles };
