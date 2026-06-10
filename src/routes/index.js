'use strict';

const router = require('express').Router();

router.use('/activos',     require('./asset.routes'));
router.use('/usuarios',    require('./user.routes'));
router.use('/solicitudes', require('./maintenance.routes'));
router.use('/kpis',        require('./kpi.routes'));
router.use('/reportes',    require('./report.routes'));
router.use('/catalogo',    require('./catalogo.routes'));

module.exports = router;
