'use strict';

const Joi = require('joi');

const crearSolicitudSchema = Joi.object({
    solicitante_id: Joi.string().uuid().required(),
    activo_id:      Joi.string().uuid().required(),
    area_id:        Joi.number().integer().positive().required(),
    tipo:           Joi.string().valid('PREVENTIVO','CORRECTIVO','PREDICTIVO').default('CORRECTIVO'),
    prioridad:      Joi.string().valid('BAJA','MEDIA','ALTA','CRITICA').default('MEDIA'),
    descripcion:    Joi.string().min(5).max(2000).required(),
    canal_origen:   Joi.string().valid('WEB','TELEGRAM','EMAIL','APP_MOVIL').default('WEB'),
    metadata:       Joi.object().default({}),
});

const cambiarEstadoSchema = Joi.object({
    estado:       Joi.string().valid('PENDIENTE','EN_PROCESO','COMPLETADO','CANCELADO','RECHAZADO').required(),
    tecnico_id:   Joi.string().uuid().optional(),
    diagnostico:  Joi.string().max(2000).optional(),
    solucion:     Joi.string().max(2000).optional(),
    costo:        Joi.number().min(0).optional(),
});

const listarSolicitudesSchema = Joi.object({
    estado:    Joi.string().valid('PENDIENTE','EN_PROCESO','COMPLETADO','CANCELADO','RECHAZADO').optional(),
    tecnicoId: Joi.string().uuid().optional(),
    areaId:    Joi.number().integer().positive().optional(),
    desde:     Joi.date().iso().optional(),
    hasta:     Joi.date().iso().optional(),
    page:      Joi.number().integer().min(1).default(1),
    pageSize:  Joi.number().integer().min(1).max(100).default(20),
});

const reporteQuerySchema = Joi.object({
    desde:   Joi.date().iso().optional(),
    hasta:   Joi.date().iso().optional(),
    periodo: Joi.date().iso().optional(),
    areaId:  Joi.number().integer().positive().optional(),
    limit:   Joi.number().integer().min(1).max(500).default(20),
});

module.exports = {
    crearSolicitudSchema,
    cambiarEstadoSchema,
    listarSolicitudesSchema,
    reporteQuerySchema,
};
