'use strict';

const service = require('../services/maintenance.service');
const { ok } = require('../utils/response');

async function crear(req, res, next) {
    try {
        const s = await service.crearSolicitud(req.body);
        return ok(res, s, null, 201);
    } catch (err) { next(err); }
}

async function obtener(req, res, next) {
    try {
        const s = await service.obtenerPorId(req.params.id);
        return ok(res, s);
    } catch (err) { next(err); }
}

async function listar(req, res, next) {
    try {
        const { items, meta } = await service.listar(req.query);
        return ok(res, items, meta);
    } catch (err) { next(err); }
}

async function cambiarEstado(req, res, next) {
    try {
        const { estado, ...rest } = req.body;
        const s = await service.cambiarEstado(req.params.id, estado, rest);
        return ok(res, s);
    } catch (err) { next(err); }
}

module.exports = { crear, obtener, listar, cambiarEstado };
