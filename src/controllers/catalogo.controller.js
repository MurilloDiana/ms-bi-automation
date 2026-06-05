'use strict';

const userRepo  = require('../repositories/user.repository');
const assetRepo = require('../repositories/asset.repository');
const { query } = require('../config/database');
const { ok } = require('../utils/response');

async function usuarios(req, res, next) {
    try {
        const { rol } = req.query;
        const data = await userRepo.listar(rol ? { rol: rol.toUpperCase() } : {});
        return ok(res, data);
    } catch (err) { next(err); }
}

async function activos(req, res, next) {
    try {
        const { buscar } = req.query;
        let data;
        if (buscar) {
            data = await assetRepo.buscarPorCodigoONombre(buscar);
        } else {
            const r = await query(
                `SELECT a.id, a.codigo, a.nombre, a.estado, a.area_id, ar.nombre AS area_nombre
                 FROM activos a
                 JOIN areas ar ON ar.id = a.area_id
                 WHERE a.estado <> 'DADO_DE_BAJA'
                 ORDER BY a.codigo
                 LIMIT 50`
            );
            data = r.rows;
        }
        return ok(res, data);
    } catch (err) { next(err); }
}

async function areas(req, res, next) {
    try {
        const r = await query(`SELECT id, codigo, nombre FROM areas ORDER BY id`);
        return ok(res, r.rows);
    } catch (err) { next(err); }
}

module.exports = { usuarios, activos, areas };
