import fs from 'node:fs';
import {catalog,banners,gameInitialState} from '../../shared/game-config.mjs';
// Editable course data stays in JSON; shared game mechanics stay in the engine.
const rules=JSON.parse(fs.readFileSync(new URL('./rules.json',import.meta.url),'utf8'));
const courseMap=JSON.parse(fs.readFileSync(new URL('./world.json',import.meta.url),'utf8'));
export const engineConfig={...rules,courseMap,catalog,banners,initialState:{...gameInitialState,...rules.initialState}};
