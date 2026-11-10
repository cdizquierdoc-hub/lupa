"""Convierte el REPOSITORIO_PRODUCTO.xlsx de Cresa en repositorio.json (lo que usa la app).
Uso:  python3 tools/repositorio_json.py ruta/REPOSITORIO_PRODUCTO.xlsx
Hay que volver a correrlo cada vez que cambie el repositorio y subir repositorio.json a GitHub."""
import json, sys
from collections import OrderedDict
import openpyxl

def limpio(v):
    return " ".join(str(v).split()) if v not in (None, "") else ""

ws = openpyxl.load_workbook(sys.argv[1], data_only=True).active
rows = [r for r in ws.iter_rows(min_row=2, values_only=True) if r and r[2]]
# columnas: Marca, Sub Grupo, Linea, Grupo, Descripcion, des_capacidad, Codigo Producto, Categoria Comercial
lineas = OrderedDict()
marcas = set()
for r in rows:
    marca, sub, linea, grupo, _, cap, _, catc = [limpio(x) for x in r[:8]]
    if not linea:
        continue
    marcas.add(marca)
    L = lineas.setdefault(linea, {"linea": linea, "categoria": catc, "grupos": OrderedDict(), "caps": set()})
    if catc and not L["categoria"]:
        L["categoria"] = catc
    g = L["grupos"].setdefault(grupo, set())
    if sub:
        g.add(sub)
    if cap:
        L["caps"].add(cap)

out = {
    "lineas": [
        {"linea": L["linea"], "categoria": L["categoria"],
         "grupos": [{"grupo": g, "subs": sorted(s)} for g, s in L["grupos"].items()],
         "caps": sorted(L["caps"])}
        for L in lineas.values()
    ],
    "marcas": sorted(marcas, key=lambda s: s.upper()),
}
with open("repositorio.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print("líneas:", len(out["lineas"]), "marcas:", len(out["marcas"]))
