import fs from 'node:fs';
import path from 'node:path';

// A clone never guesses an output outside its repository. The author's course
// folder is supplied explicitly, while tests can always construct notebooks.
export function authoringRoot({required=false}={}){
 const value=process.env.GUILD_AUTHORING_ROOT;
 if(!value){if(required)throw new Error('Укажите GUILD_AUTHORING_ROOT — директорию авторского курса с notebooks/. Экспорт не выполнен.');return null;}
 const root=path.resolve(value),notebooks=path.join(root,'notebooks');
 if(!fs.existsSync(notebooks)||!fs.statSync(notebooks).isDirectory())throw new Error('GUILD_AUTHORING_ROOT должен содержать директорию notebooks/. Экспорт не выполнен.');
 return root;
}
export function readAliceTemplate(){return JSON.parse(fs.readFileSync(new URL('../courses/alice-python/templates/blank.ipynb',import.meta.url),'utf8'));}
export function notebookOutput(name){if(!/^[a-z0-9_]+\.ipynb$/.test(name))throw new Error('Некорректное имя notebook');return path.join(authoringRoot({required:true}),'notebooks',name);}
