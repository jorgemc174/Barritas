# Metas OBS - prototipo listo

## Arranque

En Windows:

1. Descomprime el ZIP.
2. Entra en la carpeta `metas-obs-listo`.
3. Doble clic en `iniciar-windows.bat`.
4. Abre `http://localhost:3000/admin`.

## URLs

- Panel streamer: `http://localhost:3000/admin`
- Donaciones simuladas: `http://localhost:3000/donar`
- Bits simulados: `http://localhost:3000/bits`
- Vista web de todas las categorías: `http://localhost:3000/overlay`
- Overlay OBS por categoría: `http://localhost:3000/overlay/capitulos`, `http://localhost:3000/overlay/juegos`, etc.

Para OBS usa siempre la URL de una categoría concreta, no la general.

Ejemplo:

```txt
Fuente de navegador → http://localhost:3000/overlay/capitulos
Ancho: 600
Alto: 350
```

El texto se adapta al tamaño de la fuente de navegador: si haces el cuadro más pequeño, baja el tamaño; si lo haces más horizontal, intenta dejar las frases en una sola línea.

## Fuente EDO

El proyecto busca la fuente en estas rutas:

```txt
public/fonts/edo.regular.ttf
public/fonts/edo-regular.ttf
public/fonts/edo.ttf
public/fonts/edo.otf
public/fonts/Edo.ttf
public/fonts/Edo.otf
```

Si tienes el archivo `edo.regular.ttf`, cópialo en:

```txt
metas-obs-listo/public/fonts/edo.regular.ttf
```

Después reinicia el programa y recarga la fuente de navegador en OBS.

No abras los HTML directamente para el proyecto real: arranca el servidor y entra por `http://localhost:3000/...`.


## Últimos cambios

- Cada categoría tiene botón **Copiar link OBS** desde el panel.
- Se quitaron los botones rápidos +100/+500/+1000/+2500 del panel.
- Cada meta permite escribir una cantidad manual de Bits y aplicarla.
- Las metas por capítulos tienen botón para **Añadir 1 cap pagado** y otro para **+1 cap al objetivo**.
