'use strict';

const service = require('../services/kpi.service');
const { ok, AppError } = require('../utils/response');

const REPORTES_VALIDOS = new Set([
    'solicitudes-por-estado',
    'depreciacion',
    'top-fallas',
    'productividad-tecnico',
    'distribucion-area',
]);

async function obtener(req, res, next) {
    try {
        const { tipo } = req.params;
        if (!REPORTES_VALIDOS.has(tipo)) {
            throw new AppError(404, 'REPORT_NOT_FOUND', `Reporte no disponible: ${tipo}`);
        }
        const data = await service.obtenerReporte(tipo, req.query);
        return ok(res, data, { tipo, generadoEn: new Date().toISOString() });
    } catch (err) { next(err); }
}

async function listarTipos(req, res) {
    return ok(res, Array.from(REPORTES_VALIDOS).map((t) => ({ id: t, endpoint: `/api/v1/reportes/${t}` })));
}

module.exports = { obtener, listarTipos };
