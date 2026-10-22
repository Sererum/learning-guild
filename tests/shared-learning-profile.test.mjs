import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createProfileGovernance,normalizeSharedLearningPreferences,pickSharedLearningPreferences} from '../profile-governance.mjs';

function setup(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'guild-shared-preferences-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 let shared={revision:0,value:normalizeSharedLearningPreferences()},writes=0;
 const adapter={read:()=>structuredClone(shared),write(value,{expectedRevision}){assert.equal(expectedRevision,shared.revision);shared={revision:shared.revision+1,value:structuredClone(value)};writes++;return adapter.read();}};
 const a=createProfileGovernance({directory:path.join(root,'course-a'),courseId:'course-a',profileId:'one',sharedPreferences:adapter});
 const b=createProfileGovernance({directory:path.join(root,'course-b'),courseId:'course-b',profileId:'two',sharedPreferences:adapter});
 return {root,a,b,adapter,shared:()=>shared,writes:()=>writes};
}

test('linked courses share accepted teaching preferences and effort in both directions, not identities',t=>{
 const f=setup(t);
 f.a.act({action:'update-about',about:{interests:'Космос'},sharedRevision:0});
 assert.equal(f.b.settings().about.interests,'Космос');
 assert.equal(f.b.settings().courseId,'course-b');
 assert.equal(f.a.settings().profileId,'one');
 f.b.act({action:'set-ai-efforts',preset:'medium',sharedRevision:f.b.settings().sharedRevision});
 assert.deepEqual(f.a.settings().aiEfforts,f.b.settings().aiEfforts);
 f.b.act({action:'set-review-days',days:17});
 assert.equal(f.a.settings().preferenceReviewDays,17);
 f.a.act({action:'update-author',authorId:'learner',name:'Первый'});
 assert.equal(f.b.resolveLearner().name,'Ученик');
 const view=f.a.act({action:'add-rule',text:'Сначала покажи пример с понятным результатом.'});
 const id=view.personalization.preferences[0].id;
 assert.equal(f.b.snapshot().personalization.preferences[0].text,'Сначала покажи пример с понятным результатом.');
 f.b.act({action:'disable-rule',ruleId:id});
 assert.equal(f.a.snapshot().personalization.preferences[0].status,'disabled');
 f.a.act({action:'edit-rule',ruleId:id,text:'Покажи два контрастных примера.',confirm:true});
 assert.equal(f.b.snapshot().personalization.preferences[0].status,'active');
 assert.equal(f.b.snapshot().personalization.preferences[0].text,'Покажи два контрастных примера.');
 assert.deepEqual(Object.keys(f.shared().value).sort(),['about','aiEfforts','preferenceReviewDays','rules']);
 assert.equal(JSON.stringify(f.shared()).includes('Первый'),false);
});

test('AI proposals and course evidence remain local; only accepted content becomes shared',t=>{
 const f=setup(t);
 const proposal=f.a.proposeChanges({jobId:'job-a',preferences:[{id:'rule-one',text:'Объясни от входных данных до результата.',evidenceIds:['private-evidence']}],aboutUpdates:{background:'Знакомы таблицы'},observations:[{id:'private-evidence',text:'Личный отзыв об уроке',lessonId:'private-lesson',author:{name:'Личный автор'}}]});
 assert.equal(f.writes(),0);
 assert.equal(f.a.pendingChanges().length,1);
 assert.equal(f.b.pendingChanges().length,0);
 assert.equal(f.b.settings().about.background,'');
 f.a.decideChanges({proposalSetId:proposal.id,acceptedIds:proposal.changes.map(item=>item.id),sharedRevision:0});
 assert.equal(f.b.settings().about.background,'Знакомы таблицы');
 assert.equal(f.b.snapshot().personalization.preferences[0].status,'active');
 assert.equal(f.b.snapshot().personalization.observations.length,0);
 assert.equal(f.b.settings().history.length,0);
 for(const forbidden of ['private-evidence','private-lesson','Личный отзыв','Личный автор','job-a'])assert.equal(JSON.stringify(f.shared()).includes(forbidden),false);
 assert.equal(f.a.settings().changeProposals[0].observations[0].id,'private-evidence');
});

test('stale UI revisions and conflicting accepted proposals cannot overwrite another course',t=>{
 const f=setup(t),old=f.a.snapshot().sharedRevision;
 const proposal=f.a.proposeChanges({aboutUpdates:{interests:'Кофе'}});
 f.b.act({action:'update-about',about:{interests:'Музыка'},sharedRevision:old});
 assert.throws(()=>f.a.act({action:'update-about',about:{interests:'Кино'},sharedRevision:old}),/уже изменён/);
 assert.throws(()=>f.a.decideChanges({proposalSetId:proposal.id,acceptedIds:proposal.changes.map(item=>item.id),sharedRevision:old}),/уже изменён/);
 assert.throws(()=>f.a.decideChanges({proposalSetId:proposal.id,acceptedIds:proposal.changes.map(item=>item.id),sharedRevision:f.a.settings().sharedRevision}),/изменена вручную/);
 assert.equal(f.a.settings().about.interests,'Музыка');
 assert.equal(f.a.pendingChanges().length,1);
});

test('reconcile always uses canonical shared rule instead of stale local model and override',t=>{
 const f=setup(t),view=f.a.act({action:'add-rule',text:'Первое пожелание'}),id=view.personalization.preferences[0].id;
 f.b.act({action:'edit-rule',ruleId:id,text:'Актуальное пожелание',confirm:true});
 const local={schemaVersion:1,version:1,rules:[{id,text:'Старое пожелание',status:'superseded',supersededBy:'other',source:'explicit-feedback'}],observations:[],history:[],sharedProposals:[]};
 const rules=f.a.reconcile(local).rules;
 assert.equal(rules.length,1);
 assert.equal(rules[0].text,'Актуальное пожелание');
 assert.equal(rules[0].status,'active');
 assert.equal(rules[0].supersededBy,undefined);
 f.b.act({action:'disable-rule',ruleId:id});
 assert.equal(f.a.reconcile(local).rules[0].status,'disabled');
});

test('copy helper includes explicitly confirmed local rules and strips every evidence field',()=>{
 const config={about:{interests:'Походы'},aiEfforts:{},manualRules:[{id:'manual',text:'Понятный пример',category:'examples',sourceObservations:[{secret:'local'}]}],ruleOverrides:{manual:{status:'active',confirmedAt:'2026-10-22T00:00:00Z'},confirmed:{status:'active',confirmedAt:'2026-10-22T00:00:00Z'},disabled:{status:'disabled'}},history:[{secret:'local'}],changeProposals:[{secret:'local'}]};
 const personalization={rules:[{id:'confirmed',text:'Подтверждено вручную',evidenceIds:['secret']},{id:'unconfirmed',text:'Только вывод модели',status:'active'},{id:'disabled',text:'Отключено вручную'}],observations:[{secret:'local'}]};
 const picked=pickSharedLearningPreferences(config,personalization);
 assert.deepEqual(picked.rules.map(rule=>rule.id),['confirmed','disabled','manual']);
 assert.equal(JSON.stringify(picked).includes('secret'),false);
 assert.equal(JSON.stringify(picked).includes('unconfirmed'),false);
 assert.throws(()=>normalizeSharedLearningPreferences({rules:[{id:'../bad',text:'Плохо',status:'active'}]}));
});

test('unaccepted or imported seed preferences do not silently change a linked profile',t=>{
 const f=setup(t);
 const proposal=f.a.proposeChanges({aboutUpdates:{interests:'Кофе'}});
 f.a.decideChanges({proposalSetId:proposal.id,acceptedIds:[]});
 f.a.importSeed({id:'old-seed',about:{interests:'Космос'},preferences:['Старое правило']});
 assert.equal(f.writes(),0);
 assert.equal(f.b.settings().about.interests,'');
 assert.equal(f.b.snapshot().personalization.preferences.length,0);
});
