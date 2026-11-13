# Cambios de LibreTeX

Lo nuevo de cada versión respecto de la anterior, de la más reciente a la más antigua. Las
notas de cada release (con cómo instalar) están en `docs/releases/<versión>.md`.

## 1.2.2 — 2026-11-13

### Novedades

- LibreTeX vuelve a abrirse como se cerró: con el mismo tamaño, maximizado o en pantalla
  completa (también si se cerró minimizado), y en pantalla completa en el mismo monitor (en
  Wayland, una ventana normal o maximizada va donde la ponga el escritorio). Y vuelve al
  proyecto que estaba a la vista, en vez de a Inicio.
- Plegar y desplegar una carpeta del árbol de archivos o una sección del esquema se ve: lo de
  adentro se encoge o crece y se desvanece, en vez de desaparecer de golpe (sin animación con
  «reducir animaciones» del sistema).

### Arreglos

- Escribir con un PDF largo abierto ya no se atrasa respecto del teclado: pdf.js volvía a
  acomodar todas las capas de texto del PDF en cada tecla, y en WebKit cada visor
  reemplazado (cada compilación, cada zoom) quedaba vivo con sus escuchas.
- Con dos ventanas, seleccionar texto en una mientras la otra tenía algo seleccionado ya no
  hace parpadear la selección.
- Una copia de un proyecto aparece primera en «Abiertos recientemente» (antes quedaba al
  final, porque nunca se había abierto).
- Al abrir un menú (Archivo, Editar…) con el mouse, su primera opción ya no queda marcada
  como si el puntero estuviera encima; abierto con el teclado sí se marca, para recorrerlo con
  las flechas.
- La vista previa de fórmulas ya no falla con una prima justo antes del paréntesis de una
  función de physics (`\cos(\omega t')`, `\div(J(r',t'))`): MathJax no cerraba ese paréntesis.
- Linux: con WebKitGTK 2.54 y NVIDIA, la pantalla ya no vuelve durante un rato a un cuadro
  anterior (una línea recién escrita que iba y venía, el esquema que parpadeaba bajo el
  puntero).

### Problemas conocidos

- Linux (WebKitGTK 2.54, NVIDIA): al volver a la ventana, a veces la línea activa parpadea
  un momento (~0,3 s) entre la anterior y la nueva. La página no cambia: es la pantalla.
- Al escribir un acento con tecla muerta (´ + o), WebKitGTK deja un cuadro sin el acento ni
  la letra; si la línea está justo al borde, se nota como un salto breve.

## 1.2.1 — 2026-11-09

### Novedades

- Más animaciones, con el estilo de los diálogos (breves, suaves y desactivadas con «reducir
  animaciones» del sistema): al cambiar de pestaña la vista entra desde el lado de su
  pestaña; las secciones del inicio (Proyectos, Papelera, Paquetes, Ajustes), los paneles
  del riel y el historial suben o bajan según su lugar en la lista; los menús y desplegables
  se abren y se cierran con una transición, y los avisos aparecen y se van con una. Al
  cambiar entre proyectos abiertos, la vista actual se va apenas se hace clic y la nueva
  entra entera aunque tarde un momento en cargar.
- «Cargando proyecto»: si un proyecto tarda en abrirse, se ve el logo con una barra que se
  completa a medida que carga (el proyecto, sus archivos, el editor y el PDF), como al
  iniciarse un Mac; el proyecto entra cuando está listo.

### Arreglos

- macOS (vale en todas las plataformas): al pasar del inicio a un proyecto la pestaña ya no
  salta. Mientras el proyecto entraba de lado, la página quedaba 18 px más ancha que la
  ventana y un desplazamiento del trackpad movía todo, pestañas incluidas, hasta que
  terminaba la animación.
- Escribir `\left(` dentro de un par `\left( … \right)`, justo antes de su `\right`, ahora
  también agrega su `\right)` (antes se tomaba por el cierre de ese par).
- La llave se cierra sola justo después de `^` o `_` aunque siga algo ya escrito
  (`x^{|}y`, para agregar un exponente o subíndice que faltaba).
- Vista previa de matemáticas con comandos definidos con `\DeclareRobustCommand` y con
  fuentes propias de fontspec (`\newfontfamily`): una fuente de guion, como la r de
  Griffiths, se ve como `\mathscr`; `\normalfont`, `\bfseries`, `\itshape`… dentro de
  `\text{}` ya no la rompen.
- Escribir en el editor es más rápido: cada letra ya no vuelve a dibujar las pestañas, la
  barra de herramientas ni el esquema, ni vuelve a leer el preámbulo; el esquema y las
  macros se ponen al día al dejar de escribir (¼ s). Mover el cursor de línea ya no vuelve
  a dibujar toda la vista del proyecto.
- Linux: el parpadeo del texto al escribir con WebKitGTK 2.54 y NVIDIA (problema conocido de
  la 1.2.0) desaparece con el driver de NVIDIA 620; no requiere cambios en la app. Si tras
  actualizar el driver la app va lenta, hay que reiniciar el equipo (con el módulo viejo
  cargado, WebKit dibuja sin la GPU).
- Seguridad: importar un ZIP usa `zip` 9 (antes 8.6), que cierra varias vulnerabilidades con
  ZIP manipulados (encabezados contradictorios, tamaños falsos, entradas que agotan la
  memoria). LibreTeX ya validaba cada ruta por su cuenta; ahora además la biblioteca corta
  la lectura de una entrada que supera su tamaño declarado.
- Descargas (TeX Live de LibreTeX, índice de CTAN) con `rustls` 0.23.46, que cierra cuatro
  alertas de TLS.
- Dependencias de desarrollo y del menú de MathJax (`glob`, `minimatch`, `undici`) en
  versiones sin vulnerabilidades conocidas.
- Seguridad (Windows): en la raíz de `C:\` cualquier usuario del PC puede crear carpetas, así
  que otro usuario podía preparar un `C:\texlive\…` o un `C:\Strawberry\…` con programas que
  LibreTeX ejecutaba al compilar, antes que MiKTeX. Ahora esas carpetas se usan solo si son
  tuyas o del sistema (lo que deja un instalador ejecutado como administrador).

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
