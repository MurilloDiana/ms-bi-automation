'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/maintenance.controller');
const { validate } = require('../middlewares/validation.middleware');
const schemas = require('../validators/schemas');

router.post('/',
    validate(schemas.crearSolicitudSchema, 'body'),
    ctrl.crear);

router.get('/',
    validate(schemas.listarSolicitudesSchema, 'query'),
    ctrl.listar);

router.get('/:id', ctrl.obtener);

router.patch('/:id/estado',
    validate(schemas.cambiarEstadoSchema, 'body'),
    ctrl.cambiarEstado);

module.exports = router;
