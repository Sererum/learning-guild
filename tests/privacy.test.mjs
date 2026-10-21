import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeForModel,deidentifySharedText} from '../privacy.mjs';
test('Privacy redacts contacts, keys and private home paths without changing functional Python names',()=>{
 const original={code:'source_counts = {}\nraw_drink.strip()',email:'student@example.org',phone:'+7 (999) 123-45-67',key:'sk-abcdefghijklmnopqrstuv',path:'/Users/private_student/course/result.py',win:'C:\\Users\\Student\\Desktop\\answer.py',secret:'do-not-send-this-value',password:'also-not-sent'};
 const clean=sanitizeForModel(original);assert.equal(clean.code,original.code);for(const key of ['email','phone','key','path','win','secret','password'])assert.notEqual(clean[key],original[key]);assert.equal(original.email,'student@example.org');assert.equal(sanitizeForModel(null),null);
});
test('Common rule preview refuses quotations, learner names, source IDs and redacted personal details',()=>{
 assert.equal(deidentifySharedText('Показывать конкретный вход, выражение и результат.'),'Показывать конкретный вход, выражение и результат.');
 for(const value of ['Для Алисы нужны более короткие объяснения.','Отзыв: мне не нравится формат.','Показывать «raw_drink».','taskId sample-source','Писать student@example.org','Открыть /home/student/work.py'])assert.throws(()=>deidentifySharedText(value,{names:["Алиса","Алисы"]}));
 assert.throws(()=>deidentifySharedText('Серёжа просит показывать таблицы.',{names:['Серёжа']}));
});
