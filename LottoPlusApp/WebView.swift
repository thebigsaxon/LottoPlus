import SwiftUI
import WebKit

struct WebView: NSViewRepresentable {
    @Binding var activeGame: String
    @Binding var triggerAction: String?

    class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var parent: WebView

        init(_ parent: WebView) {
            self.parent = parent
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            // Handle optional JS to Swift messages
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
        controller.add(context.coordinator, name: "lottoPlusBridge")
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
            case "gamePowerball":
                nsView.evaluateJavaScript("window.app && window.app.switchGame('powerball');", completionHandler: nil)
            case "gameMegaMillions":
                nsView.evaluateJavaScript("window.app && window.app.switchGame('megamillions');", completionHandler: nil)
            case "gameCash5":
                nsView.evaluateJavaScript("window.app && window.app.switchGame('cash5');", completionHandler: nil)
            default:
                break
            }
        }
    }
}
