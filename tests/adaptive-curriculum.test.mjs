import test from 'node:test';
import assert from 'node:assert/strict';
import course from '../courses/alice-python/index.mjs';

test('Alice adaptation follows the actual roadmap after 2.4 rather than skipping the block final',()=>{
  const {roadmap}=course.adaptation;
  const current=roadmap.find(topic=>topic.lessonId==='algorithms');
  assert.equal(current.id,'lesson-02-04');
  const next=roadmap.find(topic=>topic.afterLessonIds.includes('algorithms'));
  assert.equal(next.id,'block-02-final');
  assert.equal(next.kind,'exam');
  assert.deepEqual(next.prerequisites,['lesson-02-04']);
  assert.equal(next.runtime,'basic-python');
  const functions=roadmap.find(topic=>topic.id==='lesson-03-01');
  assert.deepEqual(functions.afterLessonIds,['block-02-final']);
  assert.match(functions.title,/return/);
});

test('curriculum references are ordered, complete, and point only to existing map locations or lessons',()=>{
  const previous=new Set(),lessonIds=new Set(course.lessons.map(lesson=>lesson.id));
  const points=new Set(course.engineConfig.courseMap.points.map(point=>point.id));
  for(const topic of course.adaptation.roadmap){
    assert.ok(!previous.has(topic.id),`duplicate topic: ${topic.id}`);
    for(const id of topic.prerequisites)assert.ok(previous.has(id),`unknown or forward prerequisite ${id}`);
    if(topic.pointId)assert.ok(points.has(topic.pointId),`unknown map point ${topic.pointId}`);
    if(topic.lessonId)assert.ok(lessonIds.has(topic.lessonId),`unknown lesson ${topic.lessonId}`);
    assert.ok(topic.learningGoals.length>0);
    assert.ok(['lesson','exam'].includes(topic.kind));
    assert.ok(!Object.hasOwn(topic,'completed'),'course configuration must not fabricate student progress');
    previous.add(topic.id);
  }
});

test('the block 1 final continues to 2.1 using its existing lesson ID',()=>{
  const {roadmap}=course.adaptation;
  const source=roadmap.find(topic=>topic.lessonId==='foundations-final');
  assert.equal(source.id,'block-01-final');
  const aliases=new Set(['foundations-final',source.id]);
  const next=roadmap.find(topic=>topic.afterLessonIds.some(id=>aliases.has(id)));
  assert.equal(next.id,'lesson-02-01');
  assert.deepEqual(next.prerequisites,['block-01-final']);
  assert.deepEqual(next.afterLessonIds,['foundations-final','block-01-final']);
});

test('each curriculum topic has exactly its ordered successor for both existing and generated lesson aliases',()=>{
  const {roadmap}=course.adaptation;
  for(const [index,source]of roadmap.entries()){
    const variants=[{id:'generated-'+source.id,adaptiveTopicId:source.id},
      ...(source.lessonId?[{id:source.lessonId}]:[])];
    for(const lesson of variants){
      const aliases=new Set([lesson.id,lesson.adaptiveTopicId].filter(Boolean));
      const topic=roadmap.find(item=>item.lessonId===lesson.id||item.id===lesson.adaptiveTopicId);
      if(topic)aliases.add(topic.id);
      const successors=roadmap.filter(item=>item.afterLessonIds.some(id=>aliases.has(id)));
      assert.deepEqual(successors.map(item=>item.id),roadmap[index+1]?[roadmap[index+1].id]:[],source.id+' via '+lesson.id);
    }
  }
});

test('future SQL and data topics explicitly require a separate executor',()=>{
  for(const topic of course.adaptation.roadmap.filter(topic=>/^lesson-0[4567]|^block-0[456]/.test(topic.id))){
    assert.equal(topic.requiresRuntime,true,topic.id);
    assert.notEqual(topic.runtime,course.manifest.runtime,topic.id);
  }
  assert.equal(course.adaptation.evidencePolicy.skippingFeedbackIsNotFailure,true);
  assert.equal(course.adaptation.evidencePolicy.universalRulesRequireReview,true);
});
