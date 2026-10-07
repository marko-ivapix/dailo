const test = require('node:test');
const assert = require('node:assert/strict');

global.__TODO_TEST_MEMORY_DB__ = true;
require('../js/storage.js');
require('../js/attachments.js');
const S = global.TodoStorage;
global.TodoCore = require('../js/core.js');
global.JSZip = require('../vendor/jszip.min.js');
const B = require('../js/backup.js');
const raw = new Map();
global.localStorage = {getItem:key=>raw.get(key)??null,setItem:(key,value)=>raw.set(key,String(value)),removeItem:key=>raw.delete(key)};
const fixture = () => global.TodoCore.migrateStateV3({version:2,tasks:[{id:'t',title:'Keep',attachmentIds:['f']}],projects:[],tags:[],settings:{},ui:{}}).state;
async function seedBackup() {
  await S.clearAllForTests();
  const state=fixture();
  state.habits=[{id:'h',name:'Habit'}];state.goals=[{id:'g',title:'Goal'}];
  localStorage.setItem('todoAppData',JSON.stringify(state,null,3));
  await S.attachments.put({id:'f',taskId:'t',fileName:'binary.bin',mimeType:'application/x-example',size:4,blob:new Blob([new Uint8Array([0,255,17,3])],{type:'application/x-example'}),pendingDeleteUntil:null});
  await S.attachments.put({id:'orphan',taskId:'gone',fileName:'orphan',mimeType:'',size:2,blob:new Blob(['xx']),pendingDeleteUntil:'2030-01-01T00:00:00Z'});
  await S.habitLogs.put({id:'l',habitId:'h',date:'2026-09-15',status:'done',value:null});
  await S.goalHistory.put({id:'e',goalId:'g',type:'created',data:{note:'original'},createdAt:'2026-09-15T12:00:00Z'});
  return state;
}
test('V3 ZIP exports referenced bytes and all logs/history, and imports V1 IDs',async()=>{
  const state=await seedBackup();
  const blob=await B.exportBackupV3(state,S,'2026-09-16T12:00:00Z');
  const zip=await JSZip.loadAsync(await blob.arrayBuffer());const manifest=JSON.parse(await zip.file('data.json').async('string'));
  assert.equal(manifest.backupVersion,2);assert.equal(manifest.appVersion,'1.3');assert.equal(manifest.data.version,3);
  assert.equal(manifest.attachments.length,1);assert.equal(manifest.habitLogs[0].id,'l');assert.equal(manifest.goalHistory[0].id,'e');
  const inspected=await B.inspectBackupV3(blob);
  assert.deepEqual([...new Uint8Array(await inspected.attachmentRecords[0].blob.arrayBuffer())],[0,255,17,3]);
  assert.equal(inspected.attachmentRecords[0].blob.type,'application/x-example');
  manifest.backupVersion=1;manifest.appVersion='1.2';manifest.data.version=2;manifest.data.habits=[];manifest.data.goals=[];delete manifest.habitLogs;delete manifest.goalHistory;
  zip.file('data.json',JSON.stringify(manifest));
  const legacy=await B.inspectBackupV3(await zip.generateAsync({type:'blob'}));
  assert.equal(legacy.state.version,3);assert.equal(legacy.attachmentRecords[0].id,'f');assert.deepEqual(legacy.habitLogs,[]);
});
test('global snapshot restores exact raw text and every physical record including orphan bytes',async()=>{
  const state=await seedBackup(),before=localStorage.getItem('todoAppData');
  const id=await S.createRecoverySnapshot('reset',state,S);
  const snapshot=await S.recoverySnapshots.get(id);assert.equal(snapshot.rawAppData,before);assert.equal(snapshot.attachments.length,2);
  await S.attachments.clearAll();await S.habitLogs.clearAll();await S.goalHistory.clearAll();localStorage.setItem('todoAppData','changed');
  await S.restoreRecoverySnapshot(id);
  assert.equal(localStorage.getItem('todoAppData'),before);assert.equal((await S.attachments.get('orphan')).blob.type,'');
  assert.equal(await (await S.attachments.get('orphan')).blob.text(),'xx');assert.equal((await S.habitLogs.get('l')).status,'done');assert.equal((await S.goalHistory.get('e')).data.note,'original');
  assert.ok(await S.recoverySnapshots.get(id),'recovery must survive until caller verified and cleaned');
});
test('incoming missing files and invalid domain values reject before replacement',async()=>{
  const state=await seedBackup();const zip=await JSZip.loadAsync(await (await B.exportBackupV3(state,S,'2026-09-16T12:00:00Z')).arrayBuffer());
  const original=JSON.parse(await zip.file('data.json').async('string'));
  for(const mutate of [m=>m.data.goals[0].title='',m=>m.data.habits[0].areaId='missing',m=>m.habitLogs[0].date='2026-02-31',m=>m.habitLogs.push({...m.habitLogs[0],id:'other'}),m=>m.attachments[0].size=-1,m=>m.attachments.push({...m.attachments[0]}),m=>m.data.goals[0].status='invalid',m=>m.data.habits[0].trackingType='invalid']){
    const manifest=structuredClone(original);mutate(manifest);zip.file('data.json',JSON.stringify(manifest));
    await assert.rejects(()=>B.inspectBackupV3(zip.generateAsync({type:'blob'})));
  }
  zip.file('data.json',JSON.stringify(original));zip.remove(original.attachments[0].path);
  await assert.rejects(()=>B.inspectBackupV3(zip.generateAsync({type:'blob'})),/Missing attachment file/);
});
test('backup validation rejects malformed recurrence and conditional Habit/Goal fields without normalizing them away',async()=>{
  const state=await seedBackup();const zip=await JSZip.loadAsync(await (await B.exportBackupV3(state,S,'2026-09-16T12:00:00Z')).arrayBuffer());
  const original=JSON.parse(await zip.file('data.json').async('string'));
  for(const mutate of [m=>m.data.tasks[0].recurrence={frequency:'invalid',interval:1},m=>m.data.tasks[0].recurrence={frequency:'daily',interval:-1},m=>m.data.habits[0].frequencyType='timesPerWeek',m=>m.data.habits[0].trackingType='numeric',m=>m.data.goals[0].habitLinks=[{habitId:'missing',metric:'streak',target:1}],m=>m.data.tasks[0].isCompleted='yes',m=>m.goalHistory[0].type='nonsense',m=>m.data.goals[0].projectLinks=[{contributionMode:'allTasks'}]]){
    const manifest=structuredClone(original);mutate(manifest);zip.file('data.json',JSON.stringify(manifest));
    await assert.rejects(()=>B.inspectBackupV3(zip.generateAsync({type:'blob'})), 'malformed runtime domain accepted');
  }
});
test('legacy public restore wrapper includes growing stores and retains both write and rollback errors',async()=>{
  const state=await seedBackup(), validated=await B.inspectBackupV3(await B.exportBackupV3(state,S,'2026-09-16T12:00:00Z'));
  await S.habitLogs.clearAll();await S.goalHistory.clearAll();let current=state;
  await B.restoreBackup(validated,{attachmentApi:S.attachments,readState:async()=>current,writeState:async next=>{current=next;}});
  assert.equal((await S.habitLogs.listAll()).length,1);assert.equal((await S.goalHistory.listAll()).length,1);
  await assert.rejects(()=>B.restoreBackup(validated,{attachmentApi:S.attachments,readState:async()=>current,writeState:async()=>{throw Error('state-denied');}}),/state-denied.*state-denied/);
});
test('backup rejects malformed reusable payloads while preserving optional stale references',async()=>{
  const state=await seedBackup();state.templates=[{id:'kit',name:'Kit',type:'task',data:{title:'Draft',projectId:'deleted',goalIds:['deleted'],plannedOffsetDays:-1}}];state.savedViews=[{id:'view',name:'View',type:'tasks',filters:{projectId:'deleted'}}];
  const zip=await JSZip.loadAsync(await (await B.exportBackupV3(state,S,'2026-09-16T12:00:00Z')).arrayBuffer());
  const original=JSON.parse(await zip.file('data.json').async('string'));
  assert.equal((await B.inspectBackupV3(await zip.generateAsync({type:'blob'}))).state.templates[0].data.projectId,'deleted');
  for(const mutate of [m=>m.data.templates[0].data.goalIds='bad',m=>m.data.templates[0].data.subtasks='bad',m=>m.data.templates[0].data.plannedOffsetDays=1.5,m=>m.data.savedViews[0].filters.priority='urgent',m=>m.attachments[0].blobType={},m=>m.data.templates[0].type=null]){
    const manifest=structuredClone(original);mutate(manifest);zip.file('data.json',JSON.stringify(manifest));await assert.rejects(()=>B.inspectBackupV3(zip.generateAsync({type:'blob'})));
  }
});
test('recurrence baseline is a usable complete task payload while optional stale references remain valid',async()=>{
  const state=await seedBackup(), baseline={title:'Baseline',notes:'Preserve',recurrence:{frequency:'daily',interval:1},plannedDate:'2026-09-16',plannedTime:'08:15',dueDate:'2026-09-18',dueTime:'16:30',reminderAt:'2026-09-16T07:00:00Z',projectId:'deleted-project',areaId:null,goalIds:['deleted-goal'],tagIds:['deleted-tag'],attachmentIds:['deleted-file'],priority:'high',subtasks:[{id:'sub',title:'Child',order:0,isCompleted:false}]};
  state.tasks[0].recurrenceBaseline=baseline;
  state.tasks[0].inboxOrder=-1;baseline.inboxOrder=-2;
  const zip=await JSZip.loadAsync(await (await B.exportBackupV3(state,S,'2026-09-16T12:00:00Z')).arrayBuffer());
  const original=JSON.parse(await zip.file('data.json').async('string'));
  const valid=await B.inspectBackupV3(await zip.generateAsync({type:'blob'}));
  assert.equal(valid.state.tasks[0].recurrenceBaseline.projectId,'deleted-project');
  assert.equal(valid.state.tasks[0].inboxOrder,-1);assert.equal(valid.state.tasks[0].recurrenceBaseline.inboxOrder,-2);
  const next=TodoCore.buildNextRecurringTask(valid.state.tasks[0],'2026-09-16T12:00:00Z','next');
  assert.equal(next.plannedDate,'2026-09-17');assert.equal(next.subtasks[0].title,'Child');
  for(const [label,mutate] of [
    ['subtasks object',b=>b.subtasks={invalid:'not an array'}],['subtask scalar',b=>b.subtasks=[4]],['subtask title',b=>b.subtasks[0].title={}],['nested subtasks',b=>b.subtasks[0].subtasks=[{title:'nested'}]],
    ['planned date',b=>b.plannedDate='2026-02-31'],['due date type',b=>b.dueDate={}],['time',b=>b.plannedTime='25:99'],['reminder timestamp',b=>b.reminderAt='invalid'],
    ['title',b=>b.title={}],['notes',b=>b.notes=[]],['completion',b=>b.isCompleted='yes'],['priority',b=>b.priority='urgent'],['order',b=>b.projectOrder='first'],
    ['Goal IDs',b=>b.goalIds={bad:true}],['Tag IDs',b=>b.tagIds=[{}]],['attachment IDs',b=>b.attachmentIds='bad'],['project reference type',b=>b.projectId={}],['Area reference type',b=>b.areaId=1]
  ]) { const manifest=structuredClone(original);mutate(manifest.data.tasks[0].recurrenceBaseline);zip.file('data.json',JSON.stringify(manifest));await assert.rejects(()=>B.inspectBackupV3(zip.generateAsync({type:'blob'})),label); }
});

test('recovery verification rejects raw changes made during actual Blob byte comparison',async()=>{
  const state=await seedBackup(),id=await S.createRecoverySnapshot('reset',state,S),read=Blob.prototype.arrayBuffer;
  try {
    let changed=false;Blob.prototype.arrayBuffer=function(){if(!changed){changed=true;localStorage.setItem('todoAppData','foreign metadata during bytes verification');}return read.call(this);};
    await assert.rejects(()=>S.verifyRecoverySnapshot(id),/verification failed/i);
    assert.equal(localStorage.getItem('todoAppData'),'foreign metadata during bytes verification');assert.ok(await S.recoverySnapshots.get(id));
  } finally {Blob.prototype.arrayBuffer=read;}
});

test('positive numeric backup targets have no arbitrary minimum',async()=>{
  const state=await seedBackup();state.goals[0].progressType='numeric';state.goals[0].targetValue=1e-9;
  state.habits[0].trackingType='numeric';state.habits[0].targetValue=1e-9;
  state.goals[0].habitLinks=[{habitId:state.habits[0].id,metric:'totalValue',target:1e-9}];
  state.templates=[{id:'tiny',name:'Tiny',type:'habit',data:{trackingType:'numeric',targetValue:1e-9}}];
  const restored=await B.inspectBackupV3(await B.exportBackupV3(state,S,'2026-09-16T12:00:00Z'));
  assert.equal(restored.state.goals[0].targetValue,1e-9);assert.equal(restored.state.habits[0].targetValue,1e-9);
  assert.equal(restored.state.goals[0].habitLinks[0].target,1e-9);assert.equal(restored.state.templates[0].data.targetValue,1e-9);
  for(const value of [0,-1,Infinity,NaN,'0.1']) for(const set of [s=>s.goals[0].targetValue=value,s=>s.habits[0].targetValue=value,s=>s.goals[0].habitLinks[0].target=value,s=>s.templates[0].data.targetValue=value]) {
    const invalid=structuredClone(state);set(invalid);assert.throws(()=>B.validateDomain(invalid,[],[]));
  }
});

test('habit logs round-trip by habit and date', async () => {
  await S.clearAllForTests();
  await S.habitLogs.put({ id: 'h1:2026-09-16', habitId: 'h1', date: '2026-09-16', status: 'done', value: null });
  const item = await S.habitLogs.getByHabitAndDate('h1', '2026-09-16');
  assert.equal(item.status, 'done');
  assert.equal((await S.habitLogs.listByHabit('h1')).length, 1);
});

test('habit logs keep different dates for the same habit', async () => {
  await S.clearAllForTests();
  await S.habitLogs.put({ id: 'h1:2026-09-16', habitId: 'h1', date: '2026-09-16', status: 'done', value: null });
  await S.habitLogs.put({ id: 'h1:2026-09-17', habitId: 'h1', date: '2026-09-17', status: 'skipped', value: null });
  assert.equal((await S.habitLogs.listByHabit('h1')).length, 2);
  assert.equal((await S.habitLogs.getByHabitAndDate('h1', '2026-09-17')).status, 'skipped');
});

test('goal history and recovery snapshots are isolated stores', async () => {
  await S.clearAllForTests();
  await S.goalHistory.put({ id: 'e1', goalId: 'g1', type: 'created', data: {}, createdAt: '2026-09-16T00:00:00Z' });
  await S.recoverySnapshots.put({ id: 'r1', reason: 'reset', appData: { version: 3 } });
  assert.equal((await S.goalHistory.listByGoal('g1')).length, 1);
  assert.equal((await S.recoverySnapshots.get('r1')).reason, 'reset');
});

test('attachment facade reads and writes the shared attachments namespace', async () => {
  await S.clearAllForTests();
  await S.attachments.put({ id: 'a1', taskId: 't1', fileName: 'note.txt', pendingDeleteUntil: null });
  assert.equal((await global.TodoAttachments.get('a1')).fileName, 'note.txt');

  await global.TodoAttachments.put({ id: 'a2', taskId: 't1', fileName: 'second.txt', pendingDeleteUntil: null });
  assert.deepEqual((await S.attachments.listByTask('t1')).map(record => record.id).sort(), ['a1', 'a2']);
});

test('attachment facade preserves the V1.2 put return value', async () => {
  await S.clearAllForTests();
  const record = { id: 'a1', taskId: 't1', fileName: 'note.txt', pendingDeleteUntil: null };
  assert.strictEqual(await global.TodoAttachments.put(record), record);
});
