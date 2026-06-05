'use strict';

const router = require('express').Router();
const ctrl   = require('../controllers/catalogo.controller');

router.get('/usuarios', ctrl.usuarios);
router.get('/activos',  ctrl.activos);
router.get('/areas',    ctrl.areas);

module.exports = router;
