'use strict';

/**
 * Devuelve el primer dia del mes para una fecha dada (en UTC).
 */
function firstOfMonth(d = new Date()) {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    return x;
}

/**
 * Suma N dias laborales aproximados (3 dias habiles = ~5 dias calendario worst-case).
 * Para el caso de uso "estara listo en 3 dias" usamos dias calendario.
 */
function addBusinessDays(date, days) {
    const result = new Date(date);
    let added = 0;
    while (added < days) {
        result.setUTCDate(result.getUTCDate() + 1);
        const dow = result.getUTCDay();
        if (dow !== 0 && dow !== 6) added++;
    }
    return result;
}

/**
 * Formatea una fecha a YYYY-MM-DD.
 */
function toISODate(d) {
    return new Date(d).toISOString().slice(0, 10);
}

/**
 * Calcula meses transcurridos entre dos fechas (entero, sin redondear hacia arriba).
 */
function monthsBetween(start, end) {
    const a = new Date(start);
    const b = new Date(end);
    return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

module.exports = { firstOfMonth, addBusinessDays, toISODate, monthsBetween };
