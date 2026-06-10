'use strict';

const service = require('../services/asset.service');
const { ok } = require('../utils/response');

async function crear(req, res, next) {
    try {
        const activo = await service.crearActivo(req.body);
        return ok(res, activo, null, 201);
    } catch (err) { next(err); }
}

module.exports = { crear };
