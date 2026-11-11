'use strict';

const zlib = require('zlib');

const ESCALA_DECIMAL = 100000000n; // 10^8 para aritmética exacta tipo Decimal
const DIGITOS_ESCALA = 8;

const ENTIDADES_XML = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/**
 * Decodifica entidades XML estándar y numéricas (&#123; y &#x1A;).
 * @param {string} texto
 * @returns {string}
 */
function decodificarEntidadesXml(texto) {
  if (!texto || !texto.includes('&')) return texto || '';
  return texto.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (completo, entidad) => {
    if (entidad[0] === '#') {
      const codigo = entidad[1] === 'x' || entidad[1] === 'X'
        ? parseInt(entidad.slice(2), 16)
        : parseInt(entidad.slice(1), 10);
      return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : completo;
    }
    return Object.prototype.hasOwnProperty.call(ENTIDADES_XML, entidad)
      ? ENTIDADES_XML[entidad]
      : completo;
  });
}

/**
 * Extrae el valor de un atributo en una cadena de atributos XML.
 * @param {string} attrs
 * @param {string} nombre
 * @returns {string | null}
 */
function obtenerAtributoXml(attrs, nombre) {
  if (!attrs) return null;
  const regex = new RegExp(`(?:^|\\s)${nombre}\\s*=\\s*["']([^"']*)["']`);
  const match = regex.exec(attrs);
  return match ? match[1] : null;
}

/**
 * Extrae entradas de un archivo ZIP en memoria usando el Directorio Central.
 * @param {Buffer} zipBuffer
 * @returns {Map<string, Buffer>}
 */
function extraerArchivosZip(zipBuffer) {
  const FIRMA_EOCD = 0x06054b50;
  const FIRMA_CENTRAL = 0x02014b50;
  const FIRMA_LOCAL = 0x04034b50;

  let offsetEocd = -1;
  const minOffset = Math.max(0, zipBuffer.length - 65557);
  for (let i = zipBuffer.length - 22; i >= minOffset; i--) {
    if (zipBuffer.readUInt32LE(i) === FIRMA_EOCD) {
      offsetEocd = i;
      break;
    }
  }
  if (offsetEocd === -1) {
    throw new Error('El archivo descargado de SIIGO no es un ZIP/XLSX válido');
  }

  const totalEntradas = zipBuffer.readUInt16LE(offsetEocd + 10);
  const offsetDirectorioCentral = zipBuffer.readUInt32LE(offsetEocd + 16);

  const archivos = new Map();
  let puntero = offsetDirectorioCentral;

  for (let i = 0; i < totalEntradas; i++) {
    if (zipBuffer.readUInt32LE(puntero) !== FIRMA_CENTRAL) {
      throw new Error('Estructura de directorio central ZIP inválida en reporte SIIGO');
    }

    const metodoCompresion = zipBuffer.readUInt16LE(puntero + 10);
    const tamanoComprimido = zipBuffer.readUInt32LE(puntero + 20);
    const largoNombre = zipBuffer.readUInt16LE(puntero + 28);
    const largoExtra = zipBuffer.readUInt16LE(puntero + 30);
    const largoComentario = zipBuffer.readUInt16LE(puntero + 32);
    const offsetHeaderLocal = zipBuffer.readUInt32LE(puntero + 42);

    const nombreArchivo = zipBuffer.toString('utf8', puntero + 46, puntero + 46 + largoNombre);
    puntero += 46 + largoNombre + largoExtra + largoComentario;

    if (
      nombreArchivo !== 'xl/sharedStrings.xml' &&
      nombreArchivo !== 'xl/worksheets/sheet1.xml'
    ) {
      continue;
    }

    if (zipBuffer.readUInt32LE(offsetHeaderLocal) !== FIRMA_LOCAL) {
      throw new Error(`Encabezado local ZIP inválido para ${nombreArchivo}`);
    }

    const largoNombreLocal = zipBuffer.readUInt16LE(offsetHeaderLocal + 26);
    const largoExtraLocal = zipBuffer.readUInt16LE(offsetHeaderLocal + 28);
    const inicioDatos = offsetHeaderLocal + 30 + largoNombreLocal + largoExtraLocal;
    const datosComprimidos = zipBuffer.subarray(inicioDatos, inicioDatos + tamanoComprimido);

    if (metodoCompresion === 0) {
      archivos.set(nombreArchivo, datosComprimidos);
    } else if (metodoCompresion === 8) {
      archivos.set(nombreArchivo, zlib.inflateRawSync(datosComprimidos));
    } else {
      throw new Error(`Método de compresión ZIP no soportado (${metodoCompresion}) en ${nombreArchivo}`);
    }
  }

  return archivos;
}

/**
 * Une todos los nodos <t> dentro de un fragmento XML (replica ''.join(t.text or '' for t in elem.iter(_M + 't'))).
 * @param {string} xmlFragment
 * @returns {string}
 */
function extraerTextoNodosT(xmlFragment) {
  if (!xmlFragment) return '';
  const regexT = /<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g;
  const partes = [];
  let match;
  while ((match = regexT.exec(xmlFragment)) !== null) {
    if (match[1]) {
      partes.push(decodificarEntidadesXml(match[1]));
    }
  }
  return partes.join('');
}

/**
 * Convierte una cadena numérica a unidades escaladas (BigInt * 10^8).
 * Si la cadena está vacía o no es válida, retorna 0n (igual que _num en Python).
 * @param {string | number | null | undefined} valor
 * @returns {bigint}
 */
function aUnidadesDecimal(valor) {
  if (valor === null || valor === undefined) return 0n;
  const texto = String(valor).trim();
  if (!texto) return 0n;

  // Soporte para notación científica eventual (ej. 1.5E-4) o decimal estándar
  let normalizado = texto;
  if (/e/i.test(normalizado)) {
    const num = Number(normalizado);
    if (!Number.isFinite(num)) return 0n;
    normalizado = num.toFixed(DIGITOS_ESCALA);
  }

  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(normalizado);
  if (!match || (!match[2] && !match[3])) {
    return 0n;
  }

  const signo = match[1] === '-' ? -1n : 1n;
  const parteEntera = match[2] || '0';
  const parteDecimalCruda = match[3] || '';

  const parteDecimalAjustada = parteDecimalCruda
    .slice(0, DIGITOS_ESCALA)
    .padEnd(DIGITOS_ESCALA, '0');

  const unidades = BigInt(parteEntera) * ESCALA_DECIMAL + BigInt(parteDecimalAjustada || '0');
  return signo * unidades;
}

/**
 * Formatea unidades escaladas (BigInt * 10^8) a string decimal exacto para PostgreSQL.
 * @param {bigint} unidades
 * @returns {string}
 */
function formatearUnidadesDecimal(unidades) {
  if (unidades === 0n) return '0';
  const negativo = unidades < 0n;
  const abs = negativo ? -unidades : unidades;
  const entero = abs / ESCALA_DECIMAL;
  const fraccion = abs % ESCALA_DECIMAL;

  if (fraccion === 0n) {
    return `${negativo ? '-' : ''}${entero.toString()}`;
  }

  const fraccionStr = fraccion.toString().padStart(DIGITOS_ESCALA, '0').replace(/0+$/, '');
  return `${negativo ? '-' : ''}${entero.toString()}.${fraccionStr}`;
}

/**
 * Normaliza un string numérico a string decimal exacto (equivalente a str(_num(s)) en Python).
 * @param {string} texto
 * @returns {string}
 */
function normalizarDecimal(texto) {
  return formatearUnidadesDecimal(aUnidadesDecimal(texto));
}

/**
 * Suma una lista de valores decimales de forma exacta usando BigInt.
 * @param {Array<string>} valores
 * @returns {string}
 */
function sumarDecimales(valores) {
  let total = 0n;
  for (const v of valores) {
    total += aUnidadesDecimal(v);
  }
  return formatearUnidadesDecimal(total);
}

/**
 * Indica si un valor decimal es exactamente cero.
 * @param {string} valor
 * @returns {boolean}
 */
function esDecimalCero(valor) {
  return aUnidadesDecimal(valor) === 0n;
}

/**
 * Evalúa la regla de cierre de costos: d72 + d73 > 0 y cred >= (d72 + d73) * 0.5
 * @param {string} d72
 * @param {string} d73
 * @param {string} cred
 * @returns {boolean}
 */
function cumpleReglaCierreCostos(d72, d73, cred) {
  const totalDebitos = aUnidadesDecimal(d72) + aUnidadesDecimal(d73);
  const totalCreditos = aUnidadesDecimal(cred);
  return totalDebitos > 0n && totalCreditos * 2n >= totalDebitos;
}

/**
 * Replica exactamente _leer(xlsx) de /root/siigo_api.py sobre un Buffer .xlsx.
 * @param {Buffer} xlsxBuffer
 * @returns {Array<{
 *   nivel: string,
 *   transaccional: boolean,
 *   codigo: string,
 *   nombre: string,
 *   saldo_inicial: string,
 *   debito: string,
 *   credito: string,
 *   saldo_final: string
 * }>}
 */
function leerBalanceXlsx(xlsxBuffer) {
  const archivos = extraerArchivosZip(xlsxBuffer);
  const sheetBuffer = archivos.get('xl/worksheets/sheet1.xml');
  if (!sheetBuffer) {
    throw new Error('El archivo Excel de SIIGO no contiene xl/worksheets/sheet1.xml');
  }

  const sharedStrings = [];
  const ssBuffer = archivos.get('xl/sharedStrings.xml');
  if (ssBuffer) {
    const ssXml = ssBuffer.toString('utf8');
    const regexSi = /<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g;
    let matchSi;
    while ((matchSi = regexSi.exec(ssXml)) !== null) {
      sharedStrings.push(extraerTextoNodosT(matchSi[1] || ''));
    }
  }

  const sheetXml = sheetBuffer.toString('utf8');
  const regexRow = /<(?:\w+:)?row\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
  const regexCell = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
  const regexVal = /<(?:\w+:)?v\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?v>)/;

  const filas = [];
  let matchRow;
  while ((matchRow = regexRow.exec(sheetXml)) !== null) {
    const rowContent = matchRow[1] || '';
    const fila = {};
    let indiceCelda = 0;
    regexCell.lastIndex = 0;

    let matchCell;
    while ((matchCell = regexCell.exec(rowContent)) !== null) {
      const cellAttrs = matchCell[1] || '';
      const cellContent = matchCell[2] || '';
      const tipo = obtenerAtributoXml(cellAttrs, 't');
      const ref = obtenerAtributoXml(cellAttrs, 'r');
      const matchV = regexVal.exec(cellContent);
      const tieneV = matchV !== null;
      const textoV = tieneV && matchV[1] !== undefined
        ? decodificarEntidadesXml(matchV[1])
        : '';

      let val = '';
      if (tipo === 's' && tieneV) {
        const idx = parseInt(textoV, 10);
        val = sharedStrings[idx] ?? '';
      } else if (tipo === 'inlineStr') {
        val = extraerTextoNodosT(cellContent);
      } else {
        val = tieneV ? textoV : '';
      }

      const letrasRef = ref ? ref.replace(/[^A-Za-z]/g, '') : '';
      const claveColumna = letrasRef || String(indiceCelda);
      fila[claveColumna] = (val || '').trim();
      indiceCelda++;
    }
    filas.push(fila);
  }

  const encabezado = filas.find((f) => {
    const valores = Object.values(f);
    return valores.includes('Código cuenta contable') && valores.includes('Saldo final');
  });

  if (!encabezado) {
    throw new Error('el Excel no trae los encabezados esperados (¿cambió el formato del reporte?)');
  }

  const mapaColumnas = {};
  for (const [colLetra, nombreCol] of Object.entries(encabezado)) {
    mapaColumnas[nombreCol] = colLetra;
  }

  const obtenerCelda = (fila, nombreCol) => {
    const colLetra = mapaColumnas[nombreCol];
    return colLetra ? (fila[colLetra] ?? '') : '';
  };

  const resultado = [];
  for (const f of filas) {
    const cod = obtenerCelda(f, 'Código cuenta contable');
    if (!/^\d+$/.test(cod)) {
      continue;
    }
    const transaccionalRaw = obtenerCelda(f, 'Transaccional').toLowerCase();
    resultado.push({
      nivel: obtenerCelda(f, 'Nivel'),
      transaccional: transaccionalRaw === 'sí' || transaccionalRaw === 'si',
      codigo: cod,
      nombre: obtenerCelda(f, 'Nombre Cuenta contable'),
      saldo_inicial: normalizarDecimal(obtenerCelda(f, 'Saldo Inicial')),
      debito: normalizarDecimal(obtenerCelda(f, 'Movimiento Débito')),
      credito: normalizarDecimal(obtenerCelda(f, 'Movimiento Crédito')),
      saldo_final: normalizarDecimal(obtenerCelda(f, 'Saldo final')),
    });
  }

  return resultado;
}

module.exports = {
  leerBalanceXlsx,
  normalizarDecimal,
  sumarDecimales,
  esDecimalCero,
  cumpleReglaCierreCostos,
};
