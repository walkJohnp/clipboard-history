import AppKit
import Foundation

struct ImageFormat {
  let pasteboardType: NSPasteboard.PasteboardType
  let extensionName: String
  let mimeType: String
}

func jsonEscape(_ value: String) -> String {
  var escaped = ""

  for character in value {
    switch character {
    case "\\":
      escaped += "\\\\"
    case "\"":
      escaped += "\\\""
    case "\n":
      escaped += "\\n"
    case "\r":
      escaped += "\\r"
    case "\t":
      escaped += "\\t"
    default:
      escaped.append(character)
    }
  }

  return escaped
}

func printJson(_ fields: [String: String]) {
  let body = fields
    .map { "\"\(jsonEscape($0.key))\":\"\(jsonEscape($0.value))\"" }
    .joined(separator: ",")
  print("{\(body)}")
}

func readImage(to outputDir: String) {
  let pasteboard = NSPasteboard.general
  let formats = [
    ImageFormat(pasteboardType: NSPasteboard.PasteboardType("public.png"), extensionName: "png", mimeType: "image/png"),
    ImageFormat(pasteboardType: NSPasteboard.PasteboardType("Apple PNG pasteboard type"), extensionName: "png", mimeType: "image/png"),
    ImageFormat(pasteboardType: NSPasteboard.PasteboardType("public.tiff"), extensionName: "tiff", mimeType: "image/tiff"),
    ImageFormat(pasteboardType: NSPasteboard.PasteboardType("NeXT TIFF v4.0 pasteboard type"), extensionName: "tiff", mimeType: "image/tiff")
  ]

  do {
    try FileManager.default.createDirectory(atPath: outputDir, withIntermediateDirectories: true)

    for format in formats {
      guard let data = pasteboard.data(forType: format.pasteboardType), !data.isEmpty else {
        continue
      }

      let fileName = "img_pending_\(UUID().uuidString).\(format.extensionName)"
      let filePath = (outputDir as NSString).appendingPathComponent(fileName)
      try data.write(to: URL(fileURLWithPath: filePath), options: .atomic)
      printJson([
        "success": "true",
        "filePath": filePath,
        "extension": format.extensionName,
        "mimeType": format.mimeType,
        "pasteboardType": format.pasteboardType.rawValue
      ])
      return
    }

    printJson(["success": "false", "error": "No image data found"])
    exit(1)
  } catch {
    printJson(["success": "false", "error": "\(error)"])
    exit(1)
  }
}

let args = CommandLine.arguments
if args.count >= 3 && args[1] == "--read-image" {
  readImage(to: args[2])
  exit(0)
}

let interval: useconds_t = 250_000
let pasteboard = NSPasteboard.general
var lastChangeCount = pasteboard.changeCount

print(lastChangeCount)
fflush(stdout)

while true {
  usleep(interval)

  let changeCount = pasteboard.changeCount
  if changeCount != lastChangeCount {
    lastChangeCount = changeCount
    print(changeCount)
    fflush(stdout)
  }
}
