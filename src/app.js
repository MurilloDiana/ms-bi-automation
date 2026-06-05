'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');

const config = require('./config/env');
const logger = require('./config/logger');
const db = require('./config/database');
const swaggerSpec = require('./config/swagger');
const { notFound, errorHandler } = require('./middlewares/error.middleware');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // necesario detras de proxies (Render, Railway)

// CSP permisivo para que Swagger UI funcione con sus scripts/estilos inline
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc:  ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc:   ["'self'", "'unsafe-inline'"],
            imgSrc:     ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'https:', 'http:'],
        },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const corsOptions = {
    origin: config.security.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200,
};
app.options('*', cors(corsOptions)); // preflight para todas las rutas
app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(rateLimit({
    windowMs: config.security.rateLimitWindowMs,
    max:      config.security.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
}));

// Request logger ligero
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info({
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration,
        }, 'http');
    });
    next();
});

// Health check
app.get('/health', async (req, res) => {
    const dbOk = await db.healthCheck();
    res.status(dbOk ? 200 : 503).json({
        status: dbOk ? 'ok' : 'degraded',
        db: dbOk ? 'up' : 'down',
        uptime_s: process.uptime(),
        env: config.env,
    });
});

// Webhook de Telegram (modo produccion)
app.post('/webhook/telegram', (req, res) => {
    // El bot procesara el update si esta en modo webhook
    const bot = app.get('telegramBot');
    if (bot && typeof bot.processUpdate === 'function') {
        bot.processUpdate(req.body);
    }
    res.sendStatus(200);
});

// Swagger UI — spec dinamico para que funcione en cualquier entorno
app.get('/api-docs.json', (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host     = req.headers['x-forwarded-host']  || req.get('host');
    res.json({
        ...swaggerSpec,
        servers: [{ url: `${protocol}://${host}`, description: 'Servidor actual' }],
    });
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(null, {
    swaggerUrl: '/api-docs.json',
    customSiteTitle: 'MS BI Automation - API Docs',
}));

// API
app.use(config.apiPrefix, require('./routes'));

// 404 + errores
app.use(notFound);
app.use(errorHandler);

module.exports = app;
