import SwiftUI

struct ContentView: View {
    @Binding var triggerAction: String?

    var body: some View {
        WebView(triggerAction: $triggerAction)
            .frame(minWidth: 1100, idealWidth: 1280, minHeight: 720, idealHeight: 850)
            .background(Color(nsColor: .windowBackgroundColor))
    }
}
