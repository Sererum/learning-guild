import {readLocalConfig} from '../local-config.mjs';
import {loadCourse} from '../course-loader.mjs';
try {
 const course=await loadCourse(readLocalConfig({args:process.argv.slice(2)}));
 console.log(`${course.manifest.title} (${course.id}): ${course.lessons.length} уроков, ${course.tasks.length} задач, ${course.engineConfig.courseMap.regions.length} регионов. Структура корректна.`);
} catch(error) {console.error(error.message);process.exitCode=1;}
