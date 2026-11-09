/* CHISME — clasificación y comparación por descripción.
   Los códigos y nombres de la competencia casi nunca coinciden con los de Cresa, así que
   cada producto se convierte en atributos comparables:
     categoría · tipo (no frost, QLED, doble tanque, split inverter…) · medida (pulgadas,
     litros, kg, BTU, quemadores, cc, plazas, GB) · marca · parecido del texto (trigramas).
   Con eso se encuentra el mismo modelo, un equivalente o el más parecido que sí vendemos.
   Funciona en el navegador (window.Matcher) y en Node (require) para pruebas. */
(function (root) {
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const compact = s => norm(s).replace(/[^a-z0-9]/g, "");

  const CATS = ["Refrigeración", "Cocinas", "Lavado", "Televisores", "Audio", "Celulares", "Computación", "Climatización",
    "Pequeños electrodomésticos", "Muebles y colchones", "Motos", "Hogar y menaje", "Accesorios", "Otros"];

  /* ---------- categoría desde el maestro de Cresa (linea / grupo / sub) ---------- */
  function catFromMaster(r) {
    const l = norm(r.linea), g = norm(r.grupo), sub = norm(r.sub + " " + r.cap);
    if (/accesorio/.test(l + " " + g)) return "Accesorios";
    if (l === "refrigeracion" || /refriger|minibar|congelador|vitrina/.test(g)) return "Refrigeración";
    if (l === "lavado y secado" || /lavadora|secadora/.test(g)) return "Lavado";
    if (l === "tv y video") return /televisor/.test(g) ? "Televisores" : "Accesorios";
    if (l === "climatizacion") return "Climatización";
    if (l === "motocicletas" || l === "scooter") return "Motos";
    if (l === "telefonia") return /celular|movil/.test(g) ? "Celulares" : "Accesorios";
    if (l === "computacion") return "Computación";
    if (l === "audio") return "Audio";
    if (l === "cocina" || g === "cocinas") return "Cocinas";
    if (l === "electrodomesticos") return "Pequeños electrodomésticos";
    if (l === "muebles") return "Muebles y colchones";
    if (l === "hogar" || l === "menaje") return "Hogar y menaje";
    return "Otros";
  }

  /* ---------- categoría desde texto libre ---------- */
  const CAT_KW = [
    ["Refrigeración", /refri|refriger|nevera|congelador|frigobar|minibar|vitrina|no ?frost|side by side|french door/],
    ["Lavado", /lavadora|secadora|lava ?y ?seca|lavaseca|doble tina|doble tanque/],
    ["Climatización", /aire acondicionado|split|btu|climatizador/],
    ["Televisores", /televisor|smart ?tv|\btv\b|\bled\b.*\d{2}|qled|oled|\buhd\b|\b4k\b|pulgadas/],
    ["Cocinas", /\bcocina\b|cocineta|encimera|quemador|horno empotrable|extractor de olores|campana/],
    ["Celulares", /celular|smartphone|galaxy|iphone|redmi|\bmoto g|honor|\bgb\b.*\bram\b|\d+\s*\+\s*\d+\s*gb/],
    ["Computación", /laptop|portatil|notebook|computador|tablet|\bcore i\d|ryzen|impresora/],
    ["Audio", /parlante|minicomponente|barra de sonido|torre de sonido|audifono|equipo de sonido|bocina/],
    ["Motos", /\bmoto\b|motocicleta|\b\d{2,3}\s?cc\b|scooter|enduro/],
    ["Muebles y colchones", /colchon|sofa|comedor|\bcama\b|juego de sala|box ?spring|armario|plazas/],
    ["Pequeños electrodomésticos", /licuadora|microondas|freidora|air ?fryer|olla|arrocera|cafetera|plancha|batidora|extractor de jugo|sanduchera|tostador|aspiradora|hidrolavadora/],
  ];
  function catFromText(t) {
    const n = " " + norm(t) + " ";
    for (const [c, re] of CAT_KW) if (re.test(n)) return c;
    return "";
  }

  /* ---------- tipo: grupos excluyentes por categoría ---------- */
  const TIPOS = {
    refri: [["sidebyside", /side ?by ?side|\bsbs\b/], ["frenchdoor", /french ?door|4 puertas|multi ?door/], ["bottom", /bottom|congelador inferior/],
            ["minibar", /minibar|frigobar|mini ?bar/], ["congelador", /congelador(?! inferior)|\bfreezer\b/], ["vitrina", /vitrina|exhibidor/], ["topmount", /top ?mount|2 puertas|dos puertas/]],
    frio: [["nofrost", /no ?frost|nofrost/], ["frost", /\bfrost\b|defrost|cycle/]],
    tv: [["oled", /\boled\b/], ["miniled", /mini ?led|neo ?qled|qd ?mini/], ["qled", /\bqled\b|qned|nano/], ["uhd", /\buhd\b|\b4k\b/], ["fhd", /\bfhd\b|full ?hd|1080/], ["hd", /\bhd\b|720/]],
    lav: [["lavaseca", /lava ?y ?seca|lavaseca|lavasecadora|washer ?dryer/], ["secadora", /\bsecadora\b/], ["dobletanque", /doble (tanque|tina)|semi ?autom/],
          ["frontal", /frontal|carga frontal/], ["superior", /carga superior|automatica|\bcs\b|top ?load/]],
    coc: [["induccion", /induccion/], ["electrica", /electrica|vitroceramica/], ["encimera", /encimera|empotrable|tope/], ["gas", /\bgas\b|quemador/]],
    aire: [["portatil", /portatil/], ["ventana", /ventana/], ["cassette", /cassette|piso techo/], ["split", /split/]],
    inverter: [["inverter", /inverter|ahorrador/], ["onoff", /on ?off|convencional/]],
    cpu: [["t9", /core ?i9|ryzen ?9|ultra ?9/], ["t7", /core ?i7|ryzen ?7|ultra ?7|\bm[1-4] ?pro/], ["t5", /core ?i5|ryzen ?5|ultra ?5|\bm[1-4]\b/], ["t3", /core ?i3|ryzen ?3|athlon|celeron|pentium|\bn\d{3,4}\b/]],
    moto: [["scooter", /scooter/], ["deportiva", /deportiva|sport|naked/], ["enduro", /enduro|montaner|cross|doble proposito/], ["carga", /carga|tricimoto|motocarro|cargo/], ["chopper", /chopper|custom/], ["utilitaria", /utilitaria|trabajo|street/]],
  };
  const TIPOS_POR_CAT = {
    "Refrigeración": ["refri", "frio"], "Televisores": ["tv"], "Lavado": ["lav", "inverter"], "Cocinas": ["coc"],
    "Climatización": ["aire", "inverter"], "Motos": ["moto"], "Computación": ["cpu"]
  };
  function tipos(text, cat) {
    const n = " " + norm(text) + " ";
    const out = {};
    const groups = cat && TIPOS_POR_CAT[cat] ? TIPOS_POR_CAT[cat] : Object.keys(TIPOS);
    for (const g of groups) for (const [v, re] of TIPOS[g]) if (re.test(n)) { out[g] = v; break; }
    return out;
  }

  /* ---------- medidas ---------- */
  function num(s) { return parseFloat(String(s).replace(",", ".")); }
  function medidas(text) {
    const n = " " + norm(text).replace(/(\d)\s*'\s*'/g, '$1"') + " ";
    const m = {};
    const put = (u, lo, hi) => { if (isFinite(lo) && !m[u]) m[u] = { lo, hi: isFinite(hi) ? hi : lo }; };
    let r;
    // rangos del maestro: "351 - 450LT", "10000-12000 BTU"
    if ((r = n.match(/(\d{2,4})\s*-\s*(\d{2,4})\s*(lt|lts|litros|l)\b/))) put("lt", +r[1], +r[2]);
    if ((r = n.match(/(\d{4,5})\s*-\s*(\d{4,5})\s*btu/))) put("btu", +r[1], +r[2]);
    if ((r = n.match(/(\d{2,3})\s*(?:"|pulg|pulgadas|in\b|”)/))) put("pulg", +r[1]);
    if ((r = n.match(/(\d{1,2}(?:[.,]\d)?)\s*(?:pies|p3|pie3|ft3?|cu\.? ?ft)\b/))) { const v = num(r[1]); if (v >= 2) put("lt", v * 28.3 * 0.94); else put("lt", v * 28.3); }
    if ((r = n.match(/(\d{2,4})\s*(?:lt|lts|litros|l)\b/))) put("lt", +r[1]);
    if ((r = n.match(/(\d{1,2}(?:[.,]\d)?)\s*(?:kg|kilos|kilogramos)\b/))) put("kg", num(r[1]));
    if ((r = n.match(/(\d{1,3}(?:[.,]\d)?)\s*(?:lb|lbs|libras)\b/))) put("kg", Math.round(num(r[1]) * 0.4536 * 10) / 10);
    if ((r = n.match(/(\d{4,5})\s*btu/))) put("btu", +r[1]);
    if ((r = n.match(/(\d)\s*(?:quemadores|hornillas|q\b)/))) put("quem", +r[1]);
    if ((r = n.match(/(\d(?:[.,]5)?)\s*plazas/))) put("plazas", num(r[1]));
    if ((r = n.match(/(\d{2,4})\s*cc\b/))) put("cc", +r[1]);
    if ((r = n.match(/(\d{1,2})\s*\+\s*(\d{2,4})\s*gb/))) { put("ram", +r[1]); put("gb", +r[2]); }
    else if ((r = n.match(/(\d{2,4})\s*gb/))) put("gb", +r[1]);
    return m;
  }
  // distancia relativa entre medidas de la misma unidad: 0 = igual o dentro del rango
  function distMedida(a, b) {
    if (a.lo <= b.hi && b.lo <= a.hi) return 0;
    const d = a.hi < b.lo ? b.lo - a.hi : a.lo - b.hi;
    return d / Math.max(1, (a.lo + a.hi + b.lo + b.hi) / 4);
  }

  /* ---------- texto: trigramas ---------- */
  function trigrams(s) {
    const c = compact(s), set = new Set();
    for (let i = 0; i < c.length - 2; i++) set.add(c.slice(i, i + 3));
    return set;
  }
  function dice(a, b) {
    if (!a.size || !b.size) return 0;
    let x = 0; const [s, l] = a.size < b.size ? [a, b] : [b, a];
    for (const t of s) if (l.has(t)) x++;
    return 2 * x / (a.size + b.size);
  }

  /* ---------- códigos de modelo ---------- */
  function codeKeys(code) {
    const c = compact(code);
    if (c.length < 4) return [];
    const keys = [c];
    const parts = String(code).toUpperCase().split(/[-_/\s]/).filter(Boolean);
    if (parts.length >= 2) { const base = compact(parts.slice(0, -1).join("")); if (base.length >= 5) keys.push(base); } // sin color
    return keys;
  }
  function codeScore(qModel, pModel, pText) {
    const qk = codeKeys(qModel); if (!qk.length) return 0;
    const pk = codeKeys(pModel); const pc = compact(pText);
    if (pk.length && pk[0] === qk[0]) return 1000;
    if (pk.some(k => qk.includes(k))) return 800;
    if (qk[0].length >= 6 && pk.length && (pk[0].startsWith(qk[0]) || qk[0].startsWith(pk[0]) && pk[0].length >= 6)) return 600;
    if (qk[0].length >= 6 && pc.includes(qk[0])) return 500;
    return 0;
  }

  /* ---------- perfil de un producto ---------- */
  function profile(p) {
    const text = [p.nombre, p.desc, p.sub, p.cap, p.marca, p.modelo, p.producto].filter(Boolean).join(" ");
    let cat = p.categoria ? (CATS.find(c => norm(c) === norm(p.categoria)) || catFromText(p.categoria) || "") : "";
    if (!cat) cat = (p.linea || p.grupo ? catFromMaster(p) : "") || catFromText(text);
    const med = medidas(text);
    if (cat === "Motos" && !med.cc && /^\d{2,4}$/.test(String(p.cap || "").trim())) med.cc = { lo: +p.cap, hi: +p.cap };
    // tokens de modelo comercial: "A15", "XY150", "55C655"
    const tok = new Set((norm(text).match(/[a-z0-9]+/g) || []).filter(t => t.length >= 3 && /\d/.test(t) && /[a-z]/.test(t)));
    return { cat, tipos: tipos(text, cat), med, tok, marca: compact(p.marca), modelo: p.modelo || p.cod || "", tri: trigrams(text), text };
  }

  /* ---------- puntaje de parecido ---------- */
  function score(q, p) {
    const det = {};
    let s = 0;
    const code = codeScore(q.modelo, p.modelo, p.text);
    if (code) { s += code; det.codigo = code; }
    if (q.cat && p.cat) { if (q.cat === p.cat) s += 60; else s -= 200; }
    let conflictos = 0;
    let iguales = 0;
    for (const g of Object.keys(q.tipos)) {
      if (!p.tipos[g]) continue;
      if (p.tipos[g] === q.tipos[g]) { s += 25; iguales++; } else { s -= 35; conflictos++; }
    }
    let medDir = 0, unidad = "";
    let medOk = null;
    for (const u of Object.keys(q.med)) {
      if (!p.med[u]) continue;
      const d = distMedida(q.med[u], p.med[u]);
      const w = u === "ram" || u === "gb" ? 15 : 40;
      s += w * Math.max(-0.5, 1 - d * 4); // igual: +40 · 10% distinto: +24 · 25%: 0 · más lejos resta
      if (medOk == null || d > medOk) { const qa = (q.med[u].lo + q.med[u].hi) / 2, pa = (p.med[u].lo + p.med[u].hi) / 2; medDir = d === 0 ? 0 : pa > qa ? 1 : -1; unidad = u; }
      medOk = medOk == null ? d : Math.max(medOk, d);
    }
    if (q.marca && p.marca && (q.marca === p.marca || p.marca.startsWith(q.marca) || q.marca.startsWith(p.marca))) s += 15;
    let tk = 0; for (const x of q.tok) if (p.tok.has(x)) tk++;
    s += Math.min(2, tk) * 20;
    const t = dice(q.tri, p.tri); s += t * 60;
    det.texto = Math.round(t * 100) / 100; det.conflictos = conflictos; det.iguales = iguales; det.dMedida = medOk; det.medDir = medDir; det.unidad = unidad;
    return { s, det };
  }

  function rank(q, list, n = 20) {
    const out = [];
    for (const p of list) { const r = score(q, p._prof || (p._prof = profile(p))); out.push({ p, s: r.s, det: r.det }); }
    out.sort((a, b) => b.s - a.s);
    return out.slice(0, n);
  }

  /* qué tan parecido es: mismo modelo · equivalente · parecido · ninguno */
  function nivel(q, hit) {
    if (!hit) return null;
    const { det, p } = hit; const pp = p._prof;
    if (det.codigo >= 800) return "mismo_modelo";
    if (q.cat && pp.cat && q.cat !== pp.cat) return null;
    const mismaMedida = det.dMedida != null && det.dMedida <= 0.08;
    if (det.codigo >= 500 && !det.conflictos) return "mismo_modelo";
    // mismo tipo de producto y misma medida = equivalente, aunque la marca sea otra
    const sinTipos = !Object.keys(q.tipos).length;
    if (mismaMedida && !det.conflictos && (det.iguales > 0 || sinTipos || det.texto >= 0.35 || (q.marca && pp.marca === q.marca))) return "equivalente";
    if (det.dMedida == null && !det.conflictos && det.iguales > 0 && q.cat && q.cat === pp.cat) return "equivalente";
    if (!q.cat && hit.s < 60) return null;
    return "parecido";
  }

  /* clasificar un producto de la competencia usando el maestro de Cresa (vecinos más parecidos) */
  function clasificar(q, maestro, k = 7) {
    const top = rank(q, maestro, k);
    if (!top.length) return null;
    const votos = {};
    top.forEach((h, i) => { const c = h.p._prof.cat; if (c) votos[c] = (votos[c] || 0) + (h.s > 0 ? h.s : 1) / (i + 1); });
    const cat = Object.entries(votos).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    return { cat, top };
  }

  const api = { norm, compact, CATS, catFromMaster, catFromText, tipos, medidas, distMedida, trigrams, dice, codeScore, profile, score, rank, nivel, clasificar };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Matcher = api;
})(typeof window !== "undefined" ? window : this);
