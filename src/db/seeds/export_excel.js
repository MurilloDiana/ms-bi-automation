'use strict';

/**
 * Exporta todas las tablas relevantes a archivos Excel (.xlsx).
 * Uso: node src/db/seeds/export_excel.js
 * Salida: exports/ en la raíz del proyecto
 */

const path  = require('path');
const fs    = require('fs');
const xlsx  = require('xlsx');
const { pool, query } = require('../../config/database');
const logger = require('../../config/logger');

const OUT_DIR = path.join(__dirname, '..', '..', '..', 'exports');

function toSheet(rows) {
    if (!rows.length) return xlsx.utils.aoa_to_sheet([['Sin datos']]);
    return xlsx.utils.json_to_sheet(rows);
}

function autoWidth(sheet, rows) {
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    sheet['!cols'] = keys.map((k) => ({
        wch: Math.min(50, Math.max(k.length + 2, ...rows.map((r) =>
            String(r[k] == null ? '' : r[k]).length + 1
        ))),
    }));
}

async function exportarTabla(nombre, sql, params = []) {
    const r = await query(sql, params);
    const rows = r.rows;
    const wb   = xlsx.utils.book_new();
    const ws   = toSheet(rows);
    autoWidth(ws, rows);
    xlsx.utils.book_append_sheet(wb, ws, nombre.substring(0, 31));
    const archivo = path.join(OUT_DIR, `${nombre}.xlsx`);
    xlsx.writeFile(wb, archivo);
    logger.info({ archivo, filas: rows.length }, `Exportado`);
    return rows.length;
}

async function exportarKPIs() {
    const [disp, mttr, mtbf, costos, preventivo] = await Promise.all([
        query('SELECT * FROM v_kpi_disponibilidad_activos'),
        query('SELECT * FROM v_kpi_mttr'),
        query('SELECT * FROM v_kpi_mtbf'),
        query('SELECT * FROM v_kpi_costo_por_activo ORDER BY costo_total DESC LIMIT 50'),
        query('SELECT * FROM v_kpi_cumplimiento_preventivo ORDER BY periodo DESC LIMIT 24'),
    ]);

    const wb = xlsx.utils.book_new();

    const wsDisp = toSheet(disp.rows);
    autoWidth(wsDisp, disp.rows);
    xlsx.utils.book_append_sheet(wb, wsDisp, 'Disponibilidad Activos');

    const wsMttr = toSheet(mttr.rows);
    autoWidth(wsMttr, mttr.rows);
    xlsx.utils.book_append_sheet(wb, wsMttr, 'MTTR');

    const wsMtbf = toSheet(mtbf.rows);
    autoWidth(wsMtbf, mtbf.rows);
    xlsx.utils.book_append_sheet(wb, wsMtbf, 'MTBF');

    const wsCostos = toSheet(costos.rows);
    autoWidth(wsCostos, costos.rows);
    xlsx.utils.book_append_sheet(wb, wsCostos, 'Top Costos Mantenimiento');

    const wsPrev = toSheet(preventivo.rows);
    autoWidth(wsPrev, preventivo.rows);
    xlsx.utils.book_append_sheet(wb, wsPrev, 'Cumplimiento Preventivo');

    const archivo = path.join(OUT_DIR, 'kpis_dashboard.xlsx');
    xlsx.writeFile(wb, archivo);
    logger.info({ archivo, hojas: 5 }, 'KPIs exportados (5 hojas)');
}

async function main() {
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    logger.info({ destino: OUT_DIR }, 'Iniciando exportación Excel...');

    await Promise.all([
        exportarTabla('areas',
            'SELECT id, codigo, nombre, descripcion, activo, created_at FROM areas ORDER BY id'),

        exportarTabla('categorias_activo',
            `SELECT id, nombre, vida_util_anios, metodo_depreciacion,
                    valor_residual_pct, created_at
             FROM categorias_activo ORDER BY id`),

        exportarTabla('usuarios',
            `SELECT u.id, u.nombre, u.firstname, u.lastname, u.email,
                    u.rol, u.activo, ar.nombre AS area_nombre,
                    u.telefono, u.created_at
             FROM usuarios u
             LEFT JOIN areas ar ON ar.id = u.area_id
             ORDER BY u.rol, u.nombre`),

        exportarTabla('activos',
            `SELECT a.id, a.codigo, a.nombre, a.descripcion,
                    c.nombre AS categoria, ar.nombre AS area,
                    u.nombre AS responsable,
                    a.fecha_adquisicion, a.valor_compra, a.estado,
                    a.proveedor, a.serie, a.ubicacion, a.created_at
             FROM activos a
             JOIN categorias_activo c ON c.id = a.categoria_id
             JOIN areas ar            ON ar.id = a.area_id
             LEFT JOIN usuarios u     ON u.id = a.responsable_id
             ORDER BY a.codigo`),

        exportarTabla('solicitudes_mantenimiento',
            `SELECT s.id, s.codigo, s.tipo, s.prioridad, s.estado,
                    s.descripcion, s.diagnostico, s.solucion, s.costo,
                    s.canal_origen,
                    s.fecha_solicitud, s.fecha_inicio,
                    s.fecha_estimada_fin, s.fecha_fin,
                    u_sol.nombre AS solicitante,
                    u_tec.nombre AS tecnico,
                    ac.codigo    AS activo_codigo,
                    ac.nombre    AS activo_nombre,
                    ar.nombre    AS area
             FROM solicitudes_mantenimiento s
             JOIN usuarios u_sol ON u_sol.id = s.solicitante_id
             LEFT JOIN usuarios u_tec ON u_tec.id = s.tecnico_id
             JOIN activos ac     ON ac.id = s.activo_id
             JOIN areas ar       ON ar.id = s.area_id
             ORDER BY s.fecha_solicitud DESC`),

        exportarTabla('depreciacion_mensual',
            `SELECT dm.id, dm.periodo, dm.valor_inicio,
                    dm.depreciacion_mes, dm.depreciacion_acumulada,
                    dm.valor_libro,
                    a.codigo AS activo_codigo, a.nombre AS activo_nombre,
                    c.nombre AS categoria
             FROM depreciacion_mensual dm
             JOIN activos a ON a.id = dm.activo_id
             JOIN categorias_activo c ON c.id = a.categoria_id
             ORDER BY dm.periodo DESC, a.codigo`),
    ]);

    await exportarKPIs();

    logger.info('Exportación completada. Archivos en /exports/');
    await pool.end();
}

main().catch((err) => {
    logger.error({ err }, 'Error en exportación Excel');
    pool.end();
    process.exit(1);
});
