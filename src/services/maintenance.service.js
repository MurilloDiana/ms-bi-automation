'use strict';

const maintenanceRepo = require('../repositories/maintenance.repository');
const userRepo = require('../repositories/user.repository');
const emailService = require('./email.service');
const { AppError } = require('../utils/response');
const { addBusinessDays, toISODate } = require('../utils/dates');
const logger = require('../config/logger');

async function crearSolicitud(data) {
    const solicitud = await maintenanceRepo.crear(data);
    logger.info({ id: solicitud.id, codigo: solicitud.codigo, canal: solicitud.canal_origen },
                'Solicitud creada');
    return solicitud;
}

async function obtenerPorId(id) {
    const s = await maintenanceRepo.obtenerPorId(id);
    if (!s) throw new AppError(404, 'NOT_FOUND', 'Solicitud no encontrada');
    return s;
}

async function listar(filtros) {
    return maintenanceRepo.listar(filtros);
}

/**
 * Cambia el estado y dispara la notificacion al solicitante cuando
 * pasa a EN_PROCESO. Idempotente: si ya se notifico, no vuelve a enviar.
 */
async function cambiarEstado(id, nuevoEstado, payload = {}) {
    const ESTADOS_VALIDOS = ['PENDIENTE', 'EN_PROCESO', 'COMPLETADO', 'CANCELADO', 'RECHAZADO'];
    if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
        throw new AppError(400, 'INVALID_STATE', `Estado invalido: ${nuevoEstado}`);
    }

    const solicitud = await maintenanceRepo.cambiarEstado(id, nuevoEstado, payload);
    if (!solicitud) throw new AppError(404, 'NOT_FOUND', 'Solicitud no encontrada');

    // Notificar al solicitante cuando entra EN_PROCESO (caso de uso pedido)
    if (nuevoEstado === 'EN_PROCESO' && !solicitud.notificado_inicio) {
        await notificarInicio(solicitud);
        await maintenanceRepo.marcarNotificado(solicitud.id, 'notificado_inicio');
    }

    // Tambien cuando se completa
    if (nuevoEstado === 'COMPLETADO' && !solicitud.notificado_fin) {
        await notificarFinalizacion(solicitud);
        await maintenanceRepo.marcarNotificado(solicitud.id, 'notificado_fin');
    }

    return maintenanceRepo.obtenerPorId(id);
}

/**
 * Notifica al solicitante por email que su mantenimiento esta EN_PROCESO.
 * El tiempo estimado es de 3 dias (segun el caso de uso).
 */
async function notificarInicio(solicitudCompleta) {
    const detalle = await maintenanceRepo.obtenerPorId(solicitudCompleta.id);
    if (!detalle?.solicitante_email) {
        logger.warn({ id: solicitudCompleta.id }, 'Sin email de solicitante - no se notifica');
        return;
    }
    const fechaEstimada = toISODate(addBusinessDays(new Date(), 3));
    await emailService.enviar({
        to: detalle.solicitante_email,
        subject: `[Mantenimiento ${detalle.codigo}] Tu solicitud esta siendo atendida`,
        html: emailService.htmlMantenimientoEnProceso({
            solicitanteNombre: detalle.solicitante_nombre,
            codigo: detalle.codigo,
            activoNombre: detalle.activo_nombre,
            tecnicoNombre: detalle.tecnico_nombre,
            fechaEstimada,
        }),
        text: `Tu solicitud ${detalle.codigo} esta en proceso. Estimado de finalizacion: ${fechaEstimada}.`,
        referenciaTipo: 'SOLICITUD',
        referenciaId: detalle.id,
    });
}

async function notificarFinalizacion(solicitudCompleta) {
    const detalle = await maintenanceRepo.obtenerPorId(solicitudCompleta.id);
    if (!detalle?.solicitante_email) return;
    await emailService.enviar({
        to: detalle.solicitante_email,
        subject: `[Mantenimiento ${detalle.codigo}] Trabajo finalizado`,
        html: `<p>Hola <b>${detalle.solicitante_nombre}</b>, el mantenimiento del activo
               <b>${detalle.activo_nombre}</b> (${detalle.codigo}) ha sido completado.</p>
               <p>Solucion aplicada: ${detalle.solucion || 'N/D'}</p>`,
        text: `Mantenimiento ${detalle.codigo} completado.`,
        referenciaTipo: 'SOLICITUD',
        referenciaId: detalle.id,
    });
}

module.exports = {
    crearSolicitud,
    obtenerPorId,
    listar,
    cambiarEstado,
};
