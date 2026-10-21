// Best-effort redaction before model calls and local common-rule previews.
// This is a privacy aid, not a guarantee that arbitrary prose is anonymous.
const sensitiveKey=/^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization|private[_-]?key)$/i;
function redactText(value,names=[]){
 let output=value.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,'[ключ скрыт]')
  .replace(/\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b/g,'[токен скрыт]')
  .replace(/\bBearer\s+[A-Za-z0-9._~-]{12,}/gi,'Bearer [токен скрыт]')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email скрыт]')
  .replace(/(?:\+\d[\d ()-]{8,}\d|\b(?:8|7)[ (]\d{3}[ )-]+\d{3}[ -]\d{2}[ -]\d{2}\b)/g,'[телефон скрыт]')
  .replace(/(?:\/Users\/|\/home\/)[^\s"'`<>),;]+/g,'[личный путь скрыт]')
  .replace(/\b[A-Z]:\\Users\\[^\s"'`<>),;]+/gi,'[личный путь скрыт]')
  .replace(/\b(api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*(["']?)[A-Za-z0-9._~-]{8,}\2/gi,'$1=[секрет скрыт]');
 for(const name of names.filter(name=>typeof name==='string'&&name.trim().length>1))output=output.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'giu'),'[имя скрыто]');
 return output;
}
export function sanitizeForModel(value,{names=[]}={}){
 if(typeof value==='string')return redactText(value,names);
 if(Array.isArray(value))return value.map(item=>sanitizeForModel(item,{names}));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sensitiveKey.test(key)?'[секрет скрыт]':sanitizeForModel(item,{names})]));
 return value;
}
export function deidentifySharedText(value,{names=[]}={}){
 if(typeof value!=='string'||!value.trim()||value.length>1000)throw Error('Нужно короткое общее правило до 1000 символов.');
 const text=sanitizeForModel(value.trim(),{names});
 // A common rule is a teaching instruction, never a copied source or quotation.
 if(/[«»“”"]|\b(?:evidenceIds?|sourceIds?|profileId|lessonId|taskId)\b|(?:^|\s)(?:отзыв|цитата)\s*:/iu.test(text))throw Error('Сформулируйте общее правило своими словами: без цитат, имён и ссылок на личные отзывы.');
 if(/\[(?:имя|email|телефон|личный путь|секрет|токен|ключ)\s+скрыт[ао]?\]/u.test(text))throw Error('Перед общим применением уберите личные данные из самого правила.');
 return text;
}
