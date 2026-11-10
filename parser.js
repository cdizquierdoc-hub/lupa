/* LUPA — lectura de preciadores a partir del texto del OCR.
   Recibe las líneas que devuelve Tesseract ({text, h}) y devuelve los campos del preciador.
   Funciona en el navegador (window.CazaParser) y en Node (require) para pruebas. */
(function (root) {
  const CATEGORIAS = {
    "Refrigeración": ["refriger", "refri", "congelador", "nevera", "frigobar", "vitrina", "no frost", "pies"],
    "Cocinas": ["cocina", "horno", "quemador", "encimera", "estufa"],
    "Lavado": ["lavadora", "secadora", "lava y seca", "lavasecadora"],
    "Televisores": ["televisor", "smart tv", " tv", "led", "qled", "oled", "pulgadas", "uhd", "4k"],
    "Audio": ["parlante", "minicomponente", "barra de sonido", "torre de sonido", "audifono", "equipo de sonido"],
    "Celulares": ["celular", "smartphone", "galaxy", "iphone", "redmi", "moto g"],
    "Computación": ["laptop", "portatil", "computador", "tablet", "notebook", "impresora"],
    "Climatización": ["aire acondicionado", "split", "ventilador", "btu", "climatizador"],
    "Pequeños electrodomésticos": ["licuadora", "microondas", "freidora", "air fryer", "airfryer", "olla", "arrocera", "cafetera", "plancha", "batidora", "extractor", "sanduchera", "tostadora"],
    "Muebles y colchones": ["colchon", "sofa", "comedor", "cama", "juego de sala", "box spring"],
    "Motos": ["moto", "motocicleta", " cc", "scooter"]
  };
  const BRANDS = ["Samsung","LG","Mabe","Indurama","Whirlpool","Electrolux","Haceb","Midea","SMC","TCL","Hisense","Sony","Panasonic","Oster","Xiaomi","Redmi","Motorola","Apple","Honor","Huawei","Philips","Black+Decker","Imaca","Durex","Ecoline","Teka","Challenger","Frigidaire","Daewoo","JVC","RCA","Riviera","Innova","Umco","Lenovo","HP","Asus","Acer","Dell","Bajaj","Suzuki","Honda","Yamaha","Shineray","Daytona","Tundra","Ranger","Sukida","Thomas","Ninja","Recco","Continental","Chaide","Paraiso","Kalley","Ecomaster","Prima","Hamilton Beach","Umco","Electrolux","Infinix","Tecno","ZTE","Vivo","Oppo","Realme","Nokia","Hyundai","Sansui","Westinghouse","Global","Premier","Fujitel"];

  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  function toNumber(raw, hasDollar) {
    let s = raw.replace(/\s/g, "");
    const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
    if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    else if (lc > -1) s = (s.length - lc - 1 <= 2) ? s.replace(",", ".") : s.replace(/,/g, "");
    else if (ld > -1 && s.length - ld - 1 === 3) s = s.replace(/\./g, "");
    let n = parseFloat(s);
    if (!isFinite(n)) return null;
    // centavos en superíndice: "$89999" suele ser 899.99
    if (hasDollar && !/[.,]/.test(raw) && raw.replace(/\D/g, "").length >= 5) n = n / 100;
    return Math.round(n * 100) / 100;
  }

  const CTX = {
    cuota: /cuota|semanal|quincenal|mensual|al mes|por semana|x\s*\d{1,2}\s*(meses|semanas|quincenas|pagos|cuotas)?\b|\b\d{1,2}\s*x\b|semanas|meses|quincenas|pagos de|desde|ganguita|emma|credito/,
    normal: /antes|pvp|p\.v\.p|normal|regular|precio de lista|precio anterior|de:/,
    ahorro: /ahorr|descuento de|dcto|desc\./,
    entrada: /entrada|inicial|abono/,
    contado: /contado|oferta|ahora|efectivo|precio|hoy|black|especial|promo|solo|a:/
  };

  function parseTag(lines, opts) {
    const brandList = BRANDS.concat((opts && opts.brands) || []);
    // lines: [{text, h}] | string
    if (typeof lines === "string") lines = lines.split(/\n/).map(t => ({ text: t, h: 0 }));
    lines = lines.map(l => ({ text: String(l.text || "").replace(/\s+/g, " ").trim(), h: l.h || 0 })).filter(l => l.text);
    const full = lines.map(l => l.text).join("\n");
    const nfull = norm(full);
    const out = { producto: "", marca: "", modelo: "", categoria: "", contado: null, normal: null, cuota: null, ncuotas: null, frecuencia: "", entrada: null, plan: "", regalo: "", texto: full };

    // ---- montos
    const amounts = [];
    lines.forEach((l, i) => {
      const t = l.text;
      const prev = lines[i - 1]?.text || "";
      const ctx = norm(t) + " " + (/\d/.test(prev) ? "" : norm(prev).slice(-40));
      const re = /(\$\s*)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+[.,]\d{1,2}|\d{2,6})/g;
      let m;
      while ((m = re.exec(t))) {
        const hasDollar = !!m[1];
        const raw = m[2];
        const hasDec = /[.,]\d{1,2}$/.test(raw);
        // descartar números que no son dinero: sin $ ni decimales, salvo que el contexto sea precio
        const after = t.slice(m.index + m[0].length, m.index + m[0].length + 12).toLowerCase();
        if (/^\s*(pies|p3|pulg|"|''|lts?|litros|kg|lb|btu|cc|gb|mah|w\b|hz|mp|meses|cuotas|semanas|quincenas|pagos)/.test(after)) continue;
        if (!hasDollar && /^\s*x\b/.test(after)) continue; // "18 x $34" → 18 es el número de cuotas
        const before = t.slice(Math.max(0, m.index - 2), m.index);
        if (/[a-z]/i.test(before.slice(-1))) continue; // parte de un modelo (UN55…)
        if (!hasDollar && !hasDec && !CTX.contado.test(ctx) && !CTX.cuota.test(ctx) && !CTX.normal.test(ctx) && !CTX.entrada.test(ctx)) continue;
        const v = toNumber(raw, hasDollar);
        if (v == null || v <= 0 || v > 30000) continue;
        amounts.push({ v, i, h: l.h, ctx, hasDollar, kind: "" });
      }
    });
    for (const a of amounts) {
      const c = norm(lines[a.i].text);
      if (CTX.ahorro.test(c)) a.kind = "ahorro";
      else if (CTX.entrada.test(c)) a.kind = "entrada";
      // rótulos de precio de contado que van junto a un "llévalo en cuotas" (ej. Artefacta: "precio ahorro")
      else if (/precio ahorro|precio final|contado|ganga|oferta/.test(c) && !/cuota|mes|meses/.test(c)) a.kind = "contado";
      else if (CTX.cuota.test(c)) a.kind = "cuota";
      else if (CTX.normal.test(c)) a.kind = "normal";
      else if (CTX.contado.test(c)) a.kind = "contado";
      else if (CTX.normal.test(a.ctx)) a.kind = "normal";
      else if (CTX.cuota.test(a.ctx) && !CTX.contado.test(a.ctx)) a.kind = "cuota";
    }
    const pick = k => amounts.filter(a => a.kind === k);
    const free = () => amounts.filter(a => !a.kind);
    const byH = arr => arr.slice().sort((x, y) => (y.h - x.h) || (y.hasDollar - x.hasDollar) || (x.v - y.v));

    let cont = pick("contado");
    if (cont.length) out.contado = byH(cont)[0].v;
    else {
      const f = byH(free().filter(a => a.v >= 20));
      if (f.length) { out.contado = f[0].v; f[0].kind = "contado"; }
    }
    const nor = pick("normal");
    if (nor.length) out.normal = Math.max(...nor.map(a => a.v));
    else {
      const f = free().filter(a => out.contado != null && a.v > out.contado * 1.05);
      if (f.length) out.normal = Math.max(...f.map(a => a.v));
    }
    if (out.normal != null && out.contado != null && out.normal < out.contado) { const t = out.normal; out.normal = out.contado; out.contado = t; }
    const cu = pick("cuota");
    if (cu.length) out.cuota = Math.min(...cu.map(a => a.v));
    const en = pick("entrada");
    if (en.length) out.entrada = Math.min(...en.map(a => a.v));
    if (/sin entrada|0 entrada|entrada \$?\s?0\b/.test(nfull)) out.entrada = 0;

    // ---- número de cuotas y frecuencia
    let m = nfull.match(/(\d{1,2})\s*(cuotas|pagos|meses|semanas|quincenas)/) || nfull.match(/x\s*(\d{1,2})\b/) || nfull.match(/\b(\d{1,2})\s*x\s*\$/);
    if (m) { const n = +m[1]; if (n >= 2 && n <= 72) out.ncuotas = n; }
    if (/seman/.test(nfull)) out.frecuencia = "semanal";
    else if (/quincen/.test(nfull)) out.frecuencia = "quincenal";
    else if (/mensual|al mes|meses|mes\b/.test(nfull) && (out.cuota != null || out.ncuotas)) out.frecuencia = "mensual";
    if (out.cuota == null && out.ncuotas && out.contado) {
      const f = free().filter(a => a.v < out.contado / 2).sort((a, b) => a.v - b.v);
      if (f.length) out.cuota = f[0].v;
    }
    if (out.cuota != null && out.contado != null && out.cuota >= out.contado) out.cuota = null;

    // ---- marca
    for (const b of brandList) {
      const nb = norm(b).replace(/[^a-z0-9+ ]/g, "").trim(); if (nb.length < 2) continue;
      const re = new RegExp("(^|[^a-z])" + nb.replace(/[+]/g, "\\+") + "([^a-z]|$)");
      if (re.test(nfull)) { out.marca = b; break; }
    }
    // ---- modelo
    const mm = full.match(/\b(?:modelo|mod|cod|ref)\b\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/\.]{3,})/i);
    if (mm) out.modelo = mm[1].toUpperCase();
    else {
      const toks = full.split(/[\s,;]+/).filter(t => /^[A-Za-z0-9][A-Za-z0-9\-\/\.]{4,}$/.test(t) && /\d/.test(t) && /[A-Za-z]/.test(t) && !/^\d+[.,]?\d*(pies|lts?|kg|cc|gb|btu|pulg|mah|hz)$/i.test(t) && !/^x\d+$/i.test(t));
      const best = toks.filter(t => t === t.toUpperCase()).sort((a, b) => b.length - a.length)[0] || toks.sort((a, b) => b.length - a.length)[0];
      if (best) out.modelo = best.toUpperCase().replace(/[.\-]$/, "");
    }
    // ---- categoría y producto
    let bestCat = "", bestLine = "";
    for (const [cat, kws] of Object.entries(CATEGORIAS)) {
      const hit = kws.find(k => (" " + nfull).includes(k));
      if (hit) {
        bestCat = cat;
        bestLine = lines.find(l => (" " + norm(l.text)).includes(hit))?.text || "";
        break;
      }
    }
    out.categoria = bestCat;
    const cleanLine = s => s.replace(/\$\s*[\d.,]+/g, "").replace(/\s{2,}/g, " ").replace(/^[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]+|[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9"]+$/g, "").trim();
    if (bestLine) out.producto = cleanLine(bestLine);
    if (!out.producto) {
      const cand = lines.map(l => cleanLine(l.text)).filter(t => (t.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}/g) || []).length >= 2 && !CTX.cuota.test(norm(t)) && !CTX.normal.test(norm(t)) && !/precio|llevalo|contado|oferta|ganga|black|emma/.test(norm(t)));
      out.producto = cand.sort((a, b) => b.length - a.length)[0] || "";
    }
    out.producto = out.producto.slice(0, 90);
    // ---- plan y regalo
    const planL = lines.find(l => /credito|financ|tarjeta|diferido|sin intereses|sin entrada|directo/.test(norm(l.text)));
    if (planL) out.plan = cleanLine(planL.text).slice(0, 80);
    const regL = lines.find(l => /gratis|regalo|\blleva\b|obsequio|combo|\+ ?\w+ de regalo|2x1/.test(norm(l.text)));
    if (regL) out.regalo = cleanLine(regL.text).slice(0, 80);
    out.legible = !!(out.contado || out.cuota || out.producto);
    return out;
  }

  const api = { parseTag, norm, CATEGORIAS: Object.keys(CATEGORIAS).concat(["Otros"]) };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CazaParser = api;
})(typeof window !== "undefined" ? window : this);
