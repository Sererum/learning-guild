import {createEngine} from './shared/engine-core.mjs';
import {engineConfig as defaultConfig} from './courses/alice-python/rules.mjs';
// Only declarative game rules cross this boundary. Task fixtures stay server-side.
export function browserRulesSource(engineConfig = defaultConfig) {
 return `window.guildCreateEngine = (${createEngine.toString()});\nconst engine = window.guildCreateEngine(${JSON.stringify(engineConfig)});\nwindow.guildSyncRules = snapshot => { if(snapshot?.gameRules) Object.assign(window.guildRules, window.guildCreateEngine(snapshot.gameRules)); };\nconst {activeBanner,learnedPoints,pointAvailable,visiblePoints,courseHistory,normalizeState,achievements,earnedAchievements,itemPower,power,discoveredZones,pointRevealed,explorationPercent,enhancementTarget,materialOptions,enhancementPlan}=engine;`;
}
