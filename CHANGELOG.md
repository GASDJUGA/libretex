# Cambios de LibreTeX

Lo nuevo de cada versión respecto de la anterior, de la más reciente a la más antigua. Las
notas de cada release (con cómo instalar) están en `docs/releases/<versión>.md`.

## Sin publicar (1.2.1)

### Arreglos

- Escribir en el editor es más rápido: cada letra ya no vuelve a dibujar las pestañas, la
  barra de herramientas ni el esquema, ni vuelve a leer el preámbulo; el esquema y las
  macros se ponen al día al dejar de escribir (¼ s). Mover el cursor de línea ya no vuelve
  a dibujar toda la vista del proyecto.
- Seguridad: importar un ZIP usa `zip` 9 (antes 8.6), que cierra varias vulnerabilidades con
  ZIP manipulados (encabezados contradictorios, tamaños falsos, entradas que agotan la
  memoria). LibreTeX ya validaba cada ruta por su cuenta; ahora además la biblioteca corta
  la lectura de una entrada que supera su tamaño declarado.
- Descargas (TeX Live de LibreTeX, índice de CTAN) con `rustls` 0.23.46, que cierra cuatro
  alertas de TLS.
- Dependencias de desarrollo y del menú de MathJax (`glob`, `minimatch`, `undici`) en
  versiones sin vulnerabilidades conocidas.

## 1.2.0 — 2026-11-07

Primera versión para **macOS** y **Windows**, además de Linux. (La 1.1.0 quedó como tag de la
línea macOS, sin release propio: lo suyo está aquí.)

### macOS

- Atajos con ⌘ y menú propio de macOS; «Salir» guarda antes de cerrar.
- MacTeX detectado también al abrir la app desde el Dock; el gestor de paquetes da el comando `sudo tlmgr install …` para copiar. El TeX Live de LibreTeX también funciona en macOS.
- Pegar imágenes (también las que se copian de Vista Previa), pellizco del trackpad en el visor PDF, Papelera de la app (enviar y restaurar) y «Mostrar en Finder».

### Windows

- Instalador por usuario, sin administrador.
- MiKTeX como gestor de paquetes (instalar, desinstalar y actualizar sin administrador), además del TeX Live oficial y el de LibreTeX.
- Sin ventanas de consola al compilar, y cancelar termina todos los procesos de la compilación.
- Pegar capturas, arrastrar y soltar desde el Explorador, «Mostrar en el Explorador», archivos con CRLF conservados al guardar.

### En todas las plataformas

- El esquema del archivo se pliega: capítulos y secciones se colapsan y expanden (con el mouse o con ← →), y se recuerda por proyecto.
- Buscar distingue mayúsculas por defecto, en el editor y en el proyecto («Aa» lo cambia).
- Sin autocompletado después de `\\` (salto de línea).
- Transición suave al abrir un proyecto o volver al inicio.
- Linux: arrastrar una pestaña fuera de la ventana abre una ventana nueva también en Wayland.

### Problema conocido (Linux)

Con **WebKitGTK 2.54** y una tarjeta **NVIDIA** en Wayland, el texto del editor puede parpadear al escribir (es de WebKitGTK; con la 2.52 no pasa). Mientras se arregla: `LIBRETEX_SAFE_RENDERER=1 libretex` lo quita, pero dibuja sin la GPU y va más lento.

## 1.0.0 — 2026-10-26

Primera versión estable, para Linux (Arch y AppImage).

- Proyectos: plantillas, abrir carpeta, importar ZIP (también de Overleaf) o desde GitHub; papelera.
- Editor: CodeMirror con autocompletado (comandos del documento y de los paquetes cargados, `\ref`, `\cite`, rutas), revisión en vivo, ortografía es/en y vista previa de matemáticas.
- Compilación con latexmk (pdfLaTeX, XeLaTeX, LuaLaTeX), errores enlazados al código, visor PDF con SyncTeX.
- Gestor de paquetes (TeX Live de LibreTeX, del sistema o de pacman).
- Historial local, respaldo con Git y GitHub, exportar PDF y ZIP.
- Varios proyectos en pestañas y en varias ventanas; temas de la interfaz.
- Pegar imágenes del portapapeles (capturas) como figuras.
