'use strict';

const { query } = require('../config/database');

// =====================================================
// KPIs (consultan vistas materializadas en BD)
// =====================================================

async function kpiDisponibilidad() {
    const r = await query('SELECT * FROM v_kpi_disponibilidad_activos');
    return r.rows[0];
}

async function kpiMTTR() {
    const r = await query('SELECT * FROM v_kpi_mttr');
    return r.rows[0];
}

async function kpiMTBF() {
    const r = await query('SELECT * FROM v_kpi_mtbf');
    return r.rows[0];
}

async function kpiCostoPorActivo({ limit = 10 } = {}) {
    const r = await query(
        `SELECT * FROM v_kpi_costo_por_activo
         ORDER BY costo_total DESC
         LIMIT $1`,
        [limit]
    );
    return r.rows;
}

async function kpiCumplimientoPreventivo({ meses = 6 } = {}) {
    const r = await query(
        `SELECT * FROM v_kpi_cumplimiento_preventivo
         WHERE periodo >= (DATE_TRUNC('month', NOW()) - ($1 || ' months')::INTERVAL)
         ORDER BY periodo ASC`,
        [meses]
    );
    return r.rows;
}

// =====================================================
// REPORTES (queries directas para flexibilidad de filtros)
// =====================================================

/**
 * R1: Solicitudes por estado en rango de fechas, agrupado por mes y estado.
 */
async function reporteSolicitudesPorEstado({ desde, hasta }) {
    const sql = `
        SELECT
            DATE_TRUNC('month', fecha_solicitud)::DATE AS periodo,
            estado,
            COUNT(*)::INT                              AS total
        FROM solicitudes_mantenimiento
        WHERE ($1::DATE IS NULL OR fecha_solicitud >= $1)
          AND ($2::DATE IS NULL OR fecha_solicitud <= $2)
        GROUP BY 1, 2
        ORDER BY 1 ASC, 2 ASC`;
    const r = await query(sql, [desde || null, hasta || null]);
    return r.rows;
}

/**
 * R2: Depreciacion acumulada de activos al periodo indicado.
 * Si no se pasa periodo, devuelve el ultimo snapshot por activo.
 */
async function reporteDepreciacion({ periodo = null, areaId = null }) {
    const sql = `
        WITH ultimos AS (
            SELECT activo_id, MAX(periodo) AS max_periodo
            FROM depreciacion_mensual
            WHERE ($1::DATE IS NULL OR periodo <= $1)
            GROUP BY activo_id
        )
        SELECT
            a.codigo, a.nombre, ar.nombre AS area_nombre,
            c.nombre AS categoria_nombre,
            a.fecha_adquisicion, a.valor_compra,
            d.periodo, d.valor_inicio, d.depreciacion_mes,
            d.depreciacion_acumulada, d.valor_libro,
            ROUND(100.0 * d.depreciacion_acumulada / NULLIF(a.valor_compra, 0), 2) AS porcentaje_depreciado
        FROM ultimos u
        JOIN depreciacion_mensual d ON d.activo_id = u.activo_id AND d.periodo = u.max_periodo
        JOIN activos a              ON a.id = u.activo_id
        JOIN areas   ar             ON ar.id = a.area_id
        JOIN categorias_activo c    ON c.id = a.categoria_id
        WHERE ($2::INT IS NULL OR a.area_id = $2)
        ORDER BY porcentaje_depreciado DESC NULLS LAST`;
    const r = await query(sql, [periodo, areaId]);
    return r.rows;
}

/**
 * R3: Top activos con mayor frecuencia de fallas en un periodo.
 */
async function reporteTopFallas({ desde, hasta, limit = 20 }) {
    const sql = `
        SELECT
            a.codigo, a.nombre AS activo_nombre, ar.nombre AS area_nombre,
            COUNT(s.id)::INT AS num_fallas,
            COUNT(*) FILTER (WHERE s.prioridad = 'CRITICA')::INT AS fallas_criticas,
            ROUND(AVG(EXTRACT(EPOCH FROM (s.fecha_fin - s.fecha_inicio)) / 3600.0)::NUMERIC, 2) AS mttr_horas_promedio,
            COALESCE(SUM(s.costo), 0) AS costo_total
        FROM solicitudes_mantenimiento s
        JOIN activos a ON a.id = s.activo_id
        JOIN areas   ar ON ar.id = a.area_id
        WHERE s.tipo = 'CORRECTIVO'
          AND ($1::DATE IS NULL OR s.fecha_solicitud >= $1)
          AND ($2::DATE IS NULL OR s.fecha_solicitud <= $2)
        GROUP BY a.id, a.codigo, a.nombre, ar.nombre
        ORDER BY num_fallas DESC, costo_total DESC
        LIMIT $3`;
    const r = await query(sql, [desde || null, hasta || null, limit]);
    return r.rows;
}

/**
 * R4: Productividad por tecnico.
 */
async function reporteProductividadTecnico({ desde, hasta }) {
    const sql = `
        SELECT
            t.id AS tecnico_id,
            t.nombre AS tecnico_nombre,
            COUNT(*) FILTER (WHERE s.estado = 'COMPLETADO')::INT AS completadas,
            COUNT(*) FILTER (WHERE s.estado = 'EN_PROCESO')::INT  AS en_proceso,
            COUNT(*) FILTER (WHERE s.estado = 'PENDIENTE')::INT   AS pendientes,
            ROUND(AVG(EXTRACT(EPOCH FROM (s.fecha_fin - s.fecha_inicio)) / 3600.0)
                  FILTER (WHERE s.estado = 'COMPLETADO')::NUMERIC, 2) AS tiempo_promedio_horas,
            COALESCE(SUM(s.costo) FILTER (WHERE s.estado = 'COMPLETADO'), 0) AS costo_gestionado
        FROM usuarios t
        LEFT JOIN solicitudes_mantenimiento s
               ON s.tecnico_id = t.id
              AND ($1::DATE IS NULL OR s.fecha_solicitud >= $1)
              AND ($2::DATE IS NULL OR s.fecha_solicitud <= $2)
        WHERE t.rol = 'TECNICO' AND t.activo = TRUE
        GROUP BY t.id, t.nombre
        ORDER BY completadas DESC`;
    const r = await query(sql, [desde || null, hasta || null]);
    return r.rows;
}

/**
 * R6: Inventario general de activos (snapshot completo con valor en libros actual).
 */
async function reporteInventarioActivos({ areaId = null } = {}) {
    const sql = `
        SELECT
            a.codigo, a.nombre, c.nombre AS categoria, ar.nombre AS area,
            a.category, a.status, a.estado,
            a.fecha_adquisicion, a.valor_compra,
            COALESCE(d.valor_libro, a.valor_compra) AS valor_libro,
            a.ubicacion, a.created_at
        FROM activos a
        JOIN categorias_activo c ON c.id = a.categoria_id
        JOIN areas ar            ON ar.id = a.area_id
        LEFT JOIN LATERAL (
            SELECT valor_libro FROM depreciacion_mensual dm
            WHERE dm.activo_id = a.id ORDER BY periodo DESC LIMIT 1
        ) d ON TRUE
        WHERE ($1::INT IS NULL OR a.area_id = $1)
        ORDER BY a.codigo`;
    const r = await query(sql, [areaId]);
    return { total: r.rowCount, items: r.rows };
}

/**
 * R7: Costo de mantenimiento agrupado por mes.
 */
async function reporteCostosMantenimientoMensual({ desde, hasta } = {}) {
    const sql = `
        SELECT
            TO_CHAR(DATE_TRUNC('month', fecha_solicitud), 'YYYY-MM') AS periodo,
            COUNT(*)::INT AS total_solicitudes,
            COUNT(*) FILTER (WHERE estado = 'COMPLETADO')::INT AS completadas,
            COALESCE(SUM(costo) FILTER (WHERE estado = 'COMPLETADO'), 0) AS costo_total,
            ROUND(COALESCE(AVG(costo) FILTER (WHERE estado = 'COMPLETADO'), 0)::NUMERIC, 2) AS costo_promedio
        FROM solicitudes_mantenimiento
        WHERE fecha_solicitud >= COALESCE($1::DATE, DATE_TRUNC('month', NOW()) - INTERVAL '11 months')
          AND fecha_solicitud <  COALESCE($2::DATE, NOW()) + INTERVAL '1 day'
        GROUP BY 1
        ORDER BY 1 ASC`;
    const r = await query(sql, [desde || null, hasta || null]);
    return { ventana: { desde: desde || null, hasta: hasta || null }, items: r.rows };
}

/**
 * R8: Activos por vida util restante (candidatos a reemplazo, ordenados de menor a mayor).
 */
async function reporteVidaUtilActivos({ areaId = null, limit = 50 } = {}) {
    const sql = `
        SELECT
            a.codigo, a.nombre, c.nombre AS categoria, ar.nombre AS area,
            a.fecha_adquisicion, c.vida_util_anios,
            ROUND((EXTRACT(EPOCH FROM (NOW() - a.fecha_adquisicion)) / (365.25 * 86400))::NUMERIC, 2) AS anios_transcurridos,
            ROUND((c.vida_util_anios - EXTRACT(EPOCH FROM (NOW() - a.fecha_adquisicion)) / (365.25 * 86400))::NUMERIC, 2) AS anios_restantes,
            a.valor_compra,
            COALESCE(d.valor_libro, a.valor_compra) AS valor_libro,
            a.estado
        FROM activos a
        JOIN categorias_activo c ON c.id = a.categoria_id
        JOIN areas ar            ON ar.id = a.area_id
        LEFT JOIN LATERAL (
            SELECT valor_libro FROM depreciacion_mensual dm
            WHERE dm.activo_id = a.id ORDER BY periodo DESC LIMIT 1
        ) d ON TRUE
        WHERE a.estado <> 'DADO_DE_BAJA'
          AND ($1::INT IS NULL OR a.area_id = $1)
        ORDER BY anios_restantes ASC
        LIMIT $2`;
    const r = await query(sql, [areaId, limit]);
    return { items: r.rows };
}

/**
 * R5: Distribucion de activos por area (conteo, valor, depreciacion).
 */
async function reporteDistribucionPorArea() {
    const sql = `
        SELECT
            ar.id AS area_id,
            ar.nombre AS area_nombre,
            COUNT(a.id)::INT AS num_activos,
            COUNT(*) FILTER (WHERE a.estado = 'OPERATIVO')::INT          AS operativos,
            COUNT(*) FILTER (WHERE a.estado = 'EN_MANTENIMIENTO')::INT   AS en_mantenimiento,
            COUNT(*) FILTER (WHERE a.estado = 'FUERA_DE_SERVICIO')::INT  AS fuera_servicio,
            COALESCE(SUM(a.valor_compra), 0) AS valor_total_compra
        FROM areas ar
        LEFT JOIN activos a ON a.area_id = ar.id AND a.estado <> 'DADO_DE_BAJA'
        WHERE ar.activo = TRUE
        GROUP BY ar.id, ar.nombre
        ORDER BY num_activos DESC`;
    const r = await query(sql);
    return r.rows;
}

module.exports = {
    kpiDisponibilidad,
    kpiMTTR,
    kpiMTBF,
    kpiCostoPorActivo,
    kpiCumplimientoPreventivo,
    reporteSolicitudesPorEstado,
    reporteDepreciacion,
    reporteTopFallas,
    reporteProductividadTecnico,
    reporteDistribucionPorArea,
    reporteInventarioActivos,
    reporteCostosMantenimientoMensual,
    reporteVidaUtilActivos,
};
