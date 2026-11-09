// Loads a page in a WKWebView (the engine of the macOS app), runs an async script, prints its
// result and the page's errors, and saves a snapshot. For checking the frontend on macOS
// without driving the screen.
//
//   swiftc -O scripts/macos/wkprobe.swift -o /tmp/wkprobe
//   /tmp/wkprobe <url> <script.js> <out.png> [waitSeconds]
//
// The script is one expression whose value (a promise is awaited) is printed, such as
// `(async () => { …; return JSON.stringify(result); })();`. The page runs with the
// simulated backend. With SERVE_DIR=dist (after `vite build`) and CSP set to the policy of
// tauri.conf.json, `tauri://localhost/` serves the build the way Tauri does, CSP included:
//
//   SERVE_DIR=dist CSP="default-src 'self'; ..." /tmp/wkprobe tauri://localhost/ \
//     scripts/macos/probe-compile.js /tmp/app.png 1.5
//
// The window sits on screen below every other one (an occluded or off-screen page is
// "hidden" and WebKit stops its animation frames, which pdf.js waits for).
import Cocoa
import WebKit

let args = CommandLine.arguments
let url = URL(string: args[1])!
let script = "return await " + (try! String(contentsOfFile: args[2], encoding: .utf8))
let out = URL(fileURLWithPath: args[3])
let wait = args.count > 4 ? Double(args[4])! : 1.5

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let config = WKWebViewConfiguration()
config.preferences.inactiveSchedulingPolicy = .none
let hook = """
window.__errs = [];
const push = (k, a) => window.__errs.push(k + ': ' + Array.from(a).map(x => x && x.stack ? x.stack : String(x)).join(' '));
const ce = console.error; console.error = function() { push('console.error', arguments); ce.apply(console, arguments); };
const cw = console.warn; console.warn = function() { push('console.warn', arguments); cw.apply(console, arguments); };
window.addEventListener('error', e => push('error', [e.message + ' @' + e.filename + ':' + e.lineno]));
window.addEventListener('unhandledrejection', e => push('rejection', [e.reason]));
document.addEventListener('securitypolicyviolation', e => push('csp', [e.violatedDirective + ' ' + e.blockedURI]));
"""
config.userContentController.addUserScript(
  WKUserScript(source: hook, injectionTime: .atDocumentStart, forMainFrameOnly: true))
// SERVE_DIR: serve that folder as tauri://localhost/ with the app's CSP, like Tauri does.
class SchemeHandler: NSObject, WKURLSchemeHandler {
  let root: URL
  let csp: String
  init(root: URL, csp: String) { self.root = root; self.csp = csp }
  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    var path = task.request.url!.path
    if path == "/" || path.isEmpty { path = "/index.html" }
    let file = root.appendingPathComponent(String(path.dropFirst()))
    guard let data = try? Data(contentsOf: file) else {
      task.didReceive(HTTPURLResponse(url: task.request.url!, statusCode: 404, httpVersion: nil, headerFields: [:])!)
      task.didFinish(); return
    }
    let types = ["html": "text/html", "js": "text/javascript", "mjs": "text/javascript", "css": "text/css",
      "wasm": "application/wasm", "json": "application/json", "svg": "image/svg+xml", "png": "image/png",
      "pdf": "application/pdf", "woff2": "font/woff2", "woff": "font/woff", "bcmap": "application/octet-stream",
      "pfb": "application/octet-stream", "ttf": "font/ttf", "icc": "application/octet-stream"]
    var headers = ["Content-Type": types[file.pathExtension] ?? "application/octet-stream", "Access-Control-Allow-Origin": "*"]
    if file.pathExtension == "html" { headers["Content-Security-Policy"] = csp }
    task.didReceive(HTTPURLResponse(url: task.request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
    task.didReceive(data)
    task.didFinish()
  }
  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
var handler: SchemeHandler? = nil
if let dir = ProcessInfo.processInfo.environment["SERVE_DIR"] {
  handler = SchemeHandler(root: URL(fileURLWithPath: dir), csp: ProcessInfo.processInfo.environment["CSP"] ?? "")
  config.setURLSchemeHandler(handler, forURLScheme: "tauri")
}
// SIZE=1470x956: the window's size in points (a full screen, for instance); 1000x900 by default.
let size = (ProcessInfo.processInfo.environment["SIZE"] ?? "1000x900").split(separator: "x")
  .compactMap { Double($0) }
let (width, height) = size.count == 2 ? (size[0], size[1]) : (1000, 900)
let frame = NSRect(x: 0, y: 0, width: width, height: height)
let webView = WKWebView(frame: frame, configuration: config)
let window = NSWindow(
  contentRect: NSRect(x: 0, y: 0, width: width, height: height), styleMask: [.borderless],
  backing: .buffered, defer: false)
window.contentView = webView
window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopWindow)))
window.orderFrontRegardless()

class Delegate: NSObject, WKNavigationDelegate {
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    DispatchQueue.main.asyncAfter(deadline: .now() + wait) { run() }
  }
  func webView(_ w: WKWebView, didFail n: WKNavigation!, withError e: Error) { print("fail", e); exit(1) }
  func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) {
    print("fail", e); exit(1)
  }
}

func run() {
  webView.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page) { result in
    switch result {
    case .success(let value): print("RESULT", value as Any)
    case .failure(let error): print("JSERROR", error)
    }
    webView.evaluateJavaScript("JSON.stringify(window.__errs)") { errs, _ in
      print("ERRORS", errs ?? "")
      webView.takeSnapshot(with: nil) { image, error in
        if let image, let tiff = image.tiffRepresentation,
          let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:])
        {
          try! png.write(to: out)
          print("SNAPSHOT", out.path)
        } else {
          print("snapshot error", error ?? "")
        }
        exit(0)
      }
    }
  }
}

let delegate = Delegate()
webView.navigationDelegate = delegate
webView.load(URLRequest(url: url))
DispatchQueue.main.asyncAfter(deadline: .now() + 60) { print("timeout"); exit(2) }
app.run()
