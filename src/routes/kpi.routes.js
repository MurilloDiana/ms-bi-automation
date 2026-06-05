'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/kpi.controller');

router.get('/dashboard', ctrl.dashboard);

module.exports = router;
