import SwiftUI

struct ContentView: View {
    @State private var activeGame = "powerball"
    @Binding var triggerAction: String?

    var body: some View {
        WebView(activeGame: $activeGame, triggerAction: $triggerAction)
            .frame(minWidth: 1100, idealWidth: 1280, minHeight: 720, idealHeight: 850)
            .background(Color(red: 11/255, green: 15/255, blue: 25/255))
    }
}
