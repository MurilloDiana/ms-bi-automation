'use strict';

const cron = require('node-cron');
const config = require('../config/env');
const logger = require('../config/logger');
const depreciationService = require('../services/depreciation.service');
const { query } = require('../config/database');
const telegramService = require('../services/telegram.service');
const userRepo = require('../repositories/user.repository');

/**
 * Job 1: Calculo de depreciacion mensual.
 * Programado diariamente a las 02:00 - solo regenera el snapshot del mes actual
 * (idempotente). El primer dia del mes ya quedara historificado.
 */
function scheduleDepreciation() {
    cron.schedule(config.cron.depreciationSchedule, async () => {
        try {
            const r = await depreciationService.generarSnapshotMensual(new Date());
            logger.info(r, 'Cron depreciacion ejecutado');
        } catch (err) {
            logger.error({ err }, 'Error en cron de depreciacion');
        }
    }, { timezone: 'America/La_Paz' });
}

/**
 * Job 2: Alertas de mantenimientos atrasados o sin atender.
 * Se ejecuta cada 30 min: busca solicitudes PENDIENTES con mas de N horas
 * y EN_PROCESO que pasaron su fecha estimada de finalizacion.
 */
function scheduleAlerts() {
    cron.schedule(config.cron.alertsSchedule, async () => {
        try {
            const alertasPendientes = await query(`
                SELECT s.id, s.codigo, s.descripcion, s.prioridad, s.fecha_solicitud,
                       a.nombre AS activo_nombre, ar.nombre AS area_nombre
                FROM solicitudes_mantenimiento s
                JOIN activos a  ON a.id  = s.activo_id
                JOIN areas   ar ON ar.id = s.area_id
                WHERE s.estado = 'PENDIENTE'
                  AND s.fecha_solicitud < NOW() - INTERVAL '4 hours'
                  AND s.prioridad IN ('ALTA','CRITICA')
            `);

            if (alertasPendientes.rows.length === 0) return;

            const tecnicos = await userRepo.obtenerTecnicos();
            const destinatarios = tecnicos.filter((t) => t.telegram_chat_id);

            for (const sol of alertasPendientes.rows) {
                const msg = `<b>Solicitud sin atender</b>\n` +
                            `Codigo: ${sol.codigo}\n` +
                            `Prioridad: ${sol.prioridad}\n` +
                            `Activo: ${sol.activo_nombre} (${sol.area_nombre})\n` +
                            `Descripcion: ${sol.descripcion}`;
                for (const tec of destinatarios) {
                    await telegramService.enviarMensaje({
                        chatId: tec.telegram_chat_id,
                        mensaje: msg,
                        referenciaTipo: 'SOLICITUD',
                        referenciaId: sol.id,
                    });
                }
            }
            logger.info({ count: alertasPendientes.rows.length }, 'Alertas enviadas');
        } catch (err) {
            logger.error({ err }, 'Error en cron de alertas');
        }
    });
}

function start() {
    if (!config.cron.enabled) {
        logger.info('Cron jobs deshabilitados');
        return;
    }
    scheduleDepreciation();
    scheduleAlerts();
    logger.info({
        depreciacion: config.cron.depreciationSchedule,
        alertas: config.cron.alertsSchedule,
    }, 'Cron jobs programados');
}

module.exports = { start };
