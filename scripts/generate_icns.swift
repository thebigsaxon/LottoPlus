import AppKit

let canvas = CGSize(width: 1024, height: 1024)
let image = NSImage(size: canvas)
image.lockFocus()

guard let context = NSGraphicsContext.current?.cgContext else { exit(1) }
context.setShouldAntialias(true)

let iconRect = CGRect(x: 64, y: 64, width: 896, height: 896)
let squircle = NSBezierPath(roundedRect: iconRect, xRadius: 210, yRadius: 210)
NSColor(red: 24/255, green: 116/255, blue: 88/255, alpha: 1).setFill()
squircle.fill()

NSColor.white.withAlphaComponent(0.18).setStroke()
squircle.lineWidth = 10
squircle.stroke()

let plateRect = CGRect(x: 254, y: 254, width: 516, height: 516)
let plate = NSBezierPath(ovalIn: plateRect)
NSColor(red: 248/255, green: 247/255, blue: 243/255, alpha: 1).setFill()
plate.fill()

context.saveGState()
context.setStrokeColor(NSColor(red: 24/255, green: 116/255, blue: 88/255, alpha: 1).cgColor)
context.setLineWidth(28)
context.setLineCap(.round)

for y in [422.0, 602.0] {
    context.move(to: CGPoint(x: 362, y: y))
    context.addLine(to: CGPoint(x: 662, y: y))
}
for x in [422.0, 602.0] {
    context.move(to: CGPoint(x: x, y: 362))
    context.addLine(to: CGPoint(x: x, y: 662))
}
context.strokePath()

context.setFillColor(NSColor(red: 24/255, green: 116/255, blue: 88/255, alpha: 1).cgColor)
context.fillEllipse(in: CGRect(x: 477, y: 477, width: 70, height: 70))
context.restoreGState()

image.unlockFocus()

guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: 1024,
    pixelsHigh: 1024,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
) else { exit(1) }
bitmap.size = canvas
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
image.draw(in: CGRect(origin: .zero, size: canvas), from: .zero, operation: .copy, fraction: 1)
NSGraphicsContext.restoreGraphicsState()

guard let png = bitmap.representation(using: .png, properties: [:]) else { exit(1) }
try png.write(to: URL(fileURLWithPath: "assets/AppIcon1024.png"))
print("Generated assets/AppIcon1024.png")
