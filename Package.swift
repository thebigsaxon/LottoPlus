// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "LottoPlus",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(
            name: "LottoPlus",
            targets: ["LottoPlus"]
        )
    ],
    targets: [
        .executableTarget(
            name: "LottoPlus",
            path: "LottoPlusApp",
            resources: [
                .copy("../index.html")
            ]
        )
    ]
)
