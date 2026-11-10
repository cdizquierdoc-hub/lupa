/**
 * LUPA — backend gratis en Google Sheets + Apps Script.
 *
 * Cómo instalar (5 minutos, ver README.md):
 * 1. Crea un Google Sheet nuevo. Menú Extensiones > Apps Script. Pega este archivo.
 * 2. Ejecuta la función `setup` una vez (te pedirá permisos de Sheets y Drive).
 * 3. Implementar > Nueva implementación > Aplicación web.
 *    Ejecutar como: Yo. Quién tiene acceso: Cualquier persona.
 * 4. Copia la URL que termina en /exec y pégala en index.html (CONFIG.API_URL).
 *
 * Pestañas que crea:
 *  - Catalogo : precios Black de Cresa (una fila por código y cadena). Negocios pega aquí.
 *               Solo hace falta codigo + cadena + precio; nombre, marca y categoría salen del maestro.
 *               Si la columna stock dice 0 o "no", ese producto no se ofrece.
 *  - Capturas : todo lo que fotografía el equipo, de la competencia y de nuestras cadenas
 *               (columna origen = competencia / cresa). Se llena solo.
 *  - Config   : PIN del equipo.
 */

const VERSION_SCRIPT = '2026.11.10-ia6';
const HOJA_CATALOGO = 'Catalogo';
const HOJA_CAPTURAS = 'Capturas';
const HOJA_CONFIG = 'Config';
const CARPETA_FOTOS = 'LUPA - Fotos';

const COLS_CATALOGO = ['codigo', 'cadena', 'precio_contado', 'precio_normal', 'cuota', 'num_cuotas', 'frecuencia',
  'entrada', 'plan_credito', 'promo', 'stock', 'nombre', 'marca', 'categoria'];
/* ---------- instalación ---------- */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mk = (name, cols) => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#FFD000');
      sh.setFrozenRows(1);
    }
    return sh;
  };
  mk(HOJA_CATALOGO, COLS_CATALOGO);
  mk(HOJA_CAPTURAS, COLS_CAPTURAS);
  const cfg = mk(HOJA_CONFIG, ['clave', 'valor']);
  if (cfg.getLastRow() < 2) cfg.appendRow(['pin', 'black2026']);
  const filas = cfg.getDataRange().getValues().map(r => String(r[0]).toLowerCase());
  if (filas.indexOf('gemini_key') < 0) cfg.appendRow(['gemini_key', '']);
  carpeta_();
  Logger.log('Listo. Cambia el PIN en la pestaña Config si quieres.');
}

/* ---------- web app ---------- */
function doGet(e) {
  const p = e.parameter || {};
  if (!pinOk_(p.pin)) return json_({ ok: false, error: 'pin' });
  if (p.action === 'catalogo') return json_({ ok: true, rows: leer_(HOJA_CATALOGO) });
  if (p.action === 'capturas') {
    const n = Math.min(Number(p.n) || 300, 1000);
    return json_({ ok: true, rows: capturas_(n) });
  }
  if (p.action === 'ping') return json_({ ok: true, version: VERSION_SCRIPT, ia: !!config_('gemini_key') });
  return json_({ ok: false, error: 'accion' });
}

function doPost(e) {
  try { return doPost_(e); }
  catch (err) { return json_({ ok: false, error: 'excepcion', detalle: String(err && err.message || err).slice(0, 300) }); }
}

function doPost_(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'json' }); }
  if (!pinOk_(b.pin)) return json_({ ok: false, error: 'pin' });
  if (b.action === 'guardar') return json_(guardar_(b.captura || {}, b.foto));
  if (b.action === 'leer') return json_(leerFoto_(b.foto, b.listas || {}));
  if (b.action === 'editar') return json_(editar_(b));
  return json_({ ok: false, error: 'accion' });
}

/* ---------- lectura de la foto con Gemini (nivel gratis) ----------
 * La clave va en la pestaña Config, fila "gemini_key" (o varias claves separadas por coma,
 * de proyectos distintos, para tener más lecturas gratis al día).
 * Si no hay clave o se acaba la cuota, la app usa el lector básico del teléfono. */
const MODELOS_GEMINI = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-flash-latest'];

function config_(clave) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CONFIG);
  if (!sh) return '';
  const r = sh.getDataRange().getValues().find(x => String(x[0]).trim().toLowerCase() === clave);
  return r ? String(r[1] || '').trim() : '';
}

function promptLectura_(listas) {
  const tiendas = (listas.tiendas || []).join(', ');
  const repo = listas.repo || { lineas: [], marcas: [] };
  const lineas = (repo.lineas || []).map(l => '- ' + l.linea + ' (' + l.categoria + '): grupos ' + (l.grupos || []).join(', ')).join('\n');
  const marcas = (repo.marcas || []).join(', ');
  return [
    'Eres el lector de preciadores de Cresa, un retail de electrodomésticos en Ecuador.',
    'La foto muestra un preciador, cartel, sticker o hoja de crédito, impresa, digital, de tinta electrónica o escrita a mano.',
    'Extrae SOLO lo que se ve en la foto. Si algo no se ve, usa null. No inventes ni completes con conocimiento externo.',
    '',
    'Tipos de preciador frecuentes (lee cada número según su rótulo):',
    '1) Etiqueta de tinta electrónica (blanca, sin logo): nombre arriba; "PVP" pequeño o tachado = precio_antes; el número grande con "OFERTA" = precio_contado; el código va al pie en letra pequeña.',
    '2) Sticker de precio con el nombre de la tienda ("PRECIO GANGA", "PRECIO PROMO"): el número grande es precio_contado. Si hay una leyenda "CONTADO" / "TARJETA CRÉDITO" o "CUOTA CRÉDITO", es solo una leyenda para saber qué es cada número: no es un valor.',
    '3) Sticker de campaña ("Black Days", "Unidades limitadas") sobre una tarjeta con precio grande: ese precio es precio_contado. La línea de abajo trae el modelo y la descripción.',
    '4) Hoja de crédito (tabla con encabezado tipo "Ganguitas Mensuales" o "Cuotas"): el número grande del encabezado es la cuota mensual si dice mensual; y en la tabla: PVP* = pvp_lista (precio de lista de la hoja); CUOTA INICIAL = entrada; CUOTA MENSUAL = cuota; NO. DE CUOTAS = num_cuotas; PRECIO FINAL = precio_final (total a crédito, NUNCA contado). Si la hoja aparece cortada y no se leen sus campos, no los inventes: escribe aviso.',
    '5) Caja digital o cartel con un número grande y la frase "llévalo en cuotas" o un logo de crédito (ej. "emma"): si el número dice "precio ahorro", "precio contado" o no tiene rótulo de cuota, es precio_contado. La frase "llévalo en cuotas" por sí sola NO convierte el número en cuota. Si el cartel habla de cuotas pero el número no dice si es contado o cuota, ponlo como precio_contado y escribe aviso.',
    '',
    'Qué significa "PVP" (es la palabra más confusa):',
    '- En una hoja de crédito, PVP* es el precio de venta de lista de la hoja: va a pvp_lista, no a precio_antes.',
    '- En una etiqueta, "PVP" o un precio tachado junto a OFERTA o PROMO es el precio anterior: va a precio_antes.',
    '',
    'Rótulos:',
    '- Contado: contado, precio contado, precio ahorro, precio promo, precio ganga, precio black, oferta, efectivo, precio final (solo si no está en una hoja de crédito), o un número grande sin rótulo de crédito.',
    '- Cuota: cuota, cuotas, al mes, mensual, quincenal, semanal, x 12, a 12 meses, crédito, emma, Ganguita, Ganguitas, desde ... al mes.',
    '- Entrada: entrada, cuota inicial, inicial, abono.',
    '- Número de cuotas: "12 cuotas", "x 12", "a 12 meses", "NO. DE CUOTAS".',
    '- Frecuencia: mensual si dice mes; quincenal si dice quincena; semanal si dice semana.',
    '- Regalo o promo: gratis, regalo, lleva, obsequio, 2x1, combo, bono.',
    '',
    'Reglas de precios (muy importante):',
    '- Un precio sin palabras de crédito es PRECIO DE CONTADO.',
    '- Un número unido a una palabra de crédito (cuota, Ganguita, mes, meses, x 12) es CUOTA, nunca contado.',
    '- Nunca pongas una cuota en precio_contado ni el precio de contado en cuota.',
    '- Si solo se ve una cuota y no hay precio de contado, precio_contado null y aviso: "Solo se ve la cuota: confirma si hay precio de contado".',
    '- Si se ve la cuota pero no el número de cuotas, num_cuotas null y aviso.',
    '- Los precios van como número con punto decimal (250, 1299.99), sin símbolo.',
    '',
    'Clasificación con el repositorio de Cresa (OBLIGATORIO usar solo estas opciones, tal como están escritas):',
    'linea: una de las líneas de esta lista. grupo: uno de los grupos de esa línea. Si no encaja ninguna, null.',
    'Líneas y sus grupos:',
    lineas,
    'marca: una de estas marcas, tal como está escrita. Si la marca no está en la lista, null.',
    'Marcas: ' + marcas,
    'sub_grupo: el tipo específico del producto en MAYÚSCULAS, como aparece en el cartel o la caja (ej. SIDE BY SIDE, UHD, QLED, SPLIT INVERTER, A GAS, TOP MOUNT NO FROST, LAVADORA CS). Si no se sabe, null.',
    '',
    'Características del producto (muy importantes, para comparar):',
    '- medidas.litros: capacidad en litros (684L → 684; 1.5 L → 1.5).',
    '- medidas.btu: BTU tal como aparece (12BTU → 12; 12000 BTU → 12000).',
    '- medidas.pulgadas: tamaño de pantalla (43" → 43).',
    '- medidas.kg: peso o capacidad de lavado en kilos. medidas.pies3: pies cúbicos. medidas.watts: potencia.',
    '- medidas.quemadores: número de quemadores de una cocina (4 quemadores → 4).',
    '- medidas.cc: cilindrada de una moto (149 cc → 149).',
    '- especificaciones: texto corto con la tecnología y tipo visibles, separados por " · ". Ej.: "Split inverter · Blanco · Frío", "SBS · Acero inoxidable · Dispensador de agua", "QLED · Smart TV · 4K".',
    '- Usa la descripción de la caja o de la línea del modelo. Si una medida no se ve, null.',
    '',
    'Otros campos:',
    '- tienda: la cadena si se ve su nombre o logo. Opciones conocidas: ' + tiendas + '. Si no se ve, null.',
    '- codigo: el código o modelo tal como está escrito, respetando letras, números y guiones. Si no se lee, null.',
    '- producto: descripción corta (tipo + marca + medida + tecnología), por ejemplo "Split inverter 12 BTU" o "TV Philips 43\" FHD LED Smart TV".',
    '- regalo: regalo o promo que diga el cartel, o null.',
    '- aviso: null si todo se lee claro. Si hay cualquier duda, escribe UNA frase corta en español (máximo 140 caracteres): foto cortada, reflejo, dos productos, cuota sin contado, número sin rótulo, código ilegible, etc.',
    '',
    'Responde SOLO con este JSON:',
    '{"tienda":null,"producto":null,"marca":null,"codigo":null,"linea":null,"grupo":null,"sub_grupo":null,"especificaciones":null,',
    '"medidas":{"litros":null,"btu":null,"pulgadas":null,"kg":null,"pies3":null,"watts":null,"quemadores":null,"cc":null},',
    '"precio_contado":null,"precio_antes":null,"pvp_lista":null,"cuota":null,"num_cuotas":null,"frecuencia":null,"entrada":null,"precio_final":null,"plan_credito":null,',
    '"regalo":null,"aviso":null,"legible":true}'
  ].join('\n');
}

function leerFoto_(fotoBase64, listas) {
  const claves = (config_('gemini_key') || PropertiesService.getScriptProperties().getProperty('GEMINI_KEY') || '')
    .split(/[,\s]+/).filter(Boolean);
  if (!claves.length) return { ok: false, error: 'sin_clave' };
  if (!fotoBase64) return { ok: false, error: 'sin_foto' };
  const data = String(fotoBase64).replace(/^data:image\/\w+;base64,/, '');
  const preferido = config_('gemini_modelo');
  const modelos = preferido ? [preferido].concat(MODELOS_GEMINI.filter(m => m !== preferido)) : MODELOS_GEMINI;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: promptLectura_(listas) }, { inline_data: { mime_type: 'image/jpeg', data: data } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' }
  });
  let ultimo = '', detalle = '';
  for (const clave of claves) {
    for (const modelo of modelos) {
      const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent', {
        method: 'post', contentType: 'application/json', payload: body, muteHttpExceptions: true,
        headers: { 'x-goog-api-key': clave }
      });
      const code = r.getResponseCode();
      if (code === 200) {
        try {
          const j = JSON.parse(r.getContentText());
          let t = j.candidates[0].content.parts.map(x => x.text || '').join('');
          t = t.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
          return { ok: true, modelo: modelo, datos: JSON.parse(t) };
        } catch (err) { ultimo = 'respuesta'; continue; }
      }
      ultimo = String(code);
      detalle = modelo + ': ' + r.getContentText().slice(0, 200);
      if (code === 404 || code === 400) continue;      // modelo no disponible: probar el siguiente
      if (code === 429) continue;                      // cuota agotada: siguiente modelo o clave
      if (code === 403 || code === 401) break;         // clave inválida: siguiente clave
    }
  }
  return { ok: false, error: 'gemini_' + ultimo, detalle: detalle };
}

/* Para probar la clave desde el editor: elige probarGemini y dale Ejecutar. */
function probarGemini() {
  const claves = (config_('gemini_key') || '').split(/[,\s]+/).filter(Boolean);
  if (!claves.length) { Logger.log('Falta la clave: pon gemini_key en la pestaña Config.'); return; }
  for (const m of MODELOS_GEMINI) {
    const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { 'x-goog-api-key': claves[0] },
      payload: JSON.stringify({ contents: [{ parts: [{ text: 'Responde solo: ok' }] }] })
    });
    Logger.log(m + ' → ' + r.getResponseCode());
  }
}

/* ---------- lógica ---------- */
const COLS_CAPTURAS = ['id', 'fecha', 'autor', 'agencia', 'competidor', 'origen', 'producto', 'marca', 'modelo', 'categoria',
  'contado', 'antes', 'pvp_lista', 'cuota', 'num_cuotas', 'frecuencia', 'entrada', 'precio_final', 'plan', 'regalo',
  'btu', 'litros', 'pulgadas', 'kg', 'pies3', 'watts', 'especificaciones', 'foto_id', 'foto', 'texto_ocr', 'editado', 'editado_por',
  'categoria_comercial', 'linea', 'grupo', 'sub_grupo', 'capacidad'];
const CAMPOS_NUM_ = ['contado', 'antes', 'pvp_lista', 'cuota', 'num_cuotas', 'entrada', 'precio_final', 'btu', 'litros', 'pulgadas', 'kg', 'pies3', 'watts'];
const CAMPOS_EDITABLES_ = ['agencia', 'competidor', 'producto', 'marca', 'modelo', 'categoria', 'contado', 'antes', 'pvp_lista', 'cuota',
  'num_cuotas', 'frecuencia', 'entrada', 'precio_final', 'plan', 'regalo', 'btu', 'litros', 'pulgadas', 'kg', 'pies3', 'watts', 'especificaciones',
  'categoria_comercial', 'linea', 'grupo', 'sub_grupo', 'capacidad'];

/* Las columnas se buscan por nombre en la fila 1; si falta alguna, se agrega al final. Así una hoja vieja sigue sirviendo. */
function cabecera_(sh) {
  let head = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim()) : [];
  const faltan = COLS_CAPTURAS.filter(c => head.indexOf(c) < 0);
  if (faltan.length) {
    head = head.concat(faltan);
    sh.getRange(1, 1, 1, head.length).setValues([head]);
  }
  return head;
}

function guardar_(c, fotoBase64) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CAPTURAS);
    const head = cabecera_(sh);
    // evitar duplicados si el teléfono reintenta
    if (c.id && sh.getLastRow() > 1) {
      const ids = sh.getRange(2, head.indexOf('id') + 1, sh.getLastRow() - 1, 1).getValues().flat();
      if (ids.indexOf(c.id) > -1) return { ok: true, id: c.id, duplicado: true };
    }
    let fotoId = '', fotoUrl = '';
    if (fotoBase64) {
      try {
        const data = String(fotoBase64).replace(/^data:image\/\w+;base64,/, '');
        const blob = Utilities.newBlob(Utilities.base64Decode(data), 'image/jpeg',
          (c.competidor || 'foto') + '_' + Utilities.formatDate(new Date(), 'America/Guayaquil', 'yyyyMMdd_HHmmss') + '.jpg');
        const f = carpeta_().createFile(blob);
        try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) {}
        fotoId = f.getId();
        fotoUrl = f.getUrl();
      } catch (err) { /* se guarda la captura sin foto */ }
    }
    const obj = {
      id: c.id || Utilities.getUuid(), fecha: c.creado ? new Date(c.creado) : new Date(), autor: c.autor || '',
      agencia: c.agencia || '', competidor: c.competidor || '', origen: c.origen || 'competencia',
      producto: c.producto || '', marca: c.marca || '', modelo: c.modelo || '', categoria: c.categoria || '',
      contado: num_(c.contado), antes: num_(c.antes), pvp_lista: num_(c.pvp_lista), cuota: num_(c.cuota), num_cuotas: num_(c.ncuotas),
      frecuencia: c.frecuencia || '', entrada: num_(c.entrada), precio_final: num_(c.precio_final), plan: c.plan || '', regalo: c.regalo || '',
      btu: num_(c.btu), litros: num_(c.litros), pulgadas: num_(c.pulgadas), kg: num_(c.kg), pies3: num_(c.pies3), watts: num_(c.watts),
      especificaciones: c.especificaciones || '', categoria_comercial: c.categoria_comercial || '', linea: c.linea || '',
      grupo: c.grupo || '', sub_grupo: c.sub_grupo || '', capacidad: c.capacidad || '', foto_id: fotoId, foto: fotoUrl,
      texto_ocr: String(c.texto_ocr || '').slice(0, 2000), editado: '', editado_por: ''
    };
    sh.appendRow(head.map(h => obj[h] === undefined || obj[h] === null ? '' : obj[h]));
    return { ok: true, id: obj.id, fotoId: fotoId };
  } finally {
    lock.releaseLock();
  }
}

/* Edita una captura. Solo quien la capturó (mismo nombre de autor) puede cambiarla. */
function editar_(c) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CAPTURAS);
    const head = cabecera_(sh);
    if (sh.getLastRow() < 2) return { ok: false, error: 'no_encontrada' };
    const ids = sh.getRange(2, head.indexOf('id') + 1, sh.getLastRow() - 1, 1).getValues().flat().map(String);
    const i = ids.indexOf(String(c.id || ''));
    if (i < 0) return { ok: false, error: 'no_encontrada' };
    const fila = i + 2;
    const datos = sh.getRange(fila, 1, 1, head.length).getValues()[0];
    if (String(datos[head.indexOf('autor')]) !== String(c.autor || '')) return { ok: false, error: 'no_autor' };
    const campos = c.campos || {};
    CAMPOS_EDITABLES_.forEach(k => {
      if (campos[k] === undefined || head.indexOf(k) < 0) return;
      const v = CAMPOS_NUM_.indexOf(k) > -1 ? num_(campos[k]) : String(campos[k] || '');
      sh.getRange(fila, head.indexOf(k) + 1).setValue(v);
    });
    sh.getRange(fila, head.indexOf('editado') + 1).setValue(new Date());
    sh.getRange(fila, head.indexOf('editado_por') + 1).setValue(String(c.autor || ''));
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function capturas_(n) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CAPTURAS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const start = Math.max(2, last - n + 1);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const vals = sh.getRange(start, 1, last - start + 1, head.length).getValues();
  return vals.reverse().map(r => {
    const o = {};
    head.forEach((h, i) => { o[h] = r[i] instanceof Date ? r[i].getTime() : r[i]; });
    try { o.alternativas = JSON.parse(o.alternativas || '[]'); } catch (err) { o.alternativas = []; }
    delete o.texto_ocr;
    return o;
  });
}

function leer_(nombre) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  if (!sh || sh.getLastRow() < 2) return [];
  const vals = sh.getDataRange().getDisplayValues();
  const head = vals.shift().map(h => String(h).trim().toLowerCase());
  return vals.filter(r => r.some(String)).map(r => {
    const o = {};
    head.forEach((h, i) => { if (h) o[h] = r[i]; });
    return o;
  });
}

function pinOk_(pin) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CONFIG);
  if (!sh) return true;
  const rows = sh.getDataRange().getValues();
  const r = rows.find(x => String(x[0]).toLowerCase() === 'pin');
  return !r || !String(r[1]) || String(pin || '') === String(r[1]);
}

function carpeta_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (err) {} }
  const f = DriveApp.createFolder(CARPETA_FOTOS);
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}

function num_(v) { const n = Number(v); return v === '' || v === null || v === undefined || isNaN(n) ? '' : n; }

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
