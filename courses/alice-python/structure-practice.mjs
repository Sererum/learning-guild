// Topic practice extracted from the existing dict/set examination.
export const structurePractice=[
 {id:'frequency-practice',tag:'Практика · словарь частот',name:'Частоты категорий',minutes:8,reward:160,materials:'Кристалл ясности · книга опыта',
 description:'В lead_sources записаны источники рекламных заявок. Собери словарь source_counts: каждому источнику соответствует число его появлений. Сохрани общее число заявок в lead_count. Выведи сводку и количество заявок. Для пустого списка нужны пустой словарь и 0. Используй один обычный цикл for и словарь, без .count(), сокращённых записей и готовых счётчиков.',
 starter:'lead_sources = ["telegram", "search", "telegram"]\nsource_counts = {}\n\n# Собери source_counts, сохрани lead_count и выведи сводку:\n',
 constraints:{forLoops:1,whileLoops:0,maxLoopDepth:1,forbiddenCalls:[],forbiddenMethods:['count'],requiredPrintVariables:['source_counts','lead_count']},
 hints:['Источник — ключ, число его появлений — значение.','При просмотре очередной заявки увеличивается счётчик только её источника.','Для ещё не встречавшегося ключа .get() может вернуть 0.'],
 tests:[
 {label:'Повторные источники',inputs:{lead_sources:['telegram','search','telegram'],source_counts:{}},expected:{source_counts:{telegram:2,search:1},lead_count:3}},
 {label:'Пустой список',inputs:{lead_sources:[],source_counts:{}},expected:{source_counts:{},lead_count:0}},
 {label:'Новые категории',inputs:{lead_sources:['direct','direct','ref','direct'],source_counts:{}},expected:{source_counts:{direct:3,ref:1},lead_count:4}},
 {label:'Один источник',inputs:{lead_sources:['email'],source_counts:{}},expected:{source_counts:{email:1},lead_count:1}}
 ]},
 {id:'unique-practice',tag:'Практика · множества',name:'Уникальные элементы',minutes:8,reward:160,materials:'Кристалл ясности · книга опыта',
 description:'В customer_ids записаны клиенты, оставившие заявки; один человек может встречаться несколько раз. Сохрани множество разных клиентов в unique_customers, число заявок в lead_count и число разных людей в unique_customer_count. Выведи все три результата с пояснениями. Пустой список означает 0 заявок и 0 разных клиентов.',
 starter:'customer_ids = ["C-1", "C-2", "C-1"]\n\n# Сохрани unique_customers, lead_count, unique_customer_count и выведи отчёт:\n',
 hints:['Заявки считаем с повторениями, людей — без повторений.','Множество хранит каждый идентификатор один раз.','Раздели роли: исходный список, множество и два количества.'],
 tests:[
 {label:'Повторный клиент',inputs:{customer_ids:['C-1','C-2','C-1']},expected:{unique_customers:['C-1','C-2'],lead_count:3,unique_customer_count:2},sets:['unique_customers']},
 {label:'Пустой список',inputs:{customer_ids:[]},expected:{unique_customers:[],lead_count:0,unique_customer_count:0},sets:['unique_customers']},
 {label:'Все разные',inputs:{customer_ids:['X','Y','Z']},expected:{unique_customers:['X','Y','Z'],lead_count:3,unique_customer_count:3},sets:['unique_customers']},
 {label:'Все заявки одного человека',inputs:{customer_ids:['A','A','A','A']},expected:{unique_customers:['A'],lead_count:4,unique_customer_count:1},sets:['unique_customers']}
 ]}
];
