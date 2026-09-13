const fs = require('fs');

const apiFile = 'app/src/services/api.ts';
let apiContent = fs.readFileSync(apiFile, 'utf8');

apiContent = apiContent.replace(
  /export const updateParametro = async \(clave: string, valor: number\) => \{/g,
  'export const updateParametro = async (clave: string, valor: number, motivo?: string) => {'
);
apiContent = apiContent.replace(
  /body: JSON\.stringify\(\{ clave, valor \}\)/g,
  'body: JSON.stringify({ clave, valor, motivo })'
);
apiContent = apiContent.replace(
  /modificado_por: string;/g,
  'modificado_por: string;\n  motivo?: string;'
);

fs.writeFileSync(apiFile, apiContent);

const confFile = 'app/src/components/Gerencia/ConfiguracionMetas.tsx';
let confContent = fs.readFileSync(confFile, 'utf8');

// Add editMotivo state
confContent = confContent.replace(
  'const [editValor, setEditValor] = useState(\'\');',
  'const [editValor, setEditValor] = useState(\'\');\n  const [editMotivo, setEditMotivo] = useState(\'\');'
);

// Update handleGuardar
confContent = confContent.replace(
  'async function handleGuardar(clave: string) {\n    if (!editValor || isNaN(Number(editValor))) return;\n    setGuardando(true);\n    try {\n      await updateParametro(clave, Number(editValor));',
  'async function handleGuardar(clave: string) {\n    if (!editValor || isNaN(Number(editValor)) || !editMotivo.trim()) return;\n    setGuardando(true);\n    try {\n      await updateParametro(clave, Number(editValor), editMotivo);'
);

// Update input UI
const oldUI = `                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.1"
                            value={editValor}
                            onChange={e => setEditValor(e.target.value)}
                            className="w-24 text-right px-3 py-1.5 border border-probolsas-cyan rounded-lg focus:outline-none focus:ring-2 focus:ring-probolsas-cyan/30"
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && handleGuardar(param.clave!)}
                          />
                          <span className="text-slate-500 font-medium">{param.unidad}</span>
                          <button 
                            onClick={() => handleGuardar(param.clave!)}
                            disabled={guardando}
                            className="ml-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                          >
                            ✓
                          </button>
                          <button 
                            onClick={() => setEditando(null)}
                            disabled={guardando}
                            className="text-slate-400 hover:text-slate-600 px-2 text-xl"
                          >
                            ×
                          </button>
                        </div>`;

const newUI = `                        <div className="flex flex-col gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                          <div className="flex items-center justify-end gap-2">
                            <input
                              type="number"
                              step="0.1"
                              value={editValor}
                              onChange={e => setEditValor(e.target.value)}
                              className="w-24 text-right px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:border-indigo-500"
                              autoFocus
                            />
                            <span className="text-slate-500 font-medium">{param.unidad}</span>
                          </div>
                          <input
                            type="text"
                            placeholder="Motivo del cambio (obligatorio)"
                            value={editMotivo}
                            onChange={e => setEditMotivo(e.target.value)}
                            className="w-full sm:w-64 px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-indigo-500 bg-slate-50"
                          />
                          <div className="flex justify-end gap-2 mt-1">
                            <button 
                              onClick={() => setEditando(null)}
                              disabled={guardando}
                              className="text-slate-500 hover:text-slate-700 px-3 py-1.5 text-sm font-medium"
                            >
                              Cancelar
                            </button>
                            <button 
                              onClick={() => handleGuardar(param.clave!)}
                              disabled={guardando || !editMotivo.trim()}
                              className="bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-1.5 rounded-md text-sm font-semibold transition-colors disabled:opacity-50"
                            >
                              Guardar
                            </button>
                          </div>
                        </div>`;

confContent = confContent.replace(oldUI, newUI);

// Clear editMotivo when starting edit
confContent = confContent.replace(
  'setEditValor(String(param.valor));\n                                  setEditando(param.clave!);',
  'setEditValor(String(param.valor));\n                                  setEditMotivo(\'\');\n                                  setEditando(param.clave!);'
);

// Show motivo in history
confContent = confContent.replace(
  '<span className="text-[10px] text-slate-400">Por: {h.modificado_por}</span>',
  '<span className="text-[10px] text-slate-400">Por: {h.modificado_por}</span>\n                                {h.motivo && <span className="text-[11px] text-slate-500 font-medium mt-1">Motivo: {h.motivo}</span>}'
);

fs.writeFileSync(confFile, confContent);
