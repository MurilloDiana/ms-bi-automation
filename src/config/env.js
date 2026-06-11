'use strict';

require('dotenv').config();

const toBool = (v, def = false) => {
    if (v === undefined || v === null) return def;
    return String(v).toLowerCase() === 'true';
};

const toInt = (v, def) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : def;
};

const config = {
    env: process.env.NODE_ENV || 'development',
    port: toInt(process.env.PORT, 3000),
    apiPrefix: process.env.API_PREFIX || '/api/v1',

    db: {
        connectionString: process.env.DATABASE_URL || null,
        host: process.env.DB_HOST || 'localhost',
        port: toInt(process.env.DB_PORT, 5432),
        database: process.env.DB_NAME || 'bi_automation',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        ssl: toBool(process.env.DB_SSL, false),
        poolMax: toInt(process.env.DB_POOL_MAX, 10),
        idleTimeoutMs: toInt(process.env.DB_POOL_IDLE_TIMEOUT_MS, 30000),
    },

    telegram: {
        token: process.env.TELEGRAM_BOT_TOKEN,
        mode: process.env.TELEGRAM_MODE || 'polling', // polling | webhook
        webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
    },

    email: {
        host: process.env.SMTP_HOST,
        port: toInt(process.env.SMTP_PORT, 587),
        secure: toBool(process.env.SMTP_SECURE, false),
        user: process.env.SMTP_USER,
        password: process.env.SMTP_PASSWORD,
        fromName: process.env.SMTP_FROM_NAME || 'BI Automation',
        fromEmail: process.env.SMTP_FROM_EMAIL,
    },

    expoPush: {
        accessToken: process.env.EXPO_ACCESS_TOKEN || null,
        // Roles que reciben push al crear una solicitud de mantenimiento
        rolesNotificados: (process.env.EXPO_PUSH_ROLES || 'SUPERADMIN,GERENTE').split(',').map(r => r.trim()),
    },

    cron: {
        enabled: toBool(process.env.ENABLE_CRON, true),
        depreciationSchedule: process.env.CRON_DEPRECIATION_SCHEDULE || '0 2 * * *',
        alertsSchedule: process.env.CRON_ALERTS_SCHEDULE || '*/30 * * * *',
    },

    security: {
        rateLimitWindowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
        rateLimitMax: toInt(process.env.RATE_LIMIT_MAX, 200),
        corsOrigin: process.env.CORS_ORIGIN || '*',
    },
};

module.exports = config;
