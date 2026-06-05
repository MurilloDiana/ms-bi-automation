'use strict';

const TelegramBot = require('node-telegram-bot-api');
const config = require('../config/env');
const logger = require('../config/logger');
const telegramService = require('../services/telegram.service');
const userRepo = require('../repositories/user.repository');
const assetRepo = require('../repositories/asset.repository');
const maintenanceService = require('../services/maintenance.service');

// =====================================================
// Maquina de estados de conversacion en memoria
// Estados: IDLE | ESPERA_EMAIL | ESPERA_ACTIVO | ESPERA_DESCRIPCION
// =====================================================
const sessions = new Map();

function getSession(chatId) {
    if (!sessions.has(chatId)) {
        sessions.set(chatId, { state: 'IDLE', data: {} });
    }
    return sessions.get(chatId);
}

function resetSession(chatId) {
    sessions.set(chatId, { state: 'IDLE', data: {} });
}

function startBot() {
    if (!config.telegram.token) {
        logger.warn('TELEGRAM_BOT_TOKEN no configurado - el bot NO se iniciara');
        return null;
    }

    const isWebhook = config.telegram.mode === 'webhook' && config.telegram.webhookUrl;
    const bot = new TelegramBot(config.telegram.token, isWebhook ? {} : {
        polling: { interval: 300, autoStart: true, params: { timeout: 10 } },
    });

    if (isWebhook) {
        bot.setWebHook(`${config.telegram.webhookUrl}/webhook/telegram`)
           .then(() => logger.info({ url: config.telegram.webhookUrl }, 'Webhook Telegram configurado'))
           .catch((err) => logger.error({ err }, 'Error configurando webhook'));
    } else {
        logger.info('Bot Telegram iniciado en modo polling');
    }

    telegramService.setBot(bot);
    registerHandlers(bot);
    return bot;
}

function registerHandlers(bot) {

    // /start - vincular cuenta o saludar
    bot.onText(/^\/start$/, async (msg) => {
        const chatId = msg.chat.id;
        const u = await userRepo.buscarPorTelegramChatId(chatId);
        if (u) {
            return bot.sendMessage(chatId,
                `Hola <b>${u.nombre}</b>!\n\nUsa /nueva para crear una solicitud de mantenimiento.`,
                { parse_mode: 'HTML' });
        }
        return bot.sendMessage(chatId,
            'Bienvenido al sistema de Mantenimiento.\n\n' +
            'Para vincular tu cuenta envia: <code>/vincular tu-correo@empresa.com</code>',
            { parse_mode: 'HTML' });
    });

    // /vincular email - asocia chat de telegram con un usuario por email
    bot.onText(/^\/vincular\s+(.+)$/, async (msg, match) => {
        const chatId = msg.chat.id;
        const email = match[1].trim();
        try {
            const user = await userRepo.buscarPorEmail(email);
            if (!user) return bot.sendMessage(chatId, 'No encontre un usuario con ese correo.');
            await userRepo.vincularTelegram(user.id, chatId);
            return bot.sendMessage(chatId,
                `Cuenta vinculada como <b>${user.nombre}</b>. Usa /nueva para crear una solicitud.`,
                { parse_mode: 'HTML' });
        } catch (err) {
            logger.error({ err }, 'Error vinculando telegram');
            return bot.sendMessage(chatId, 'Error vinculando la cuenta. Intenta de nuevo.');
        }
    });

    // /nueva - inicia el flujo de creacion de solicitud
    bot.onText(/^\/nueva$/, async (msg) => {
        const chatId = msg.chat.id;
        const user = await userRepo.buscarPorTelegramChatId(chatId);
        if (!user) {
            return bot.sendMessage(chatId,
                'Primero vincula tu cuenta: <code>/vincular tu-correo@empresa.com</code>',
                { parse_mode: 'HTML' });
        }

        const session = getSession(chatId);
        session.state = 'ESPERA_ACTIVO';
        session.data = { solicitante_id: user.id, area_id: user.area_id };
        return bot.sendMessage(chatId,
            'Vamos a crear una solicitud.\n\n' +
            'Paso 1/2: <b>Cual es el equipo que tiene problema?</b>\n' +
            'Envia el codigo o nombre del activo (ej: <code>IMP-001</code> o <code>impresora</code>).\n\n' +
            'Escribe /cancelar para salir.',
            { parse_mode: 'HTML' });
    });

    // /cancelar - aborta el flujo actual
    bot.onText(/^\/cancelar$/, async (msg) => {
        resetSession(msg.chat.id);
        return bot.sendMessage(msg.chat.id, 'Solicitud cancelada.');
    });

    // /ayuda
    bot.onText(/^\/ayuda$/, async (msg) => {
        return bot.sendMessage(msg.chat.id,
            'Comandos disponibles:\n\n' +
            '/start - Mensaje de bienvenida\n' +
            '/vincular email - Vincula tu cuenta\n' +
            '/nueva - Crear nueva solicitud de mantenimiento\n' +
            '/cancelar - Cancelar el flujo actual\n' +
            '/ayuda - Mostrar esta ayuda');
    });

    // Mensajes libres - dependiendo del estado de la sesion
    bot.on('message', async (msg) => {
        if (!msg.text || msg.text.startsWith('/')) return;

        const chatId = msg.chat.id;
        const session = getSession(chatId);

        if (session.state === 'ESPERA_ACTIVO') {
            const matches = await assetRepo.buscarPorCodigoONombre(msg.text);
            if (matches.length === 0) {
                return bot.sendMessage(chatId, 'No encontre activos con ese codigo/nombre. Intenta otra vez.');
            }
            if (matches.length > 1) {
                const opciones = matches.slice(0, 5).map((a) => `- ${a.codigo}: ${a.nombre}`).join('\n');
                return bot.sendMessage(chatId,
                    `Encontre varios activos. Envia el codigo exacto:\n\n${opciones}`);
            }
            session.data.activo_id = matches[0].id;
            session.data.activo_nombre = matches[0].nombre;
            session.data.area_id = matches[0].area_id; // sobreescribir con el area del activo
            session.state = 'ESPERA_DESCRIPCION';
            return bot.sendMessage(chatId,
                `Activo seleccionado: <b>${matches[0].nombre}</b>\n\n` +
                'Paso 2/2: <b>Describe brevemente el problema</b>\n' +
                '(ej: "no enciende", "atasca el papel", etc.)',
                { parse_mode: 'HTML' });
        }

        if (session.state === 'ESPERA_DESCRIPCION') {
            if (msg.text.length < 5) {
                return bot.sendMessage(chatId, 'La descripcion es muy corta. Por favor da mas detalle.');
            }
            try {
                const solicitud = await maintenanceService.crearSolicitud({
                    solicitante_id: session.data.solicitante_id,
                    activo_id:      session.data.activo_id,
                    area_id:        session.data.area_id,
                    descripcion:    msg.text,
                    canal_origen:   'TELEGRAM',
                    tipo:           'CORRECTIVO',
                    prioridad:      'MEDIA',
                    metadata:       { telegram_chat_id: chatId, telegram_message_id: msg.message_id },
                });
                resetSession(chatId);
                return bot.sendMessage(chatId,
                    `Solicitud registrada correctamente!\n\n` +
                    `Codigo: <b>${solicitud.codigo}</b>\n` +
                    `Activo: ${session.data.activo_nombre}\n` +
                    `Estado: PENDIENTE\n\n` +
                    'Recibiras un correo cuando un tecnico inicie el trabajo.',
                    { parse_mode: 'HTML' });
            } catch (err) {
                logger.error({ err }, 'Error creando solicitud desde Telegram');
                resetSession(chatId);
                return bot.sendMessage(chatId, 'Ocurrio un error registrando la solicitud. Intenta de nuevo.');
            }
        }
    });

    let _reconnecting = false;
    let _retryDelay = 5_000;

    bot.on('polling_error', async (err) => {
        if (_reconnecting) return;
        _reconnecting = true;
        logger.warn({ err: err.message, retryMs: _retryDelay }, 'Telegram polling error - reconectando');

        try { await bot.stopPolling(); } catch (_) {}
        await new Promise((r) => setTimeout(r, _retryDelay));
        _retryDelay = Math.min(_retryDelay * 2, 60_000);

        try {
            await bot.startPolling();
            _retryDelay = 5_000;
            logger.info('Telegram polling reconectado');
        } catch (e) {
            logger.error({ err: e.message }, 'Error reconectando Telegram polling');
        } finally {
            _reconnecting = false;
        }
    });
    bot.on('webhook_error', (err) => logger.error({ err: err.message }, 'Webhook error Telegram'));
}

module.exports = { startBot, sessions };
