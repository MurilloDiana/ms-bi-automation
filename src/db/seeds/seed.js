'use strict';

/**
 * Seed — genera +2000 registros para demo/dev.
 * Uso: npm run seed
 */

const { faker } = require('@faker-js/faker');
const { pool, withTransaction } = require('../../config/database');
const logger = require('../../config/logger');
const depreciationService = require('../../services/depreciation.service');

const trunc = (str, max) => (str || '').substring(0, max);

const telefonoBO = () => {
    const pre = ['70','71','72','73','74','75','76','77','78','79'][Math.floor(Math.random()*10)];
    const num = String(Math.floor(Math.random() * 9000000) + 1000000);
    return `+591 ${pre}${num}`.substring(0, 20);
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const NOMBRES_ACTIVOS = {
    'Impresoras':           ['HP LaserJet Pro', 'Epson EcoTank', 'Canon PIXMA', 'Brother MFC'],
    'Computadoras':         ['Dell OptiPlex', 'HP EliteDesk', 'Lenovo ThinkCentre', 'Apple iMac'],
    'Laptops':              ['Dell Latitude', 'HP ProBook', 'Lenovo ThinkPad', 'Asus ZenBook'],
    'Mobiliario':           ['Escritorio ejecutivo', 'Silla ergonomica', 'Archivero metalico', 'Estante modular'],
    'Equipos Audiovisuales':['Proyector Epson', 'TV Samsung 55"', 'Sistema audio Bose', 'Pantalla LG 65"'],
    'Climatizacion':        ['AC Daikin Split', 'Ventilador industrial', 'Calefactor electrico', 'Purificador aire'],
    'Equipos de Oficina':   ['Trituradora papel', 'Maquina anillado', 'Plastificadora', 'Telefono IP Cisco'],
    'Vehiculos':            ['Camioneta Toyota Hilux', 'Furgon Mercedes Sprinter'],
};

const AREAS_DATA = [
    { codigo: 'GER', nombre: 'Gerencia General' },
    { codigo: 'ADM', nombre: 'Administracion' },
    { codigo: 'CON', nombre: 'Contabilidad' },
    { codigo: 'VEN', nombre: 'Ventas' },
    { codigo: 'COM', nombre: 'Compras' },
    { codigo: 'ALM', nombre: 'Almacen' },
    { codigo: 'LOG', nombre: 'Logistica' },
    { codigo: 'TIC', nombre: 'Tecnologia e Informatica' },
    { codigo: 'RRH', nombre: 'Recursos Humanos' },
    { codigo: 'MKT', nombre: 'Marketing' },
    { codigo: 'ATC', nombre: 'Atencion al Cliente' },
    { codigo: 'MAN', nombre: 'Mantenimiento' },
];

const CATEGORIAS_DATA = [
    { nombre: 'Impresoras',           vida_util_anios: 5,  valor_residual_pct: 10 },
    { nombre: 'Computadoras',         vida_util_anios: 5,  valor_residual_pct: 10 },
    { nombre: 'Laptops',              vida_util_anios: 4,  valor_residual_pct: 10 },
    { nombre: 'Mobiliario',           vida_util_anios: 10, valor_residual_pct: 15 },
    { nombre: 'Equipos Audiovisuales',vida_util_anios: 7,  valor_residual_pct: 10 },
    { nombre: 'Climatizacion',        vida_util_anios: 8,  valor_residual_pct: 10 },
    { nombre: 'Equipos de Oficina',   vida_util_anios: 6,  valor_residual_pct: 10 },
    { nombre: 'Vehiculos',            vida_util_anios: 8,  valor_residual_pct: 20 },
];

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

// Estados validos segun schema CHECK constraint
const ESTADOS_SOL = ['PENDIENTE','EN_PROCESO','COMPLETADO','CANCELADO'];
const TIPOS_SOL   = ['CORRECTIVO','PREVENTIVO','PREDICTIVO'];
const PRIORIDADES = ['BAJA','MEDIA','ALTA','CRITICA'];

// =====================================================
async function limpiarTablas(client) {
    logger.info('Limpiando datos previos...');
    await client.query(`
        TRUNCATE TABLE
            depreciacion_mensual,
            historial_estados_solicitud,
            notificaciones,
            solicitudes_mantenimiento,
            activos,
            usuarios,
            categorias_activo,
            areas
        RESTART IDENTITY CASCADE
    `);
}

async function seedAreas(client) {
    const ids = [];
    for (const a of AREAS_DATA) {
        const r = await client.query(
            `INSERT INTO areas (codigo, nombre) VALUES ($1,$2) RETURNING id`,
            [a.codigo, a.nombre]
        );
        ids.push(r.rows[0].id);
    }
    logger.info({ count: ids.length }, 'Areas creadas');
    return ids;
}

async function seedCategorias(client) {
    const ids = [];
    for (const c of CATEGORIAS_DATA) {
        const r = await client.query(
            `INSERT INTO categorias_activo (nombre, vida_util_anios, valor_residual_pct)
             VALUES ($1,$2,$3) RETURNING id, nombre`,
            [c.nombre, c.vida_util_anios, c.valor_residual_pct]
        );
        ids.push(r.rows[0]);
    }
    logger.info({ count: ids.length }, 'Categorias creadas');
    return ids;
}

async function seedUsuarios(client, areaIds) {
    const usuarios = [];

    for (let i = 0; i < 8; i++) {
        const r = await client.query(
            `INSERT INTO usuarios (nombre, email, telefono, rol, area_id)
             VALUES ($1,$2,$3,'TECNICO',$4) RETURNING id`,
            [trunc(faker.person.fullName(), 150), `tecnico${i+1}@empresa.com`,
             telefonoBO(), areaIds[areaIds.length - 1]]
        );
        usuarios.push({ id: r.rows[0].id, rol: 'TECNICO' });
    }

    for (let i = 0; i < 2; i++) {
        const r = await client.query(
            `INSERT INTO usuarios (nombre, email, rol, area_id)
             VALUES ($1,$2,'SUPERADMIN',$3) RETURNING id`,
            [trunc(faker.person.fullName(), 150), `admin${i+1}@empresa.com`, areaIds[0]]
        );
        usuarios.push({ id: r.rows[0].id, rol: 'SUPERADMIN' });
    }

    for (let i = 0; i < 6; i++) {
        const r = await client.query(
            `INSERT INTO usuarios (nombre, email, rol, area_id)
             VALUES ($1,$2,'GERENTE',$3) RETURNING id`,
            [trunc(faker.person.fullName(), 150), `supervisor${i+1}@empresa.com`, areaIds[i]]
        );
        usuarios.push({ id: r.rows[0].id, rol: 'GERENTE' });
    }

    for (let i = 0; i < 44; i++) {
        const r = await client.query(
            `INSERT INTO usuarios (nombre, email, rol, area_id)
             VALUES ($1,$2,'OPERADOR',$3) RETURNING id`,
            [trunc(faker.person.fullName(), 150), `empleado${i+1}@empresa.com`,
             pick(areaIds)]
        );
        usuarios.push({ id: r.rows[0].id, rol: 'OPERADOR' });
    }

    logger.info({ count: usuarios.length }, 'Usuarios creados');
    return usuarios;
}

async function seedActivos(client, areaIds, categorias, usuarios) {
    const empleados = usuarios.filter((u) => u.rol === 'OPERADOR' || u.rol === 'GERENTE');
    const activos = [];

    for (let i = 0; i < 250; i++) {
        const cat    = pick(categorias);
        const nombres = NOMBRES_ACTIVOS[cat.nombre] || ['Generico'];
        const nombre  = trunc(`${pick(nombres)} #${i+1}`, 150);
        const areaId  = pick(areaIds);
        const resp    = pick(empleados);
        const fechaAdq = faker.date.between({
            from: new Date(Date.now() - 4 * 365 * 24 * 3600_000),
            to:   new Date()
        });
        const valorCompra = faker.number.int({ min: 500, max: 25000 });

        const rand = Math.random();
        let estado = 'OPERATIVO';
        if      (rand < 0.05) estado = 'DADO_DE_BAJA';
        else if (rand < 0.13) estado = 'EN_MANTENIMIENTO';
        else if (rand < 0.16) estado = 'FUERA_DE_SERVICIO';

        const r = await client.query(
            `INSERT INTO activos
                (codigo, nombre, categoria_id, area_id, responsable_id,
                 fecha_adquisicion, valor_compra, estado)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             RETURNING id, fecha_adquisicion, valor_compra, categoria_id, area_id`,
            [`ACT-${String(i+1).padStart(4,'0')}`, nombre, cat.id, areaId,
             resp.id, fechaAdq, valorCompra, estado]
        );
        activos.push(r.rows[0]);
    }
    logger.info({ count: activos.length }, 'Activos creados');
    return activos;
}

async function seedSolicitudes(client, activos, usuarios) {
    const tecnicos  = usuarios.filter((u) => u.rol === 'TECNICO');
    const empleados = usuarios.filter((u) => u.rol !== 'TECNICO' && u.rol !== 'SUPERADMIN');
    const ahora     = new Date();
    const inicio18m = new Date(ahora - 18 * 30 * 24 * 3600_000);

    const TOTAL = 1700;
    const yearCounters = {};

    for (let i = 0; i < TOTAL; i++) {
        const activo      = pick(activos);
        const solicitante = pick(empleados);
        const tecnico     = pick(tecnicos);
        const tipo        = Math.random() < 0.75 ? 'CORRECTIVO' : pick(TIPOS_SOL);
        const prioridad   = pick(PRIORIDADES);
        const fechaSol    = faker.date.between({ from: inicio18m, to: ahora });

        const anio = fechaSol.getFullYear();
        yearCounters[anio] = (yearCounters[anio] || 0) + 1;
        // Contador por año: SOL-2026-000001 = primera solicitud del año 2026
        const codigo = `SOL-${anio}-${String(yearCounters[anio]).padStart(6,'0')}`;

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
                costo, true, estado === 'COMPLETADO'
            ]
        );

        if ((i + 1) % 200 === 0) {
            logger.info({ progreso: `${i+1}/${TOTAL}` }, 'Solicitudes insertando...');
        }
    }
    logger.info({ count: TOTAL }, 'Solicitudes creadas');
}

// =====================================================
async function main() {
    logger.info('Iniciando seed de datos...');

    let areaIds, categorias, usuarios, activos;

    await withTransaction(async (client) => {
        await limpiarTablas(client);
        areaIds    = await seedAreas(client);
        categorias = await seedCategorias(client);
        usuarios   = await seedUsuarios(client, areaIds);
        activos    = await seedActivos(client, areaIds, categorias, usuarios);
        await seedSolicitudes(client, activos, usuarios);
    });

    logger.info('Generando snapshots de depreciacion (puede tardar 30-60s)...');
    try {
        await depreciationService.generarHistoricoCompleto();
        logger.info('Snapshots de depreciacion generados');
    } catch (err) {
        logger.warn({ err: err.message }, 'Depreciacion omitida (no critica para el demo)');
    }

    logger.info('Seed completado exitosamente');
    await pool.end();
}

main().catch((err) => {
    logger.error({ err }, 'Error fatal en seed');
    process.exit(1);
});