'use strict';

/**
 * Top-up seed: añade solicitudes hasta alcanzar el mínimo requerido.
 * NO trunca tablas — opera sobre datos existentes.
 * Uso: node src/db/seeds/topup_seed.js
 */

const { faker } = require('@faker-js/faker');
const { pool, query, withTransaction } = require('../../config/database');
const logger = require('../../config/logger');
const depreciationService = require('../../services/depreciation.service');

const MIN_SOLICITUDES    = 2000;
const MIN_DEPRECIACION   = 2000;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const DESCRIPCIONES = [
    'No enciende, revisar fuente de poder',
    'Atasco de papel recurrente',
    'Pantalla parpadea intermitentemente',
    'Sonido extrano al encender',
    'Lentitud en el funcionamiento',
    'Cartucho o toner agotado, requiere reemplazo',
    'Cable danado, necesita cambio',
    'No conecta a la red WiFi',
    'Boton bloqueado, no responde',
    'Calentamiento excesivo',
    'Mantenimiento preventivo trimestral programado',
    'Limpieza profunda interna',
    'Actualizacion de firmware necesaria',
    'Recalibrar sensores',
    'Cambio de filtros',
];

const TIPOS_SOL   = ['CORRECTIVO', 'PREVENTIVO', 'PREDICTIVO'];
const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];

async function contarActual() {
    const [sol, dep] = await Promise.all([
        query('SELECT COUNT(*) FROM solicitudes_mantenimiento'),
        query('SELECT COUNT(*) FROM depreciacion_mensual'),
    ]);
    return {
        solicitudes:  parseInt(sol.rows[0].count),
        depreciacion: parseInt(dep.rows[0].count),
    };
}

async function cargarReferencias() {
    const [activos, tecnicos, solicitantes] = await Promise.all([
        query(`SELECT id, area_id FROM activos WHERE estado <> 'DADO_DE_BAJA'`),
        query(`SELECT id FROM usuarios WHERE rol = 'TECNICO' AND activo = TRUE`),
        query(`SELECT id FROM usuarios WHERE rol NOT IN ('TECNICO','SUPERADMIN') AND activo = TRUE`),
    ]);
    return {
        activos:      activos.rows,
        tecnicos:     tecnicos.rows,
        solicitantes: solicitantes.rows,
    };
}

async function nextCodigoPorAnio(client, anio) {
    const r = await client.query(
        `SELECT COUNT(*) FROM solicitudes_mantenimiento WHERE codigo LIKE $1`,
        [`SOL-${anio}-%`]
    );
    return parseInt(r.rows[0].count) + 1;
}

async function rellenarSolicitudes(faltantes, refs) {
    const { activos, tecnicos, solicitantes } = refs;
    if (!activos.length || !tecnicos.length || !solicitantes.length) {
        throw new Error('No hay activos/tecnicos/solicitantes en BD para generar solicitudes');
    }

    const ahora     = new Date();
    const inicio18m = new Date(ahora - 18 * 30 * 24 * 3600_000);
    const counters  = {};

    await withTransaction(async (client) => {
        // Pre-cargar contadores por año para no colisionar
        for (const anio of [2024, 2025, 2026]) {
            counters[anio] = await nextCodigoPorAnio(client, anio) - 1;
        }

        for (let i = 0; i < faltantes; i++) {
            const activo      = pick(activos);
            const tecnico     = pick(tecnicos);
            const solicitante = pick(solicitantes);
            const tipo        = Math.random() < 0.75 ? 'CORRECTIVO' : pick(TIPOS_SOL);
            const prioridad   = pick(PRIORIDADES);
            const fechaSol    = faker.date.between({ from: inicio18m, to: ahora });

            const anio = fechaSol.getFullYear();
            counters[anio] = (counters[anio] || 0) + 1;
            const codigo = `SOL-${anio}-${String(counters[anio]).padStart(6, '0')}`;

            const rand = Math.random();
            let estado;
            if      (rand < 0.08) estado = 'PENDIENTE';
            else if (rand < 0.20) estado = 'EN_PROCESO';
            else if (rand < 0.94) estado = 'COMPLETADO';
            else                   estado = 'CANCELADO';

            let fechaInicio = null, fechaFin = null, fechaEstFin = null, costo = 0;
            if (estado === 'EN_PROCESO' || estado === 'COMPLETADO') {
                fechaInicio = new Date(fechaSol.getTime() + faker.number.int({ min: 1, max: 24 }) * 3600_000);
                fechaEstFin = new Date(fechaInicio.getTime() + 3 * 24 * 3600_000);
            }
            if (estado === 'COMPLETADO') {
                fechaFin = new Date(fechaInicio.getTime() + faker.number.int({ min: 1, max: 72 }) * 3600_000);
                costo    = faker.number.int({ min: 50, max: 3000 });
            }

            await client.query(
                `INSERT INTO solicitudes_mantenimiento
                    (codigo, solicitante_id, tecnico_id, activo_id, area_id,
                     tipo, prioridad, estado, descripcion, canal_origen,
                     fecha_solicitud, fecha_inicio, fecha_estimada_fin, fecha_fin,
                     costo, notificado_inicio, notificado_fin)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
                [
                    codigo, solicitante.id, tecnico.id, activo.id, activo.area_id,
                    tipo, prioridad, estado, pick(DESCRIPCIONES), 'WEB',
                    fechaSol, fechaInicio, fechaEstFin, fechaFin,
                    costo, true, estado === 'COMPLETADO',
                ]
            );

            if ((i + 1) % 100 === 0) {
                logger.info({ progreso: `${i + 1}/${faltantes}` }, 'Solicitudes insertando...');
            }
        }
    });

    logger.info({ insertadas: faltantes }, 'Solicitudes añadidas');
}

async function main() {
    logger.info('Iniciando top-up seed...');

    const antes = await contarActual();
    logger.info(antes, 'Registros actuales');

    // --- Solicitudes ---
    const faltanSol = Math.max(0, MIN_SOLICITUDES - antes.solicitudes);
    if (faltanSol > 0) {
        logger.info({ faltantes: faltanSol }, `Rellenando solicitudes hasta ${MIN_SOLICITUDES}`);
        const refs = await cargarReferencias();
        await rellenarSolicitudes(faltanSol, refs);
    } else {
        logger.info({ actual: antes.solicitudes }, 'Solicitudes ya superan el mínimo ✓');
    }

    // --- Depreciación ---
    const despues = await contarActual();
    const faltanDep = Math.max(0, MIN_DEPRECIACION - despues.depreciacion);
    if (faltanDep > 0) {
        logger.info({ actual: despues.depreciacion, minimo: MIN_DEPRECIACION },
            'Regenerando snapshots de depreciación...');
        try {
            await depreciationService.generarHistoricoCompleto();
            logger.info('Snapshots de depreciación regenerados ✓');
        } catch (err) {
            logger.warn({ err: err.message }, 'Depreciación omitida (no crítica)');
        }
    } else {
        logger.info({ actual: despues.depreciacion }, 'Depreciación ya supera el mínimo ✓');
    }

    const final = await contarActual();
    logger.info(final, 'Registros finales tras top-up');
    await pool.end();
}

main().catch((err) => {
    logger.error({ err }, 'Error en top-up seed');
    pool.end();
    process.exit(1);
});
