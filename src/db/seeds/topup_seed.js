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
const MIN_ACTIVOS        = 2000;

const CATEGORIES   = ['ELECTRONIC_EQUIPMENT', 'HVAC_EQUIPMENT', 'FIXTURES', 'OTHERS'];
const STATUSES     = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE',
                      'UNDER_MAINTENANCE', 'UNDER_MAINTENANCE',
                      'IN_STORAGE', 'DAMAGED', 'RETIRED'];

const CATEGORY_TO_NOMBRE = {
    ELECTRONIC_EQUIPMENT: 'Computadoras',
    HVAC_EQUIPMENT:       'Climatizacion',
    FIXTURES:             'Mobiliario',
    OTHERS:               'Equipos de Oficina',
};

const STATUS_TO_ESTADO = {
    ACTIVE:            'OPERATIVO',
    IN_STORAGE:        'FUERA_DE_SERVICIO',
    LOST:              'FUERA_DE_SERVICIO',
    DAMAGED:           'FUERA_DE_SERVICIO',
    RETIRED:           'DADO_DE_BAJA',
    UNDER_MAINTENANCE: 'EN_MANTENIMIENTO',
};

const NOMBRES_POR_CAT = {
    ELECTRONIC_EQUIPMENT: ['Laptop HP ProBook', 'Monitor Dell 24"', 'Teclado Logitech MX', 'Switch Cisco 24p',
                           'PC Dell OptiPlex', 'Impresora Canon LBP', 'Scanner Fujitsu', 'Proyector Epson',
                           'Router Mikrotik', 'UPS APC 1500VA', 'Tablet Samsung Tab', 'Camara IP Hikvision'],
    HVAC_EQUIPMENT:       ['AC Daikin 18000 BTU', 'Ventilador Industrial', 'Purificador Aire Dyson',
                           'Calefactor Electrico', 'AC LG Inverter', 'Extractor Industrial'],
    FIXTURES:             ['Escritorio Ejecutivo L', 'Silla Ergonomica Herman Miller', 'Archivero 4 Gavetas',
                           'Mesa de Reuniones', 'Estante Metalico', 'Sofa de Espera', 'Locker 6 Puestos'],
    OTHERS:               ['Vehiculo Toyota Hilux', 'Moto Honda CB190', 'Compresor 50L',
                           'Generador 5kW', 'Extintor CO2', 'Carretilla Hidraulica'],
};

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
    const [sol, dep, act] = await Promise.all([
        query('SELECT COUNT(*) FROM solicitudes_mantenimiento'),
        query('SELECT COUNT(*) FROM depreciacion_mensual'),
        query('SELECT COUNT(*) FROM activos'),
    ]);
    return {
        solicitudes:  parseInt(sol.rows[0].count),
        depreciacion: parseInt(dep.rows[0].count),
        activos:      parseInt(act.rows[0].count),
    };
}

async function rellenarActivos(faltantes) {
    const [areas, cats] = await Promise.all([
        query('SELECT id FROM areas'),
        query('SELECT id, nombre FROM categorias_activo'),
    ]);
    const areaIds = areas.rows.map(r => r.id);
    const catMap  = {};
    cats.rows.forEach(c => { catMap[c.nombre] = c.id; });

    // Usar el mayor número en códigos existentes para no colisionar
    const maxRow = await query(
        `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(codigo, '[^0-9]', '', 'g') AS INTEGER)), 0) AS max_seq
         FROM activos WHERE codigo ~ '^ACT-'`
    );
    let seq = parseInt(maxRow.rows[0].max_seq);

    await withTransaction(async (client) => {
        for (let i = 0; i < faltantes; i++) {
            seq++;
            const category = pick(CATEGORIES);
            const status   = pick(STATUSES);
            const estado   = STATUS_TO_ESTADO[status];
            const catNombre = CATEGORY_TO_NOMBRE[category];
            const categoriaId = catMap[catNombre] ?? cats.rows[0].id;
            const areaId   = pick(areaIds);
            const nombres  = NOMBRES_POR_CAT[category];
            const nombre   = `${pick(nombres)} #${seq}`;
            const codigo   = `ACT-${String(seq).padStart(5, '0')}`;
            const fechaAdq = faker.date.between({
                from: new Date(Date.now() - 4 * 365 * 24 * 3600_000),
                to:   new Date(),
            });
            const ubicacion = faker.helpers.arrayElement([
                'Oficina Central', 'Sala de Reuniones', 'Almacén', 'Recepción',
                'Sala de Servidores', 'Planta Baja', 'Piso 1', 'Piso 2',
            ]);

            await client.query(
                `INSERT INTO activos
                    (codigo, nombre, descripcion, categoria_id, area_id,
                     fecha_adquisicion, valor_compra, estado, ubicacion,
                     category, status)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                [
                    codigo, nombre,
                    faker.commerce.productDescription().substring(0, 200),
                    categoriaId, areaId,
                    fechaAdq,
                    faker.number.int({ min: 200, max: 30000 }),
                    estado, ubicacion, category, status,
                ]
            );

            if ((i + 1) % 200 === 0) {
                logger.info({ progreso: `${i + 1}/${faltantes}` }, 'Activos insertando...');
            }
        }
    });

    logger.info({ insertados: faltantes }, 'Activos añadidos');
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

    // --- Activos ---
    const faltanAct = Math.max(0, MIN_ACTIVOS - antes.activos);
    if (faltanAct > 0) {
        logger.info({ faltantes: faltanAct }, `Rellenando activos hasta ${MIN_ACTIVOS}`);
        await rellenarActivos(faltanAct);
    } else {
        logger.info({ actual: antes.activos }, 'Activos ya superan el mínimo ✓');
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
