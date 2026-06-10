'use strict';

const service = require('../services/kpi.service');
const { ok, AppError } = require('../utils/response');
const { toExcelBuffer, toPdfBuffer } = require('../utils/export');

const REPORTES_VALIDOS = new Set([
    'solicitudes-por-estado',
    'depreciacion',
    'top-fallas',
    'productividad-tecnico',
    'distribucion-area',
    'inventario-activos',
    'costos-mantenimiento-mensual',
    'vida-util-activos',
]);

// Extrae el arreglo tabular de un payload de reporte (puede venir como array directo o en .items)
function extraerFilas(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    return [data];
}

async function obtener(req, res, next) {
    try {
        const { tipo } = req.params;
        if (!REPORTES_VALIDOS.has(tipo)) {
            throw new AppError(404, 'REPORT_NOT_FOUND', `Reporte no disponible: ${tipo}`);
        }
        const { formato, ...filtros } = req.query;
        const data = await service.obtenerReporte(tipo, filtros);

        if (formato === 'excel') {
            const buffer = toExcelBuffer(extraerFilas(data), tipo);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${tipo}.xlsx"`);
            return res.send(buffer);
        }

        if (formato === 'pdf') {
            const buffer = await toPdfBuffer({
                title: `Reporte: ${tipo}`,
                subtitle: `Generado: ${new Date().toISOString()}`,
                rows: extraerFilas(data),
            });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${tipo}.pdf"`);
            return res.send(buffer);
        }

        return ok(res, data, { tipo, generadoEn: new Date().toISOString() });
    } catch (err) { next(err); }
}

async function listarTipos(req, res) {
    return ok(res, Array.from(REPORTES_VALIDOS).map((t) => ({ id: t, endpoint: `/api/v1/reportes/${t}` })));
}

module.exports = { obtener, listarTipos };
