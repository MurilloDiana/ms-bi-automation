'use strict';

const xlsx = require('xlsx');
const PDFDocument = require('pdfkit');

/**
 * Convierte un arreglo de objetos planos a un buffer .xlsx (una hoja).
 */
function toExcelBuffer(rows, sheetName = 'Reporte') {
    const wb = xlsx.utils.book_new();
    const ws = rows.length
        ? xlsx.utils.json_to_sheet(rows)
        : xlsx.utils.aoa_to_sheet([['Sin datos']]);

    if (rows.length) {
        const keys = Object.keys(rows[0]);
        ws['!cols'] = keys.map((k) => ({
            wch: Math.min(40, Math.max(k.length + 2, ...rows.map((r) => String(r[k] ?? '').length + 1))),
        }));
    }

    xlsx.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Genera un PDF tabular simple (encabezado + filas, con paginacion automatica).
 */
function toPdfBuffer({ title, subtitle, rows }) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc.fontSize(16).font('Helvetica-Bold').text(title);
        if (subtitle) {
            doc.moveDown(0.2);
            doc.fontSize(9).font('Helvetica').fillColor('#555').text(subtitle).fillColor('#000');
        }
        doc.moveDown(0.5);

        if (!rows.length) {
            doc.fontSize(10).font('Helvetica').text('Sin datos para los filtros indicados.');
            doc.end();
            return;
        }

        const columns   = Object.keys(rows[0]);
        const left      = doc.page.margins.left;
        const right     = doc.page.width - doc.page.margins.right;
        const colWidth  = (right - left) / columns.length;
        const rowHeight = 16;

        const drawHeader = (y) => {
            doc.fontSize(7).font('Helvetica-Bold');
            columns.forEach((col, i) => {
                doc.text(String(col), left + i * colWidth, y, { width: colWidth - 4, height: rowHeight - 4, ellipsis: true, lineBreak: false });
            });
            doc.moveTo(left, y + rowHeight - 3).lineTo(right, y + rowHeight - 3).strokeColor('#cccccc').stroke();
            doc.font('Helvetica');
            return y + rowHeight;
        };

        let y = drawHeader(doc.y);
        doc.fontSize(7);

        for (const row of rows) {
            if (y > doc.page.height - doc.page.margins.bottom - rowHeight) {
                doc.addPage();
                y = drawHeader(doc.page.margins.top);
                doc.fontSize(7);
            }
            columns.forEach((col, i) => {
                const val = row[col];
                const text = val === null || val === undefined ? '' : String(val);
                doc.text(text, left + i * colWidth, y, { width: colWidth - 4, height: rowHeight - 4, ellipsis: true, lineBreak: false });
            });
            y += rowHeight;
        }

        doc.end();
    });
}

module.exports = { toExcelBuffer, toPdfBuffer };
