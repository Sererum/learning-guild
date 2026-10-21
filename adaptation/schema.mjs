// Generated course content is JSON data. It never imports or evaluates model JavaScript.
const object = properties => ({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const text = {type:'string'};
const list = (items,minItems,maxItems) => ({type:'array',items,...(minItems!==undefined?{minItems}:{}),...(maxItems!==undefined?{maxItems}:{})});
const strings = list(text);
const attributed = object({text,evidenceIds:strings});
export const personalizationSchema = object({summary:text,preferences:list(object({rule:text,category:{type:'string',enum:['explanations','examples','pacing','practice','interface']},evidenceIds:strings,supersedesIds:strings})),aboutUpdates:list(object({field:{type:'string',enum:['interests','goals','background','avoid']},value:text,evidenceIds:strings})),sharedProposals:list(attributed)});
const step = object({label:text,line:{type:'integer'},occurrence:{type:'integer'},variablesJson:text,explanation:text});
const section = object({title:text,paragraphs:list(text,1,8),table:object({headers:list(text,2,6),rows:list(strings,1,20)}),example:object({code:text,output:text,steps:list(step,2,20)})});
const sample = object({inputsJson:text,expectedJson:text,explanation:text});
const testCase = object({label:text,inputsJson:text,expectedJson:text,hidden:{type:'boolean'}});
const wrong = object({code:text,reason:text});
const task = object({name:text,description:text,starter:text,hints:list(text,1,4),examples:list(sample,2,4),tests:list(testCase,4,10),referenceCode:text,wrongVariants:list(wrong,2,3),audit:object({simplestSolution:text,shortcutAnalysis:text,transfer:text})});
const material = object({branch:{type:'string',enum:['next','repair','reinforcement']},title:text,summary:text,sections:list(section,1,6),tasks:list(task,1,10),cheatsheet:list(text,1,12),pitfalls:list(object({title:text,problem:text,explanation:text,fix:text}),1,4)});
export const generationSchema = object({materials:list(material,1,2)});
export const independentReviewSchema = object({approved:{type:'boolean'},summary:text,issues:strings,taskAudits:list(object({taskId:text,clearForBeginner:{type:'boolean'},meaningfulConditions:{type:'boolean'},independentReferenceCode:text,wrongVariants:list(wrong),conclusion:text}))});

export function assertJsonShape(value,schema,label='Ответ Codex') {
 if(schema.type==='object') {
  if(value===null||typeof value!=='object'||Array.isArray(value))throw Error(`${label}: ожидался объект`);
  for(const key of schema.required)if(!Object.hasOwn(value,key))throw Error(`${label}: нет поля ${key}`);
  for(const [key,item]of Object.entries(value)){if(!Object.hasOwn(schema.properties,key))throw Error(`${label}: лишнее поле ${key}`);assertJsonShape(item,schema.properties[key],`${label}.${key}`);}
 } else if(schema.type==='array') {
  if(!Array.isArray(value))throw Error(`${label}: ожидался список`);
  if((schema.minItems!==undefined&&value.length<schema.minItems)||(schema.maxItems!==undefined&&value.length>schema.maxItems))throw Error(`${label}: неверное количество элементов`);
  if(value.length>100)throw Error(`${label}: слишком много элементов`);
  value.forEach((item,i)=>assertJsonShape(item,schema.items,`${label}[${i}]`));
 } else if(schema.type==='integer'?!Number.isSafeInteger(value):typeof value!==schema.type)throw Error(`${label}: неверный тип`);
 if(schema.enum&&!schema.enum.includes(value))throw Error(`${label}: неизвестное значение`);
 if(typeof value==='string'&&value.length>22000)throw Error(`${label}: слишком длинный текст`);
 return value;
}
