/**
 * Generador vectorial de comprobantes contables en formato PDF 1.4 (WinAnsiEncoding).
 * Produce un Uint8Array listo para empaquetarse en JSZip como archivo .pdf real.
 */

export interface ComprobanteItemRow {
  readonly index: number;
  readonly cuentaContable: string;
  readonly tercero: string;
  readonly detalle: string;
  readonly descripcion: string;
  readonly debito: string;
  readonly credito: string;
}

export interface ComprobantePdfData {
  readonly title: string;
  readonly instructionsLines: readonly string[];
  readonly docCode: string;
  readonly docLabel: string;
  readonly fechaElaboracion: string;
  readonly rows: readonly ComprobanteItemRow[];
  readonly totalDebito: string;
  readonly totalCredito: string;
  readonly observation: string;
}

const PDF_COLORS = {
  brandGreen: '0.180 0.490 0.196',
  brandLightGreen: '0.545 0.765 0.290',
  black: '0 0 0',
  darkGray: '0.4 0.4 0.4',
  borderGray: '0.8 0.8 0.8',
  dashedGray: '0.6 0.6 0.6',
  headerFillGray: '0.933 0.933 0.933',
  instructionsFillGray: '0.980 0.980 0.980',
  white: '1 1 1',
} as const;

const PDF_METRICS = {
  pageWidth: 612,
  pageHeight: 792,
  marginX: 30,
  marginTop: 36,
  marginBottom: 36,
  boxPadding: 18,
  titleFontSize: 14,
  logoTitleFontSize: 16,
  logoSubFontSize: 8.5,
  companyBoldFontSize: 9.5,
  companyRegularFontSize: 8,
  instructionsFontSize: 8.5,
  tableHeaderFontSize: 8,
  tableCellFontSize: 7.5,
  totalsFontSize: 8.5,
  observationFontSize: 8.5,
  watermarkFontSize: 7.5,
  lineHeightFactor: 1.35,
  cellPaddingX: 4,
  cellPaddingY: 4,
  colWidths: [22, 136, 106, 50, 78, 62, 62] as const,
} as const;

const TABLE_HEADERS = [
  '#',
  'Cuenta contable',
  'Tercero',
  'Detalle',
  'Descripción',
  'Débito',
  'Crédito',
] as const;

/**
 * Convierte un texto UTF-16 de JavaScript a una secuencia escapada compatible con PDF WinAnsiEncoding.
 */
function toPdfLiteralString(text: string): string {
  let out = '(';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x28) {
      out += '\\(';
    } else if (code === 0x29) {
      out += '\\)';
    } else if (code === 0x5c) {
      out += '\\\\';
    } else if (code >= 0x20 && code <= 0x7e) {
      out += text[i];
    } else if (code >= 0xa0 && code <= 0xff) {
      out += '\\' + code.toString(8).padStart(3, '0');
    } else if (code === 0x2013 || code === 0x2014) {
      out += '-';
    } else if (code === 0x2022) {
      out += '-';
    } else {
      out += ' ';
    }
  }
  out += ')';
  return out;
}

/**
 * Estima el ancho en puntos de una cadena usando métricas promedio de Helvetica.
 */
function estimateTextWidth(text: string, fontSize: number, isBold: boolean): number {
  const avgFactor = isBold ? 0.56 : 0.52;
  return text.length * fontSize * avgFactor;
}

/**
 * Divide un texto en líneas para que cada una quepa en maxWidth puntos.
 */
function wrapText(text: string, maxWidth: number, fontSize: number, isBold = false): string[] {
  const clean = (text || '').trim();
  if (!clean) return [''];

  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (estimateTextWidth(candidate, fontSize, isBold) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function drawTextCmd(
  text: string,
  x: number,
  y: number,
  font: 'F1' | 'F2',
  fontSize: number,
  colorRgb: string
): string {
  return [
    'BT',
    `${colorRgb} rg`,
    `/${font} ${fontSize.toFixed(2)} Tf`,
    `1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`,
    `${toPdfLiteralString(text)} Tj`,
    'ET',
  ].join('\n');
}

function drawAlignedTextCmd(
  text: string,
  cellX: number,
  cellWidth: number,
  y: number,
  align: 'left' | 'center' | 'right',
  font: 'F1' | 'F2',
  fontSize: number,
  colorRgb: string,
  paddingX: number = PDF_METRICS.cellPaddingX
): string {
  const isBold = font === 'F2';
  const w = estimateTextWidth(text, fontSize, isBold);
  let x = cellX + paddingX;
  if (align === 'center') {
    x = cellX + Math.max(paddingX, (cellWidth - w) / 2);
  } else if (align === 'right') {
    x = cellX + Math.max(paddingX, cellWidth - paddingX - w);
  }
  return drawTextCmd(text, x, y, font, fontSize, colorRgb);
}

function drawRectCmd(
  x: number,
  y: number,
  w: number,
  h: number,
  strokeRgb: string | null,
  fillRgb: string | null,
  dashed = false,
  lineWidth = 0.75
): string {
  const cmds: string[] = ['q', `${lineWidth.toFixed(2)} w`];
  if (dashed) {
    cmds.push('[3 3] 0 d');
  }
  if (strokeRgb) {
    cmds.push(`${strokeRgb} RG`);
  }
  if (fillRgb) {
    cmds.push(`${fillRgb} rg`);
  }
  cmds.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
  if (fillRgb && strokeRgb) {
    cmds.push('B');
  } else if (fillRgb) {
    cmds.push('f');
  } else {
    cmds.push('S');
  }
  cmds.push('Q');
  return cmds.join('\n');
}

/**
 * Construye el archivo PDF completo (como Uint8Array) para un comprobante de cierre.
 */
export function buildComprobantePdfBytes(data: ComprobantePdfData): Uint8Array {
  const pagesOps: string[][] = [];
  let curOps: string[] = [];
  pagesOps.push(curOps);

  const outerX = PDF_METRICS.marginX;
  const outerW = PDF_METRICS.pageWidth - PDF_METRICS.marginX * 2;
  const innerX = outerX + PDF_METRICS.boxPadding;
  const innerW = outerW - PDF_METRICS.boxPadding * 2;

  let cursorY = PDF_METRICS.pageHeight - PDF_METRICS.marginTop;

  // 1. Título principal centrado en verde
  cursorY -= PDF_METRICS.titleFontSize;
  curOps.push(
    drawAlignedTextCmd(
      data.title,
      outerX,
      outerW,
      cursorY,
      'center',
      'F2',
      PDF_METRICS.titleFontSize,
      PDF_COLORS.brandGreen,
      0
    )
  );
  cursorY -= 16;

  // 2. Caja punteada de instrucciones
  const instrLineH = PDF_METRICS.instructionsFontSize * PDF_METRICS.lineHeightFactor;
  const instrBoxH = 14 + (data.instructionsLines.length + 1) * instrLineH;
  const instrBoxY = cursorY - instrBoxH;

  curOps.push(
    drawRectCmd(
      outerX,
      instrBoxY,
      outerW,
      instrBoxH,
      PDF_COLORS.dashedGray,
      PDF_COLORS.instructionsFillGray,
      true,
      0.8
    )
  );

  let instrTextY = cursorY - 12;
  curOps.push(
    drawTextCmd(
      'Instrucciones:',
      outerX + 10,
      instrTextY,
      'F2',
      PDF_METRICS.instructionsFontSize,
      PDF_COLORS.black
    )
  );

  for (const line of data.instructionsLines) {
    instrTextY -= instrLineH;
    curOps.push(
      drawTextCmd(
        line,
        outerX + 10,
        instrTextY,
        'F1',
        PDF_METRICS.instructionsFontSize,
        PDF_COLORS.black
      )
    );
  }

  cursorY = instrBoxY - 14;
  const boxTopY = cursorY;
  cursorY -= PDF_METRICS.boxPadding;

  // 3. Encabezado del comprobante (Logo, Empresa, Tabla de Documento)
  const headerTopY = cursorY;

  // 3a. Logo Probolsas
  curOps.push(
    drawTextCmd(
      'Probolsas',
      innerX,
      headerTopY - 14,
      'F2',
      PDF_METRICS.logoTitleFontSize,
      PDF_COLORS.brandGreen
    )
  );
  curOps.push(
    drawTextCmd(
      'empaques',
      innerX + 2,
      headerTopY - 24,
      'F2',
      PDF_METRICS.logoSubFontSize,
      PDF_COLORS.brandLightGreen
    )
  );

  // 3b. Información de la empresa centrada
  const companyCenterW = 210;
  const companyCenterX = innerX + 105;
  const companyLines: ReadonlyArray<{ text: string; bold: boolean }> = [
    { text: 'INDUSTRIAS PLASTICAS', bold: true },
    { text: 'PROBOLSAS SAS', bold: true },
    { text: 'NIT 900.333.574-1', bold: false },
    { text: 'AV 2 1243 BARRIO SAN LUIS', bold: false },
    { text: 'Teléfono: (57) 3183409532', bold: false },
    { text: 'Cúcuta - Colombia', bold: false },
  ];

  let compY = headerTopY - 8;
  for (const cl of companyLines) {
    const fSize = cl.bold ? PDF_METRICS.companyBoldFontSize : PDF_METRICS.companyRegularFontSize;
    curOps.push(
      drawAlignedTextCmd(
        cl.text,
        companyCenterX,
        companyCenterW,
        compY,
        'center',
        cl.bold ? 'F2' : 'F1',
        fSize,
        PDF_COLORS.black,
        0
      )
    );
    compY -= fSize * 1.25;
  }

  // 3c. Tabla derecha de numeración y fecha
  const docTableW = 185;
  const docCol1W = 112;
  const docCol2W = docTableW - docCol1W;
  const docTableX = innerX + innerW - docTableW;
  const row1H = 26;
  const row2H = 18;
  const row1Y = headerTopY - row1H;
  const row2Y = row1Y - row2H;

  curOps.push(
    drawRectCmd(docTableX, row1Y, docCol1W, row1H, PDF_COLORS.borderGray, PDF_COLORS.headerFillGray)
  );
  curOps.push(
    drawRectCmd(docTableX + docCol1W, row1Y, docCol2W, row1H, PDF_COLORS.borderGray, PDF_COLORS.white)
  );
  curOps.push(
    drawRectCmd(docTableX, row2Y, docCol1W, row2H, PDF_COLORS.borderGray, PDF_COLORS.headerFillGray)
  );
  curOps.push(
    drawRectCmd(docTableX + docCol1W, row2Y, docCol2W, row2H, PDF_COLORS.borderGray, PDF_COLORS.white)
  );

  curOps.push(
    drawTextCmd(data.docCode, docTableX + 5, row1Y + 15, 'F2', 7.5, PDF_COLORS.black)
  );
  const wrappedDocLabel = wrapText(data.docLabel, docCol1W - 8, 7, true);
  curOps.push(
    drawTextCmd(wrappedDocLabel[0] || '', docTableX + 5, row1Y + 6, 'F2', 7, PDF_COLORS.black)
  );
  curOps.push(
    drawAlignedTextCmd(
      `${data.docCode}-___`,
      docTableX + docCol1W,
      docCol2W,
      row1Y + 10,
      'center',
      'F2',
      8.5,
      PDF_COLORS.black
    )
  );

  curOps.push(
    drawTextCmd('Fecha de elaboración', docTableX + 5, row2Y + 6, 'F2', 7.5, PDF_COLORS.black)
  );
  curOps.push(
    drawAlignedTextCmd(
      data.fechaElaboracion,
      docTableX + docCol1W,
      docCol2W,
      row2Y + 6,
      'center',
      'F1',
      8,
      PDF_COLORS.black
    )
  );

  cursorY = Math.min(compY, row2Y) - 14;

  // Helper para dibujar el encabezado de la tabla de asientos
  const drawTableHeader = (yTop: number): number => {
    const h = 18;
    const yBottom = yTop - h;
    let colX = innerX;
    for (let c = 0; c < TABLE_HEADERS.length; c++) {
      const colW = PDF_METRICS.colWidths[c];
      curOps.push(
        drawRectCmd(colX, yBottom, colW, h, PDF_METRICS.pageWidth ? PDF_COLORS.borderGray : null, PDF_COLORS.headerFillGray)
      );
      curOps.push(
        drawAlignedTextCmd(
          TABLE_HEADERS[c],
          colX,
          colW,
          yBottom + 6,
          'center',
          'F2',
          PDF_METRICS.tableHeaderFontSize,
          PDF_COLORS.black
        )
      );
      colX += colW;
    }
    return yBottom;
  };

  const drawWatermarkAndBorder = (ops: string[], topY: number, bottomY: number): void => {
    const boxH = topY - bottomY;
    // Borde contenedor
    ops.unshift(
      drawRectCmd(outerX, bottomY, outerW, boxH, PDF_COLORS.borderGray, null, false, 0.8)
    );
    // Marca de agua lateral rotada 90 grados
    const wmX = outerX + outerW - 7;
    const wmY = bottomY + Math.max(40, (boxH - 130) / 2);
    ops.push(
      [
        'BT',
        `${PDF_COLORS.darkGray} rg`,
        `/F1 ${PDF_METRICS.watermarkFontSize.toFixed(2)} Tf`,
        `0 1 -1 0 ${wmX.toFixed(2)} ${wmY.toFixed(2)} Tm`,
        `${toPdfLiteralString('Elaborado por Dashboard Gerencial')} Tj`,
        'ET',
      ].join('\n')
    );
  };

  cursorY = drawTableHeader(cursorY);

  let currentBoxTopY = boxTopY;
  const minPageY = PDF_METRICS.marginBottom + 65;

  // 4. Filas de la tabla
  for (const row of data.rows) {
    const cellsText = [
      String(row.index),
      row.cuentaContable,
      row.tercero,
      row.detalle,
      row.descripcion,
      row.debito,
      row.credito,
    ];
    const aligns: ReadonlyArray<'left' | 'center' | 'right'> = [
      'center',
      'left',
      'left',
      'left',
      'left',
      'right',
      'right',
    ];

    const wrappedCells = cellsText.map((txt, idx) =>
      wrapText(
        txt,
        PDF_METRICS.colWidths[idx] - PDF_METRICS.cellPaddingX * 2,
        PDF_METRICS.tableCellFontSize,
        false
      )
    );
    const maxLines = Math.max(1, ...wrappedCells.map((lines) => lines.length));
    const lineStep = PDF_METRICS.tableCellFontSize * PDF_METRICS.lineHeightFactor;
    const rowH = maxLines * lineStep + PDF_METRICS.cellPaddingY * 2;

    if (cursorY - rowH < minPageY) {
      drawWatermarkAndBorder(curOps, currentBoxTopY, cursorY - PDF_METRICS.boxPadding);
      curOps = [];
      pagesOps.push(curOps);
      currentBoxTopY = PDF_METRICS.pageHeight - PDF_METRICS.marginTop;
      cursorY = currentBoxTopY - PDF_METRICS.boxPadding;
      cursorY = drawTableHeader(cursorY);
    }

    const rowBottomY = cursorY - rowH;
    let colX = innerX;

    for (let c = 0; c < wrappedCells.length; c++) {
      const colW = PDF_METRICS.colWidths[c];
      curOps.push(drawRectCmd(colX, rowBottomY, colW, rowH, PDF_COLORS.borderGray, null));
      const lines = wrappedCells[c];
      let lineY = cursorY - PDF_METRICS.cellPaddingY - PDF_METRICS.tableCellFontSize + 1;
      for (const line of lines) {
        curOps.push(
          drawAlignedTextCmd(
            line,
            colX,
            colW,
            lineY,
            aligns[c],
            'F1',
            PDF_METRICS.tableCellFontSize,
            PDF_COLORS.black
          )
        );
        lineY -= lineStep;
      }
      colX += colW;
    }

    cursorY = rowBottomY;
  }

  // 5. Fila de Totales
  cursorY -= 16;
  const debitoColX =
    innerX +
    PDF_METRICS.colWidths[0] +
    PDF_METRICS.colWidths[1] +
    PDF_METRICS.colWidths[2] +
    PDF_METRICS.colWidths[3] +
    PDF_METRICS.colWidths[4];
  const creditoColX = debitoColX + PDF_METRICS.colWidths[5];

  curOps.push(
    drawAlignedTextCmd(
      'Total',
      debitoColX - 55,
      50,
      cursorY,
      'right',
      'F2',
      PDF_METRICS.totalsFontSize,
      PDF_COLORS.black
    )
  );
  curOps.push(
    drawAlignedTextCmd(
      data.totalDebito,
      debitoColX,
      PDF_METRICS.colWidths[5],
      cursorY,
      'right',
      'F2',
      PDF_METRICS.totalsFontSize,
      PDF_COLORS.black
    )
  );
  curOps.push(
    drawAlignedTextCmd(
      data.totalCredito,
      creditoColX,
      PDF_METRICS.colWidths[6],
      cursorY,
      'right',
      'F2',
      PDF_METRICS.totalsFontSize,
      PDF_COLORS.black
    )
  );

  // 6. Observaciones
  cursorY -= 24;
  curOps.push(
    drawTextCmd(
      'Observaciones',
      innerX,
      cursorY,
      'F2',
      PDF_METRICS.observationFontSize,
      PDF_COLORS.black
    )
  );
  cursorY -= 12;
  curOps.push(
    drawTextCmd(
      data.observation,
      innerX,
      cursorY,
      'F1',
      PDF_METRICS.observationFontSize,
      PDF_COLORS.black
    )
  );

  const finalBoxBottomY = cursorY - PDF_METRICS.boxPadding;
  drawWatermarkAndBorder(curOps, currentBoxTopY, finalBoxBottomY);

  // 7. Ensamblar objetos PDF 1.4 con tabla xref exacta en bytes
  const bytes: number[] = [];
  const pushAscii = (str: string): void => {
    for (let i = 0; i < str.length; i++) {
      bytes.push(str.charCodeAt(i) & 0xff);
    }
  };

  pushAscii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  // Objetos:
  // 1: Catalog
  // 2: Pages
  // 3: Font F1 (Helvetica)
  // 4: Font F2 (Helvetica-Bold)
  // Por cada página i (0..N-1):
  //   5 + i*2: Page object
  //   6 + i*2: Content stream object
  const totalObjects = 4 + pagesOps.length * 2;
  const offsets: number[] = new Array(totalObjects + 1).fill(0);

  const startObj = (id: number): void => {
    offsets[id] = bytes.length;
    pushAscii(`${id} 0 obj\n`);
  };
  const endObj = (): void => {
    pushAscii('\nendobj\n');
  };

  startObj(1);
  pushAscii('<< /Type /Catalog /Pages 2 0 R >>');
  endObj();

  const kidsRefs = pagesOps.map((_, idx) => `${5 + idx * 2} 0 R`).join(' ');
  startObj(2);
  pushAscii(`<< /Type /Pages /Kids [${kidsRefs}] /Count ${pagesOps.length} >>`);
  endObj();

  startObj(3);
  pushAscii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  endObj();

  startObj(4);
  pushAscii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  endObj();

  for (let i = 0; i < pagesOps.length; i++) {
    const pageObjId = 5 + i * 2;
    const streamObjId = 6 + i * 2;
    const streamContent = pagesOps[i].join('\n') + '\n';

    startObj(pageObjId);
    pushAscii(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_METRICS.pageWidth} ${PDF_METRICS.pageHeight}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamObjId} 0 R >>`
    );
    endObj();

    startObj(streamObjId);
    pushAscii(`<< /Length ${streamContent.length} >>\nstream\n${streamContent}endstream`);
    endObj();
  }

  const xrefOffset = bytes.length;
  pushAscii(`xref\n0 ${totalObjects + 1}\n`);
  pushAscii('0000000000 65535 f \n');
  for (let id = 1; id <= totalObjects; id++) {
    pushAscii(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  }

  pushAscii(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  return new Uint8Array(bytes);
}
