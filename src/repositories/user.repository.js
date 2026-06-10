'use strict';

const { query } = require('../config/database');

async function crear({ email, firstname, lastname, rol, password_hash, activo }) {
    const r = await query(
        `INSERT INTO usuarios (email, nombre, firstname, lastname, rol, password_hash, activo)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, email, firstname, lastname, nombre, rol, activo, created_at`,
        [email, `${firstname} ${lastname}`, firstname, lastname, rol, password_hash, activo]
    );
    return r.rows[0];
}

async function buscarPorEmail(email) {
    const r = await query('SELECT * FROM usuarios WHERE email = $1 AND activo = TRUE', [email]);
    return r.rows[0] || null;
}

async function buscarPorTelegramChatId(chatId) {
    const r = await query('SELECT * FROM usuarios WHERE telegram_chat_id = $1 AND activo = TRUE', [chatId]);
    return r.rows[0] || null;
}

async function vincularTelegram(userId, chatId) {
    const r = await query(
        'UPDATE usuarios SET telegram_chat_id = $2 WHERE id = $1 RETURNING *',
        [userId, chatId]
    );
    return r.rows[0] || null;
}

async function obtenerPorId(id) {
    const r = await query('SELECT * FROM usuarios WHERE id = $1', [id]);
    return r.rows[0] || null;
}

async function obtenerTecnicos() {
    const r = await query(
        `SELECT id, nombre, email, telefono, telegram_chat_id
         FROM usuarios
         WHERE rol = 'TECNICO' AND activo = TRUE
         ORDER BY nombre`
    );
    return r.rows;
}

async function listar({ rol } = {}) {
    const where = rol ? `WHERE rol = $1 AND activo = TRUE` : `WHERE activo = TRUE`;
    const params = rol ? [rol] : [];
    const r = await query(
        `SELECT id, nombre, email, rol, area_id FROM usuarios ${where} ORDER BY nombre LIMIT 100`,
        params
    );
    return r.rows;
}

module.exports = {
    crear,
    buscarPorEmail,
    buscarPorTelegramChatId,
    vincularTelegram,
    obtenerPorId,
    obtenerTecnicos,
    listar,
};
