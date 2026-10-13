// R68: the example Bucket list holds the 81 items the user kept from the proposed list of 89.
// Spec: docs/superpowers/specs/2026-10-13-r68-bucket-list.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const I18n = require('../js/i18n.js');
const Starter = require('../js/starter-examples.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const PROJECT_COLORS = ['#5362FF', '#30CBAD', '#A879FF', '#4CC9F0', '#F5B942', '#FF8A5B', '#F06A8A', '#8FD14F'];
const emptyState = () => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: {}, ui: {} });
function examples(view = emptyState()) {
  let counter = 0;
  return Starter.workspaceExamples(view, { Core, uid: prefix => `${prefix}_${++counter}`, today: '2026-10-13', timestamp: '2026-10-13T08:00:00.000Z', habitDraft: () => ({}), PROJECT_COLORS });
}
const bucket = out => { const project = out.projects.find(item => item.sampleKey === `${Starter.PREFIX}:project:bucket-list`); return out.tasks.filter(task => task.projectId === project.id); };

const KEPT = [
  // Travel
  'See the northern lights', 'Japan in cherry blossom season', 'A safari in Tanzania or Kenya', 'The Great Wall of China', 'Petra in Jordan', 'See a desert',
  'New York', 'The Dolomites', 'Sunset on Santorini', 'The islands of Thailand', 'The Trans-Siberian Railway', 'Live for a month in another country, working remotely',
  'A total solar eclipse (the next one nearby: 2 August 2027, southern Spain)', 'Rome, Florence and Venice',
  // Serbia and the Balkans
  'Visit all five national parks of Serbia', 'Watch the sunrise from Rtanj', 'Climb Midžor', 'Uvac: the meanders and the griffon vultures', "Devil's Town",
  'The Šargan Eight and Drvengrad', 'Studenica, Sopoćani and Žiča', 'Raft the Tara river', 'Climb Bobotov Kuk on Durmitor', 'Prokletije: hike from Valbona to Theth',
  'The Plitvice Lakes', 'Ohrid', 'Lovćen and the fortress above Kotor',
  // On the motorcycle
  'A motorcycle tour around the Balkans', 'Transfăgărășan and Transalpina in Romania', 'Alpine passes: Stelvio and Grossglockner', 'A day on a race track',
  'An off-road enduro weekend', 'A MotoGP race live (e.g. Mugello)',
  // Adrenaline
  'Skydive', 'Ride in a hot-air balloon', 'Learn to scuba dive (with a certificate)', 'Bungee jumping', 'Paragliding', 'A via ferrata', 'Learn to surf',
  'Kayak on the sea or through a canyon', 'Sleep in an igloo or an ice hotel', 'Watch whales on the open sea',
  // Nature and camping
  'A multi-day hike with a backpack (part of the Via Dinarica)', 'A few days of camping alone', 'See the Milky Way far from city lights', 'Camp on a beach',
  'An ice-cold swim in a river or lake in winter',
  // Health and challenges
  'Run a half marathon', 'Run a marathon', 'Finish a sprint triathlon', '100 km by bike in one day', '100 push-ups in one set', '30 days without sugar',
  'A week without the phone and the internet',
  // Learning and skills
  'Learn to play an instrument', 'A foreign language to B2', 'Build and publish your own app', 'A photography course and a printed photo book', 'Get a skipper licence',
  'A martial art or self-defence', 'Learn to dance (salsa or tango)', 'Make a piece of furniture with your own hands', 'Read 100 books',
  // Food
  'Real pizza in Naples', 'Ramen in Tokyo', 'A cooking course in Italy or Thailand', 'Dinner at a Michelin-starred restaurant', 'Make your own ajvar',
  // Life and people
  'Build your own house', 'Furnish the flat to your own taste', 'Plant a tree', 'A vegetable garden and its harvest', 'The motorcycle of your dreams', 'Give blood 10 times',
  'Volunteer', 'Write a letter to yourself in 10 years', 'Make a family tree', 'A big music festival', 'Savings for a year of living', 'Start your own business or project',
];

test('R68: the Bucket list holds the 81 kept items, in the order of the list', () => {
  assert.equal(KEPT.length, 81);
  const items = bucket(examples());
  assert.deepEqual(items.map(task => task.title), KEPT);
  assert.deepEqual(items.map(task => task.projectOrder), KEPT.map((_, index) => index));
  assert.ok(items.every(task => !task.plannedDate && !task.dueDate && !task.plannedMonth && !task.tagIds.length && !task.isInbox));
});

test('R68: the eight removed items are gone and the two reworded ones read as asked', () => {
  const titles = bucket(examples()).map(task => task.title).join(' | ');
  for (const gone of [/Iceland/, /fjords/, /Machu Picchu/, /New Zealand/, /Nordkapp/, /Kilimanjaro/, /under the stars/, /with your parents/]) assert.doesNotMatch(titles, gone);
  assert.doesNotMatch(titles, /wilderness|Wadi Rum|Sahara/);
});

test('R68: an item that was already added keeps its place in the workspace and is not added twice', () => {
  const first = examples();
  const view = { ...emptyState(), projects: first.projects, tasks: bucket(first).filter(task => ['Skydive', 'Learn to scuba dive (with a certificate)'].includes(task.title)) };
  // The R66 titles of two dreams changed; their sample keys did not, so an older copy still counts.
  view.tasks = view.tasks.map(task => (task.title.startsWith('Learn to scuba dive') ? { ...task, title: 'Learn to scuba dive' } : task));
  const again = examples(view);
  assert.equal(again.tasks.filter(task => /Skydive|scuba/.test(task.title)).length, 0);
});

test('R68: the Bucket list is Serbian in the app', () => {
  require('../js/i18n-sr.js');
  I18n.setLanguage('sr');
  try {
    const titles = bucket(examples()).map(task => task.title);
    for (const title of ['Vidi pustinju', 'Nekoliko dana kampovanja sam', 'Obiđi svih pet nacionalnih parkova Srbije', 'Nauči da roniš (sa sertifikatom)', 'Moto tura oko Balkana', 'Napravi svoj ajvar', 'Pokreni svoj posao ili projekat', 'Ohrid']) {
      assert.ok(titles.includes(title), title);
    }
  } finally { I18n.setLanguage('en'); }
});

test('R68 is released as 2.0.0-alpha.95', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.95');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.95';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.95');
});
