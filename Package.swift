// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Cash5Studio",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(
            name: "Cash5Studio",
            targets: ["Cash5Studio"]
        )
    ],
    targets: [
        .executableTarget(
            name: "Cash5Studio",
            path: "LottoPlusApp",
            resources: [
                .copy("../index.html"),
                .copy("../css"),
                .copy("../js")
            ]
        )
    ]
)
