import Foundation
import Capacitor
import CoreMIDI
import UIKit
import CoreAudioKit

@objc(CoreMidiPlugin)
public class CoreMidiPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CoreMidi"
    public let jsName = "CoreMidi"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listInputs", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listOutputs", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openBluetoothPicker", returnType: CAPPluginReturnPromise)
    ]

    private var midiClient = MIDIClientRef()
    private var inputPort = MIDIPortRef()
    private var outputPort = MIDIPortRef()
    private var connectedSource = MIDIEndpointRef()
    private var connectedDestination = MIDIEndpointRef()
    private var clientCreated = false

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": true])
    }

    @objc func listInputs(_ call: CAPPluginCall) {
        ensureClient()
        var devices: [[String: String]] = []
        let count = MIDIGetNumberOfSources()
        for i in 0..<count {
            let src = MIDIGetSource(i)
            devices.append([
                "id": String(src),
                "name": endpointName(src),
                "manufacturer": ""
            ])
        }
        call.resolve(["devices": devices])
    }

    @objc func listOutputs(_ call: CAPPluginCall) {
        ensureClient()
        var devices: [[String: String]] = []
        let count = MIDIGetNumberOfDestinations()
        for i in 0..<count {
            let dst = MIDIGetDestination(i)
            devices.append([
                "id": String(dst),
                "name": endpointName(dst),
                "manufacturer": ""
            ])
        }
        call.resolve(["devices": devices])
    }

    @objc func connect(_ call: CAPPluginCall) {
        ensureClient()
        disconnectInternal()

        let inputId = call.getString("inputId")
        let outputId = call.getString("outputId")

        let sourceCount = MIDIGetNumberOfSources()
        var source = MIDIEndpointRef()
        if let inputId, let valued = MIDIEndpointRef(exactly: Int(inputId) ?? 0), valued != 0 {
            source = valued
        } else if sourceCount > 0 {
            source = MIDIGetSource(0)
        }

        if source != 0 {
            let status = MIDIPortConnectSource(inputPort, source, nil)
            if status != noErr {
                call.reject("Failed to connect MIDI source (\(status))")
                return
            }
            connectedSource = source
        }

        let destCount = MIDIGetNumberOfDestinations()
        if let outputId, let valued = MIDIEndpointRef(exactly: Int(outputId) ?? 0), valued != 0 {
            connectedDestination = valued
        } else if destCount > 0 {
            connectedDestination = MIDIGetDestination(0)
        }

        call.resolve()
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        disconnectInternal()
        call.resolve()
    }

    @objc func send(_ call: CAPPluginCall) {
        guard connectedDestination != 0 else {
            call.resolve()
            return
        }
        guard let data = call.getArray("data", Int.self), !data.isEmpty else {
            call.reject("Missing data")
            return
        }

        var packet = MIDIPacket()
        packet.timeStamp = 0
        packet.length = UInt16(min(data.count, 256))
        withUnsafeMutableBytes(of: &packet.data) { raw in
            for (index, value) in data.prefix(256).enumerated() {
                raw[index] = UInt8(clamping: value)
            }
        }

        var packetList = MIDIPacketList(numPackets: 1, packet: packet)
        MIDISend(outputPort, connectedDestination, &packetList)
        call.resolve()
    }

    @objc func openBluetoothPicker(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let controller = CABTMIDICentralViewController()
            let nav = UINavigationController(rootViewController: controller)
            let done = UIBarButtonItem(
                barButtonSystemItem: .done,
                target: self,
                action: #selector(self.dismissBluetooth)
            )
            controller.navigationItem.rightBarButtonItem = done
            if let vc = self.bridge?.viewController {
                vc.present(nav, animated: true) {
                    call.resolve()
                }
            } else {
                call.reject("No view controller available")
            }
        }
    }

    @objc private func dismissBluetooth() {
        self.bridge?.viewController?.dismiss(animated: true)
    }

    private func ensureClient() {
        guard !clientCreated else { return }
        let name = "MusicMind" as CFString
        MIDIClientCreate(name, nil, nil, &midiClient)

        MIDIInputPortCreateWithBlock(midiClient, "MusicMindIn" as CFString, &inputPort) { [weak self] packetList, _ in
            self?.handlePackets(packetList)
        }
        MIDIOutputPortCreate(midiClient, "MusicMindOut" as CFString, &outputPort)
        clientCreated = true
    }

    private func disconnectInternal() {
        if connectedSource != 0 {
            MIDIPortDisconnectSource(inputPort, connectedSource)
            connectedSource = 0
        }
        connectedDestination = 0
    }

    private func handlePackets(_ packetList: UnsafePointer<MIDIPacketList>) {
        var packet = packetList.pointee.packet
        for _ in 0..<packetList.pointee.numPackets {
            let length = Int(packet.length)
            var bytes: [Int] = []
            withUnsafeBytes(of: packet.data) { raw in
                for i in 0..<length {
                    bytes.append(Int(raw[i]))
                }
            }
            if !bytes.isEmpty {
                notifyListeners("midimessage", data: [
                    "data": bytes,
                    "timestamp": Date().timeIntervalSince1970 * 1000
                ])
            }
            packet = MIDIPacketNext(&packet).pointee
        }
    }

    private func endpointName(_ endpoint: MIDIEndpointRef) -> String {
        var param: Unmanaged<CFString>?
        MIDIObjectGetStringProperty(endpoint, kMIDIPropertyDisplayName, &param)
        return param?.takeRetainedValue() as String? ?? "MIDI Device"
    }
}
