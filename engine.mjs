// Default game engine without a curriculum. Pass a course to createEngine for learning.
import {createEngine} from './shared/engine-core.mjs';
import course from './shared/blank-course.mjs';
const {engineConfig}=course;
export {createEngine};
export const {catalog,banners,courseMap,courseHistory,achievements,taskRewards,itemById,activeBanner,importCourseHistory,earnedAchievements,normalizeState,initialState,itemPower,power,learnedPoints,pointAvailable,visiblePoints,discoveredZones,pointRevealed,explorationPercent,enhancementTarget,materialOptions,enhancementPlan,applyEnhancement,claimKey,lessonBaseReward,qualityCap,canStudyAlgorithms,claimQuality,claim,wish,act,canStudyGate}=createEngine({engineConfig});
