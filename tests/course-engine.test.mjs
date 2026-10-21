import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createEngine} from '../shared/engine-core.mjs';
import {catalog,banners,gameInitialState} from '../shared/game-config.mjs';

// Deliberately uses unrelated IDs and rewards: a second course must not inherit
// Alice's chapter names, prerequisites, historical topics or payout amounts.
function courseConfig(){
 return {
  catalog,banners,initialState:{...gameInitialState,name:'Исследователь данных'},
  courseMap:{start:{id:'departure',x:5,y:5},regions:[],routes:[],points:[
   {id:'observations',kind:'teleport',x:10,y:10},
   {id:'comparison',kind:'teleport',x:20,y:10},
   {id:'checkpoint',kind:'statue',x:25,y:10,task:'data-final'}
  ]},
  taskRewards:{'data-first':0,'data-final':0,'warm-up':60},
  taskRules:{'data-first':{gate:'start-data'},'data-final':{exam:true,crystals:2},'warm-up':{petals:2}},
  rewardGroups:[{id:'data-intro',kind:'lesson',taskIds:['data-first','data-final'],reward:320,completedTopics:['observations']}],
  courseHistory:[],achievements:[{id:'data-badge',requires:['data-first','data-final']}],
  pointPrerequisites:{observations:null,comparison:'observations'},
  statuePrerequisites:{checkpoint:['observations']},
  gates:{'start-data':{anyCredits:['prior-reading']}},
  qualityCaps:{'data-first':10,'data-final':20},recurringTasks:['warm-up']
 };
}
const makeEngine=()=>createEngine({engineConfig:courseConfig()});
const review=(score=9,overrides={})=>({mode:'review',codeHash:'tested-code',rubricVersion:7,criteria:Object.fromEntries(['correctness','readability','efficiency'].map(key=>[key,{score}])),...overrides});
const proof={allPassed:true,codeHash:'tested-code'};
const rubric={approved:true,version:7};
function unlock(state){state.courseCredits={'prior-reading':{reward:0}};return state;}

test('A different course starts with zero gems and no inherited study history; saves do not share mutable state',()=>{
 const engine=makeEngine(),first=engine.initialState(),second=engine.initialState();
 assert.equal(first.currency,0);assert.deepEqual(first.completedTopics,[]);assert.equal(first.name,'Исследователь данных');
 assert.equal(engine.importCourseHistory(first,{awardRewards:false}),0);
 first.inventory.flower.level=3;first.claims['data-first']=true;first.completedTopics.push('observations');first.materials.notes=0;
 assert.equal(second.inventory.flower.level,0);assert.equal(second.claims['data-first'],undefined);assert.deepEqual(second.completedTopics,[]);assert.equal(second.materials.notes,6);
 const different=makeEngine().initialState();assert.equal(different.currency,0);assert.deepEqual(different.claims,{});
});

test('Arbitrary lesson IDs pay the configured group reward only after all tasks, in any order and once',()=>{
 const engine=makeEngine(),state=unlock(engine.initialState());
 assert.equal(engine.claim(state,'data-final','2026-10-17').gems,0);
 assert.equal(state.currency,0);assert.deepEqual(engine.learnedPoints(state),[]);
 const result=engine.claim(state,'data-first','2026-10-17');assert.equal(result.gems,320);assert.equal(result.lessonComplete,true);assert.equal(state.currency,320);
 assert.deepEqual(engine.learnedPoints(state),['observations']);assert.equal(engine.earnedAchievements(state)[0].id,'data-badge');
 for(const task of ['data-final','data-first'])assert.equal(engine.claim(state,task,'2026-10-18').already,true);
 assert.equal(state.currency,320);assert.deepEqual(state.lessonClaims['data-intro'],{gems:320,base:320});
});

test('Course gates use configured history and map dependencies change only after verified completion',()=>{
 const engine=makeEngine(),state=engine.initialState(),[first,next,statue]=engine.courseMap.points;
 assert.equal(engine.pointAvailable(state,first),true);assert.equal(engine.pointAvailable(state,next),false);assert.equal(engine.pointAvailable(state,statue),false);
 assert.throws(()=>engine.claim(state,'data-first','2026-10-17'),/предыдущ/);assert.equal(state.claims['data-first'],undefined);assert.equal(state.currency,0);
 assert.throws(()=>engine.act(state,{type:'teleport',id:'observations'},'2026-10-17'),/после прохождения/);
 unlock(state);engine.claim(state,'data-first','2026-10-17');assert.equal(engine.pointAvailable(state,next),false);
 engine.claim(state,'data-final','2026-10-17');assert.equal(engine.pointAvailable(state,next),true);assert.equal(engine.pointAvailable(state,statue),true);
 assert.ok(state.statues.includes('checkpoint'));
});

test('Recurring rewards use configured task IDs and do not re-pay on the same day',()=>{
 const engine=makeEngine(),state=engine.initialState();
 assert.equal(engine.claim(state,'warm-up','2026-10-17').gems,60);
 assert.equal(engine.claim(state,'warm-up','2026-10-17').already,true);
 assert.equal(engine.claim(state,'warm-up','2026-10-18').gems,60);
 assert.equal(state.currency,120);assert.equal(state.claims['warm-up:2026-10-17'],true);
});

test('changed tasks must pass current checks before an unpaid group pays, without repeating task materials',()=>{
 const engine=makeEngine(),state=unlock(engine.initialState()),day='2026-10-17';
 engine.claim(state,'data-first',day);
 const currentClaims={};
 assert.equal(engine.claim(state,'data-final',day,{completionClaims:currentClaims}).gems,0,'old paid task cannot satisfy changed current conditions');
 assert.equal(state.currency,0);assert.equal(state.lessonClaims['data-intro'],undefined);
 const gold=state.gold,books=state.books,materials=structuredClone(state.materials);
 assert.equal(engine.claim(state,'data-first',day,{completionClaims:{'data-final':true}}).gems,320);
 assert.equal(state.gold,gold);assert.equal(state.books,books);assert.deepEqual(state.materials,materials);
 assert.equal(engine.claim(state,'data-first',day,{completionClaims:state.claims}).already,true);
 assert.equal(state.currency,320);
 state.contentNeedsRecheckPoints=['observations'];
 state.courseCredits.historical={};assert.deepEqual(engine.learnedPoints(state),[],'version invalidation hides even historically credited map completion');
});

test('Quality bonuses use per-task caps and pay only the improvement over the best score',()=>{
 const engine=makeEngine(),state=unlock(engine.initialState());engine.claim(state,'data-first','2026-10-17');engine.claim(state,'data-final','2026-10-17');
 const base=state.currency;
 assert.equal(engine.claimQuality(state,'data-first',review(6),proof,rubric).gems,6);
 assert.equal(engine.claimQuality(state,'data-first',review(9),proof,rubric).gems,3);
 assert.equal(engine.claimQuality(state,'data-first',review(4),proof,rubric).gems,0);
 assert.equal(engine.claimQuality(state,'data-first',review(10),proof,rubric).gems,1);
 assert.equal(engine.claimQuality(state,'data-final',review(9),proof,rubric).gems,18);
 assert.equal(engine.claimQuality(state,'data-final',review(10),proof,rubric).gems,2);
 assert.equal(state.currency,base+30);assert.equal(state.qualityClaims['data-first'].gems,10);assert.equal(state.qualityClaims['data-final'].gems,20);
});

test('A quality reward rejects untested code, old proofs, help responses, malformed grades and unapproved rubrics',()=>{
 const engine=makeEngine(),state=unlock(engine.initialState());
 assert.equal(engine.claimQuality(state,'data-first',review(),proof,rubric).gems,0);
 engine.claim(state,'data-first','2026-10-17');const before=state.currency;
 for(const [response,checked,policy] of [
  [review(),{...proof,allPassed:false},rubric],
  [review(),{...proof,codeHash:'older-code'},rubric],
  [review(9,{mode:'help'}),proof,rubric],
  [review(9,{rubricVersion:6}),proof,rubric],
  [review(0),proof,rubric],[review(11),proof,rubric],[review(8.5),proof,rubric],
  [review(9,{criteria:{correctness:{score:9}}}),proof,rubric],
  [review(),proof,{...rubric,approved:false}]
 ])assert.equal(engine.claimQuality(state,'data-first',response,checked,policy).gems,0);
 assert.equal(engine.claimQuality(state,'warm-up',review(),proof,rubric).gems,0);
 assert.equal(state.currency,before);assert.equal(state.qualityClaims,undefined);
});

test('The serialized browser factory reproduces course rewards and exploration without server imports',()=>{
 const config=courseConfig(),server=createEngine(config);
 const browser=vm.runInNewContext(`(${createEngine.toString()})(${JSON.stringify(config)})`);
 const serverState=unlock(server.initialState()),browserState=unlock(browser.initialState());
 for(const id of ['data-final','data-first','warm-up']){
  const expected=server.claim(serverState,id,'2026-10-17');const actual=browser.claim(browserState,id,'2026-10-17');
  assert.deepEqual(JSON.parse(JSON.stringify(actual)),expected);
 }
 assert.deepEqual(JSON.parse(JSON.stringify(browserState)),serverState);
 assert.equal(browser.explorationPercent(browserState),server.explorationPercent(serverState));
 assert.deepEqual(JSON.parse(JSON.stringify(browser.learnedPoints(browserState))),server.learnedPoints(serverState));
});

test('Shared wishes guarantee 4 stars by five and 5 stars by twenty; featured legendary items rotate without duplicates',()=>{
 const engine=makeEngine(),state=engine.initialState();state.currency=160*40;
 const drops=Array.from({length:40},()=>engine.wish(state,'outfit',()=>.99));
 let sinceFour=0,sinceFive=0;const legends=[];
 for(const drop of drops){sinceFour++;sinceFive++;if(sinceFour===5)assert.ok(drop.rarity>=4);if(sinceFive===20)assert.equal(drop.rarity,5);if(drop.rarity>=4)sinceFour=0;if(drop.rarity===5){sinceFive=0;legends.push(drop.id);assert.equal(drop.duplicate,false);}}
 assert.equal(legends.length,2);assert.equal(new Set(legends).size,legends.length);assert.equal(state.currency,0);
 assert.ok(drops.every(drop=>engine.itemById(drop.id).wishable!==false));
});
