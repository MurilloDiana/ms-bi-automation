'use strict';

const assetRepo = require('../repositories/asset.repository');
const { AppError } = require('../utils/response');

async function crearActivo(data) {
    try {
        return await assetRepo.crear(data);
    } catch (err) {
        if (err.code === '23505') {
            throw new AppError(409, 'DUPLICATE_ASSET', 'Ya existe un activo con ese código');
        }
        throw err;
    }
}

module.exports = { crearActivo };
