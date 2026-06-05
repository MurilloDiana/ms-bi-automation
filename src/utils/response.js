'use strict';

/**
 * Envoltura estandar para respuestas exitosas.
 * Estructura: { success, data, meta }
 */
function ok(res, data, meta = null, status = 200) {
    return res.status(status).json({
        success: true,
        data,
        ...(meta ? { meta } : {}),
    });
}

/**
 * Envoltura estandar para errores. No revela stack en produccion.
 */
function fail(res, status, code, message, details = null) {
    return res.status(status).json({
        success: false,
        error: { code, message, ...(details ? { details } : {}) },
    });
}

class AppError extends Error {
    constructor(status, code, message, details = null) {
        super(message);
        this.status  = status;
        this.code    = code;
        this.details = details;
    }
}

module.exports = { ok, fail, AppError };
