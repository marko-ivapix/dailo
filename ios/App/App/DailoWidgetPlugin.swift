import Foundation
import Capacitor
import WidgetKit

// Redesign R55: the iPhone side of the DailoWidget plugin (Android: WidgetPlugin.java). The app hands the home-screen
// widgets the same JSON snapshot Android gets, and the share extension leaves shared text here for the app to take.
// Both go through the App Group group.cloud.ivapix.dailo (docs/v2/ios-widgeti.md). Without the App Group the calls
// still succeed; the widgets then show "Otvori Dailo".
@objc(DailoWidgetPlugin)
public class DailoWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DailoWidgetPlugin"
    public let jsName = "DailoWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeShared", returnType: CAPPluginReturnPromise)
    ]

    static let group = "group.cloud.ivapix.dailo"
    static let snapshotKey = "dailoWidgetSnapshot"
    static let sharedKey = "dailoShared"

    @objc func update(_ call: CAPPluginCall) {
        guard let snapshot = call.getString("snapshot"), let defaults = UserDefaults(suiteName: DailoWidgetPlugin.group) else {
            call.reject("No snapshot")
            return
        }
        defaults.set(snapshot, forKey: DailoWidgetPlugin.snapshotKey)
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    @objc func takeShared(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: DailoWidgetPlugin.group) else {
            call.resolve(["items": []])
            return
        }
        let items = defaults.array(forKey: DailoWidgetPlugin.sharedKey) as? [[String: String]] ?? []
        defaults.removeObject(forKey: DailoWidgetPlugin.sharedKey)
        call.resolve(["items": items])
    }
}
