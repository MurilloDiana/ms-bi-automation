'use strict';

const pino = require('pino');
const config = require('./env');

const logger = pino({
    level: config.env === 'production' ? 'info' : 'debug',
    transport: config.env === 'production'
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss.l',
                ignore: 'pid,hostname',
            },
        },
    base: { service: 'ms-bi-automation' },
});

module.exports = logger;
