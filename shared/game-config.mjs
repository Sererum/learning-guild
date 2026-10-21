// Общая игровая механика: предметы, баннеры и стартовые ресурсы.
export const banners = [
  {id:"weapon", name:"Оружие", title:"Арсенал созвездий", text:"Мечи, палочки и посохи для новых открытий"},
  {
    "id": "outfit",
    "name": "Наряды",
    "title": "Сад лунного кода",
    "text": "Платья, мантии и плащи исследовательницы"
  },
  {
    "id": "artifact",
    "name": "Артефакты",
    "title": "Реликвии архива",
    "text": "Цветок, перо и часы усиливают резонанс"
  },
  {
    "id": "accessory",
    "name": "Аксессуары",
    "title": "Маленькие созвездия",
    "text": "Венцы, броши и магические украшения"
  }
];
export const catalog = [
  {id:"moon-quill",kind:"weapon",name:"Клинок лунного архива",rarity:5,color:"#7dc8e0",power:9},
  {id:"dawn-quill",kind:"weapon",name:"Посох первого рассвета",rarity:5,color:"#e4b767",power:10},
  {
    "id": "novice",
    "wishable": false,
    "kind": "outfit",
    "name": "Мантия ученицы",
    "rarity": 3,
    "color": "#829b87",
    "power": 0
  },
  {
    "id": "tea",
    "kind": "outfit",
    "name": "Чайная роза",
    "rarity": 3,
    "color": "#b87576",
    "power": 0
  },
  {
    "id": "sea",
    "kind": "outfit",
    "name": "Морской ветер",
    "rarity": 3,
    "color": "#639eab",
    "power": 0
  },
  {
    "id": "violet",
    "kind": "outfit",
    "name": "Архивариус сумерек",
    "rarity": 4,
    "color": "#8e78b2",
    "power": 0
  },
  {
    "id": "cloud",
    "kind": "outfit",
    "name": "Облачная каллиграфия",
    "rarity": 4,
    "color": "#8196b8",
    "power": 0
  },
  {
    "id": "moon",
    "kind": "outfit",
    "name": "Лунная орхидея",
    "rarity": 5,
    "color": "#8470ac",
    "power": 0
  },
  {
    "id": "peony",
    "kind": "outfit",
    "name": "Королева пионов",
    "rarity": 5,
    "color": "#c67691",
    "power": 0
  },
  {
    "id": "aurora",
    "kind": "outfit",
    "name": "Ткачиха северного сияния",
    "rarity": 5,
    "color": "#589d9a",
    "power": 0
  },
  {
    "id": "ember",
    "kind": "outfit",
    "name": "Хранительница заката",
    "rarity": 5,
    "color": "#c47e58",
    "power": 0
  },
  {
    "id": "flower",
    "kind": "artifact",
    "slot": "flower",
    "name": "Цветок первого шага",
    "rarity": 3,
    "color": "#8ba786",
    "power": 5
  },
  {
    "id": "feather",
    "kind": "artifact",
    "slot": "feather",
    "name": "Перо ясной мысли",
    "rarity": 3,
    "color": "#8ba786",
    "power": 5
  },
  {
    "id": "clock",
    "kind": "artifact",
    "slot": "clock",
    "name": "Часы тихого утра",
    "rarity": 3,
    "color": "#8ba786",
    "power": 5
  },
  {
    "id": "garden",
    "kind": "artifact",
    "slot": "flower",
    "name": "Цветок воспоминаний",
    "rarity": 4,
    "color": "#9476b8",
    "power": 9
  },
  {
    "id": "ink",
    "kind": "artifact",
    "slot": "feather",
    "name": "Перо звёздных чернил",
    "rarity": 4,
    "color": "#9476b8",
    "power": 9
  },
  {
    "id": "eternity",
    "kind": "artifact",
    "slot": "clock",
    "name": "Часы созвездий",
    "rarity": 5,
    "color": "#ba934d",
    "power": 15
  },
  {
    "id": "bloom",
    "kind": "artifact",
    "slot": "flower",
    "name": "Сердце вечного сада",
    "rarity": 5,
    "color": "#ba934d",
    "power": 15
  },
  {
    "id": "tide",
    "kind": "artifact",
    "slot": "feather",
    "name": "Перо лунного прилива",
    "rarity": 5,
    "color": "#5f9fae",
    "power": 15
  },
  {
    "id": "eclipse",
    "kind": "artifact",
    "slot": "clock",
    "name": "Часы затмения",
    "rarity": 5,
    "color": "#9b7fba",
    "power": 15
  },
  {
    "id": "ribbon",
    "kind": "accessory",
    "name": "Лента странницы",
    "rarity": 3,
    "color": "#a56f79",
    "power": 0
  },
  {
    "id": "pin",
    "kind": "accessory",
    "name": "Брошь библиотекаря",
    "rarity": 3,
    "color": "#94a889",
    "power": 0
  },
  {
    "id": "wreath",
    "kind": "accessory",
    "name": "Венок полевых цветов",
    "rarity": 4,
    "color": "#9476b8",
    "power": 0
  },
  {
    "id": "star",
    "kind": "accessory",
    "name": "Звёздная диадема",
    "rarity": 5,
    "color": "#ba934d",
    "power": 0
  },
  {
    "id": "halo",
    "kind": "accessory",
    "name": "Венец рассвета",
    "rarity": 5,
    "color": "#ba934d",
    "power": 0
  },
  {
    "id": "coral",
    "kind": "accessory",
    "name": "Корона кораллового сада",
    "rarity": 5,
    "color": "#c47886",
    "power": 0
  },
  {
    "id": "comet",
    "kind": "accessory",
    "name": "Диадема падающей звезды",
    "rarity": 5,
    "color": "#708fb8",
    "power": 0
  },
  {
    "id": "quill",
    "kind": "weapon",
    "name": "Меч странницы",
    "rarity": 3,
    "color": "#b39964",
    "power": 0
  },
  {
    "id": "archive-quill",
    "kind": "weapon",
    "name": "Аметистовая палочка",
    "rarity": 4,
    "color": "#8f79af",
    "power": 4
  }
];
export const gameInitialState = {
  "version": 1,
  "name": "Исследователь",
  "hair": "chestnut",
  "skin": "warm",
  "currency": 0,
  "gold": 800,
  "books": 4,
  "petals": 0,
  "crystals": 0,
  "level": 19,
  "stage": 0,
  "inventory": {
    "novice": {
      "count": 1,
      "level": 0
    },
    "flower": {
      "count": 1,
      "level": 0
    },
    "ribbon": {
      "count": 1,
      "level": 0
    },
    "quill": {
      "count": 1,
      "level": 0,
      "xp": 0
    }
  },
  "equipped": {
    "outfit": "novice",
    "accessory": "ribbon",
    "flower": "flower",
    "feather": null,
    "clock": null,
    "weapon": "quill"
  },
  "pity": {
    "outfit": 0,
    "artifact": 0,
    "accessory": 0
  },
  "claims": {},
  "history": [],
  "world": 0,
  "materials": {
    "notes": 6,
    "tomes": 1,
    "ore": 8,
    "crystal": 1,
    "cloth": 8,
    "silk": 1,
    "dust": 0
  },
  "characterXp": 0,
  "achievementSlots": [
    null,
    null,
    null,
    null,
    null
  ],
  "statues": [],
  "visited": [],
  "lessonClaims": {},
  "pityFour": {
    "outfit": 0,
    "artifact": 0,
    "accessory": 0
  }
};
