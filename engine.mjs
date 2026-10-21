// Compatibility facade: existing Alice imports keep working while the engine accepts any course.
import {createEngine} from './shared/engine-core.mjs';
import {engineConfig} from './courses/alice-python/rules.mjs';
export {createEngine};
export const {catalog,banners,courseMap,courseHistory,achievements,taskRewards,itemById,activeBanner,importCourseHistory,earnedAchievements,normalizeState,initialState,itemPower,power,learnedPoints,pointAvailable,visiblePoints,discoveredZones,pointRevealed,explorationPercent,enhancementTarget,materialOptions,enhancementPlan,applyEnhancement,claimKey,lessonBaseReward,qualityCap,canStudyAlgorithms,claimQuality,claim,wish,act,canStudyGate}=createEngine({engineConfig});
