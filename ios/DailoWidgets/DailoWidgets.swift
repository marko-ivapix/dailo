import WidgetKit
import SwiftUI

// Redesign R55: the iPhone home-screen widgets "Danas" and "Navike" (Android: TodayWidget, HabitsWidget). They read
// the snapshot the app leaves in the App Group, the same JSON as on Android, and open Dailo through dailo:// links.
// This file belongs to the "DailoWidgets" Widget Extension target that docs/v2/ios-widgeti.md creates in Xcode.

private let appGroup = "group.cloud.ivapix.dailo"

struct DailoSnapshot: Decodable {
    struct Item: Decodable {
        let text: String
        let overdue: Bool?
        let done: Bool?
        let id: String?
    }
    struct Part: Decodable {
        let title: String?
        let summary: String?
        let items: [Item]?
        let more: String?
        let empty: String?
        let stale: String?
    }
    let date: String?
    let title: String?
    let summary: String?
    let items: [Item]?
    let more: String?
    let empty: String?
    let stale: String?
    let habits: Part?

    var today: Part { Part(title: title, summary: summary, items: items, more: more, empty: empty, stale: stale) }
}

struct DailoEntry: TimelineEntry {
    let date: Date
    let snapshot: DailoSnapshot?
}

struct DailoProvider: TimelineProvider {
    func placeholder(in context: Context) -> DailoEntry {
        DailoEntry(date: Date(), snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (DailoEntry) -> Void) {
        completion(DailoEntry(date: Date(), snapshot: load()))
    }

    // The app reloads the widgets on every change; after midnight the old day turns into "Otvori Dailo".
    func getTimeline(in context: Context, completion: @escaping (Timeline<DailoEntry>) -> Void) {
        let midnight = Calendar.current.startOfDay(for: Date().addingTimeInterval(86_400))
        completion(Timeline(entries: [DailoEntry(date: Date(), snapshot: load())], policy: .after(midnight)))
    }

    private func load() -> DailoSnapshot? {
        guard let text = UserDefaults(suiteName: appGroup)?.string(forKey: "dailoWidgetSnapshot"),
              let data = text.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(DailoSnapshot.self, from: data)
    }
}

private func todayKey() -> String {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: Date())
}

private let graphite = Color(red: 0.059, green: 0.067, blue: 0.078)
private let late = Color(red: 0.96, green: 0.73, blue: 0.26)

extension View {
    @ViewBuilder func dailoBackground() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(graphite, for: .widget)
        } else {
            background(graphite)
        }
    }
}

struct DailoListView: View {
    let part: DailoSnapshot.Part?
    let fallbackTitle: String
    let current: Bool
    let link: URL
    let rowLink: (DailoSnapshot.Item) -> URL?

    var body: some View {
        let rows = current ? Array((part?.items ?? []).prefix(5)) : []
        let note = part == nil ? "Otvori Dailo" : !current ? (part?.stale ?? "Otvori Dailo") : rows.isEmpty ? (part?.empty ?? "") : (part?.more ?? "")
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(part?.title ?? fallbackTitle).font(.headline).foregroundStyle(.white)
                Spacer()
                if current, let summary = part?.summary { Text(summary).font(.caption).foregroundStyle(.secondary) }
            }
            ForEach(Array(rows.enumerated()), id: \.offset) { _, item in
                if let url = rowLink(item) {
                    Link(destination: url) { row(item) }
                } else {
                    row(item)
                }
            }
            if !note.isEmpty { Text(note).font(.caption).foregroundStyle(.secondary) }
            Spacer(minLength: 0)
        }
        .widgetURL(link)
        .dailoBackground()
    }

    private func row(_ item: DailoSnapshot.Item) -> some View {
        Text(item.text)
            .font(.subheadline)
            .lineLimit(1)
            .foregroundStyle(item.overdue == true ? late : item.done == true ? Color.secondary : Color.white)
    }
}

struct DailoTodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "DailoToday", provider: DailoProvider()) { entry in
            DailoListView(part: entry.snapshot?.today, fallbackTitle: "Danas", current: entry.snapshot?.date == todayKey(),
                          link: URL(string: "dailo://today")!, rowLink: { _ in nil })
        }
        .configurationDisplayName("Dailo · Danas")
        .description("Današnji plan iz Dailo-a.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct DailoHabitsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "DailoHabits", provider: DailoProvider()) { entry in
            DailoListView(part: entry.snapshot?.habits, fallbackTitle: "Navike", current: entry.snapshot?.date == todayKey(),
                          link: URL(string: "dailo://habits")!, rowLink: { item in
                              guard item.done != true, let id = item.id?.addingPercentEncoding(withAllowedCharacters: .alphanumerics) else { return URL(string: "dailo://habits") }
                              return URL(string: "dailo://habit-done?id=\(id)")
                          })
        }
        .configurationDisplayName("Dailo · Navike")
        .description("Današnje navike; dodir na naviku je beleži.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@main
struct DailoWidgets: WidgetBundle {
    var body: some Widget {
        DailoTodayWidget()
        DailoHabitsWidget()
    }
}
