"""Screenshots for docs/screenshots: the browser preview (sample data, no personal files)
rendered by WebKitGTK, the engine of the app, at 1440×900.

Usage (with the preview running, `pnpm dev --port 1430`):

    Xvfb :97 -screen 0 1440x900x24 &
    DISPLAY=:97 WEBKIT_DISABLE_DMABUF_RENDERER=1 python3 scripts/screenshots.py docs/screenshots

Needs python-gobject and webkit2gtk-4.1. Writes inicio, proyecto, paquetes, registros,
historial and respaldo .png (the README uses all but registros).
"""
import json
import sys

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import GLib, Gtk, WebKit2  # noqa: E402

OUT = sys.argv[1]
URL = "http://localhost:1430/"
W, H = 1440, 900

win = Gtk.Window()
win.set_default_size(W, H)
view = WebKit2.WebView()
win.add(view)
win.show_all()

steps = []


def js(code, then):
    def done(v, res):
        try:
            r = v.evaluate_javascript_finish(res)
            val = r.to_json(0) if r is not None else None
        except Exception as e:  # noqa: BLE001
            val = f"ERR {e}"
        print("js:", (val or "")[:200], flush=True)
        then()

    view.evaluate_javascript(code, -1, None, None, None, done)


def shot(name, then):
    def done(v, res):
        surface = v.get_snapshot_finish(res)
        surface.write_to_png(f"{OUT}/{name}.png")
        print("shot", name, flush=True)
        then()

    view.get_snapshot(
        WebKit2.SnapshotRegion.VISIBLE, WebKit2.SnapshotOptions.NONE, None, done
    )


def run(i=0):
    if i >= len(steps):
        Gtk.main_quit()
        return
    kind, arg, wait = steps[i]
    nxt = lambda: GLib.timeout_add(wait, lambda: (run(i + 1), False)[1])  # noqa: E731
    if kind == "js":
        js(arg, nxt)
    else:
        shot(arg, nxt)


def step(kind, arg, wait=600):
    steps.append((kind, arg, wait))


# Helpers available in the page.
HELP = r"""
window.$click = (pred) => { const b = [...document.querySelectorAll('button,[role=tab],[role=menuitem]')].find(pred); if (b) b.click(); return !!b; };
window.$label = (t) => $click(b => (b.getAttribute('aria-label') || b.textContent.trim()) === t);
window.$view = () => { const c = document.querySelector('.cm-content'); return c && (c.cmView?.view ?? c.cmTile?.view); };
'ok'
"""

step("js", HELP, 300)
step("shot", "inicio", 300)
step("js", "$label('Abrir Tesis de magíster')", 2000)
step("js", HELP, 200)
step("js", "$click(b => b.textContent.trim() === 'Recompilar')", 4000)
# A formula with the user's macros, the cursor inside: the live preview shows.
step(
    "js",
    r"""(() => { const v = $view(); const d = v.state.doc.toString();
      const at = d.indexOf('\\subsection{Motivación}');
      const block = '\\begin{align*}\n  \\vec{v} &= a\\,\\ihat + b\\,\\jhat \\\\\n  \\lVert \\vec{v} \\rVert &= \\sqrt{a^2 + b^2}\n\\end{align*}\n\n';
      v.dispatch({ changes: { from: at, insert: block } });
      const cur = at + block.indexOf('\\jhat') + 5;
      v.focus(); v.dispatch({ selection: { anchor: cur }, scrollIntoView: false });
      v.dispatch({ ...v.state.replaceSelection(' '), userEvent: 'input.type' });
      document.querySelector('.cm-scroller').scrollTop = 0;
      return cur; })()""",
    2000,
)
step("js", "$label('Archivos')", 700)
step("shot", "proyecto", 300)
step("js", "$label('Paquetes')", 1500)
step(
    "js",
    r"""(() => { const i = document.querySelector('input[type=search], input[placeholder*="CTAN"]');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(i, 'units'); i.dispatchEvent(new Event('input', { bubbles: true })); return !!i; })()""",
    1500,
)
step("shot", "paquetes", 300)
step("js", "$label('Registros y errores')", 800)
step("shot", "registros", 300)
# A named version, then the history with its diff.
step("js", "$label('Archivo')", 400)
step("js", "$click(b => b.textContent.includes('Guardar versión'))", 600)
step(
    "js",
    r"""(() => { const i = document.querySelector('[role=dialog] input');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(i, 'Entrega 1'); i.dispatchEvent(new Event('input', { bubbles: true }));
      i.form.requestSubmit(); return true; })()""",
    1200,
)
step("js", "$label('Registros y errores')", 400)
step("js", "document.querySelectorAll('[aria-label^=\"Cerrar aviso\"]').forEach(b => b.click()); 'ok'", 400)
step("js", "$label('Historial')", 1500)
step(
    "js",
    "(() => { const b = document.querySelector('[aria-label=\"Versiones\"] button'); b && b.click(); return !!b; })()",
    2000,
)
step("js", "document.querySelectorAll('[aria-label^=\"Cerrar aviso\"]').forEach(b => b.click()); 'ok'", 600)
step("shot", "historial", 300)

# Backup with Git, connected to GitHub (simulated).
step("js", "$label('Historial')", 600)
step("js", "$label('Respaldo con Git')", 1200)
step("js", "$click(b => b.textContent.trim() === 'Activar el respaldo con Git')", 800)
step("js", "$click(b => b.textContent.trim() === 'Usar mi cuenta de GitHub')", 800)
step("js", "$click(b => b.textContent.trim() === 'Activar')", 1200)
step("js", "$click(b => b.textContent.trim() === 'Respaldar')", 1200)
step("js", "$click(b => b.textContent.trim() === 'Conectar con GitHub…')", 800)
step("js", "$click(b => b.textContent.trim() === 'Crear y conectar')", 1200)
step("js", "$click(b => b.textContent.trim() === 'Subir')", 1500)
step(
    "js",
    r"""(() => { const v = $view(); const d = v.state.doc.toString();
      const at = d.indexOf('Los editores en línea');
      v.dispatch({ changes: { from: at, insert: 'Un cambio sin respaldar. ' } });
      document.querySelectorAll('[aria-label^="Cerrar aviso"]').forEach(b => b.click());
      return at; })()""",
    2500,
)
step("js", "document.querySelectorAll('[aria-label^=\"Cerrar aviso\"]').forEach(b => b.click()); 'ok'", 600)
step("shot", "respaldo", 300)

win.connect("destroy", Gtk.main_quit)
view.connect(
    "load-changed",
    lambda v, e: e == WebKit2.LoadEvent.FINISHED and GLib.timeout_add(2500, lambda: (run(), False)[1]),
)
view.load_uri(URL)
Gtk.main()
print(json.dumps({"done": True}))
