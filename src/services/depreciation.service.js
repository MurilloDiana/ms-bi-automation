'use strict';

const { withTransaction, query } = require('../config/database');
const assetRepo = require('../repositories/asset.repository');
const { firstOfMonth, monthsBetween } = require('../utils/dates');
const logger = require('../config/logger');

/**
 * Calcula la depreciacion lineal mensual de un activo.
 *
 * Formula:
 *   depreciable    = valor_compra * (1 - valor_residual_pct/100)
 *   meses_vida_util = vida_util_anios * 12
 *   depreciacion_mes = depreciable / meses_vida_util
 *
 * Se respetan: si el activo se compro a mitad de mes, se cuenta desde el siguiente
 * mes completo (tratamiento conservador comun en contabilidad).
 */
function calcularDepreciacionLineal(activo, periodoObjetivo) {
    const periodo = firstOfMonth(periodoObjetivo);
    const fechaAdq = new Date(activo.fecha_adquisicion);
    const inicio = firstOfMonth(fechaAdq);

    if (periodo < inicio) return null;

    const valorCompra = parseFloat(activo.valor_compra);
    const residualPct = parseFloat(activo.valor_residual_pct) || 0;
    const vidaUtilMeses = activo.vida_util_anios * 12;
    if (vidaUtilMeses <= 0) return null;

    const depreciable = valorCompra * (1 - residualPct / 100);
    const depreciacionMes = +(depreciable / vidaUtilMeses).toFixed(2);

    const mesesTranscurridos = monthsBetween(inicio, periodo) + 1; // inclusivo
    const mesesEfectivos = Math.min(mesesTranscurridos, vidaUtilMeses);
    const depreciacionAcumulada = +(depreciacionMes * mesesEfectivos).toFixed(2);
    const valorLibro = +Math.max(valorCompra - depreciacionAcumulada, valorCompra * residualPct / 100).toFixed(2);
    const valorInicio = +(valorCompra - depreciacionMes * (mesesEfectivos - 1)).toFixed(2);

    return {
        periodo,
        valor_inicio: valorInicio,
        depreciacion_mes: depreciacionMes,
        depreciacion_acumulada: depreciacionAcumulada,
        valor_libro: valorLibro,
    };
}

/**
 * Recalcula y guarda el snapshot del mes para todos los activos vigentes.
 * Idempotente gracias al UNIQUE (activo_id, periodo) - usa ON CONFLICT.
 */
async function generarSnapshotMensual(fechaRef = new Date()) {
    const activos = await assetRepo.listarTodos();
    const periodo = firstOfMonth(fechaRef);

    let insertados = 0;
    await withTransaction(async (client) => {
        for (const activo of activos) {
            const calc = calcularDepreciacionLineal(activo, periodo);
            if (!calc) continue;

            await client.query(
                `INSERT INTO depreciacion_mensual
                   (activo_id, periodo, valor_inicio, depreciacion_mes, depreciacion_acumulada, valor_libro)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (activo_id, periodo) DO UPDATE
                   SET valor_inicio          = EXCLUDED.valor_inicio,
                       depreciacion_mes      = EXCLUDED.depreciacion_mes,
                       depreciacion_acumulada = EXCLUDED.depreciacion_acumulada,
                       valor_libro           = EXCLUDED.valor_libro`,
                [activo.id, calc.periodo, calc.valor_inicio, calc.depreciacion_mes,
                 calc.depreciacion_acumulada, calc.valor_libro]
            );
            insertados++;
        }
    });

    logger.info({ insertados, periodo: periodo.toISOString().slice(0,10) },
                'Snapshot de depreciacion generado');
    return { insertados, periodo };
}

/**
 * Genera snapshots historicos para todos los meses desde la adquisicion mas antigua.
 * Util para inicializar el sistema con datos historicos coherentes.
 */
async function generarHistoricoCompleto() {
    const activos = await assetRepo.listarTodos();
    if (activos.length === 0) return { totalSnapshots: 0 };

    const fechasInicio = activos.map((a) => new Date(a.fecha_adquisicion));
    const minFecha = new Date(Math.min(...fechasInicio));
    const inicio = firstOfMonth(minFecha);
    const hoy = firstOfMonth(new Date());

    let total = 0;
    const cursor = new Date(inicio);
    while (cursor <= hoy) {
        const res = await generarSnapshotMensual(cursor);
        total += res.insertados;
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return { totalSnapshots: total };
}

module.exports = { calcularDepreciacionLineal, generarSnapshotMensual, generarHistoricoCompleto };
