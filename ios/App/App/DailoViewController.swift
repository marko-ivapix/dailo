import UIKit
import Capacitor

// Redesign R55: registers the app's own plugins with the Capacitor bridge; Main.storyboard uses this class.
class DailoViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(DailoWidgetPlugin())
    }
}
