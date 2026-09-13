const fs = require('fs');

const file = 'app/src/components/Inventario/CierreCosto.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace \r\n with \n to normalize for regex
content = content.replace(/\r\n/g, '\n');

const startIndex = content.indexOf('const handlePrint = () => {');
const endIndexStr = 'printWindow.document.close();\n  };';
const endIndex = content.indexOf(endIndexStr, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
  const newHandlePrint = `
  const handlePrint = async () => {
    if (!cierreCostos) return;

    const zip = new JSZip();
    const monthName = mockMonths.find(m => m.val === defaultMonth)?.label || '';
    const lastDayOfMonth = new Date(defaultYear, defaultMonth, 0).getDate();
    const fechaElaboracion = \`\${defaultYear}-\${String(defaultMonth).padStart(2, '0')}-\${String(lastDayOfMonth).padStart(2, '0')}\`;
    const fmtNumOnly = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const createHTML = (title: string, instructions: string, docNo: string, tableRows: string, totalsHTML: string, observation: string) => \`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>\${title}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #000; margin: 40px; font-size: 12px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
          .logo { width: 150px; }
          .company-info { text-align: center; font-size: 11px; flex-grow: 1; }
          .company-info strong { font-size: 13px; }
          .doc-info { border: 1px solid #ccc; border-collapse: collapse; width: 250px; }
          .doc-info td { border: 1px solid #ccc; padding: 5px; }
          .doc-info .bg-gray { background-color: #eee; font-weight: bold; }
          table.items { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
          table.items th, table.items td { border: 1px solid #ccc; padding: 6px; }
          table.items th { background-color: #eee; text-align: center; font-weight: bold; }
          table.items td { text-align: center; }
          table.items td.left { text-align: left; }
          table.items td.right { text-align: right; }
          .totals { display: flex; justify-content: flex-end; font-weight: bold; margin-bottom: 40px; }
          .totals span { display: inline-block; width: 100px; text-align: right; }
          .totals span.label { width: auto; margin-right: 20px; }
          .observations { margin-top: 20px; font-size: 11px; }
          .observations strong { display: block; margin-bottom: 5px; }
          .watermark { position: fixed; right: -40px; top: 50%; transform: translateY(-50%) rotate(-90deg); font-size: 10px; color: #666; letter-spacing: 1px; }
          .instructions { margin-bottom: 20px; border: 1px dashed #999; padding: 10px; background: #fafafa; }
        </style>
      </head>
      <body>
        <h1 style="text-align: center; color: #2e7d32; font-size: 18px; margin-bottom: 20px;">\${title}</h1>
        <div class="instructions">\${instructions}</div>
        <div style="border: 1px solid #ccc; padding: 30px; position: relative;">
          <div class="watermark">Elaborado por Dashboard Gerencial</div>
          <div class="header">
            <div class="logo"><h2 style="color: #2e7d32; margin:0;">Probolsas<br><span style="font-size:10px;color:#8bc34a;">empaques</span></h2></div>
            <div class="company-info"><strong>INDUSTRIAS PLASTICAS<br>PROBOLSAS SAS</strong><br>NIT 900.333.574-1<br>AV 2 1243 BARRIO SAN LUIS<br>Teléfono: (57) 3183409532<br>Cúcuta - Colombia</div>
            <table class="doc-info">
              <tr><td class="bg-gray">\${docNo.split(' ')[0]}<br>\${docNo.split(' ').slice(1).join(' ')}</td><td style="text-align: center; font-weight: bold;">\${docNo.split(' ')[0]}-___</td></tr>
              <tr><td class="bg-gray">Fecha de elaboración</td><td style="text-align: center;">\${fechaElaboracion}</td></tr>
            </table>
          </div>
          <table class="items">
            <thead><tr><th>#</th><th>Cuenta contable</th><th>Tercero</th><th>Detalle</th><th>Descripción</th><th>Débito</th><th>Crédito</th></tr></thead>
            <tbody>\${tableRows}</tbody>
          </table>
          <div class="totals">\${totalsHTML}</div>
          <div class="observations"><strong>Observaciones</strong><br>\${observation}</div>
        </div>
      </body>
      </html>
    \`;

    // CC-99
    const valor99 = cierreCostos?.controlCierre?.depurado || 0;
    const rows99 = \`
      <tr><td>1</td><td class="left">14050501 - Inventario de Materia Prima</td><td class="left">INDUSTRIAS PLASTICAS PROBOLSAS SAS</td><td class="left">Prod: 05 Cant: 0</td><td class="left">MATERIA PRIMA</td><td class="right">0.00</td><td class="right">\${fmtNumOnly.format(valor99)}</td></tr>
      <tr><td>2</td><td class="left">71050501 - Materia prima</td><td class="left">INDUSTRIAS PLASTICAS PROBOLSAS SAS</td><td class="left"></td><td class="left">Materia prima</td><td class="right">\${fmtNumOnly.format(valor99)}</td><td class="right">0.00</td></tr>
    \`;
    zip.file("CC-99.html", createHTML(
      "1er asiento contable para el cierre de costos",
      "<strong>Instrucciones:</strong><br/>- Este valor es el inventario de materia prima consumido.<br/>- Bautizar <strong>CC-99-</strong><br/>- Llevar al <strong>CRÉDITO</strong> y contrapartida en <strong>710505.01</strong>.",
      "CC-99 Cumplidos de Materia Prima No.",
      rows99,
      \`<span class="label">Total</span><span style="margin-right: 6px;">\${fmtNumOnly.format(valor99)}</span><span>\${fmtNumOnly.format(valor99)}</span>\`,
      \`CONTABILIZACION DE CONSUMOS DE MATERIA PRIMA - \${monthName.toUpperCase()}\`
    ));

    // CC-100
    const totalDebito100 = valor99 + total;
    let rows100 = \`<tr><td>1</td><td class="left">71050501 - Materia prima</td><td class="left">INDUSTRIAS PLASTICAS PROBOLSAS SAS</td><td class="left"></td><td class="left">Materia prima</td><td class="right">0.00</td><td class="right">\${fmtNumOnly.format(valor99)}</td></tr>\`;
    data.forEach((d: any, i: number) => {
      rows100 += \`<tr><td>\${i+2}</td><td class="left">\${d.code} - \${d.concept}</td><td class="left">INDUSTRIAS PLASTICAS PROBOLSAS SAS</td><td class="left"></td><td class="left">\${d.concept}</td><td class="right">0.00</td><td class="right">\${fmtNumOnly.format(Number(d.valor) || 0)}</td></tr>\`;
    });
    rows100 += \`<tr><td>\${data.length+2}</td><td class="left">14100501 - Producto en Proceso</td><td class="left">INDUSTRIAS PLASTICAS PROBOLSAS SAS</td><td class="left"></td><td class="left">Producto en Proceso</td><td class="right">\${fmtNumOnly.format(totalDebito100)}</td><td class="right">0.00</td></tr>\`;
    zip.file("CC-100.html", createHTML(
      "3er asiento contable para el cierre de costos",
      "<strong>Instrucciones:</strong><br/>- Bautizar <strong>CC-100-</strong><br/>- Materia prima y costos al <strong>CRÉDITO</strong>, contrapartida al <strong>DÉBITO</strong> en <strong>14100501</strong>.",
      "CC-100 Cierre de Costos de Produccion No.",
      rows100,
      \`<span class="label">Total</span><span style="margin-right: 6px;">\${fmtNumOnly.format(totalDebito100)}</span><span>\${fmtNumOnly.format(totalDebito100)}</span>\`,
      \`CIERRE DE COSTOS DE PRODUCCION - \${monthName.toUpperCase()}\`
    ));

    // CC-101
    const valor101 = cierreCostos.kpisCC101?.cc101Propuesto || 0;
    const rows101 = \`
      <tr><td>1</td><td class="left">61350501 - Costo de Ventas (CC-101 Ajustado)</td><td class="left">INDUSTRIAS PLASTICAS PROBOLSAS SAS</td><td class="left"></td><td class="left">Ajuste Costo Ventas</td><td class="right">\${fmtNumOnly.format(valor101)}</td><td class="right">0.00</td></tr>
      <tr><td>2</td><td class="left">14300501 - Producto Terminado</td><td class="left">INDUSTRIAS PLASTICAS PROBOLSAS SAS</td><td class="left"></td><td class="left">Descarga de Inventario</td><td class="right">0.00</td><td class="right">\${fmtNumOnly.format(valor101)}</td></tr>
    \`;
    zip.file("CC-101.html", createHTML(
      "Nuevo asiento contable CC-101 (Ajuste Inventario vs Costo Ventas)",
      "<strong>Instrucciones:</strong><br/>- Bautizar <strong>CC-101-</strong><br/>- <strong>DÉBITO</strong> en 61350501, <strong>CRÉDITO</strong> en 14300501.",
      "CC-101 Ajuste Costo Ventas No.",
      rows101,
      \`<span class="label">Total</span><span style="margin-right: 6px;">\${fmtNumOnly.format(valor101)}</span><span>\${fmtNumOnly.format(valor101)}</span>\`,
      \`AJUSTE INVENTARIO A RESULTADOS (CC-101) - \${monthName.toUpperCase()}\`
    ));

    // CC-102
    const valor102 = cierreCostos?.produccionTerminada?.total || 0;
    const rows102 = \`
      <tr><td>1</td><td class="left">14300501 - Producto Terminado</td><td class="left">INDUSTRIAS PLASTICAS PROBOLSAS SAS</td><td class="left">Prod: 05 Cant: 0</td><td class="left">PRODUCCION TERMINADA</td><td class="right">\${fmtNumOnly.format(valor102)}</td><td class="right">0.00</td></tr>
      <tr><td>2</td><td class="left">14100501 - Producto en Proceso</td><td class="left">INDUSTRIAS PLASTICAS PROBOLSAS SAS</td><td class="left"></td><td class="left">Producto en Proceso</td><td class="right">0.00</td><td class="right">\${fmtNumOnly.format(valor102)}</td></tr>
    \`;
    zip.file("CC-102.html", createHTML(
      "2do Reporte de cierre de costos",
      "<strong>Instrucciones:</strong><br/>- Bautizar <strong>CC-102-</strong><br/>- <strong>DÉBITO</strong> en 14300501 y <strong>CRÉDITO</strong> en 14100501.",
      "CC-102 Cumplidos de Produccion No.",
      rows102,
      \`<span class="label">Total</span><span style="margin-right: 6px;">\${fmtNumOnly.format(valor102)}</span><span>\${fmtNumOnly.format(valor102)}</span>\`,
      \`CUMPLIDOS DE PRODUCCION TERMINADA - \${monthName.toUpperCase()}\`
    ));

    const contentBlob = await zip.generateAsync({ type: "blob" });
    saveAs(contentBlob, \`Comprobantes-Cierre-\${defaultYear}-\${String(defaultMonth).padStart(2, '0')}.zip\`);
  };`;
  
  content = content.substring(0, startIndex) + newHandlePrint.trim() + content.substring(endIndex + endIndexStr.length);
  content = content.replace('Imprimir / Descargar PDF', 'Descargar ZIP (CC-99, 100, 101, 102)');
  fs.writeFileSync(file, content);
  console.log("Replaced handlePrint successfully.");
} else {
  console.log("Could not find handlePrint block boundaries.");
}
