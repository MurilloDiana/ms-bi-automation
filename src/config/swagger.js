'use strict';

const config = require('./env');

const swaggerSpec = {
    openapi: '3.0.3',
    info: {
        title: 'MS BI Automation API',
        description: `Microservicio de BI, Automatizacion y Notificaciones para gestion de activos fijos y mantenimiento.\n\n**Base URL:** \`${config.apiPrefix}\``,
        version: '1.0.0',
        contact: { name: 'Soporte', email: 'soporte@biautomation.local' },
    },
    servers: [
        { url: `http://localhost:${config.port}`, description: 'Desarrollo local' },
    ],
    tags: [
        { name: 'Health',      description: 'Estado del servicio' },
        { name: 'Catalogo',    description: 'Consulta de IDs validos para usar en pruebas (usuarios, activos, areas)' },
        { name: 'Solicitudes', description: 'Gestion de solicitudes de mantenimiento' },
        { name: 'KPIs',        description: 'Dashboard de indicadores clave de rendimiento' },
        { name: 'Reportes',    description: 'Reportes y analiticas' },
    ],
    paths: {
        '/health': {
            get: {
                tags: ['Health'],
                summary: 'Health check del servicio',
                description: 'Verifica la conexion a la base de datos y retorna el estado del servicio.',
                responses: {
                    200: {
                        description: 'Servicio operativo',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/HealthOk' },
                                example: { status: 'ok', db: 'up', uptime_s: 123.4, env: 'development' },
                            },
                        },
                    },
                    503: {
                        description: 'Base de datos no disponible',
                        content: {
                            'application/json': {
                                example: { status: 'degraded', db: 'down', uptime_s: 5.1, env: 'development' },
                            },
                        },
                    },
                },
            },
        },

        [`${config.apiPrefix}/catalogo/usuarios`]: {
            get: {
                tags: ['Catalogo'],
                summary: 'Listar usuarios',
                description: 'Retorna usuarios activos. Usar los `id` como `solicitante_id` o `tecnico_id` en las solicitudes.',
                parameters: [
                    {
                        name: 'rol',
                        in: 'query',
                        schema: { type: 'string', enum: ['SOLICITANTE', 'TECNICO', 'ADMIN'] },
                        description: 'Filtrar por rol',
                    },
                ],
                responses: {
                    200: {
                        description: 'Lista de usuarios',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/SuccessResponse' },
                                example: {
                                    success: true,
                                    data: [
                                        { id: 'uuid-real', nombre: 'Juan Perez', email: 'juan@empresa.com', rol: 'SOLICITANTE', area_id: 2 },
                                    ],
                                },
                            },
                        },
                    },
                },
            },
        },

        [`${config.apiPrefix}/catalogo/activos`]: {
            get: {
                tags: ['Catalogo'],
                summary: 'Listar activos',
                description: 'Retorna activos disponibles. Usar los `id` como `activo_id` en las solicitudes.',
                parameters: [
                    { name: 'buscar', in: 'query', schema: { type: 'string' }, description: 'Buscar por codigo o nombre' },
                ],
                responses: {
                    200: {
                        description: 'Lista de activos',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/SuccessResponse' },
                                example: {
                                    success: true,
                                    data: [
                                        { id: 'uuid-real', codigo: 'IMP-001', nombre: 'HP LaserJet Pro', estado: 'ACTIVO', area_id: 2, area_nombre: 'TIC' },
                                    ],
                                },
                            },
                        },
                    },
                },
            },
        },

        [`${config.apiPrefix}/catalogo/areas`]: {
            get: {
                tags: ['Catalogo'],
                summary: 'Listar areas',
                description: 'Retorna todas las areas. Usar el `id` como `area_id` en las solicitudes.',
                responses: {
                    200: {
                        description: 'Lista de areas',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/SuccessResponse' },
                                example: {
                                    success: true,
                                    data: [
                                        { id: 1, codigo: 'TIC', nombre: 'Tecnologia e Informatica' },
                                        { id: 2, codigo: 'ADM', nombre: 'Administracion' },
                                    ],
                                },
                            },
                        },
                    },
                },
            },
        },

        [`${config.apiPrefix}/solicitudes`]: {
            post: {
                tags: ['Solicitudes'],
                summary: 'Crear solicitud de mantenimiento',
                description: '**Antes de usar:** obtener IDs reales desde `GET /api/v1/catalogo/usuarios`, `/activos` y `/areas`.',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/CrearSolicitudInput' },
                            example: {
                                solicitante_id: '<uuid de GET /api/v1/catalogo/usuarios>',
                                activo_id: '<uuid de GET /api/v1/catalogo/activos>',
                                area_id: 1,
                                tipo: 'CORRECTIVO',
                                prioridad: 'ALTA',
                                descripcion: 'El aire acondicionado de la sala de servidores dejo de funcionar.',
                                canal_origen: 'WEB',
                                metadata: {},
                            },
                        },
                    },
                },
                responses: {
                    201: {
                        description: 'Solicitud creada exitosamente',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/SolicitudResponse' },
                            },
                        },
                    },
                    400: { $ref: '#/components/responses/ValidationError' },
                    409: { $ref: '#/components/responses/ConflictError' },
                },
            },
            get: {
                tags: ['Solicitudes'],
                summary: 'Listar solicitudes de mantenimiento',
                description: 'Retorna un listado paginado con filtros opcionales.',
                parameters: [
                    { name: 'estado', in: 'query', schema: { $ref: '#/components/schemas/EstadoSolicitud' }, description: 'Filtrar por estado' },
                    { name: 'tecnicoId', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'UUID del tecnico asignado' },
                    { name: 'areaId', in: 'query', schema: { type: 'integer', minimum: 1 }, description: 'ID del area' },
                    { name: 'desde', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Fecha de inicio (ISO 8601)' },
                    { name: 'hasta', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Fecha de fin (ISO 8601)' },
                    { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 }, description: 'Numero de pagina' },
                    { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 }, description: 'Registros por pagina' },
                ],
                responses: {
                    200: {
                        description: 'Lista de solicitudes con paginacion',
                        content: {
                            'application/json': {
                                schema: {
                                    allOf: [
                                        { $ref: '#/components/schemas/SuccessResponse' },
                                        {
                                            properties: {
                                                data: { type: 'array', items: { $ref: '#/components/schemas/SolicitudResumen' } },
                                                meta: { $ref: '#/components/schemas/PaginationMeta' },
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    },
                    400: { $ref: '#/components/responses/ValidationError' },
                },
            },
        },

        [`${config.apiPrefix}/solicitudes/{id}`]: {
            get: {
                tags: ['Solicitudes'],
                summary: 'Obtener solicitud por ID',
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'UUID de la solicitud' },
                ],
                responses: {
                    200: {
                        description: 'Detalle de la solicitud',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/SolicitudResponse' },
                            },
                        },
                    },
                    404: { $ref: '#/components/responses/NotFoundError' },
                },
            },
        },

        [`${config.apiPrefix}/solicitudes/{id}/estado`]: {
            patch: {
                tags: ['Solicitudes'],
                summary: 'Cambiar estado de una solicitud',
                description: 'Actualiza el estado. Al pasar a `EN_PROCESO` o `COMPLETADO` se dispara una notificacion por email al solicitante.',
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'UUID de la solicitud' },
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/CambiarEstadoInput' },
                            examples: {
                                asignar_tecnico: {
                                    summary: 'Asignar tecnico y poner EN_PROCESO',
                                    value: {
                                        estado: 'EN_PROCESO',
                                        tecnico_id: '550e8400-e29b-41d4-a716-446655440002',
                                        diagnostico: 'Fallo en el compresor del equipo.',
                                    },
                                },
                                completar: {
                                    summary: 'Marcar como COMPLETADO',
                                    value: {
                                        estado: 'COMPLETADO',
                                        solucion: 'Se reemplazo el compresor. Equipo operativo.',
                                        costo: 1200.50,
                                    },
                                },
                                rechazar: {
                                    summary: 'Rechazar solicitud',
                                    value: { estado: 'RECHAZADO', diagnostico: 'No corresponde al area.' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: {
                        description: 'Estado actualizado',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/SolicitudResponse' },
                            },
                        },
                    },
                    400: { $ref: '#/components/responses/ValidationError' },
                    404: { $ref: '#/components/responses/NotFoundError' },
                },
            },
        },

        [`${config.apiPrefix}/kpis/dashboard`]: {
            get: {
                tags: ['KPIs'],
                summary: 'Dashboard de KPIs',
                description: 'Retorna los 5 indicadores principales: disponibilidad, MTTR, MTBF, costos por activo y cumplimiento preventivo. Resultado cacheado 60 segundos.',
                responses: {
                    200: {
                        description: 'Dashboard con todos los KPIs',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/KpiDashboardResponse' },
                            },
                        },
                    },
                },
            },
        },

        [`${config.apiPrefix}/reportes`]: {
            get: {
                tags: ['Reportes'],
                summary: 'Listar tipos de reportes disponibles',
                responses: {
                    200: {
                        description: 'Lista de reportes disponibles',
                        content: {
                            'application/json': {
                                schema: {
                                    allOf: [
                                        { $ref: '#/components/schemas/SuccessResponse' },
                                        {
                                            properties: {
                                                data: {
                                                    type: 'array',
                                                    items: {
                                                        type: 'object',
                                                        properties: {
                                                            id: { type: 'string', example: 'solicitudes-por-estado' },
                                                            endpoint: { type: 'string', example: `${config.apiPrefix}/reportes/solicitudes-por-estado` },
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    },
                },
            },
        },

        [`${config.apiPrefix}/reportes/{tipo}`]: {
            get: {
                tags: ['Reportes'],
                summary: 'Obtener reporte especifico',
                parameters: [
                    {
                        name: 'tipo',
                        in: 'path',
                        required: true,
                        schema: {
                            type: 'string',
                            enum: ['solicitudes-por-estado', 'depreciacion', 'top-fallas', 'productividad-tecnico', 'distribucion-area'],
                        },
                        description: 'Tipo de reporte',
                    },
                    { name: 'desde', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Fecha de inicio (ISO 8601)' },
                    { name: 'hasta', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Fecha de fin (ISO 8601)' },
                    { name: 'periodo', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Periodo especifico (ISO 8601)' },
                    { name: 'areaId', in: 'query', schema: { type: 'integer', minimum: 1 }, description: 'Filtrar por area' },
                    { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500, default: 20 }, description: 'Maximo de registros' },
                ],
                responses: {
                    200: {
                        description: 'Datos del reporte',
                        content: {
                            'application/json': {
                                schema: {
                                    allOf: [
                                        { $ref: '#/components/schemas/SuccessResponse' },
                                        {
                                            properties: {
                                                meta: {
                                                    type: 'object',
                                                    properties: {
                                                        tipo: { type: 'string' },
                                                        generadoEn: { type: 'string', format: 'date-time' },
                                                    },
                                                },
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    },
                    404: { $ref: '#/components/responses/NotFoundError' },
                },
            },
        },
    },

    components: {
        schemas: {
            SuccessResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    data: {},
                },
            },
            ErrorResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: false },
                    error: {
                        type: 'object',
                        properties: {
                            code: { type: 'string', example: 'VALIDATION_ERROR' },
                            message: { type: 'string', example: 'Datos invalidos' },
                            details: { type: 'array', items: { type: 'object' } },
                        },
                    },
                },
            },
            HealthOk: {
                type: 'object',
                properties: {
                    status: { type: 'string', enum: ['ok', 'degraded'] },
                    db: { type: 'string', enum: ['up', 'down'] },
                    uptime_s: { type: 'number' },
                    env: { type: 'string' },
                },
            },
            PaginationMeta: {
                type: 'object',
                properties: {
                    total: { type: 'integer', example: 150 },
                    page: { type: 'integer', example: 1 },
                    pageSize: { type: 'integer', example: 20 },
                    totalPages: { type: 'integer', example: 8 },
                },
            },
            EstadoSolicitud: {
                type: 'string',
                enum: ['PENDIENTE', 'EN_PROCESO', 'COMPLETADO', 'CANCELADO', 'RECHAZADO'],
            },
            TipoMantenimiento: {
                type: 'string',
                enum: ['PREVENTIVO', 'CORRECTIVO', 'PREDICTIVO'],
            },
            PrioridadSolicitud: {
                type: 'string',
                enum: ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'],
            },
            CrearSolicitudInput: {
                type: 'object',
                required: ['solicitante_id', 'activo_id', 'area_id', 'descripcion'],
                properties: {
                    solicitante_id: { type: 'string', format: 'uuid', description: 'UUID del usuario solicitante' },
                    activo_id: { type: 'string', format: 'uuid', description: 'UUID del activo a mantener' },
                    area_id: { type: 'integer', minimum: 1, description: 'ID del area responsable' },
                    tipo: { $ref: '#/components/schemas/TipoMantenimiento', default: 'CORRECTIVO' },
                    prioridad: { $ref: '#/components/schemas/PrioridadSolicitud', default: 'MEDIA' },
                    descripcion: { type: 'string', minLength: 5, maxLength: 2000, description: 'Descripcion del problema o tarea' },
                    canal_origen: { type: 'string', enum: ['WEB', 'TELEGRAM', 'EMAIL', 'APP_MOVIL'], default: 'WEB' },
                    metadata: { type: 'object', default: {}, description: 'Datos adicionales opcionales' },
                },
            },
            CambiarEstadoInput: {
                type: 'object',
                required: ['estado'],
                properties: {
                    estado: { $ref: '#/components/schemas/EstadoSolicitud' },
                    tecnico_id: { type: 'string', format: 'uuid', description: 'UUID del tecnico asignado' },
                    diagnostico: { type: 'string', maxLength: 2000, description: 'Diagnostico del problema' },
                    solucion: { type: 'string', maxLength: 2000, description: 'Solucion aplicada' },
                    costo: { type: 'number', minimum: 0, description: 'Costo del mantenimiento' },
                },
            },
            SolicitudResumen: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    codigo: { type: 'string', example: 'SOL-2026-000123' },
                    estado: { $ref: '#/components/schemas/EstadoSolicitud' },
                    tipo: { $ref: '#/components/schemas/TipoMantenimiento' },
                    prioridad: { $ref: '#/components/schemas/PrioridadSolicitud' },
                    descripcion: { type: 'string' },
                    fecha_solicitud: { type: 'string', format: 'date-time' },
                    fecha_inicio: { type: 'string', format: 'date-time', nullable: true },
                    fecha_fin: { type: 'string', format: 'date-time', nullable: true },
                    costo: { type: 'number', nullable: true },
                    solicitante_nombre: { type: 'string' },
                    tecnico_nombre: { type: 'string', nullable: true },
                    activo_codigo: { type: 'string' },
                    activo_nombre: { type: 'string' },
                    area_nombre: { type: 'string' },
                },
            },
            SolicitudDetalle: {
                allOf: [
                    { $ref: '#/components/schemas/SolicitudResumen' },
                    {
                        type: 'object',
                        properties: {
                            solicitante_email: { type: 'string', format: 'email' },
                            tecnico_email: { type: 'string', format: 'email', nullable: true },
                            diagnostico: { type: 'string', nullable: true },
                            solucion: { type: 'string', nullable: true },
                            canal_origen: { type: 'string' },
                            metadata: { type: 'object' },
                            notificado_inicio: { type: 'boolean' },
                            notificado_fin: { type: 'boolean' },
                            fecha_estimada_fin: { type: 'string', format: 'date', nullable: true },
                        },
                    },
                ],
            },
            SolicitudResponse: {
                allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                        properties: {
                            data: { $ref: '#/components/schemas/SolicitudDetalle' },
                        },
                    },
                ],
            },
            KpiDashboardResponse: {
                allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                        properties: {
                            data: {
                                type: 'object',
                                properties: {
                                    disponibilidad: { type: 'object', description: 'KPI de disponibilidad de activos' },
                                    mttr: { type: 'object', description: 'Mean Time To Repair' },
                                    mtbf: { type: 'object', description: 'Mean Time Between Failures' },
                                    top_costos_mantenimiento: { type: 'array', description: 'Top 10 activos por costo' },
                                    cumplimiento_preventivo: { type: 'object', description: 'Cumplimiento de mantenimiento preventivo (6 meses)' },
                                    generado_en: { type: 'string', format: 'date-time' },
                                },
                            },
                        },
                    },
                ],
            },
        },
        responses: {
            ValidationError: {
                description: 'Error de validacion en los datos enviados',
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/ErrorResponse' },
                        example: {
                            success: false,
                            error: {
                                code: 'VALIDATION_ERROR',
                                message: 'Datos invalidos',
                                details: [{ path: 'descripcion', msg: '"descripcion" is required' }],
                            },
                        },
                    },
                },
            },
            NotFoundError: {
                description: 'Recurso no encontrado',
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/ErrorResponse' },
                        example: { success: false, error: { code: 'NOT_FOUND', message: 'Solicitud no encontrada' } },
                    },
                },
            },
            ConflictError: {
                description: 'Conflicto de datos (duplicado o FK)',
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/ErrorResponse' },
                        example: { success: false, error: { code: 'DUPLICATE', message: 'Registro duplicado' } },
                    },
                },
            },
        },
    },
};

module.exports = swaggerSpec;
