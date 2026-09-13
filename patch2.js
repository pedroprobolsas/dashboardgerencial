const fs = require('fs');

const file = 'app/src/components/Inventario/CierreCosto.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Insert <DetalleCC101 /> below CoherenciaCostos
content = content.replace(
  '<CoherenciaCostos defaultYear={year} mockMonths={mockMonths} availableYears={years} />',
  '<CoherenciaCostos defaultYear={year} mockMonths={mockMonths} availableYears={years} />\n      <DetalleCC101 year={year} month={month} />'
);

// 2. Update CoherenciaCostos table headers
content = content.replace(
  '<th className="px-5 py-3 font-semibold text-right">Consumo Real MP (Depurado)</th>',
  '<th className="px-5 py-3 font-semibold text-right">Consumo Real MP (Depurado)</th>\n                <th className="px-5 py-3 font-semibold text-right">Costo Vtas Real (por OP)</th>\n                <th className="px-5 py-3 font-semibold text-right">CC-101 Ajustado</th>'
);

// 3. Update CoherenciaCostos column rendering
const rowRenderRegex = /(<td className={`px-5 py-3 text-right font-semibold \${isAlert \? 'text-red-700' : 'text-slate-800'}`}>{fmtCOP\.format\(depurado\)}<\/td>)/;

content = content.replace(rowRenderRegex, (match) => {
  return match + `
                    <td className={\`px-5 py-3 text-right font-medium text-slate-700\`}>{fmtCOP.format(row.data.kpisCC101?.costoRealOP || 0)}</td>
                    <td className={\`px-5 py-3 text-right font-bold text-indigo-700\`}>{fmtCOP.format(row.data.kpisCC101?.cc101Propuesto || 0)}</td>`;
});

// Update colSpan for loading and empty states
content = content.replace('colSpan={9}', 'colSpan={11}');
content = content.replace('colSpan={8}', 'colSpan={10}');

fs.writeFileSync(file, content);
