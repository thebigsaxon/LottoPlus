import SwiftUI

@main
struct Cash5StudioApp: App {
    @State private var triggerAction: String? = nil

    var body: some Scene {
        WindowGroup {
            ContentView(triggerAction: $triggerAction)
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified)
        .commands {
            // File Menu Shortcuts
            CommandGroup(replacing: .newItem) {
                Button("Import CSV...") {
                    triggerAction = "importCSV"
                }
                .keyboardShortcut("i", modifiers: [.command])

                Button("Open Project...") {
                    triggerAction = "openProject"
                }
                .keyboardShortcut("o", modifiers: [.command])

                Button("Save Project File...") {
                    triggerAction = "saveProject"
                }
                .keyboardShortcut("s", modifiers: [.command])
            }
            CommandMenu("Zoom") {
                Button("Zoom In") {
                    triggerAction = "zoomIn"
                }
                .keyboardShortcut("+", modifiers: [.command])

                Button("Zoom Out") {
                    triggerAction = "zoomOut"
                }
                .keyboardShortcut("-", modifiers: [.command])

                Button("Actual Size") {
                    triggerAction = "zoomReset"
                }
                .keyboardShortcut("0", modifiers: [.command])
            }
        }
    }
}
