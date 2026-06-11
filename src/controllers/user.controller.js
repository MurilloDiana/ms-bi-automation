'use strict';

const service = require('../services/user.service');
const pushTokenRepo = require('../repositories/push-token.repository');
const { ok, AppError } = require('../utils/response');

async function crear(req, res, next) {
    try {
        const usuario = await service.crearUsuario(req.body);
        return ok(res, usuario, null, 201);
    } catch (err) { next(err); }
}

async function registrarPushToken(req, res, next) {
    try {
        const { id } = req.params;
        const { token } = req.body;
        const pushToken = await pushTokenRepo.upsert(id, token);
        return ok(res, pushToken, 'Token registrado', 201);
    } catch (err) { next(err); }
}

async function eliminarPushToken(req, res, next) {
    try {
        const { token } = req.body;
        const result = await pushTokenRepo.desactivar(token);
        if (!result) throw new AppError(404, 'NOT_FOUND', 'Token no encontrado');
        return ok(res, null, 'Token eliminado');
    } catch (err) { next(err); }
}

module.exports = { crear, registrarPushToken, eliminarPushToken };
