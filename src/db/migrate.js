'use strict';

/**
 * Aplica todos los archivos SQL en src/db/migrations en orden alfabetico.
 * Idempotente: usa CREATE TABLE IF NOT EXISTS y CREATE OR REPLACE.
 *
 * Uso: npm run migrate
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');
const logger = require('../config/logger');

async function run() {
    const dir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

    for (const f of files) {
        const sql = fs.readFileSync(path.join(dir, f), 'utf8');
        logger.info({ archivo: f }, 'Aplicando migracion');
        try {
            await pool.query(sql);
        } catch (err) {
            logger.error({ err, archivo: f }, 'Error en migracion');
            throw err;
        }
    }
    logger.info('Migraciones aplicadas correctamente');
    await pool.end();
}

run().catch((err) => {
    logger.error({ err }, 'Error en migrate');
    process.exit(1);
});
