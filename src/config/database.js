'use strict';

const { Pool } = require('pg');
const config = require('./env');
const logger = require('./logger');

const poolConfig = config.db.connectionString
    ? {
        connectionString: config.db.connectionString,
        ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
        max: config.db.poolMax,
        idleTimeoutMillis: config.db.idleTimeoutMs,
    }
    : {
        host:     config.db.host,
        port:     config.db.port,
        database: config.db.database,
        user:     config.db.user,
        password: config.db.password,
        ssl:      config.db.ssl ? { rejectUnauthorized: false } : false,
        max:      config.db.poolMax,
        idleTimeoutMillis: config.db.idleTimeoutMs,
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
    logger.error({ err }, 'Error inesperado en pool de PostgreSQL');
});

/**
 * Ejecuta una query usando el pool. Devuelve el resultado completo.
 * Loguea la consulta en debug con duracion para diagnostico de performance.
 */
async function query(text, params = []) {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const durationMs = Date.now() - start;
        if (config.env !== 'production' && durationMs > 200) {
            logger.warn({ durationMs, sql: text.substring(0, 120), rows: result.rowCount }, 'SQL lento');
        }
        return result;
    } catch (err) {
        logger.error({ err, sql: text.substring(0, 200) }, 'Error en query SQL');
        throw err;
    }
}

/**
 * Ejecuta una funcion dentro de una transaccion con commit/rollback automaticos.
 */
async function withTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function healthCheck() {
    try {
        const r = await pool.query('SELECT 1 AS ok');
        return r.rows[0].ok === 1;
    } catch (err) {
        logger.error({ err }, 'DB healthcheck fallido');
        return false;
    }
}

async function shutdown() {
    logger.info('Cerrando pool de conexiones PostgreSQL...');
    await pool.end();
}

module.exports = { pool, query, withTransaction, healthCheck, shutdown };
