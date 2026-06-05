'use strict';

const logger = require('../config/logger');
const { fail, AppError } = require('../utils/response');

function notFound(req, res) {
    return fail(res, 404, 'NOT_FOUND', `Ruta no encontrada: ${req.method} ${req.originalUrl}`);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    if (err instanceof AppError) {
        return fail(res, err.status, err.code, err.message, err.details);
    }

    // Errores de Joi
    if (err.isJoi) {
        const details = err.details?.map((d) => ({ path: d.path.join('.'), msg: d.message }));
        return fail(res, 400, 'VALIDATION_ERROR', 'Datos invalidos', details);
    }

    // Errores de PostgreSQL
    if (err.code && /^[0-9A-Z]{5}$/.test(err.code)) {
        // 23505 = unique_violation, 23503 = foreign_key_violation, 23502 = not_null
        const pgMap = {
            23505: { status: 409, code: 'DUPLICATE' },
            23503: { status: 409, code: 'FK_CONSTRAINT' },
            23502: { status: 400, code: 'REQUIRED_FIELD' },
        };
        const m = pgMap[err.code];
        if (m) return fail(res, m.status, m.code, err.detail || err.message);
    }

    logger.error({ err }, 'Error no controlado');
    return fail(res, 500, 'INTERNAL_ERROR', 'Error interno del servidor');
}

module.exports = { notFound, errorHandler };
