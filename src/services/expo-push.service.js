'use strict';

const { Expo } = require('expo-server-sdk');
const { query } = require('../config/database');
const logger = require('../config/logger');

let expoClient = null;

function getClient() {
    if (expoClient) return expoClient;
    // El access token es opcional; requerido solo para prioridad alta en producción
    expoClient = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN || undefined });
    return expoClient;
}

/**
 * Envía una notificación push a uno o múltiples tokens Expo.
 * No lanza excepción: los errores quedan en la tabla notificaciones y en los logs.
 *
 * @param {Object} opts
 * @param {string[]} opts.tokens           - Tokens destino (ExponentPushToken[...])
 * @param {string}   opts.titulo           - Título de la notificación
 * @param {string}   opts.cuerpo           - Cuerpo del mensaje
 * @param {Object}   [opts.data]           - Payload extra para la app móvil
 * @param {string}   [opts.referenciaTipo] - Ej: 'SOLICITUD'
 * @param {string}   [opts.referenciaId]   - UUID de la entidad
 */
async function enviarPush({ tokens, titulo, cuerpo, data = {}, referenciaTipo = null, referenciaId = null }) {
    if (!tokens || !tokens.length) return { ok: true, enviados: 0 };

    const expo = getClient();
    const tokensValidos = tokens.filter(t => Expo.isExpoPushToken(t));

    if (!tokensValidos.length) {
        logger.warn({ tokens }, 'No hay tokens Expo válidos para enviar push');
        return { ok: false, reason: 'no_valid_tokens' };
    }

    const mensajeTexto = `${titulo}: ${cuerpo}`;

    // Insertar un registro de notificación por cada token válido
    const notifIds = await Promise.all(
        tokensValidos.map(token =>
            query(
                `INSERT INTO notificaciones
                    (canal, destinatario, asunto, mensaje, referencia_tipo, referencia_id, estado)
                 VALUES ('EXPO_PUSH', $1, $2, $3, $4, $5, 'PENDIENTE') RETURNING id`,
                [token, titulo, mensajeTexto, referenciaTipo, referenciaId]
            ).then(r => ({ token, notifId: r.rows[0].id }))
        )
    );

    const tokenToNotifId = Object.fromEntries(notifIds.map(({ token, notifId }) => [token, notifId]));

    // Construir mensajes para la API de Expo
    const messages = tokensValidos.map(token => ({
        to: token,
        sound: 'default',
        title: titulo,
        body: cuerpo,
        data,
    }));

    const chunks = expo.chunkPushNotifications(messages);
    let enviados = 0;
    let errores = 0;

    for (const chunk of chunks) {
        let tickets;
        try {
            tickets = await expo.sendPushNotificationsAsync(chunk);
        } catch (err) {
            logger.error({ err }, 'Error al enviar chunk de push notifications');
            // Marcar todos los del chunk como ERROR
            await Promise.all(
                chunk.map(msg =>
                    query(
                        `UPDATE notificaciones SET estado = 'ERROR', error_detalle = $2, intentos = intentos + 1 WHERE id = $1`,
                        [tokenToNotifId[msg.to], err.message]
                    )
                )
            );
            errores += chunk.length;
            continue;
        }

        // Procesar tickets individuales
        await Promise.all(
            tickets.map((ticket, idx) => {
                const token = chunk[idx].to;
                const notifId = tokenToNotifId[token];
                if (ticket.status === 'ok') {
                    enviados++;
                    return query(
                        `UPDATE notificaciones SET estado = 'ENVIADO', sent_at = NOW(), intentos = intentos + 1 WHERE id = $1`,
                        [notifId]
                    );
                } else {
                    errores++;
                    logger.warn({ token, ticket }, 'Expo push ticket con error');
                    return query(
                        `UPDATE notificaciones SET estado = 'ERROR', error_detalle = $2, intentos = intentos + 1 WHERE id = $1`,
                        [notifId, ticket.details?.error || ticket.message || 'unknown']
                    );
                }
            })
        );
    }

    logger.info({ enviados, errores, referenciaTipo, referenciaId }, 'Push notifications procesadas');
    return { ok: errores === 0, enviados, errores };
}

module.exports = { enviarPush };
