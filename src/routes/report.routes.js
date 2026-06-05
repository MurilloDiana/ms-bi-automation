'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/report.controller');
const { validate } = require('../middlewares/validation.middleware');
const schemas = require('../validators/schemas');

router.get('/', ctrl.listarTipos);

router.get('/:tipo',
    validate(schemas.reporteQuerySchema, 'query'),
    ctrl.obtener);

module.exports = router;
