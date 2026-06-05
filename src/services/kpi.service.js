'use strict';

const kpiRepo = require('../repositories/kpi.repository');

// Cache en memoria simple para KPIs (TTL 60s). Para multi-instancia migrar a Redis.
const cache = new Map();
const TTL_MS = 60 * 1000;

function cacheGet(key) {
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > TTL_MS) {
        cache.delete(key);
        return null;
    }
    return hit.value;
}

function cacheSet(key, value) {
    cache.set(key, { value, at: Date.now() });
}

async function obtenerDashboardKpis() {
    const cached = cacheGet('dashboard_kpis');
    if (cached) return cached;

    const [disp, mttr, mtbf, topCostos, preventivo] = await Promise.all([
        kpiRepo.kpiDisponibilidad(),
        kpiRepo.kpiMTTR(),
        kpiRepo.kpiMTBF(),
        kpiRepo.kpiCostoPorActivo({ limit: 10 }),
        kpiRepo.kpiCumplimientoPreventivo({ meses: 6 }),
    ]);

    const payload = {
        disponibilidad: disp,
        mttr,
        mtbf,
        top_costos_mantenimiento: topCostos,
        cumplimiento_preventivo: preventivo,
        generado_en: new Date().toISOString(),
    };
    cacheSet('dashboard_kpis', payload);
    return payload;
}

async function obtenerReporte(tipo, params) {
    switch (tipo) {
        case 'solicitudes-por-estado': return kpiRepo.reporteSolicitudesPorEstado(params);
        case 'depreciacion':           return kpiRepo.reporteDepreciacion(params);
        case 'top-fallas':             return kpiRepo.reporteTopFallas(params);
        case 'productividad-tecnico':  return kpiRepo.reporteProductividadTecnico(params);
        case 'distribucion-area':      return kpiRepo.reporteDistribucionPorArea();
        default:
            throw new Error(`Reporte desconocido: ${tipo}`);
    }
}

module.exports = { obtenerDashboardKpis, obtenerReporte };
