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

const VERSION_SCRIPT = '2026.11.09-ia3';
const HOJA_CATALOGO = 'Catalogo';
const HOJA_CAPTURAS = 'Capturas';
const HOJA_CONFIG = 'Config';
const CARPETA_FOTOS = 'LUPA - Fotos';

const COLS_CATALOGO = ['codigo', 'cadena', 'precio_contado', 'precio_normal', 'cuota', 'num_cuotas', 'frecuencia',
  'entrada', 'plan_credito', 'promo', 'stock', 'nombre', 'marca', 'categoria'];
const COLS_CAPTURAS = ['id', 'fecha', 'autor', 'agencia', 'competidor', 'origen', 'producto', 'marca', 'modelo', 'categoria',
  'contado', 'antes', 'cuota', 'num_cuotas', 'frecuencia', 'entrada', 'plan', 'regalo',
  'veredicto', 'tipo_match', 'sku_cresa', 'diferencia', 'mejor_cadena', 'alternativas', 'en_maestro_sin_stock', 'foto_id', 'foto', 'texto_ocr'];

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
  const cats = (listas.categorias || []).join(', ');
  const tiendas = (listas.tiendas || []).join(', ');
  return [
    'Eres un asistente de un retail de electrodomésticos en Ecuador. La foto muestra un preciador o cartel de precio,',
    'impreso o escrito a mano, a veces pegado sobre la caja del producto.',
    'Extrae SOLO lo que se puede leer o ver en la foto. Si algo no se ve, usa null. No inventes ni completes con conocimiento externo.',
    'Puedes usar lo impreso en la caja (marca, serie, pulgadas, tecnología) para describir el producto.',
    '',
    'Reglas de precios (muy importante):',
    '- Un precio que aparece solo, sin palabras de crédito, es PRECIO DE CONTADO.',
    '- Es CRÉDITO solo si el cartel dice cuota, cuotas, meses, semanas, quincenas, semanal, mensual, "x 12", "desde ... al mes" o similar.',
    '- Nunca pongas una cuota en precio_contado ni el precio de contado en cuota.',
    '- precio_antes solo si hay un precio tachado o que diga antes/PVP/precio normal.',
    '- Los precios van como número en dólares (250, 1299.99), sin símbolo.',
    '',
    'Otros campos:',
    '- tienda: la cadena que pone el cartel si se ve su nombre o logo. Opciones conocidas: ' + tiendas + '. Si no se ve, null.',
    '- codigo: el código o modelo tal como está escrito (a mano o impreso), respetando letras, números y guiones.',
    '- categoria: una de: ' + cats + '.',
    '- producto: descripción corta y clara (tipo + marca + medida + tecnología), por ejemplo "TV Philips 43\" FHD LED Smart TV".',
    '- frecuencia de la cuota: mensual, quincenal o semanal; null si no se sabe.',
    '- regalo: regalos o promos extra que diga el cartel (ej. "Remate de bodega", "lleva licuadora gratis").',
    '',
    'Responde SOLO con este JSON:',
    '{"tienda":null,"producto":null,"marca":null,"codigo":null,"categoria":null,"precio_contado":null,"precio_antes":null,',
    '"cuota":null,"num_cuotas":null,"frecuencia":null,"entrada":null,"plan_credito":null,"regalo":null,"legible":true}'
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
function guardar_(c, fotoBase64) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CAPTURAS);
    // evitar duplicados si el teléfono reintenta
    if (c.id) {
      const ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().flat() : [];
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
    const fecha = c.creado ? new Date(c.creado) : new Date();
    const row = [c.id || Utilities.getUuid(), fecha, c.autor, c.agencia, c.competidor, c.origen || 'competencia', c.producto, c.marca, c.modelo, c.categoria,
      num_(c.contado), num_(c.antes), num_(c.cuota), num_(c.ncuotas), c.frecuencia, num_(c.entrada), c.plan, c.regalo,
      c.veredicto, c.tipo_match, c.sku_cresa, num_(c.diferencia), c.mejor_cadena, JSON.stringify(c.alternativas || []), c.en_maestro_sin_stock, fotoId, fotoUrl,
      String(c.texto_ocr || '').slice(0, 2000)];
    sh.appendRow(row.map(v => v === undefined || v === null ? '' : v));
    return { ok: true, id: row[0], fotoId: fotoId };
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
