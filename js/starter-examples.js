(function (root, factory) {
  const api = factory(root.TodoI18n || (typeof require === 'function' ? require('./i18n.js') : null));
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DailoStarterExamples = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (I18n) {
  'use strict';
  const { tr, msg } = I18n;

  // R67: "Popuni primerima" adds the user's own structure (replacing the R29 set): five Areas, the shopping, learning,
  // bucket and movie lists as Projects, the habits, camping and hiking as project templates, books as Resources.
  // Every item carries a stable sampleKey, so a later run adds only what is missing and never duplicates a name.
  const PREFIX = 'workspace-starter-v3';
  // The habits and three Areas keep their first-set keys, so a workspace filled before R67 is recognized.
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
    ['things-to-own', msg('Things to own'), 'personal'],
    // R71: two Redovne obaveze groups (isCleaningRoom) for the chores below.
    ['car-and-motorcycle', msg('Car and motorcycle'), null, true], ['health-and-bills', msg('Health and bills'), 'health', true],
  ];

  // R71: chores that repeat, in their Redovne obaveze group: [group, key, title, frequency, interval, first day].
  // The first day is a number of days from today, a calendar day ([month, day], the next one to come) or the next
  // property-tax instalment (due 45 days into each quarter).
  const CHORES = [
    ['car-and-motorcycle', 'car-registration', msg('Car registration and technical inspection'), 'yearly', 1, 30],
    ['car-and-motorcycle', 'motorcycle-registration', msg('Motorcycle registration'), 'yearly', 1, 60],
    ['car-and-motorcycle', 'car-service', msg('Car service (oil and filters)'), 'yearly', 1, 90],
    ['car-and-motorcycle', 'motorcycle-service', msg('Motorcycle service before the season'), 'yearly', 1, [3, 1]],
    ['car-and-motorcycle', 'winter-tyres', msg('Winter tyres'), 'yearly', 1, [10, 25]],
    ['car-and-motorcycle', 'summer-tyres', msg('Summer tyres'), 'yearly', 1, [4, 10]],
    ['car-and-motorcycle', 'tyre-pressure', msg('Tyre pressure'), 'monthly', 1, 7],
    ['car-and-motorcycle', 'car-fluids', msg('Car oil and fluids'), 'monthly', 1, 8],
    ['car-and-motorcycle', 'motorcycle-chain', msg('Lubricate and tension the motorcycle chain'), 'weekly', 2, 5],
    ['car-and-motorcycle', 'motorcycle-battery', msg('Motorcycle battery over the winter'), 'monthly', 1, 20],
    ['car-and-motorcycle', 'car-wash', msg('Car wash'), 'weekly', 2, 3],
    ['car-and-motorcycle', 'wiper-blades', msg('Wiper blades'), 'yearly', 1, 21],
    ['car-and-motorcycle', 'car-first-aid', msg('First aid kit expiry date in the car'), 'yearly', 1, 150],
    ['health-and-bills', 'dentist', msg('Dentist'), 'monthly', 6, 14],
    ['health-and-bills', 'check-up', msg('Medical check-up'), 'yearly', 1, 30],
    ['health-and-bills', 'eye-test', msg('Eye test'), 'yearly', 2, 60],
    ['health-and-bills', 'property-tax', msg('Property tax'), 'monthly', 3, 'property-tax'],
  ];
  const PROPERTY_TAX_DAYS = [[2, 14], [5, 15], [8, 14], [11, 14]];

  // R71: the user's shopping list for four days of the meal plan, as a task template for Namirnice.
  const MEAL_PLAN_SHOPPING = [
    msg('Chicken fillet – 620 g'), msg('Turkey fillet – 400 g'), msg('Lean beef – 220 g'), msg('Tuna in water – 160 g'), msg('Eggs – 7'), msg('Egg whites – 200 g'),
    msg('Skyr – 500 g'), msg('Low-fat cottage cheese – 230 g'), msg('Whey protein – 120 g'), msg('Milk – 200 ml'),
    msg('Oat flakes – 150 g'), msg('Rice (white or brown) – 260 g'), msg('Wholegrain pasta – 90 g'), msg('Wholegrain or rye bread – 300 g'), msg('Potatoes – 900 g'),
    msg('Rice cakes – 40 g'), msg('Bananas – 4'),
    msg('Canned mushrooms (drained) – 1100 g'), msg('Carrots – 300 g'), msg('Peppers – 500 g'), msg('Spinach – 270 g'), msg('Tomatoes – 300 g'), msg('Cabbage – 200 g'),
    msg('Onion – 50 g'), msg('Cucumber – 100 g'),
    msg('Blueberries – 100 g'), msg('Raspberries – 100 g'), msg('Almonds – 85 g'), msg('Walnuts – 20 g'),
    msg('Olive oil – 100 g'), msg('Creatine – 20 g'), msg('Omega-3 – as on the label'),
  ];

  // R71: saved views of the open tasks with a tag: [key, name, tag].
  const VIEWS = [['shopping', msg('Shopping'), 'shopping'], ['work', msg('Work'), 'work'], ['house', msg('House'), 'house'], ['health', msg('Health'), 'health']];

  // [project, key, title, { tags, inMonths: rough month from this one, calendarMonth: the next such month (1–12), items: subtasks }].
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
    // R69: the 81 dreams the user kept from the proposed 89, in its order: travel, Serbia and the Balkans, the motorcycle,
    // adrenaline, nature, health, learning, food, life. The R67 dreams keep their keys.
    ['bucket-list', 'northern-lights', msg('See the northern lights'), {}], ['bucket-list', 'japan', msg('Japan in cherry blossom season'), {}],
    ['bucket-list', 'safari', msg('A safari in Tanzania or Kenya'), {}], ['bucket-list', 'great-wall', msg('The Great Wall of China'), {}],
    ['bucket-list', 'petra', msg('Petra in Jordan'), {}], ['bucket-list', 'desert', msg('See a desert'), {}],
    ['bucket-list', 'new-york', msg('New York'), {}], ['bucket-list', 'dolomites', msg('The Dolomites'), {}],
    ['bucket-list', 'santorini', msg('Sunset on Santorini'), {}], ['bucket-list', 'thailand', msg('The islands of Thailand'), {}],
    ['bucket-list', 'trans-siberian', msg('The Trans-Siberian Railway'), {}], ['bucket-list', 'month-abroad', msg('Live for a month in another country, working remotely'), {}],
    ['bucket-list', 'eclipse', msg('A total solar eclipse (the next one nearby: 2 August 2027, southern Spain)'), {}], ['bucket-list', 'italy', msg('Rome, Florence and Venice'), {}],
    ['bucket-list', 'national-parks', msg('Visit all five national parks of Serbia'), {}], ['bucket-list', 'rtanj', msg('Watch the sunrise from Rtanj'), {}],
    ['bucket-list', 'midzor', msg('Climb Midžor'), {}], ['bucket-list', 'uvac', msg('Uvac: the meanders and the griffon vultures'), {}],
    ['bucket-list', 'devils-town', msg("Devil's Town"), {}], ['bucket-list', 'sargan', msg('The Šargan Eight and Drvengrad'), {}],
    ['bucket-list', 'monasteries', msg('Studenica, Sopoćani and Žiča'), {}], ['bucket-list', 'tara-rafting', msg('Raft the Tara river'), {}],
    ['bucket-list', 'bobotov-kuk', msg('Climb Bobotov Kuk on Durmitor'), {}], ['bucket-list', 'prokletije', msg('Prokletije: hike from Valbona to Theth'), {}],
    ['bucket-list', 'plitvice', msg('The Plitvice Lakes'), {}], ['bucket-list', 'ohrid', 'Ohrid', {}],
    ['bucket-list', 'lovcen', msg('Lovćen and the fortress above Kotor'), {}], ['bucket-list', 'balkan-ride', msg('A motorcycle tour around the Balkans'), {}],
    ['bucket-list', 'transfagarasan', msg('Transfăgărășan and Transalpina in Romania'), {}], ['bucket-list', 'alpine-passes', msg('Alpine passes: Stelvio and Grossglockner'), {}],
    ['bucket-list', 'track-day', msg('A day on a race track'), {}], ['bucket-list', 'enduro', msg('An off-road enduro weekend'), {}],
    ['bucket-list', 'motogp', msg('A MotoGP race live (e.g. Mugello)'), {}], ['bucket-list', 'skydive', msg('Skydive'), {}],
    ['bucket-list', 'balloon', msg('Ride in a hot-air balloon'), {}], ['bucket-list', 'scuba', msg('Learn to scuba dive (with a certificate)'), {}],
    ['bucket-list', 'bungee', msg('Bungee jumping'), {}], ['bucket-list', 'paragliding', msg('Paragliding'), {}],
    ['bucket-list', 'via-ferrata', msg('A via ferrata'), {}], ['bucket-list', 'surf', msg('Learn to surf'), {}],
    ['bucket-list', 'kayak', msg('Kayak on the sea or through a canyon'), {}], ['bucket-list', 'igloo', msg('Sleep in an igloo or an ice hotel'), {}],
    ['bucket-list', 'whales', msg('Watch whales on the open sea'), {}], ['bucket-list', 'long-hike', msg('A multi-day hike with a backpack (part of the Via Dinarica)'), {}],
    ['bucket-list', 'solo-camping', msg('A few days of camping alone'), {}], ['bucket-list', 'milky-way', msg('See the Milky Way far from city lights'), {}],
    ['bucket-list', 'beach-camping', msg('Camp on a beach'), {}], ['bucket-list', 'ice-swim', msg('An ice-cold swim in a river or lake in winter'), {}],
    ['bucket-list', 'half-marathon', msg('Run a half marathon'), {}], ['bucket-list', 'marathon', msg('Run a marathon'), {}],
    ['bucket-list', 'triathlon', msg('Finish a sprint triathlon'), {}], ['bucket-list', 'century-ride', msg('100 km by bike in one day'), {}],
    ['bucket-list', 'push-ups', msg('100 push-ups in one set'), {}], ['bucket-list', 'no-sugar', msg('30 days without sugar'), {}],
    ['bucket-list', 'offline-week', msg('A week without the phone and the internet'), {}], ['bucket-list', 'play-instrument', msg('Learn to play an instrument'), {}],
    ['bucket-list', 'language', msg('A foreign language to B2'), {}], ['bucket-list', 'own-app', msg('Build and publish your own app'), {}],
    ['bucket-list', 'photo-book', msg('A photography course and a printed photo book'), {}], ['bucket-list', 'skipper', msg('Get a skipper licence'), {}],
    ['bucket-list', 'martial-art', msg('A martial art or self-defence'), {}], ['bucket-list', 'dance', msg('Learn to dance (salsa or tango)'), {}],
    ['bucket-list', 'furniture', msg('Make a piece of furniture with your own hands'), {}], ['bucket-list', 'hundred-books', msg('Read 100 books'), {}],
    ['bucket-list', 'naples-pizza', msg('Real pizza in Naples'), {}], ['bucket-list', 'tokyo-ramen', msg('Ramen in Tokyo'), {}],
    ['bucket-list', 'cooking-course', msg('A cooking course in Italy or Thailand'), {}], ['bucket-list', 'michelin', msg('Dinner at a Michelin-starred restaurant'), {}],
    ['bucket-list', 'ajvar', msg('Make your own ajvar'), {}], ['bucket-list', 'own-house', msg('Build your own house'), {}],
    ['bucket-list', 'home-style', msg('Furnish the flat to your own taste'), {}], ['bucket-list', 'plant-tree', msg('Plant a tree'), {}],
    ['bucket-list', 'vegetable-garden', msg('A vegetable garden and its harvest'), {}], ['bucket-list', 'dream-bike', msg('The motorcycle of your dreams'), {}],
    ['bucket-list', 'give-blood', msg('Give blood 10 times'), {}], ['bucket-list', 'volunteer', msg('Volunteer'), {}],
    ['bucket-list', 'letter', msg('Write a letter to yourself in 10 years'), {}], ['bucket-list', 'family-tree', msg('Make a family tree'), {}],
    ['bucket-list', 'festival', msg('A big music festival'), {}], ['bucket-list', 'savings', msg('Savings for a year of living'), {}],
    ['bucket-list', 'own-business', msg('Start your own business or project'), {}],
    ['movies', 'who-is-singing', msg("Who's Singin' Over There?"), {}], ['movies', 'marathon-family', msg('The Marathon Family'), {}], ['movies', 'planet-earth', msg('Planet Earth II'), {}],
    // R70: the things to own the user kept, one task per group with the things as subtasks.
    ['things-to-own', 'own-clothes', msg('Clothes and shoes'), { items: [msg('A dark suit'), msg('A light blue shirt'), msg('A dark plain tie'), msg('Leather belts, black and brown'),
      msg('Black leather shoes'), msg('Brown shoes or boots'), msg('White sneakers'), msg('Dark jeans'), msg('Chinos'), msg('A polo shirt'), msg('A merino wool sweater'),
      msg('A winter coat'), msg('Rain jacket'), msg('A leather jacket'), msg('A good watch')] }],
    ['things-to-own', 'own-grooming', msg('Grooming'), { items: [msg('Perfume'), msg('Face cream with SPF'), msg('A good mattress and pillow')] }],
    ['things-to-own', 'own-tools', msg('Tools and home'), { items: [msg('A basic toolbox (hammer, screwdrivers, pliers, tape measure, level)'), msg('A cordless drill'),
      msg('Hex and Torx key sets'), msg('A flashlight'), msg('Duct tape and WD-40'), msg('A Swiss Army knife or multi-tool'), msg('A ladder'), msg('A fire extinguisher'),
      msg('A first aid kit'), msg('An extension cord'), msg('Iron')] }],
    ['things-to-own', 'own-kitchen', msg('Kitchen'), { items: [msg('A good kitchen knife'), msg('A cutting board'), msg('A cast-iron pan'), msg('A good pot'), msg('A coffee maker'), msg('A thermos')] }],
    ['things-to-own', 'own-vehicle', msg('Car and motorcycle'), { items: [msg('Jumper cables or a booster'), msg('A tyre inflator'), msg('A spare wheel and a jack'), msg('A tow rope'),
      msg('A good helmet and motorcycle protective gear'), msg('A vest, a warning triangle and a first aid kit in the car')] }],
    ['things-to-own', 'own-tech', msg('Technology'), { items: [msg('A laptop'), msg('Power bank'), msg('Headphones'), msg('An external drive for backups'), msg('A password manager')] }],
    ['things-to-own', 'own-documents', msg('Documents and money'), { items: [msg('ID card and driving licence'), msg('An emergency fund'), msg('Travel health insurance'),
      msg('A folder with important documents'), msg('A card for payments abroad')] }],
    ['things-to-own', 'own-outdoors', msg('Nature and travel'), { items: [msg('A good backpack'), msg('A cabin suitcase'), msg('A tent and a sleeping bag'), msg('Hiking shoes'), msg('A water bottle')] }],
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
    ['gift-ideas', msg('Gift ideas'), 'personal', [msg('Mom —'), msg('Dad —'), msg('Friends —'), msg('Colleagues —')]],
  ];

  // view: the current collections. Returns only the new records, per collection.
  function workspaceExamples(view, { Core, uid, today, timestamp, habitDraft, PROJECT_COLORS }) {
    const plainName = value => Core.normalizeTagName(String(value || '')).toLocaleLowerCase();
    const existing = (collection, sampleKey, name, field = 'name') => (collection || []).find(item => item.sampleKey === sampleKey || plainName(item[field]) === plainName(name));
    const stamp = { createdAt: timestamp, updatedAt: timestamp };
    const out = { areas: [], tags: [], habits: [], projects: [], tasks: [], goals: [], notes: [], resources: [], templates: [], savedViews: [] };
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

    for (const [key, name, area, isCleaningRoom] of PROJECTS) {
      const sampleKey = `${PREFIX}:project:${key}`;
      const own = existing(view.projects, sampleKey, tr(name));
      if (own) { found.projects[key] = own; continue; }
      const project = { id: uid('project'), sampleKey, name: tr(name), color: color(view.projects, out.projects), areaId: areaId(area), goalIds: [], order: (view.projects || []).length + out.projects.length, isArchived: false, archivedAt: null, ...(isCleaningRoom ? { isCleaningRoom } : {}), ...stamp };
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
      const item = makeTask(tr(title), { sampleKey, projectId: project.id, tagIds: tagIds(fields.tags), subtasks: subtasks(fields.items || []), projectOrder, ...(plannedMonth ? { plannedMonth } : {}) });
      out.tasks.push(item); found.tasks[key] = item;
    }

    // The next time a calendar day comes round, after today.
    const nextDay = ([month, day]) => {
      const date = `${Core.upcomingMonth(month, today)}-${String(day).padStart(2, '0')}`;
      return date > today ? date : `${Core.addMonths(date.slice(0, 7), 12)}-${date.slice(8)}`;
    };
    for (const [groupKey, key, title, frequency, interval, first] of CHORES) {
      const sampleKey = `${PREFIX}:task:${key}`;
      const group = found.projects[groupKey];
      if (!group || existing(view.tasks, sampleKey, tr(title), 'title')) continue;
      const date = first === 'property-tax' ? PROPERTY_TAX_DAYS.map(nextDay).sort()[0] : Array.isArray(first) ? nextDay(first) : Core.addDays(today, first);
      const item = makeTask(tr(title), { sampleKey, projectId: group.id, plannedDate: date, dueDate: date });
      item.recurrence = Core.normalizeRecurrenceV3({ frequency, interval, endType: 'never', seriesId: item.id });
      out.tasks.push(item);
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
    const shoppingKey = `${PREFIX}:template:meal-plan-shopping`, shoppingName = tr('Shopping for the meal plan (4 days)');
    if (!existing(view.templates, shoppingKey, shoppingName)) {
      const source = makeTask(shoppingName, { notes: tr('For 8 days, double the amounts.'), projectId: found.projects.groceries?.id || null, subtasks: subtasks(MEAL_PLAN_SHOPPING) });
      const { data } = Core.templateFromEntity('task', source, view, today);
      out.templates.push({ id: uid('template'), sampleKey: shoppingKey, name: shoppingName, type: 'task', data: { ...data, scheduleEnabled: false, scheduleDate: null, scheduleGeneratedOn: null }, ...stamp });
    }

    for (const [key, name, tag] of VIEWS) {
      const sampleKey = `${PREFIX}:view:${key}`;
      if (existing(view.savedViews, sampleKey, tr(name)) || !found.tags[tag]) continue;
      out.savedViews.push({ id: uid('view'), sampleKey, name: tr(name), type: 'tasks', filters: { tagId: found.tags[tag].id, completion: 'open' }, isPinned: false, ...stamp });
    }
    return out;
  }

  return { PREFIX, workspaceExamples };
});
