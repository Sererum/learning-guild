import test from 'node:test';
import assert from 'node:assert/strict';
import {currentJourneyPoint,describePoint,discoveredJourneyZones} from '../public/journey.js';

function fixture(){
 const points=[{id:'first',name:'First',kind:'teleport',region:'r',lessonId:'first-lesson'}, {id:'repeat',name:'Repeat',kind:'daily',region:'r',topic:'first',task:'repeat-task'}, {id:'fix',name:'Fix',kind:'repair',region:'r',topic:'first',adaptive:true,lessonId:'fix-lesson'}, {id:'next',name:'Next',kind:'teleport',region:'r',lessonId:'next-lesson',prerequisites:['first']}];
 return {rules:{},data:{course:{recurringTasks:['repeat-task']},day:'2030-01-01',state:{claims:{},lessonClaims:{}},presentation:{currentPointId:'first'},courseMap:{start:{id:'start'},regions:[{id:'r'}],points,routes:[{from:'start',to:'first'},{from:'first',to:'next'},{from:'first',to:'repeat',side:true},{from:'first',to:'fix',side:true}]},lessons:[{id:'first-lesson',taskIds:['first-task']},{id:'next-lesson',taskIds:['next-task']},{id:'fix-lesson',type:'repair',taskIds:['fix-task']}],tasks:[]}};
}
test('completed presentation checkpoint advances to the unambiguous available lesson, ahead of optional practice',()=>{
 const ctx=fixture();assert.equal(currentJourneyPoint(ctx).id,'first');ctx.data.state.claims['first-task']=true;
 const saved=JSON.stringify(ctx.data.state);assert.equal(currentJourneyPoint(ctx).id,'next');
 assert.equal(describePoint(ctx,ctx.data.courseMap.points[0]).current,false);
 assert.equal(describePoint(ctx,ctx.data.courseMap.points.at(-1)).current,true);
 assert.equal(JSON.stringify(ctx.data.state),saved);
});
test('locked or ambiguous next lessons never displace the completed checkpoint',()=>{
 const ctx=fixture();ctx.data.state.claims['first-task']=true;
 ctx.data.presentation.points={next:{available:false}};assert.equal(currentJourneyPoint(ctx).id,'first');
 delete ctx.data.presentation.points;
 ctx.data.courseMap.points.push({id:'branch',kind:'teleport',region:'r',lessonId:'branch-lesson',prerequisites:['first']});ctx.data.lessons.push({id:'branch-lesson',taskIds:['branch-task']});ctx.data.courseMap.routes.push({from:'first',to:'branch'});
 assert.equal(currentJourneyPoint(ctx).id,'first');
});
test('optional practice never reveals new map terrain',()=>{
 const ctx=fixture(),before=discoveredJourneyZones(ctx);ctx.data.state.claims['repeat-task:2030-01-01']=true;ctx.data.state.claims['fix-task']=true;
 assert.deepEqual(discoveredJourneyZones(ctx),before);
});
