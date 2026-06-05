'use strict';

const service = require('../services/kpi.service');
const { ok } = require('../utils/response');

async function dashboard(req, res, next) {
    try {
        const data = await service.obtenerDashboardKpis();
        return ok(res, data);
    } catch (err) { next(err); }
}

module.exports = { dashboard };
