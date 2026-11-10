# Cómo está escrito cada preciador (y cómo lo lee LUPA)

Referencia para el prompt de la IA (`promptLectura_` en `apps-script/Code.gs`) y para el lector de respaldo (`parser.js`).

## Los cuatro casos de la prueba de noviembre 2026

| # | Foto | Quién | Cómo está escrito | Qué debe salir |
|---|---|---|---|---|
| 1 | Liquidora Warienhaus WH-555G | Marcimex (etiqueta de tinta electrónica) | Nombre arriba · `PVP 103.02` (precio anterior, pequeño) · `OFERTA` + número grande `44` · código al pie en letra muy pequeña · sin logo de tienda | contado 44 · antes 103.02 · producto "Liquidora perilla Warienhaus 1.5 L negro" · código WH-555G · tienda: elegir a mano |
| 2 | Refrigeradora LG SBS VS25LQIK 684 L | La Ganga (sticker "Ganga Black Days") | Tarjeta blanca con `$1541.01` grande · línea de abajo con modelo y descripción · a la derecha una hoja de crédito cortada (PVP, cuota inicial, cuota mensual, no. de cuotas, precio final) | contado 1541.01 · codigo VS25LQIK · producto "Refrigeradora SBS LG 684 L" · la hoja cortada no se inventa: aviso |
| 3 | Refrigeradora Samsung SBS 540 L | La Ganga (sticker circular "Precio Ganga") | `PRECIO GANGA $854.11` grande · leyenda azul `CONTADO` / `CUOTA CRÉDITO` · etiqueta lateral `Ganguita Menú $72.23` (cuota) | contado 854.11 · cuota 72.23 (Ganguita = crédito) · plazo: no se ve bien → aviso |
| 4 | TV Artefacta 75" | Artefacta (caja digital) | Encabezado `llévalo en cuotas` · caja digital con `precio ahorro` y `1145.00` · logo `emma` de crédito | contado 1145 (la etiqueta dice "precio ahorro"). La frase "llévalo en cuotas" NO vuelve cuota al número. Sin cuota visible: aviso |

## Tipos de preciador y su estructura

1. **Tinta electrónica (Marcimex y similares):** nombre arriba, `PVP` = precio anterior, `OFERTA` = contado, código al pie muy pequeño. Suele no tener logo de tienda.
2. **Sticker de precio con el nombre de la tienda (La Ganga):** el número grande es contado. Si hay leyenda `CONTADO / CUOTA CRÉDITO`, cada número sigue su rótulo. `Ganguita` es crédito.
3. **Sticker de campaña (Black Days, Unidades limitadas):** el número grande es contado; la línea de abajo trae modelo y descripción.
4. **Hoja de crédito:** `PVP` = contado (o antes), `CUOTA INICIAL` = entrada, `CUOTA MENSUAL` = cuota, `NO. DE CUOTAS` = plazo, `PRECIO FINAL` = total a crédito (texto, nunca contado).
5. **Caja digital o cartel con "llévalo en cuotas" (Artefacta):** el número con `precio ahorro` o `contado` es contado. "llévalo en cuotas" por sí solo no es cuota. Si hay duda, se marca como aviso.

## Escenarios posibles y qué hace LUPA

| Escenario | Lectura | Qué ve la persona |
|---|---|---|
| Solo un precio sin palabras de crédito | contado | Se guarda sin cuota |
| PVP o precio tachado junto al contado | contado + antes | Antes queda en "Precio antes" |
| Contado y cuota con rótulos (CONTADO / CUOTA) | cada número a su campo | Ambos guardados |
| Cuota con "Ganguita", "emma", "mes", "x 12" | cuota | Crédito con su plazo |
| Solo cuota, sin contado visible | cuota, contado vacío | Aviso: "Solo hay cuota: confirma si hay precio de contado" |
| Cuota sin plazo | cuota, plazo vacío | Aviso: "Falta el número de cuotas" |
| "Llévalo en cuotas" con un número sin rótulo | contado, aviso de la IA | Aviso para confirmar contado o cuota |
| "Precio ahorro" o "contado" con "llévalo en cuotas" | contado | Sin aviso |
| Hoja de crédito cortada | solo campos legibles | Aviso de la IA sobre la hoja |
| Código ilegible o ausente | codigo vacío | Se empareja por descripción (como PILAS) |
| Sin logo de tienda | tienda vacía | Se elige el chip de competidor a mano |
| Varios productos en la foto | el más grande | Aviso: una foto por producto |
| Foto borrosa, reflejo o de lejos | legible = false | Aviso y se pide otra foto |
| Ningún precio legible | sin contado ni cuota | Aviso: escribir a mano o tomar otra foto |
| Regalo o promo ("gratis", "lleva", "2x1") | regalo | Campo "Regalo o promo" |
| "Llévalo en cuotas" sin cuota ni número | nada legible | Aviso: no se leyó ningún precio |

## Lo que la persona debe cuidar al tomar la foto

- Que salgan completos el nombre del producto y el precio grande.
- Si hay cuota: el precio de cuota, el plazo (12 meses, x 12) y el de contado juntos, con su rótulo.
- Si la hoja de crédito está aparte, fotografiarla también.
- De frente, de cerca, sin reflejo. Una etiqueta por foto.
