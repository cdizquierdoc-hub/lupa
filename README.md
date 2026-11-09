# LUPA

**L**ocalizador **U**nificado de **P**recios y **A**lternativas.

Una app para el teléfono. El equipo le toma foto al preciador de la competencia y la app:

1. lee producto, precio, cuota, plan y regalo,
2. averigua qué producto es aunque el código y el nombre no se parezcan a los nuestros,
3. lo compara con lo que **sí** tenemos en Crecos, Orve Hogar y Japón,
4. sugiere alternativas y te da el texto para decirle al cliente,
5. lo guarda para todo el equipo.

**Costo: $0.**

| Pieza | Herramienta |
|---|---|
| Página | GitHub Pages |
| Lectura de la foto | Tesseract.js, corre dentro del teléfono, sin claves |
| Base de datos y fotos | Google Sheets + Apps Script + tu Google Drive |

---

## Cómo reconoce los productos

Los códigos y nombres de la competencia casi nunca son los mismos que los nuestros. LUPA convierte cada producto en una ficha comparable y busca el más parecido, igual que PILAS cuando busca el código por la descripción:

- **Categoría**: refrigeración, TV, lavado, aires, cocinas, motos, celulares, computación…
- **Tipo**: no frost, side by side, QLED/UHD, doble tanque/carga superior, split inverter, a gas/inducción, Core i5/Ryzen 5, scooter/utilitaria…
- **Medida**: pulgadas, litros (los "pies" se convierten a litros), kg (las libras a kg), BTU, quemadores, cc, plazas, GB.
- **Marca** y **parecido del texto**.

El resultado es uno de estos:

| Resultado | Cuándo |
|---|---|
| **Mismo modelo** | El código coincide, aunque cambie el color o el sufijo. |
| **Equivalente** | Mismo tipo y misma medida, aunque sea otra marca (ej. TV 55" QLED Hisense ↔ TV 55" QLED Daewoo). |
| **Lo más parecido que tenemos** | No vendemos ese producto; se muestra lo más cercano de la misma categoría. |

Si el tipo es distinto (doble tanque vs. carga superior) **no** lo da como equivalente; solo lo sugiere como "otro tipo pero más económico".

### Las tres listas

| Archivo / pestaña | Qué es | Para qué se usa |
|---|---|---|
| `maestro.tsv` | Los 11.524 códigos de Cresa (el de PILAS) | **Solo para clasificar.** Nunca se ofrece al cliente: la mayoría no tiene stock. |
| `vendidos.tsv` | Lo que se vendió este mes (1.713 productos) | "Lo que tenemos". Se compara y se sugiere, marcado *sin precio Black*. |
| Pestaña **Catalogo** del Sheet | Precios Black de Negocios | Lo que manda: precio, cuota, plan, promo y stock. |

Si un producto de la lista Black tiene `stock` en 0 o "no", desaparece de la app.
Si el maestro conoce el modelo de la competencia pero no está en la lista Black, la app avisa:
*"Ese modelo existe en Cresa pero no está en la lista de Black o no tiene stock."*

---

## Paso a paso

### Paso 1 · Crear el repositorio (2 min)

1. Entra a <https://github.com/new> con la cuenta **cdizquierdoc-hub**.
2. *Repository name*: `lupa`.
3. Márcalo **Public**. No agregues README ni nada más.
4. **Create repository**.

### Paso 2 · Subir los archivos

**Opción A:** avísale a Claude que ya está creado y él sube todo.

**Opción B (tú mismo):** en la página del repositorio, *uploading an existing file* → arrastra todo el contenido de la carpeta `lupa` (incluida la carpeta `apps-script`) → **Commit changes**.

### Paso 3 · Activar la página (1 min)

1. En el repositorio: **Settings → Pages**.
2. *Source*: **Deploy from a branch** · *Branch*: **main** · carpeta **/ (root)** → **Save**.
3. En 1 o 2 minutos queda en **https://cdizquierdoc-hub.github.io/lupa/**.

En este punto la app ya abre y compara contra lo vendido del mes, pero todavía no guarda nada para el equipo. Para eso sigue el paso 4.

### Paso 4 · La base de datos en Google Sheets (5 min)

1. Con tu **Gmail personal** crea un Google Sheet llamado **LUPA**.
   (Las cuentas corporativas suelen bloquear compartir las fotos.)
2. **Extensiones → Apps Script**. Borra lo que haya, pega todo `apps-script/Code.gs` y guarda (💾).
3. Arriba elige la función **setup** → **Ejecutar**. Acepta los permisos.
   Google dirá que la app no está verificada: **Configuración avanzada → Ir a LUPA (no seguro)**. Es tu propio script.
4. Se crean las pestañas **Catalogo**, **Capturas** y **Config**, y la carpeta *LUPA - Fotos* en tu Drive.
5. En **Config** cambia el PIN `black2026` por el que le vas a dar al equipo.

### Paso 5 · Publicar el servidor (2 min)

1. En Apps Script: **Implementar → Nueva implementación**.
2. Engranaje → **Aplicación web**.
3. *Ejecutar como*: **Yo** · *Quién tiene acceso*: **Cualquier persona**.
4. **Implementar** → copia la URL que termina en **/exec**.

### Paso 6 · Conectar la app con el Sheet (1 min)

1. En GitHub abre `config.js` → lápiz ✏️.
2. Pega la URL entre las comillas de `API_URL: ""`.
3. **Commit changes**. En 1 o 2 minutos la app ya guarda en el Sheet.

### Paso 7 · Cargar los precios de Black

En la pestaña **Catalogo**, una fila por **código y cadena**. Solo son obligatorias las tres primeras columnas:

```
codigo | cadena | precio_contado | precio_normal | cuota | num_cuotas | frecuencia | entrada | plan_credito | promo | stock | nombre | marca | categoria
```

- `codigo`: el código Cresa (el mismo de la matriz y de PILAS).
- `cadena`: Crecos, Orve Hogar, Japón…
- `nombre`, `marca`, `categoria` se pueden dejar vacíos: salen del maestro.
- `stock`: si es 0 o "no", el producto no se ofrece.
- `promo`: frase corta que el vendedor pueda decir ("Lleva licuadora gratis").

Negocios puede pegar directo desde su matriz (ver `plantilla-catalogo.csv`).
Los teléfonos bajan los precios al abrir, se actualizan cada 10 minutos o con **Actualizar precios**.

### Paso 8 · Probar antes de repartir

1. Abre el link en tu teléfono → nombre y PIN. Acepta el permiso de ubicación (sirve para saber la ciudad).
2. Toma foto a 3 o 4 preciadores (o a una foto en pantalla).
3. Revisa que aparezcan en la pestaña **Capturas** del Sheet.
4. **Compartir:** manda el link por WhatsApp o haz un QR. En el teléfono, *Agregar a pantalla de inicio* para que quede como app.

### Paso 9 · Lectura con IA (gratis, recomendado)

El lector básico del teléfono no entiende letra a mano. La IA de Google (Gemini) sí, y tiene un nivel gratis sin tarjeta.

1. Entra a <https://aistudio.google.com/apikey> con tu Gmail → **Create API key** → copia la clave.
2. En el Sheet, pestaña **Config**, fila `gemini_key`: pega la clave en la columna B.
   (Para más lecturas al día puedes crear claves en proyectos distintos y ponerlas separadas por coma.)
3. En Apps Script pega el `Code.gs` nuevo del repositorio, guarda, elige **probarGemini** → **Ejecutar**. En el registro debe salir al menos un modelo con **200**.
4. **Implementar → Administrar implementaciones → ✏️ → Versión: Nueva versión → Implementar.** La URL no cambia.

Si se acaba la cuota del día o no hay señal, la app usa sola el lector básico.
Nota: en el nivel gratis Google puede usar las fotos para mejorar sus productos; son fotos de carteles de precio, no datos de clientes.

---

## Cada mes

- **Vendidos:** reemplaza `vendidos.tsv` en GitHub (*Add file → Upload files*). Mismo formato que el Excel que exportas:
  `cod · desc · marca · cap · sub · linea · grupo` separados por tabulador, con encabezado.
- **Maestro:** si PILAS agrega códigos nuevos, reemplaza `maestro.tsv` con el nuevo.
- Si cambias `Code.gs`: **Implementar → Administrar implementaciones → ✏️ → Versión: nueva** (así la URL no cambia).

## Uso en tienda

**Foto a la competencia** (elige Artefacta, Marcimex…):
foto al preciador → revisa los datos → **Comparar y guardar**. Sale el precio de ellos frente al nuestro por cadena, el veredicto, hasta 3 alternativas y el texto para el cliente.

**Foto a nuestro preciador** (elige Crecos, Orve Hogar, Japón…):
foto → revisa (el campo dice *Código Cresa*) → **Guardar y comparar con la competencia**. Sale:
- nuestro precio frente a lo que el equipo ya capturó en cada competidor (mismo modelo, equivalente o parecido),
- diferencia de contado, de cuota al mes, plazo (meses, semanas o quincenas) y total a crédito,
- si estamos más altos o más bajos ("más baratos que 2 de 3 competidores"),
- si alguien está más bajo: alternativas nuestras más baratas o con mejor crédito,
- el texto para el cliente.

Ese precio **queda guardado como precio Cresa** de esa cadena (marcado "foto") y se usa en las comparaciones de todos. Si Negocios carga el precio Black de esa cadena, manda el de Negocios.

**Nuestros precios**: escribe un código (ej. `SMCAS122IGL`) o un producto y toca el resultado para ver cómo está frente a la competencia. También encuentra códigos que existen en Cresa pero no están en Black.

**Competencia**: todo lo capturado por el equipo, de la competencia y de nuestras cadenas, con filtros por cadena y por ciudad.

**Cadena y ciudad**: la cadena la lee la IA del cartel (y se puede cambiar con los botones); la ciudad sale de la ubicación del teléfono comparada con una lista de ciudades del Ecuador dentro de la app (sin servicios externos). Si no hay permiso de ubicación, se elige de la lista. En el Sheet la ciudad queda en la tercera columna de **Capturas**; puedes cambiar ese encabezado de `agencia` a `ciudad`.

Sin señal: se guarda en el teléfono y se envía solo cuando vuelve la conexión.

## Límites

- El OCR es básico: lee bien preciadores impresos, de cerca y sin reflejo. Por eso siempre se revisa antes de guardar. La primera lectura en cada teléfono baja el lector de español (unos 4 MB); luego queda guardado.
- Apps Script gratis aguanta unas 30 peticiones al mismo tiempo: suficiente para unas 150 a 200 personas activas.
- El PIN evita que cualquiera escriba, pero no es un login real.
