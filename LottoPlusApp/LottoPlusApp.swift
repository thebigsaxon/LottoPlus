import SwiftUI

@main
struct LottoPlusApp: App {
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

            // Custom Game Switcher Menu
            CommandMenu("Game") {
                Button("Powerball (5 + 1)") {
                    triggerAction = "gamePowerball"
                }
                .keyboardShortcut("1", modifiers: [.command])

                Button("Mega Millions (5 + 1)") {
                    triggerAction = "gameMegaMillions"
                }
                .keyboardShortcut("2", modifiers: [.command])

                Button("Cash 5 (5 Balls)") {
                    triggerAction = "gameCash5"
                }
                .keyboardShortcut("3", modifiers: [.command])
            }
        }
    }
}
