// Prepared snapshots of the lesson's explained examples, never student solutions.
export function traceScenarios(id){
 if(id==='max'){
  const values=[-30,-12,-45,-8],frames=[];let best=values[0],bestIndex=0;
  frames.push({line:2,values,active:[],marks:{0:'лидер'},vars:{best_profit:best},text:'Берём первого реального кандидата. Ноль не придумываем.'});
  values.forEach((profit,i)=>{const better=profit>best;frames.push({line:6,values,active:[i],marks:{[i]:'profit',[bestIndex]:'лидер'},vars:{profit,best_profit:best},text:`Сравниваем ${profit} > ${best}: ${better?'True — обновляем лидера следующим шагом.':'False — лидер остаётся прежним.'}`});if(better){best=profit;bestIndex=i;frames.push({line:7,values,active:[i],marks:{[i]:'новый лидер'},vars:{profit,best_profit:best},text:`Сохранили ${best}. Это лучший результат среди уже просмотренных.`});}});
  frames.push({line:9,values,active:[bestIndex],marks:{[bestIndex]:'ответ'},vars:{best_profit:best},text:'Цикл закончился. Выводим лучший результат: -8.'});return [{id:'example',name:'Все значения отрицательные',frames}];
 }
 if(id==='substring'){
  const text='coffee tea',marker='tea',values=[...text],frames=[{line:4,values,active:[],marks:{},vars:{width:3,found_at:-1},text:'Маркер — tea. Ширина окна 3. Допустимые начала: от 0 до 7 включительно.'}];
  for(let start=0;start<=7;start++){const window=text.slice(start,start+3),match=window===marker;frames.push({line:8,values,active:[start,start+1,start+2],marks:{[start]:'start'},vars:{start,window,found_at:-1},text:`Окно «${window}»: ${match?'совпадает с tea.':'не совпадает с tea; передвинем окно на один символ.'}`});if(match)frames.push({line:9,values,active:[start,start+1,start+2],marks:{[start]:'найдено'},vars:{start,window,found_at:start},text:'Сохраняем found_at = 7 и выходим через break. Последнее окно тоже проверили.'});}
  return [{id:'example',name:'Совпадение в последнем окне',frames}];
 }
 const scenario=(id,name,values)=>{let left=0,right=values.length-1,found=false;const frames=[],base={values};const state=()=>({left,right,pair_found:found});
 frames.push({...base,line:6,active:values.length>1?[left,right]:[],marks:values.length?{[left]:'left',[right]:left===right?'left = right':'right'}:{},vars:state(),text:`Проверяем left < right: ${left} < ${right} → ${left<right?'True. Можно сравнить два разных элемента.':'False. Цикл не начнётся: двух разных элементов нет.'}`});
 while(left<right){const total=values[left]+values[right];frames.push({...base,line:7,active:[left,right],marks:{[left]:'left',[right]:'right'},vars:{...state(),total,target:12},text:`${values[left]} + ${values[right]} = ${total}. ${total===12?'Попали в цель.':total<12?'Мало: двигаем только left.':'Много: двигаем только right.'}`});if(total===12){found=true;frames.push({...base,line:10,active:[left,right],marks:{[left]:'пара',[right]:'пара'},vars:{...state(),total,target:12},text:'pair_found = True. Выходим через break: пара 4 и 8.'});break;}if(total<12)left++;else right--;frames.push({...base,line:total<12?14:16,active:left<right?[left,right]:[],marks:left<right?{[left]:'left',[right]:'right'}:{},vars:state(),text:'Изменили один адрес. На следующем круге снова проверим условие.'});}
 frames.push({...base,line:17,active:found?[left,right]:[],marks:{},vars:state(),text:`Итог: pair_found = ${found?'True':'False'}. ${values.length<2?'Не обращались к несуществующим элементам.':'Проверка закончена.'}`});return {id,name,frames};};
 return [scenario('example','Пара на сумму 12',[2,4,8,9]),scenario('single','Один товар',[6]),scenario('empty','Пустой список',[])];
}
