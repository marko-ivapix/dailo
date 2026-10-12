import UIKit
import UniformTypeIdentifiers

// Redesign R55: "Podeli u Dailo" on the iPhone (Android: the SEND intent). A share extension may not open its app, so
// the shared text or link waits in the App Group; Dailo takes it the next time it opens and puts it in Quick Add, and a
// link becomes an Inbox resource, as on Android. This file belongs to the "DailoShare" Share Extension target that
// docs/v2/ios-widgeti.md creates in Xcode.
class ShareViewController: UIViewController {
    private let appGroup = "group.cloud.ivapix.dailo"

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        Task { await collect() }
    }

    private func collect() async {
        var text = ""
        var url = ""
        for item in (extensionContext?.inputItems as? [NSExtensionItem]) ?? [] {
            if text.isEmpty, let content = item.attributedContentText?.string { text = content }
            for provider in item.attachments ?? [] {
                if url.isEmpty, provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
                   let value = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
                    url = value.absoluteString
                }
                if text.isEmpty, provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                   let value = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
                    text = value
                }
            }
        }
        if !text.isEmpty || !url.isEmpty, let defaults = UserDefaults(suiteName: appGroup) {
            var queue = defaults.array(forKey: "dailoShared") as? [[String: String]] ?? []
            queue.append(["text": text, "url": url])
            defaults.set(Array(queue.suffix(20)), forKey: "dailoShared")
        }
        await MainActor.run { finish(saved: !text.isEmpty || !url.isEmpty) }
    }

    private func finish(saved: Bool) {
        let alert = UIAlertController(title: saved ? "Sačuvano za Dailo" : "Nema teksta ni linka",
                                      message: saved ? "Otvori Dailo da ga dodaš." : nil, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "U redu", style: .default) { [weak self] _ in
            self?.extensionContext?.completeRequest(returningItems: nil)
        })
        present(alert, animated: true)
    }
}
