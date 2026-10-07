# Area Knowledge and Routines Prototype Design

> This is a user-approved prototype extension to V1.3. The approved V1.3 design remains binding where it conflicts; this document only adds the behaviors below.

## Goal

Let an Area hold its work plus independent Notes and Resources, make Goal horizons easier to scan, and group Habits into Morning, Daily, and Night routines. Keep this local-first, desktop-first, and immediately usable with no backend or framework.

## Non-negotiable constraints

- Preserve V1.2/V1.3 behavior, current IDs, Search behavior, and the no-bulk-action rule.
- Keep metadata in localStorage and binary files in the existing IndexedDB attachment store.
- Reuse the current attachment limit, validation, delete-confirmation, Undo, backup, and recovery flows.
- Do not delete related records when an Area is deleted; clear their `areaId` instead.
- Keep the existing dark BDS tokens, native controls, Escape behavior, and focus return.

## Data model

`state.notes` and `state.resources` are new top-level arrays. Existing data migrates losslessly with both arrays defaulting to `[]`.

```js
Note {
  id, title, body, areaId,
  attachmentIds, linkUrls,
  createdAt, updatedAt
}

Resource {
  id, title, description, areaId,
  linkUrls, attachmentIds,
  relatedTaskIds, relatedProjectIds, relatedGoalIds, relatedHabitIds,
  createdAt, updatedAt
}
```

`areaId` is optional for both objects, consistent with existing Projects, Goals, and Habits. A Resource may have multiple links and files/images. Links are normalized, duplicate non-empty values are removed, and only the current attachment pipeline creates binary records.

Existing `Goal` gains `horizon: 'short' | 'mid' | 'long'`, defaulting existing goals to `'short'`. Monthly is not persisted as a competing horizon: the Goals page derives a `By month` grouping from `targetDate`, leaving undated Goals in an `Undated` group.

Existing `Habit` gains `routine: 'morning' | 'daily' | 'night'`, defaulting existing habits to `'daily'`. Routine does not replace frequency, tracking, lifecycle, reminders, or continuation rules.

## Surfaces and behavior

### Task properties and images

The existing attachment section remains the only attachment pipeline. It is shown under Task Properties with a clear image-upload affordance (`accept="image/*"`) while preserving the existing general-file attachment flow. Existing attachments remain visible and deletable under their current confirmation → delete → Undo behavior.

### Areas

The user-facing starter Areas are Family & Friends, Work, Personal Growth, Home, Travel, Health, Career, and Finance. They are sample data only: they are added only by an explicit starter-data action and never overwrite, duplicate, or reset a user's Areas.

Area Detail retains Projects, standalone Tasks, Goals, and Habits, and adds Notes and Resources sections with counts, open controls, and contextual New Note/New Resource actions. Contextual creation preselects the Area. Area summary adds the two counts. On Area deletion, linked Notes and Resources remain, with only `areaId` cleared.

### Notes and Resources

Notes and Resources each have a dedicated list route, detail/edit surface, and Area-filtered section. A Note contains title, body, optional links, and optional attachments. A Resource contains title, description, multiple links, multiple attachments, plus optional links to Tasks, Projects, Goals, and Habits. Removing an attachment uses the established attachment confirmation/Undo mechanism. Deleting a Note or Resource follows the established universal confirmation → delete → Undo contract and retains referenced attachments through the Undo window.

This prototype does not add tags, ratings, versions, sharing, external sync, rich-text editing, or a new file store.

### Goals

Goal create/edit shows a Horizon picker. The default Goals surface has horizon filters/sections for Short-term, Mid-term, and Long-term. `By month` is a view switch that groups active Goals by the calendar month of `targetDate`; it does not change Goal progress, reminders, lifecycle, or Calendar behavior.

### Habits

Habit create/edit shows a Routine picker. The Habits module groups active Habits into Morning, Daily, and Night sections. Today keeps its existing schedule-first behavior but may label each Habit with its routine; it does not turn routines into a new dashboard.

The initial prototype data represents:

- Morning: cold shower, Wim Hof breathing, 10-minute workout, beard balm.
- Daily: no-nut, training four times per week, sleep before midnight, sleep 7–8 hours, program 30 minutes, read/learn 30 minutes.
- Night: beard balm, enter tomorrow's tasks.

The sample creation action creates only missing items with stable sample markers, so repeating it is safe and does not overwrite user edits.

## Migration, backup, and safety

Migration normalizes new arrays and fields without rejecting existing V3 data. Validation checks entity IDs, strings, array shapes, Area/related-object references, and attachment IDs. Existing ZIP export/import, safety ZIP, recovery snapshots, and reset/restore include Notes, Resources, and their attachment references. Any source mismatch, invalid reference, failed binary write, or incomplete rollback retains recovery data and surfaces the existing actionable warning rather than silently dropping content.

## Prototype delivery order

1. Extend normalization, validation, storage ownership, and starter data.
2. Add Note/Resource routes, Area Detail sections, creation/editing, and safe delete/Undo attachment ownership.
3. Add Goal horizon and derived month view.
4. Add Habit routine grouping and the approved starter routines.
5. Place the existing image attachment flow in Task Properties and make the new routes keyboard-accessible.

## Explicitly deferred

- Cloud sync, sharing, accounts, rich text, resource ratings/versioning, new Search semantics, bulk actions, and a new binary store.
- Full release-grade regression/review cycles remain deferred under the user's fast-prototype workflow; existing data-safety behavior must not be weakened.
