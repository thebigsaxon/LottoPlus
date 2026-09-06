import SwiftUI

struct ContentView: View {
    @Binding var triggerAction: String?

    var body: some View {
        WebView(triggerAction: $triggerAction)
            .frame(minWidth: 760, idealWidth: 1440, maxWidth: .infinity, minHeight: 600, idealHeight: 900, maxHeight: .infinity)
            .background(Color(nsColor: .windowBackgroundColor))
    }
}
