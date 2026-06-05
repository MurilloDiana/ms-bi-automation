'use strict';

const nodemailer = require('nodemailer');
const config = require('../config/env');
const logger = require('../config/logger');
const { query } = require('../config/database');

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;
    if (!config.email.host || !config.email.user) {
        logger.warn('SMTP no configurado; los emails no se enviaran realmente');
        return null;
    }
    transporter = nodemailer.createTransport({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.secure,
        auth: { user: config.email.user, pass: config.email.password },
    });
    return transporter;
}

/**
 * Envia un email y registra el resultado en la tabla notificaciones.
 * Tolera fallos (no rompe el flujo de negocio): los errores quedan loguead os y persistidos.
 */
async function enviar({ to, subject, html, text, referenciaTipo = null, referenciaId = null }) {
    const t = getTransporter();
    const notifSql = `
        INSERT INTO notificaciones (canal, destinatario, asunto, mensaje, referencia_tipo, referencia_id, estado)
        VALUES ('EMAIL', $1, $2, $3, $4, $5, 'PENDIENTE') RETURNING id`;
    const notif = await query(notifSql, [to, subject, text || html, referenciaTipo, referenciaId]);
    const notifId = notif.rows[0].id;

    if (!t) {
        await query(
            `UPDATE notificaciones SET estado = 'ERROR', error_detalle = 'SMTP no configurado' WHERE id = $1`,
            [notifId]
        );
        return { ok: false, reason: 'no_smtp' };
    }

    try {
        const info = await t.sendMail({
            from: `"${config.email.fromName}" <${config.email.fromEmail || config.email.user}>`,
            to,
            subject,
            text,
            html,
        });
        await query(
            `UPDATE notificaciones SET estado = 'ENVIADO', sent_at = NOW(), intentos = intentos + 1 WHERE id = $1`,
            [notifId]
        );
        logger.info({ to, subject, messageId: info.messageId }, 'Email enviado');
        return { ok: true, messageId: info.messageId };
    } catch (err) {
        logger.error({ err, to, subject }, 'Error enviando email');
        await query(
            `UPDATE notificaciones SET estado = 'ERROR', error_detalle = $2, intentos = intentos + 1 WHERE id = $1`,
            [notifId, err.message]
        );
        return { ok: false, reason: 'send_error', error: err.message };
    }
}

/**
 * Plantilla HTML para notificar al solicitante que su mantenimiento entro EN_PROCESO.
 */
function htmlMantenimientoEnProceso({ solicitanteNombre, codigo, activoNombre, tecnicoNombre, fechaEstimada }) {
    return `
    <!doctype html>
    <html><body style="font-family: Arial, sans-serif; color:#222;">
      <div style="max-width:600px;margin:auto;border:1px solid #eee;border-radius:8px;padding:24px;">
        <h2 style="color:#1f6feb;">Tu solicitud de mantenimiento esta siendo atendida</h2>
        <p>Hola <b>${solicitanteNombre}</b>,</p>
        <p>Te informamos que tu solicitud <b>${codigo}</b> para el activo
           <b>${activoNombre}</b> ha cambiado a estado <b>EN PROCESO</b>.</p>
        <p>Tecnico asignado: <b>${tecnicoNombre || 'Por asignar'}</b><br/>
           Fecha estimada de finalizacion: <b>${fechaEstimada}</b> (3 dias)</p>
        <p>Te avisaremos cuando este lista. Gracias por tu paciencia.</p>
        <hr/>
        <small style="color:#888">Mensaje automatico - MS BI &amp; Automation</small>
      </div>
    </body></html>`;
}

module.exports = { enviar, htmlMantenimientoEnProceso };
