// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MusicMindCoreMidi",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "MusicMindCoreMidi",
            targets: ["CoreMidiPlugin"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.6.0")
    ],
    targets: [
        .target(
            name: "CoreMidiPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/CoreMidiPlugin"
        )
    ]
)
