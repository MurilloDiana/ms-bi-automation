'use strict';

const router = require('express').Router();
const ctrl   = require('../controllers/asset.controller');
const { validate } = require('../middlewares/validation.middleware');
const schemas = require('../validators/schemas');

router.post('/',
    validate(schemas.crearActivoSchema, 'body'),
    ctrl.crear);

module.exports = router;
