'use strict';

const { calcularDepreciacionLineal } = require('../src/services/depreciation.service');

describe('Depreciation Service', () => {
    test('depreciacion lineal calculada correctamente para 5 anios', () => {
        const activo = {
            fecha_adquisicion: '2024-01-15',
            valor_compra: 1200,
            vida_util_anios: 5,
            valor_residual_pct: 10,
        };
        // 1200 * (1 - 0.10) = 1080 depreciable
        // 1080 / 60 meses = 18.00 / mes
        const resultado = calcularDepreciacionLineal(activo, new Date('2024-01-15'));
        expect(resultado.depreciacion_mes).toBeCloseTo(18.00, 1);
    });

    test('valor de libro nunca cae por debajo del valor residual', () => {
        const activo = {
            fecha_adquisicion: '2010-01-01',
            valor_compra: 1000,
            vida_util_anios: 5,
            valor_residual_pct: 10,
        };
        const resultado = calcularDepreciacionLineal(activo, new Date('2030-01-01'));
        // Aunque haya pasado mucho mas tiempo, el valor de libro no debe ser negativo
        expect(resultado.valor_libro).toBeGreaterThanOrEqual(100); // 10% de 1000
    });

    test('retorna null si la fecha objetivo es anterior a la adquisicion', () => {
        const activo = {
            fecha_adquisicion: '2024-06-01',
            valor_compra: 1000,
            vida_util_anios: 5,
            valor_residual_pct: 10,
        };
        const resultado = calcularDepreciacionLineal(activo, new Date('2024-01-01'));
        expect(resultado).toBeNull();
    });
});
