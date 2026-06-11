'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/user.controller');
const { validate } = require('../middlewares/validation.middleware');
const schemas = require('../validators/schemas');

router.post('/',
    validate(schemas.crearUsuarioSchema, 'body'),
    ctrl.crear);

// Expo Push Token: la app móvil lo llama tras obtener getExpoPushTokenAsync()
router.post('/:id/push-token',
    validate(schemas.registrarPushTokenSchema, 'body'),
    ctrl.registrarPushToken);

// Llamado al cerrar sesión en la app móvil para dejar de recibir notificaciones
router.delete('/:id/push-token',
    validate(schemas.registrarPushTokenSchema, 'body'),
    ctrl.eliminarPushToken);

module.exports = router;
