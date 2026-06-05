'use strict';

const app = require('./src/app');
const config = require('./src/config/env');
const logger = require('./src/config/logger');
const db = require('./src/config/database');
const { runMigrations } = require('./src/db/migrate');
const { startBot } = require('./src/bots/telegram.bot');
const jobs = require('./src/jobs');

async function main() {
    // 1. Verificar conexion a BD
    const dbOk = await db.healthCheck();
    if (!dbOk) {
        logger.error('No se pudo conectar a la base de datos. Saliendo...');
        process.exit(1);
    }
    logger.info('BD conectada');

    // 2. Aplicar migraciones automaticamente (idempotente)
    await runMigrations();

    // 3. Iniciar bot de Telegram
    const bot = startBot();
    if (bot) app.set('telegramBot', bot);

    // 4. Iniciar cron jobs
    jobs.start();

    // 5. Arrancar servidor HTTP
    const server = app.listen(config.port, () => {
        logger.info({ port: config.port, env: config.env }, 'Servidor escuchando');
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
        logger.info({ signal }, 'Cerrando servidor...');
        server.close(async () => {
            await db.shutdown();
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
    process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandledRejection'));
    process.on('uncaughtException',  (err) => logger.error({ err }, 'uncaughtException'));
}

main().catch((err) => {
    logger.error({ err }, 'Error fatal en bootstrap');
    process.exit(1);
});
