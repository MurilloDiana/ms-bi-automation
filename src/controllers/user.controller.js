'use strict';

const service = require('../services/user.service');
const { ok } = require('../utils/response');

async function crear(req, res, next) {
    try {
        const usuario = await service.crearUsuario(req.body);
        return ok(res, usuario, null, 201);
    } catch (err) { next(err); }
}

module.exports = { crear };
