(function (root, factory) {
  const api = factory(root.TodoI18n || (typeof require === 'function' ? require('./i18n.js') : null));
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DailoStarterExamples = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (I18n) {
  'use strict';
  const { tr, msg } = I18n;

  // R66: "Popuni primerima" adds the user's own structure (replacing the R29 set): five Areas, the shopping, learning,
  // bucket and movie lists as Projects, the habits, camping and hiking as project templates, books as Resources.
  // Every item carries a stable sampleKey, so a later run adds only what is missing and never duplicates a name.
  const PREFIX = 'workspace-starter-v3';
  // The habits and three Areas keep their first-set keys, so a workspace filled before R66 is recognized.
  const FIRST = 'area-routines-v1';

  // [key, name, icon, sampleKey]
  const AREAS = [
    ['personal', msg('Personal'), 'ph-graduation-cap', `${PREFIX}:area:personal`],
    ['work', msg('Work'), 'ph-briefcase', `${FIRST}:area:work`],
    ['home', msg('Home'), 'ph-house', `${FIRST}:area:home`],
    ['health', msg('Health'), 'ph-heart', `${FIRST}:area:health`],
    ['hobbies', msg('Hobbies and nature'), 'ph-plant', `${PREFIX}:area:hobbies`],
  ];

  // The user's tags from the lists they kept before (Vrsta), plus Shopping.
  const TAGS = [
    ['house', msg('House'), '#9AA0A6'], ['private', msg('Private'), '#4CAF7D'], ['work', msg('Work'), '#B07A4F'], ['art', msg('Art'), '#A879FF'],
    ['hobby', msg('Hobby'), '#4C8DF0'], ['health', msg('Health'), '#F5B942'], ['shopping', msg('Shopping'), '#FF8A5B'],
  ];

  // [routine, key, name, area, fields]
  const HABITS = [
    ['morning', 'cold-shower', msg('Cold shower'), 'health', {}], ['morning', 'wim-hof-breathing', msg('Wim Hof breathing'), 'health', {}],
    ['morning', '10-minute-workout', msg('10-minute workout'), 'health', {}], ['morning', 'beard-balm', msg('Beard balm'), 'personal', {}],
    ['daily', 'training', msg('Training four times per week'), 'health', { frequencyType: 'timesPerWeek', timesPerWeek: 4 }],
    ['daily', 'sleep-before-midnight', msg('Sleep before midnight'), 'health', {}], ['daily', 'sleep-7-8-hours', msg('Sleep 7–8 hours'), 'health', {}],
    ['daily', 'program-30-minutes', msg('Program 30 minutes'), 'work', {}], ['daily', 'read-learn-30-minutes', msg('Read/learn 30 minutes'), 'personal', {}],
    ['night', 'tomorrow-tasks', msg("Enter tomorrow's tasks"), 'personal', {}],
  ];

  const PROJECTS = [
    ['groceries', msg('Groceries'), 'home'], ['to-buy', msg('To buy'), 'home'], ['clothes', msg('Clothes'), 'personal'], ['motorcycle', msg('Motorcycle'), 'hobbies'],
    ['to-learn', msg('To learn'), 'personal'], ['bucket-list', msg('Bucket list'), 'personal'], ['movies', msg('Movies and series'), 'personal'],
  ];

  // [project, key, title, { tags, inMonths: rough month from this one, calendarMonth: the next such month (1–12) }].
  // Product names stay as they are in every language.
  const TASKS = [
    ['groceries', 'eggs', msg('Eggs'), {}], ['groceries', 'milk', msg('Milk'), {}], ['groceries', 'bananas', msg('Bananas'), {}], ['groceries', 'fabric-softener', msg('Fabric softener'), {}],
    ['to-buy', 'iron', msg('Iron'), { tags: ['house'], inMonths: 1 }], ['to-buy', 'car-floor-mats', msg('Car floor mats'), { tags: ['private'], inMonths: 1 }],
    ['to-buy', 'hubcaps', msg('Hubcaps'), { tags: ['private'], inMonths: 2 }], ['to-buy', 'tools', msg('Tools'), { tags: ['house'] }],
    ['clothes', 't-shirt', msg('T-shirt'), { inMonths: 0 }], ['clothes', 'hoodie', msg('Hoodie'), { inMonths: 1 }], ['clothes', 'socks', msg('Socks'), { inMonths: 0 }],
    ['motorcycle', 'summer-jacket', msg('Summer jacket'), { tags: ['shopping'], calendarMonth: 4 }],
    ['motorcycle', 'chain-sprockets', msg('Chain and sprockets'), { calendarMonth: 3 }], ['motorcycle', 'battery', msg('Battery'), { calendarMonth: 3 }],
    ['to-learn', 'javascript', 'JavaScript', { tags: ['work'], calendarMonth: 1 }], ['to-learn', 'canva', 'Canva', { tags: ['work'], calendarMonth: 1 }],
    ['to-learn', 'photoshop', 'Photoshop', { tags: ['work'], calendarMonth: 1 }], ['to-learn', 'figma', msg('Figma (Marko Pešić course)'), { tags: ['work'], calendarMonth: 1 }],
    ['to-learn', 'interior-design', msg('Interior design'), { tags: ['art'] }], ['to-learn', 'house-building', msg('How a house is built'), { tags: ['art'] }],
    ['to-learn', 'instrument', msg('A musical instrument'), { tags: ['art', 'hobby'] }], ['to-learn', 'cooking', msg('Cooking'), { tags: ['health'] }],
    ['to-learn', 'training-plan', msg('Training plan'), { tags: ['health'], calendarMonth: 1 }], ['to-learn', 'meal-plan', msg('Meal plan'), { tags: ['health'], calendarMonth: 1 }],
    ['bucket-list', 'northern-lights', msg('See the northern lights'), {}], ['bucket-list', 'japan', msg('Japan in cherry blossom season'), {}],
    ['bucket-list', 'skydive', msg('Skydive'), {}], ['bucket-list', 'bobotov-kuk', msg('Climb Bobotov Kuk on Durmitor'), {}],
    ['bucket-list', 'tara-rafting', msg('Raft the Tara river'), {}], ['bucket-list', 'balloon', msg('Ride in a hot-air balloon'), {}],
    ['bucket-list', 'scuba', msg('Learn to scuba dive'), {}], ['bucket-list', 'rtanj', msg('Watch the sunrise from Rtanj'), {}],
    ['bucket-list', 'national-parks', msg('Visit every national park in Serbia'), {}],
    ['movies', 'who-is-singing', msg("Who's Singin' Over There?"), {}], ['movies', 'marathon-family', msg('The Marathon Family'), {}], ['movies', 'planet-earth', msg('Planet Earth II'), {}],
  ];

  // Packing lists the user repeats: each trip is a new project made from the template. [key, name, area, tasks].
  const TEMPLATES = [
    ['camping', msg('Camping'), 'hobbies', [
      [msg('Sleeping'), [msg('Tent'), msg('Sleeping bag'), msg('Sleeping pad'), msg('Pillow'), msg('Blanket')]],
      [msg('Water and food'), [msg('Water canister'), msg('Cutlery and dishes')]],
      [msg('Hygiene'), [msg('Towel'), msg('Shampoo'), msg('Paper tissues and wet wipes'), msg('Waterless hand wash')]],
      [msg('Gear'), [msg('Lamp'), msg('Power bank')]],
      [msg('Clothes'), [msg('Swimsuit')]],
    ]],
    ['hiking', msg('Hiking'), 'hobbies', [
      [msg('Check the weather forecast'), []],
      [msg('Tell someone your route'), []],
      [msg('Pack the backpack'), [msg('Hiking shoes'), msg('Rain jacket'), msg('Water'), msg('Snack'), msg('First aid kit'), msg('Offline map of the area'), msg('Power bank')]],
    ]],
  ];

  const BOOKS = [
    ['atomic-habits', msg('Atomic Habits'), 'James Clear', msg('Small habits built step by step: make them obvious, attractive, easy and satisfying.'), 'https://jamesclear.com/atomic-habits'],
    ['bridge-on-the-drina', msg('The Bridge on the Drina'), 'Ivo Andrić', msg('A novel about the bridge in Višegrad and four centuries of life around it.'), null],
    ['death-and-the-dervish', msg('Death and the Dervish'), 'Meša Selimović', msg('A novel about Sheikh Ahmed Nurudin and the search for justice.'), null],
    ['sapiens', msg('Sapiens'), 'Yuval Noah Harari', msg('A brief history of humankind.'), null],
  ];

  // Note bodies are lists of lines, so no catalog key holds a line break.
  const NOTES = [
    ['clothing-sizes', msg('Clothing sizes'), 'personal', [msg('Write the sizes down so shopping is quick.'), '', msg('T-shirt —'), msg('Hoodie —'), msg('Trousers —'), msg('Shoes —')]],
    ['emergency-numbers', msg('Emergency numbers'), 'health', [msg('Police 192'), msg('Fire service 193'), msg('Ambulance 194'), msg('Roadside assistance (AMSS) 1987'), msg('112 from a mobile phone also reaches the police')]],
  ];

  // view: the current collections. Returns only the new records, per collection.
  function workspaceExamples(view, { Core, uid, today, timestamp, habitDraft, PROJECT_COLORS }) {
    const plainName = value => Core.normalizeTagName(String(value || '')).toLocaleLowerCase();
    const existing = (collection, sampleKey, name, field = 'name') => (collection || []).find(item => item.sampleKey === sampleKey || plainName(item[field]) === plainName(name));
    const stamp = { createdAt: timestamp, updatedAt: timestamp };
    const out = { areas: [], tags: [], habits: [], projects: [], tasks: [], goals: [], notes: [], resources: [], templates: [] };
    const added = { projects: {}, habits: {} };
    const found = { areas: {}, tags: {}, projects: {}, tasks: {} };
    const color = (collection, list) => PROJECT_COLORS[((collection || []).length + list.length) % PROJECT_COLORS.length];

    for (const [key, name, icon, sampleKey] of AREAS) {
      const own = existing(view.areas, sampleKey, tr(name));
      const area = own || { id: uid('area'), sampleKey, name: tr(name), color: color(view.areas, out.areas), icon, status: 'active', isPinned: false, ...stamp };
      if (!own) out.areas.push(area);
      found.areas[key] = area;
    }
    const areaId = key => (key ? found.areas[key]?.id || null : null);

    for (const [key, name, tagColor] of TAGS) {
      const sampleKey = `${PREFIX}:tag:${key}`;
      const own = existing(view.tags, sampleKey, tr(name));
      const tag = own || { id: uid('tag'), sampleKey, name: tr(name), color: tagColor, ...stamp };
      if (!own) out.tags.push(tag);
      found.tags[key] = tag;
    }
    const tagIds = keys => [...new Set((keys || []).map(key => found.tags[key]?.id).filter(Boolean))];

    for (const [routine, key, name, area, fields] of HABITS) {
      const sampleKey = `${FIRST}:habit:${routine}:${key}`;
      const own = existing(view.habits, sampleKey, tr(name));
      if (own) continue;
      const frequencyType = fields.frequencyType || 'daily';
      const habit = {
        ...habitDraft(), id: uid('habit'), sampleKey, name: tr(name), areaId: areaId(area), routine, status: 'active', isInbox: false,
        goalIds: [], trackingType: 'checkbox', targetValue: 1, minimumTarget: null, idealTarget: null, graceDays: 0, unit: '', quickValues: [], frequencyType,
        weekdays: [], timesPerWeek: frequencyType === 'timesPerWeek' ? fields.timesPerWeek : null, everyNDays: null,
        startDate: today, continuation: 'automatic', endType: 'never', endDate: null, successfulPeriodsTarget: null, reminders: [], reminderFiredMoments: [], ...stamp,
      };
      out.habits.push(habit); added.habits[key] = habit;
    }

    for (const [key, name, area] of PROJECTS) {
      const sampleKey = `${PREFIX}:project:${key}`;
      const own = existing(view.projects, sampleKey, tr(name));
      if (own) { found.projects[key] = own; continue; }
      const project = { id: uid('project'), sampleKey, name: tr(name), color: color(view.projects, out.projects), areaId: areaId(area), goalIds: [], order: (view.projects || []).length + out.projects.length, isArchived: false, archivedAt: null, ...stamp };
      out.projects.push(project); found.projects[key] = added.projects[key] = project;
    }

    const makeTask = (title, fields) => ({
      id: uid('task'), title, notes: '', projectId: null, areaId: null, goalIds: [], plannedDate: null, plannedTime: null, dueDate: null, dueTime: null, durationMinutes: null,
      reminderAt: null, reminderFiredAt: null, recurrence: null, recurrenceBaseline: null, recurrenceSuccessorId: null, tagIds: [], priority: 'none', attachmentIds: [],
      isInbox: false, isCompleted: false, completedAt: null, subtasks: [], todayOrder: null, projectOrder: null, inboxOrder: null, ...stamp, ...fields,
    });
    const subtasks = titles => titles.map((title, order) => ({ id: uid('sub'), title: tr(title), order, isCompleted: false, completedAt: null }));
    const thisMonth = Core.monthKey(today);
    for (const [projectKey, key, title, fields] of TASKS) {
      const sampleKey = `${PREFIX}:task:${key}`;
      const project = found.projects[projectKey];
      const own = existing(view.tasks, sampleKey, tr(title), 'title');
      if (own) { found.tasks[key] = own; continue; }
      if (!project) continue;
      const plannedMonth = fields.calendarMonth ? Core.upcomingMonth(fields.calendarMonth, today) : Number.isInteger(fields.inMonths) ? Core.addMonths(thisMonth, fields.inMonths) : null;
      const projectOrder = [...(view.tasks || []), ...out.tasks].filter(item => item.projectId === project.id).length;
      const item = makeTask(tr(title), { sampleKey, projectId: project.id, tagIds: tagIds(fields.tags), projectOrder, ...(plannedMonth ? { plannedMonth } : {}) });
      out.tasks.push(item); found.tasks[key] = item;
    }

    // Links go both ways, so only to a project or habit this run adds; existing items are never changed.
    const goal = (key, title, area, horizon, days, fields) => {
      const sampleKey = `${PREFIX}:goal:${key}`;
      const own = existing(view.goals, sampleKey, tr(title), 'title');
      if (own) return own;
      const project = added.projects[fields.project], habit = added.habits[fields.habit?.[0]];
      // Without the link (the project or habit was already there), a linked goal would stay at 0%, so it is manual.
      const progressMode = fields.progressMode && (project || habit) ? fields.progressMode : 'manual';
      const record = {
        id: uid('goal'), sampleKey, title: tr(title), areaId: areaId(area), horizon, status: 'active', progressMode, progressType: fields.progressType || 'percentage',
        currentValue: 0, targetValue: fields.targetValue || 100, unit: fields.unit ? tr(fields.unit) : '', targetDate: fields.targetDate || Core.addDays(today, days), projectLinks: [], taskIds: [], habitLinks: [],
        milestones: [], reminders: { sevenDaysBefore: false, threeDaysBefore: false, oneDayBefore: false, onTargetDate: false, time: '09:00' }, reminderFiredMoments: [], completedAt: null, ...stamp,
      };
      if (project) { record.projectLinks.push({ projectId: project.id, contributionMode: 'allTasks', selectedTaskIds: [] }); project.goalIds.push(record.id); }
      if (habit) { record.habitLinks.push({ habitId: habit.id, metric: fields.habit[1], target: fields.habit[2] }); habit.goalIds.push(record.id); }
      out.goals.push(record);
      return record;
    };
    // The season starts in April; the goal is due on the first April 1st at least a month away.
    const soonest = Core.addDays(today, 30), april = Core.upcomingMonth(4, soonest);
    const season = `${`${april}-01` < soonest ? Core.addMonths(april, 12) : april}-01`;
    goal('motorcycle-season', msg('Get the motorcycle ready for the season'), 'hobbies', 'mid', 0, { progressMode: 'linkedTasks', project: 'motorcycle', targetDate: season });
    const reading = goal('books', msg('Read 12 books in a year'), 'personal', 'long', 365, { progressType: 'numeric', targetValue: 12, unit: msg('books') });
    goal('shape', msg('Stay in shape'), 'health', 'short', 84, { progressMode: 'linkedHabits', habit: ['training', 'totalCheckins', 48] });

    const resource = (key, fields) => {
      const sampleKey = `${PREFIX}:resource:${key}`;
      if (existing(view.resources, sampleKey, fields.title, 'title')) return;
      out.resources.push({
        id: uid('resource'), sampleKey, description: '', linkUrls: [], attachmentIds: [], status: 'unread', author: '', favorite: false, reviewedAt: null, clip: '',
        relatedTaskIds: [], relatedProjectIds: [], relatedGoalIds: [], relatedHabitIds: [], ...fields, ...stamp,
      });
    };
    const figma = found.tasks.figma;
    resource('figma-course', { title: tr('Figma course'), description: tr('The course for the Figma item in To learn.'), type: 'course', author: 'Marko Pešić', areaId: areaId('work'), relatedTaskIds: figma ? [figma.id] : [] });
    for (const [key, title, author, description, url] of BOOKS) {
      resource(key, { title: tr(title), description: tr(description), type: 'book', author, areaId: areaId('personal'), linkUrls: url ? [url] : [], relatedGoalIds: reading ? [reading.id] : [] });
    }

    for (const [key, title, area, lines] of NOTES) {
      const sampleKey = `${PREFIX}:note:${key}`;
      if (existing(view.notes, sampleKey, tr(title), 'title')) continue;
      out.notes.push({ id: uid('note'), sampleKey, title: tr(title), body: lines.map(line => (line ? tr(line) : '')).join('\n'), areaId: areaId(area), linkUrls: [], attachmentIds: [], favorite: false, clip: '', ...stamp });
    }

    for (const [key, name, area, list] of TEMPLATES) {
      const sampleKey = `${PREFIX}:template:${key}`;
      if (existing(view.templates, sampleKey, tr(name))) continue;
      // The template is taken from a project that is never saved, so the user's lists hold no camping project.
      const source = { id: `${PREFIX}:${key}`, name: tr(name), areaId: areaId(area), goalIds: [], color: PROJECT_COLORS[4] };
      const tasks = list.map(([title, items], projectOrder) => makeTask(tr(title), { projectId: source.id, subtasks: subtasks(items), projectOrder }));
      const { data } = Core.templateFromEntity('project', source, { tasks, goals: [] }, today);
      out.templates.push({ id: uid('template'), sampleKey, name: tr(name), type: 'project', data, ...stamp });
    }
    return out;
  }

  return { PREFIX, workspaceExamples };
});
