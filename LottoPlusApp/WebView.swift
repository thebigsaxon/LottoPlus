import SwiftUI
import WebKit
import AppKit

struct WebView: NSViewRepresentable {
    @Binding var triggerAction: String?

    class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var parent: WebView
        var sharingPicker: NSSharingServicePicker?

        private static let allowedFetchHosts = [
            "www.lotteryusa.com",
            "www.sceducationlottery.com"
        ]

        init(_ parent: WebView) {
            self.parent = parent
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "cash5StudioBridge",
                  let body = message.body as? [String: Any],
                  let action = body["action"] as? String else {
                return
            }

            if action == "theme" {
                guard let theme = body["theme"] as? String else { return }
                DispatchQueue.main.async { [weak webView = message.webView] in
                    guard let webView else { return }
                    let isDark = theme == "dark"
                    let appearance = NSAppearance(named: isDark ? .darkAqua : .aqua)
                    webView.appearance = appearance
                    webView.window?.appearance = appearance
                    webView.underPageBackgroundColor = NSColor(
                        red: isDark ? 23 / 255 : 228 / 255,
                        green: isDark ? 29 / 255 : 225 / 255,
                        blue: isDark ? 26 / 255 : 217 / 255,
                        alpha: 1
                    )
                }
                return
            }

            if action == "share" {
                guard let requestId = body["requestId"] as? String,
                      let text = body["text"] as? String,
                      !text.isEmpty else { return }
                DispatchQueue.main.async { [weak self, weak webView = message.webView] in
                    guard let self, let webView else { return }
                    let picker = NSSharingServicePicker(items: [text])
                    self.sharingPicker = picker
                    picker.show(relativeTo: webView.bounds, of: webView, preferredEdge: .minY)
                    self.sendShareResponse(to: webView, requestId: requestId)
                }
                return
            }

            guard action == "fetch",
                  let requestId = body["requestId"] as? String,
                  let urlString = body["url"] as? String,
                  let url = URL(string: urlString),
                  url.scheme == "https",
                  let host = url.host,
                  Self.allowedFetchHosts.contains(host) else {
                return
            }

            var request = URLRequest(url: url)
            request.timeoutInterval = 20
            request.setValue(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
                forHTTPHeaderField: "User-Agent"
            )

            URLSession.shared.dataTask(with: request) { [weak webView = message.webView] data, response, error in
                var result: [String: Any] = ["requestId": requestId]

                if let error {
                    result["error"] = error.localizedDescription
                } else if let httpResponse = response as? HTTPURLResponse,
                          !(200...299).contains(httpResponse.statusCode) {
                    result["error"] = "The lottery server returned HTTP \(httpResponse.statusCode)."
                } else if let data, let html = String(data: data, encoding: .utf8) {
                    result["html"] = html
                } else {
                    result["error"] = "The lottery server returned an unreadable response."
                }

                guard JSONSerialization.isValidJSONObject(result),
                      let jsonData = try? JSONSerialization.data(withJSONObject: result),
                      let json = String(data: jsonData, encoding: .utf8) else {
                    return
                }

                DispatchQueue.main.async {
                    webView?.evaluateJavaScript("window.__cash5StudioNativeFetchResponse(\(json));")
                }
            }.resume()
        }

        private func sendShareResponse(to webView: WKWebView, requestId: String) {
            let response = ["requestId": requestId]
            guard let data = try? JSONSerialization.data(withJSONObject: response),
                  let json = String(data: data, encoding: .utf8) else { return }
            webView.evaluateJavaScript("window.__cash5StudioNativeShareResponse(\(json));")
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            // Web view finished loading
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "cash5StudioBridge")
        controller.addUserScript(WKUserScript(
            source: Self.nativeBridgeScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        config.userContentController = controller

        // Allow local file access and JavaScript execution
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        
        // Enable Web Inspector for easy developer debugging in macOS
        #if DEBUG
        if #available(macOS 13.3, *) {
            webView.isInspectable = true
        }
        #endif

        if let htmlPath = Bundle.main.path(forResource: "index", ofType: "html") {
            let fileURL = URL(fileURLWithPath: htmlPath)
            webView.loadFileURL(fileURL, allowingReadAccessTo: fileURL.deletingLastPathComponent())
        }

        return webView
    }

    private static let nativeBridgeScript = #"""
    (() => {
      const pending = new Map();

      window.__cash5StudioNativeFetchResponse = ({ requestId, html, error }) => {
        const request = pending.get(requestId);
        if (!request) return;
        pending.delete(requestId);
        clearTimeout(request.timeoutId);
        if (error) request.reject(new Error(error));
        else request.resolve(html);
      };

      window.cash5StudioNativeFetch = (url) => new Promise((resolve, reject) => {
        const requestId = `fetch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const timeoutId = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error('The native lottery request timed out.'));
        }, 20000);

        pending.set(requestId, { resolve, reject, timeoutId });
        window.webkit.messageHandlers.cash5StudioBridge.postMessage({
          action: 'fetch',
          requestId,
          url
        });
      });

      window.cash5StudioNativeTheme = (theme) => {
        window.webkit.messageHandlers.cash5StudioBridge.postMessage({
          action: 'theme',
          theme: theme === 'dark' ? 'dark' : 'light'
        });
      };

      const pendingShares = new Map();
      window.__cash5StudioNativeShareResponse = ({ requestId, error }) => {
        const request = pendingShares.get(requestId);
        if (!request) return;
        pendingShares.delete(requestId);
        clearTimeout(request.timeoutId);
        if (error) request.reject(new Error(error));
        else request.resolve();
      };

      window.cash5StudioNativeShare = (text) => new Promise((resolve, reject) => {
        const requestId = `share-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const timeoutId = setTimeout(() => {
          pendingShares.delete(requestId);
          reject(new Error('The native share sheet did not open.'));
        }, 10000);
        pendingShares.set(requestId, { resolve, reject, timeoutId });
        window.webkit.messageHandlers.cash5StudioBridge.postMessage({
          action: 'share',
          requestId,
          text: String(text || '')
        });
      });
    })();
    """#

    func updateNSView(_ nsView: WKWebView, context: Context) {
        // Trigger native menu actions if requested
        if let action = triggerAction {
            DispatchQueue.main.async {
                self.triggerAction = nil
            }
            switch action {
            case "importCSV":
                nsView.evaluateJavaScript("document.getElementById('btnImportCsv').click();", completionHandler: nil)
            case "openProject":
                nsView.evaluateJavaScript("document.getElementById('btnOpenProject').click();", completionHandler: nil)
            case "saveProject":
                nsView.evaluateJavaScript("document.getElementById('btnSaveProject').click();", completionHandler: nil)
            case "zoomIn":
                nsView.evaluateJavaScript("window.app?.zoomInterface(1);", completionHandler: nil)
            case "zoomOut":
                nsView.evaluateJavaScript("window.app?.zoomInterface(-1);", completionHandler: nil)
            case "zoomReset":
                nsView.evaluateJavaScript("window.app?.setInterfaceZoom(1);", completionHandler: nil)
            default:
                break
            }
        }
    }
}
