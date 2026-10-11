(function (root, factory) {
  const api = factory(root.TodoI18n || (typeof require === 'function' ? require('./i18n.js') : null));
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DailoStarterExamples = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (I18n) {
  'use strict';
  const { tr, msg } = I18n;

  // Redesign R29: the real-life example set that "Popuni primerima" adds after the first one (js/habits-ui.js).
  // Every item carries a stable sampleKey, so a later run adds only what is missing and never duplicates a name.
  const PREFIX = 'workspace-starter-v2';
  // The first set's Areas, found by name.
  const AREAS = { health: msg('Health'), home: msg('Home'), travel: msg('Travel'), finance: msg('Finance'), family: msg('Family & Friends'), growth: msg('Personal Growth') };

  const TAGS = [
    ['quick', msg('Quick (5 min)'), '#8FD14F'], ['waiting', msg('Waiting for'), '#F5B942'], ['phone', msg('Phone'), '#4CC9F0'],
    ['computer', msg('Computer'), '#5362FF'], ['shopping', msg('Shopping'), '#FF8A5B'], ['someday', msg('Someday'), '#A879FF'],
    ['low-energy', msg('Low energy'), '#F06A8A'],
  ];

  // [key, name, area, routine, fields]; water, steps and fruit come from common health advice, the rest from everyday routines.
  const HABITS = [
    ['water', msg('Drink 2 liters of water'), 'health', 'daily', { trackingType: 'numeric', targetValue: 2, unit: 'l', quickValues: [0.25, 0.5] }],
    ['steps', msg('10,000 steps'), 'health', 'daily', { trackingType: 'numeric', targetValue: 10000, unit: msg('steps'), quickValues: [1000, 2500] }],
    ['fruit-vegetables', msg('Five servings of fruit and vegetables'), 'health', 'daily', { trackingType: 'numeric', targetValue: 5, unit: msg('servings'), quickValues: [1] }],
    ['make-bed', msg('Make the bed'), 'home', 'morning', {}],
    ['meditate', msg('Meditate 10 minutes'), 'growth', 'morning', {}],
    ['spanish', msg('Spanish 15 minutes'), 'growth', 'daily', { frequencyType: 'weekdays', weekdays: [1, 2, 3, 4, 5] }],
    ['call-family', msg('Call your parents or a friend'), 'family', 'daily', { frequencyType: 'timesPerWeek', timesPerWeek: 2 }],
    ['expenses', msg('Write down expenses'), 'finance', 'night', {}],
    ['no-phone', msg('No phone an hour before bed'), 'health', 'night', {}],
    ['gratitude', msg('Write down three good things'), 'growth', 'night', {}],
  ];

  const PROJECTS = [['camping', msg('Camping at Tara'), 'travel'], ['bucket-list', msg('Bucket list'), 'growth'], ['moving', msg('Moving to a new apartment'), 'home'], ['birthday', msg('Birthday party'), 'family']];

  // [project, key, title, { due: days from today, tags, subtasks }]; the packing list follows common camping checklists.
  const PROJECT_TASKS = [
    ['camping', 'reserve-campsite', msg('Reserve a campsite'), { due: 14, tags: ['phone'] }],
    ['camping', 'weather', msg('Check the weather forecast'), { tags: ['quick'] }],
    ['camping', 'pack-sleeping', msg('Pack: tent and sleeping'), { subtasks: [msg('Tent, stakes and rainfly'), msg('Sleeping bag rated for the night temperature'), msg('Sleeping pad'), msg('Small pillow'), msg('Headlamp and spare batteries'), msg('Camping chairs'), msg('Tarp')] }],
    ['camping', 'pack-kitchen', msg('Pack: kitchen and water'), { subtasks: [msg('Camping stove and gas cartridge'), msg('Lighter and matches'), msg('Pot, pan and cutlery'), msg('Plates and mugs'), msg('Water bottles or a canister'), msg('Cooler bag'), msg('Food for each meal'), msg('Coffee and tea'), msg('Sponge, dish soap and trash bags')] }],
    ['camping', 'pack-clothes', msg('Pack: clothes'), { subtasks: [msg('Rain jacket'), msg('A warm layer for the evening'), msg('Hiking shoes'), msg('Spare socks'), msg('Hat and sunglasses'), msg('Swimsuit'), msg('Clothes to sleep in')] }],
    ['camping', 'pack-first-aid', msg('Pack: first aid and hygiene'), { subtasks: [msg('First aid kit: plasters, antiseptic, painkillers'), msg('Personal medication'), msg('Sunscreen'), msg('Mosquito and tick repellent'), msg('Toilet paper and wet wipes'), msg('Toothbrush and toothpaste'), msg('Quick-dry towel'), msg('Hand sanitizer')] }],
    ['camping', 'pack-forgotten', msg('Pack: often forgotten'), { subtasks: [msg('Power bank and chargers'), msg('Pocket knife or multi-tool'), msg('Rope and clothespins'), msg('Spare tent stakes'), msg('Offline map of the area'), msg('ID card and some cash')] }],
    ['camping', 'leave-no-trace', msg('Leave the campsite cleaner than you found it'), {}],
    ['bucket-list', 'northern-lights', msg('See the northern lights'), { tags: ['someday'] }],
    ['bucket-list', 'japan', msg('Japan in cherry blossom season'), { tags: ['someday'] }],
    ['bucket-list', 'skydive', msg('Skydive'), { tags: ['someday'] }],
    ['bucket-list', 'bobotov-kuk', msg('Climb Bobotov Kuk on Durmitor'), { tags: ['someday'] }],
    ['bucket-list', 'tara-rafting', msg('Raft the Tara river'), { tags: ['someday'] }],
    ['bucket-list', 'balloon', msg('Ride in a hot-air balloon'), { tags: ['someday'] }],
    ['bucket-list', 'scuba', msg('Learn to scuba dive'), { tags: ['someday'] }],
    ['bucket-list', 'rtanj', msg('Watch the sunrise from Rtanj'), { tags: ['someday'] }],
    ['bucket-list', 'national-parks', msg('Visit every national park in Serbia'), { tags: ['someday'] }],
    ['bucket-list', 'instrument', msg('Learn to play an instrument'), { tags: ['someday'] }],
    ['moving', 'moving-offers', msg('Compare offers from moving companies'), { due: 7, tags: ['phone'] }],
    ['moving', 'boxes', msg('Get boxes, tape and a marker'), { tags: ['shopping'] }],
    ['moving', 'first-night-box', msg('Pack a first-night box'), { subtasks: [msg('Phone chargers'), msg('Toiletries and towels'), msg('Bed sheets'), msg('Coffee and a few mugs'), msg('Basic tools and a flashlight'), msg('Medication')] }],
    ['moving', 'meters', msg('Read the electricity and water meters'), { tags: ['quick'] }],
    ['moving', 'internet', msg('Move the internet to the new address'), { tags: ['phone'] }],
    ['moving', 'register-address', msg('Register the new address with the police'), {}],
    ['moving', 'change-address', msg('Change the address at the bank and for the bills'), { tags: ['computer'] }],
    ['moving', 'deposit', msg('Get the deposit back from the landlord'), { tags: ['waiting'] }],
    ['birthday', 'guest-list', msg('Make the guest list'), {}],
    ['birthday', 'venue', msg('Book a place or plan the party at home'), { tags: ['phone'] }],
    ['birthday', 'invitations', msg('Send invitations'), { due: 10, tags: ['phone'] }],
    ['birthday', 'cake', msg('Order the cake'), { due: 17, tags: ['phone'] }],
    ['birthday', 'decorations', msg('Buy decorations and candles'), { tags: ['shopping'] }],
    ['birthday', 'food', msg('Plan food and drinks'), {}],
  ];

  // Recurring chores for Redovne obaveze: [key, title, area, frequency, interval, first date in days, tags].
  const CHORES = [
    ['bills', msg('Pay the bills (electricity, water, internet)'), 'finance', 'monthly', 1, 4, ['computer', 'quick']],
    ['bed-sheets', msg('Change the bed sheets'), 'home', 'weekly', 2, 2, ['low-energy']],
    ['tire-pressure', msg('Check tire pressure'), null, 'monthly', 1, 7, ['quick']],
    ['water-filter', msg('Replace the water filter'), 'home', 'monthly', 3, 20, []],
    ['medicine', msg('Check medicine expiry dates'), 'health', 'monthly', 6, 30, ['low-energy']],
    ['dentist', msg('Dental check-up'), 'health', 'monthly', 6, 45, ['phone']],
    ['photos', msg('Back up phone photos'), null, 'monthly', 1, 10, ['computer']],
    ['car-registration', msg('Car registration and technical inspection'), 'finance', 'yearly', 1, 60, []],
  ];

  // [key, title, area, horizon, days to the target date, fields]; milestones are [title, days from today].
  const GOALS = [
    ['books', msg('Read 12 books in a year'), 'growth', 'long', 365, { progressType: 'numeric', targetValue: 12, unit: msg('books') }],
    ['half-marathon', msg('Run a half marathon'), 'health', 'mid', 180, { milestones: [[msg('Run 5 km without stopping'), 30], [msg('Run 10 km'), 75], [msg('Run 15 km'), 120], [msg('Sign up for a race'), 150], [msg('Finish 21.1 km'), 180]] }],
    ['emergency-fund', msg('Emergency fund for three months'), 'finance', 'long', 365, { milestones: [[msg('One month of expenses saved'), 120], [msg('Two months of expenses saved'), 240], [msg('Three months of expenses saved'), 365]] }],
    ['spanish', msg('Learn Spanish to A1 level'), 'growth', 'mid', 120, { progressMode: 'linkedHabits', habits: [['spanish', 'totalCheckins', 60]], milestones: [[msg('Introduce yourself in Spanish'), 30], [msg('Order food in Spanish'), 75]] }],
    ['nature', msg('Spend more time in nature'), 'travel', 'short', 60, { progressMode: 'linkedTasks', projects: ['camping'] }],
  ];

  // Note bodies are lists of lines, so no catalog key holds a line break.
  const NOTES = [
    ['gift-ideas', msg('Gift ideas'), 'family', [msg('Write it down the moment someone mentions something they would like.'), '', msg('• Mom —'), msg('• Dad —'), msg('• Friends —'), msg('• Colleagues —')]],
    ['books', msg('Books to read'), 'growth', [msg('• Atomic Habits — James Clear'), msg('• The Bridge on the Drina — Ivo Andrić'), msg('• Death and the Dervish — Meša Selimović'), msg('• Sapiens — Yuval Noah Harari'), msg('• The Little Prince — Antoine de Saint-Exupéry')]],
    ['movies', msg('Movies and series to watch'), null, [msg("• Who's Singin' Over There?"), msg('• The Marathon Family'), msg('• Planet Earth II'), msg('• Add what friends recommend')]],
    ['proja', msg('Recipe: proja (cornbread)'), 'home', [msg('250 g cornmeal, 2 eggs, 200 ml yogurt, 100 ml oil, 200 ml sparkling water, 1 sachet of baking powder, salt, 150 g white cheese.'), '', msg('Mix everything, pour into a greased baking tin and bake for about 35 minutes at 200 °C.')]],
    ['emergency-numbers', msg('Emergency numbers'), 'health', [msg('Police 192'), msg('Fire service 193'), msg('Ambulance 194'), msg('Roadside assistance (AMSS) 1987'), msg('112 from a mobile phone also reaches the police')]],
  ];

  // [key, title, description, link, type, author, area, related]; related names keys of this set.
  const RESOURCES = [
    ['pss', msg('Mountaineering Association of Serbia'), msg('Hiking trips, marked trails and mountain huts across Serbia.'), 'https://www.pss.rs', 'other', '', 'travel', { projects: ['camping'] }],
    ['np-tara', msg('Tara National Park'), msg('Trails, viewpoints, campsites and park rules before the trip.'), 'https://www.nptara.rs', 'other', '', 'travel', { projects: ['camping'], goals: ['nature'] }],
    ['leave-no-trace', msg('Leave No Trace: the seven principles'), msg('How to camp and hike without leaving a trace behind.'), 'https://lnt.org/why/7-principles/', 'article', '', 'travel', { projects: ['camping'] }],
    ['who-activity', msg('WHO: physical activity'), msg('Adults: 150–300 minutes of moderate activity a week, plus muscle-strengthening on two or more days.'), 'https://www.who.int/europe/news-room/fact-sheets/item/physical-activity', 'article', '', 'health', { habits: ['steps'], goals: ['half-marathon'] }],
    ['atomic-habits', msg('Atomic Habits'), msg('Small habits built step by step: make them obvious, attractive, easy and satisfying.'), 'https://jamesclear.com/atomic-habits', 'book', 'James Clear', 'growth', { habits: ['make-bed', 'meditate'] }],
  ];

  const TRIP_PACKING = [msg('ID card or passport'), msg('Tickets and reservations'), msg('Travel health insurance'), msg('Phone charger and adapter'), msg('Medication'), msg('Toiletries'), msg('Clothes for each day'), msg('Cash and a card'), msg('Sunglasses'), msg('Headphones')];

  // view: the current collections plus what the first set adds in the same run. Returns only new records.
  function realLifeExamples(view, { Core, uid, today, timestamp, habitDraft, PROJECT_COLORS }) {
    const plainName = value => Core.normalizeTagName(String(value || '')).toLocaleLowerCase();
    const existing = (collection, sampleKey, name, field = 'name') => (collection || []).find(item => item.sampleKey === sampleKey || plainName(item[field]) === plainName(name));
    const areaId = key => (key ? (view.areas || []).find(area => plainName(area.name) === plainName(tr(AREAS[key])))?.id || null : null);
    const stamp = { createdAt: timestamp, updatedAt: timestamp };
    const out = { tags: [], habits: [], projects: [], tasks: [], goals: [], notes: [], resources: [], templates: [] };
    const added = { habits: {}, projects: {}, goals: {} };
    const found = { tags: {}, habits: {}, projects: {}, goals: {} };

    for (const [key, name, color] of TAGS) {
      const sampleKey = `${PREFIX}:tag:${key}`;
      const own = existing(view.tags, sampleKey, tr(name));
      const tag = own || { id: uid('tag'), sampleKey, name: tr(name), color, ...stamp };
      if (!own) out.tags.push(tag);
      found.tags[key] = tag;
    }
    const tagIds = keys => [...new Set((keys || []).map(key => found.tags[key]?.id).filter(Boolean))];

    for (const [key, name, area, routine, fields] of HABITS) {
      const sampleKey = `${PREFIX}:habit:${key}`;
      const own = existing(view.habits, sampleKey, tr(name));
      if (own) { found.habits[key] = own; continue; }
      const frequencyType = fields.frequencyType || 'daily';
      const habit = {
        ...habitDraft(), id: uid('habit'), sampleKey, name: tr(name), areaId: areaId(area), routine, status: 'active', isInbox: false,
        goalIds: [], trackingType: fields.trackingType || 'checkbox', targetValue: fields.targetValue || 1, minimumTarget: null, idealTarget: null, graceDays: 0,
        unit: fields.unit ? tr(fields.unit) : '', quickValues: [...(fields.quickValues || [])], frequencyType,
        weekdays: frequencyType === 'weekdays' ? [...fields.weekdays] : [], timesPerWeek: frequencyType === 'timesPerWeek' ? fields.timesPerWeek : null, everyNDays: null,
        startDate: today, continuation: 'automatic', endType: 'never', endDate: null, successfulPeriodsTarget: null, reminders: [], reminderFiredMoments: [], ...stamp,
      };
      out.habits.push(habit); found.habits[key] = added.habits[key] = habit;
    }

    for (const [key, name, area] of PROJECTS) {
      const sampleKey = `${PREFIX}:project:${key}`;
      const own = existing(view.projects, sampleKey, tr(name));
      if (own) { found.projects[key] = own; continue; }
      const project = { id: uid('project'), sampleKey, name: tr(name), color: PROJECT_COLORS[((view.projects || []).length + out.projects.length) % PROJECT_COLORS.length], areaId: areaId(area), goalIds: [], order: (view.projects || []).length + out.projects.length, isArchived: false, archivedAt: null, ...stamp };
      out.projects.push(project); found.projects[key] = added.projects[key] = project;
    }

    const allTasks = () => [...(view.tasks || []), ...out.tasks];
    const makeTask = (id, title, fields) => ({
      id, title, notes: '', projectId: null, areaId: null, goalIds: [], plannedDate: null, plannedTime: null, dueDate: null, dueTime: null, durationMinutes: null,
      reminderAt: null, reminderFiredAt: null, recurrence: null, recurrenceBaseline: null, recurrenceSuccessorId: null, tagIds: [], priority: 'none', attachmentIds: [],
      isInbox: false, isCompleted: false, completedAt: null, subtasks: [], todayOrder: null, projectOrder: null, inboxOrder: null, ...stamp, ...fields,
    });
    for (const [projectKey, key, title, fields] of PROJECT_TASKS) {
      const sampleKey = `${PREFIX}:task:${key}`;
      const project = found.projects[projectKey];
      if (!project || existing(view.tasks, sampleKey, tr(title), 'title')) continue;
      out.tasks.push(makeTask(uid('task'), tr(title), {
        sampleKey, projectId: project.id, dueDate: fields.due ? Core.addDays(today, fields.due) : null, tagIds: tagIds(fields.tags),
        subtasks: (fields.subtasks || []).map((item, order) => ({ id: uid('sub'), title: tr(item), order, isCompleted: false, completedAt: null })),
        projectOrder: allTasks().filter(task => task.projectId === project.id).length,
      }));
    }
    for (const [key, title, area, frequency, interval, days, tags] of CHORES) {
      const sampleKey = `${PREFIX}:task:${key}`;
      if (existing(view.tasks, sampleKey, tr(title), 'title')) continue;
      const id = uid('task'), date = Core.addDays(today, days);
      out.tasks.push(makeTask(id, tr(title), { sampleKey, areaId: areaId(area), plannedDate: date, dueDate: date, tagIds: tagIds(tags), recurrence: Core.normalizeRecurrenceV3({ frequency, interval, endType: 'never', seriesId: id }) }));
    }

    for (const [key, title, area, horizon, days, fields] of GOALS) {
      const sampleKey = `${PREFIX}:goal:${key}`;
      const own = existing(view.goals, sampleKey, tr(title), 'title');
      if (own) { found.goals[key] = own; continue; }
      const goal = {
        id: uid('goal'), sampleKey, title: tr(title), areaId: areaId(area), horizon, status: 'active', progressMode: fields.progressMode || 'manual', progressType: fields.progressType || 'percentage',
        currentValue: 0, targetValue: fields.targetValue || 100, unit: fields.unit ? tr(fields.unit) : '', targetDate: Core.addDays(today, days), projectLinks: [], taskIds: [], habitLinks: [],
        milestones: (fields.milestones || []).map(([name, offset], order) => ({ id: uid('milestone'), title: tr(name), date: Core.addDays(today, offset), order, isCompleted: false, completedAt: null })),
        reminders: { sevenDaysBefore: false, threeDaysBefore: false, oneDayBefore: false, onTargetDate: false, time: '09:00' }, reminderFiredMoments: [], completedAt: null, ...stamp,
      };
      // Links go both ways, so only to a project or habit this run adds; existing items are never changed.
      for (const projectKey of fields.projects || []) {
        const project = added.projects[projectKey]; if (!project) continue;
        goal.projectLinks.push({ projectId: project.id, contributionMode: 'allTasks', selectedTaskIds: [] }); project.goalIds.push(goal.id);
      }
      for (const [habitKey, metric, target] of fields.habits || []) {
        const habit = added.habits[habitKey]; if (!habit) continue;
        goal.habitLinks.push({ habitId: habit.id, metric, target }); habit.goalIds.push(goal.id);
      }
      out.goals.push(goal); found.goals[key] = added.goals[key] = goal;
    }

    for (const [key, title, area, lines] of NOTES) {
      const sampleKey = `${PREFIX}:note:${key}`;
      if (existing(view.notes, sampleKey, tr(title), 'title')) continue;
      out.notes.push({ id: uid('note'), sampleKey, title: tr(title), body: lines.map(line => (line ? tr(line) : '')).join('\n'), areaId: areaId(area), linkUrls: [], attachmentIds: [], favorite: false, clip: '', ...stamp });
    }
    for (const [key, title, description, url, type, author, area, related] of RESOURCES) {
      const sampleKey = `${PREFIX}:resource:${key}`;
      if (existing(view.resources, sampleKey, tr(title), 'title')) continue;
      const ids = (map, keys) => (keys || []).map(item => map[item]?.id).filter(Boolean);
      out.resources.push({
        id: uid('resource'), sampleKey, title: tr(title), description: tr(description), areaId: areaId(area), linkUrls: [url], attachmentIds: [], type, status: 'unread', author, favorite: false, reviewedAt: null, clip: '',
        relatedTaskIds: [], relatedProjectIds: ids(found.projects, related.projects), relatedGoalIds: ids(found.goals, related.goals), relatedHabitIds: ids(found.habits, related.habits), ...stamp,
      });
    }

    const template = (key, name, type, data) => {
      const sampleKey = `${PREFIX}:template:${key}`;
      if (!existing(view.templates, sampleKey, tr(name))) out.templates.push({ id: uid('template'), sampleKey, name: tr(name), type, data, ...stamp });
    };
    const packing = Core.templateFromEntity('task', { title: tr('Packing for a trip'), notes: '', tagIds: [], priority: 'none', subtasks: TRIP_PACKING.map(item => ({ title: tr(item) })) }, view, today).data;
    template('trip-packing', msg('Packing for a trip'), 'task', { ...packing, scheduleEnabled: false, scheduleDate: null, scheduleGeneratedOn: null });
    const camping = found.projects.camping;
    if (camping) {
      const weekend = Core.templateFromEntity('project', camping, { ...view, tasks: allTasks() }, today).data;
      template('camping-weekend', msg('Camping weekend'), 'project', { ...weekend, goalIds: [], goalLinkConfigs: [] });
    }
    return out;
  }

  return { PREFIX, realLifeExamples };
});
