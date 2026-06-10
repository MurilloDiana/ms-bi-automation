'use strict';

const bcrypt = require('bcryptjs');
const userRepo = require('../repositories/user.repository');
const { AppError } = require('../utils/response');

const SALT_ROUNDS = 10;

async function crearUsuario({ email, firstname, lastname, role, password, enabled }) {
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const activo = enabled !== undefined ? enabled : true;

    try {
        return await userRepo.crear({ email, firstname, lastname, rol: role, password_hash, activo });
    } catch (err) {
        // unique_violation en la columna email
        if (err.code === '23505') {
            throw new AppError(409, 'EMAIL_TAKEN', `El email ${email} ya está registrado`);
        }
        throw err;
    }
}

module.exports = { crearUsuario };
