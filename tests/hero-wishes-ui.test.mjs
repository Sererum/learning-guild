import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngine} from '../shared/engine-core.mjs';
import {catalog,banners,gameInitialState} from '../shared/game-config.mjs';
import {renderHero} from '../public/pages/hero.js';
import {renderWishes} from '../public/pages/wishes.js';

function context(){
  const rules=createEngine({catalog,banners,initialState:structuredClone(gameInitialState)});
  const state=rules.initialState();
  return {rules,data:{catalog,banners,state},esc:value=>String(value??'')};
}

test('Empty experience supplies disable auto-selection and explain how to obtain materials',()=>{
  const ctx=context(),s=ctx.data.state;
  s.books=0;s.materials.notes=0;s.materials.tomes=0;
  const output=renderHero(ctx);
  assert.match(output,/id="hero-auto-materials" disabled/);
  assert.match(output,/Нет материалов для повышения уровня\. Их можно получить за задания\./);
  assert.match(output,/Где взять материалы и мору\?/);
  assert.match(output,/Результат повышения уровня/);
  assert.match(output,/Подтвердить повышение уровня/);
  assert.doesNotMatch(output,/Экипированные артефакты и одна копия/);
  assert.doesNotMatch(output,/Монеты|монет/);
});

test('Available experience materials keep auto-selection enabled, unless the level cap is reached',()=>{
  const ctx=context(),s=ctx.data.state;
  s.books=1;s.materials.notes=0;s.materials.tomes=0;s.level=19;
  const before=structuredClone(s),output=renderHero(ctx);
  assert.match(output,/id="hero-auto-materials">До следующего уровня/);
  assert.doesNotMatch(output,/Нет материалов для/);
  assert.deepEqual(s,before,'Rendering must not spend resources');
  s.level=20;
  assert.match(renderHero(ctx),/id="hero-auto-materials" disabled/);
});

test('Completed collections replace guarantees while unfinished collections retain working wish controls',()=>{
  const ctx=context(),s=ctx.data.state;s.currency=3200;
  for(const item of catalog.filter(x=>x.kind==='outfit'&&x.rarity===5))delete s.inventory[item.id];
  const open=renderWishes(ctx);
  assert.match(open,/до гарантированной 5★/);
  assert.match(open,/data-stellar-wish="1" >/);
  for(const item of catalog.filter(x=>x.kind==='outfit'&&x.rarity===5))s.inventory[item.id]={count:1,level:0};
  const before=structuredClone(s),complete=renderWishes(ctx);
  assert.match(complete,/Все легендарные вещи этой коллекции получены\. Молитвы здесь завершены\./);
  assert.doesNotMatch(complete,/до гарантированной 5★|до находки 4★/);
  assert.match(complete,/data-stellar-wish="1" disabled/);
  assert.match(complete,/data-stellar-wish="10" disabled/);
  assert.deepEqual(s,before,'Completed collection rendering must not change pity, inventory or currency');
});
