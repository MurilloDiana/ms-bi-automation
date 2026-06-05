'use strict';

const logger = require('../config/logger');
const { query } = require('../config/database');

let botInstance = null;

function setBot(bot) {
    botInstance = bot;
}

async function enviarMensaje({ chatId, mensaje, referenciaTipo = null, referenciaId = null }) {
    const sql = `
        INSERT INTO notificaciones (canal, destinatario, mensaje, referencia_tipo, referencia_id, estado)
        VALUES ('TELEGRAM', $1, $2, $3, $4, 'PENDIENTE') RETURNING id`;
    const notif = await query(sql, [String(chatId), mensaje, referenciaTipo, referenciaId]);
    const notifId = notif.rows[0].id;

    if (!botInstance) {
        await query(
            `UPDATE notificaciones SET estado = 'ERROR', error_detalle = 'Bot no inicializado' WHERE id = $1`,
            [notifId]
        );
        return { ok: false };
    }

    try {
        await botInstance.sendMessage(chatId, mensaje, { parse_mode: 'HTML' });
        await query(
            `UPDATE notificaciones SET estado = 'ENVIADO', sent_at = NOW(), intentos = intentos + 1 WHERE id = $1`,
            [notifId]
        );
        return { ok: true };
    } catch (err) {
        logger.error({ err, chatId }, 'Error enviando mensaje a Telegram');
        await query(
            `UPDATE notificaciones SET estado = 'ERROR', error_detalle = $2, intentos = intentos + 1 WHERE id = $1`,
            [notifId, err.message]
        );
        return { ok: false, error: err.message };
    }
}

module.exports = { setBot, enviarMensaje };
