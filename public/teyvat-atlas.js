// Public geographic data from HoYoLAB. Snapshot: 2026-10-22.
// Course contents and learner progress do not belong in this file.
export const TEYVAT_ATLAS = Object.freeze({
  "id": "hoyolab-teyvat-2026-10-22",
  "sourceName": "HoYoLAB — Интерактивная карта Тейвата",
  "sourceUrl": "https://act.hoyolab.com/ys/app/interactive-map/index.html?lang=ru-ru#/map/2",
  "retrievedAt": "2026-10-22",
  "copyright": "© HoYoverse. Все права на карту и географию принадлежат правообладателю.",
  "image": "/assets/teyvat/teyvat-official-2026-10.webp",
  "detail": {
    "directory": "/assets/teyvat",
    "prefix": "detail-4x-",
    "scale": 4,
    "tileSize": 256,
    "sourceZoom": -1
  },
  "width": 2702,
  "height": 2295,
  "mapId": 2,
  "mapVersion": "eea752b746ae1f2e0c1988a574f2b7b0",
  "tileZoom": -3,
  "tileSize": 256,
  "sourceSize": [
    36864,
    18432
  ],
  "sourceOrigin": [
    24206,
    8918
  ],
  "crop": {
    "left": 953,
    "top": 4,
    "width": 2702,
    "height": 2295
  },
  "coordinateSystem": "x = ((sourceX + 24206) / 8 - 953) / 2702 * 100; y = ((sourceY + 8918) / 8 - 4) / 2295 * 100. Positive y points down.",
  "portalNote": "Фиксированные учебные порталы размещены на координатах наземных точек телепортации официальной карты. Последовательность принадлежит учебному приложению."
});
export const ATLAS_REGIONS = [
  {
    "id": "mondstadt",
    "name": "Мондштадт",
    "sourceAreaId": 1,
    "x": 77.091,
    "y": 49.4363,
    "sourceBounds": {
      "left": -1031,
      "top": -688,
      "right": 1195,
      "bottom": 1069
    },
    "portals": [
      {
        "id": "mondstadt-01",
        "sourcePointId": 7,
        "sourceX": 756.5,
        "sourceY": 46.5,
        "x": 80.2114,
        "y": 48.652,
        "location": "Храм Тысячи ветров"
      },
      {
        "id": "mondstadt-02",
        "sourcePointId": 9,
        "sourceX": 891.5,
        "sourceY": -352.5,
        "x": 80.836,
        "y": 46.4788,
        "location": "Утёс Звездолова"
      },
      {
        "id": "mondstadt-03",
        "sourcePointId": 95792,
        "sourceX": -8,
        "sourceY": -555.5,
        "x": 76.6747,
        "y": 45.3731,
        "location": "Сидровое озеро"
      },
      {
        "id": "mondstadt-04",
        "sourcePointId": 95794,
        "sourceX": -437,
        "sourceY": -555.5,
        "x": 74.69,
        "y": 45.3731,
        "location": "Каньон Светлой короны"
      },
      {
        "id": "mondstadt-05",
        "sourcePointId": 28,
        "sourceX": -787,
        "sourceY": -35.14179092048266,
        "x": 73.0709,
        "y": 48.2073,
        "location": "Горы Светлой короны"
      },
      {
        "id": "mondstadt-06",
        "sourcePointId": 116,
        "sourceX": -545.1000061035156,
        "sourceY": 459.300048828125,
        "x": 74.19,
        "y": 50.9003,
        "location": "Винокурня «Рассвет»"
      },
      {
        "id": "mondstadt-07",
        "sourcePointId": 6540,
        "sourceX": -174.5,
        "sourceY": 869,
        "x": 75.9044,
        "y": 53.1318,
        "location": "Ущелье спящего дракона"
      },
      {
        "id": "mondstadt-08",
        "sourcePointId": 6538,
        "sourceX": 389,
        "sourceY": 732,
        "x": 78.5113,
        "y": 52.3856,
        "location": "Укрытая снегом тропа"
      },
      {
        "id": "mondstadt-09",
        "sourcePointId": 6604,
        "sourceX": 587.5,
        "sourceY": 1497.5,
        "x": 79.4296,
        "y": 56.555,
        "location": "Дворец погребённой столицы"
      },
      {
        "id": "mondstadt-10",
        "sourcePointId": 6609,
        "sourceX": 46,
        "sourceY": 1295,
        "x": 76.9245,
        "y": 55.4521,
        "location": "Шип небесной стужи"
      },
      {
        "id": "mondstadt-11",
        "sourcePointId": 6599,
        "sourceX": -337.5,
        "sourceY": 1171.5,
        "x": 75.1504,
        "y": 54.7794,
        "location": "Окрестности погребённой столицы"
      },
      {
        "id": "mondstadt-12",
        "sourcePointId": 6596,
        "sourceX": -192,
        "sourceY": 1093,
        "x": 75.8235,
        "y": 54.3519,
        "location": "Ущелье спящего дракона"
      }
    ]
  },
  {
    "id": "liyue",
    "name": "Ли Юэ",
    "sourceAreaId": 2,
    "x": 66.0737,
    "y": 57.2985,
    "sourceBounds": {
      "left": -3135,
      "top": 712,
      "right": -1464,
      "bottom": 2556
    },
    "portals": [
      {
        "id": "liyue-01",
        "sourcePointId": 51,
        "sourceX": -1075.0000825801526,
        "sourceY": 1449.4987769860568,
        "x": 71.7385,
        "y": 56.2936,
        "location": "Постоялый двор «Ваншу»"
      },
      {
        "id": "liyue-02",
        "sourcePointId": 36,
        "sourceX": -1594,
        "sourceY": 793,
        "x": 69.3375,
        "y": 52.7179,
        "location": "Деревня Цинцэ"
      },
      {
        "id": "liyue-03",
        "sourcePointId": 64845,
        "sourceX": -2436.2449683286413,
        "sourceY": 686.0004411663122,
        "x": 65.4411,
        "y": 52.1351,
        "location": "Долина Яоде"
      },
      {
        "id": "liyue-04",
        "sourcePointId": 64840,
        "sourceX": -2941.6251306927625,
        "sourceY": 231.50321421169792,
        "x": 63.1031,
        "y": 49.6596,
        "location": "Гора Линмэн"
      },
      {
        "id": "liyue-05",
        "sourcePointId": 64837,
        "sourceX": -3106.2499673268085,
        "sourceY": -81.25063023758776,
        "x": 62.3416,
        "y": 47.9562,
        "location": "Порт Илун"
      },
      {
        "id": "liyue-06",
        "sourcePointId": 45,
        "sourceX": -2549,
        "sourceY": 1619,
        "x": 64.9195,
        "y": 57.2168,
        "location": "Гора Хулао"
      },
      {
        "id": "liyue-07",
        "sourcePointId": 47,
        "sourceX": -2413.5,
        "sourceY": 1943.5,
        "x": 65.5464,
        "y": 58.9842,
        "location": "Южные небесные врата"
      },
      {
        "id": "liyue-08",
        "sourcePointId": 110,
        "sourceX": -1582.5,
        "sourceY": 2087.5,
        "x": 69.3907,
        "y": 59.7685,
        "location": "Озеро Лухуа"
      },
      {
        "id": "liyue-09",
        "sourcePointId": 94,
        "sourceX": -1039,
        "sourceY": 2573.5,
        "x": 71.9051,
        "y": 62.4156,
        "location": "Ли Юэ"
      },
      {
        "id": "liyue-10",
        "sourcePointId": 104,
        "sourceX": -1017,
        "sourceY": 2996.5,
        "x": 72.0068,
        "y": 64.7195,
        "location": "Ли Юэ"
      },
      {
        "id": "liyue-11",
        "sourcePointId": 24910,
        "sourceX": -2214.191360825494,
        "sourceY": 3051.941547382814,
        "x": 66.4684,
        "y": 65.0215,
        "location": "Глазурный утёс"
      },
      {
        "id": "liyue-12",
        "sourcePointId": 28732,
        "sourceX": -2767.5,
        "sourceY": 3106,
        "x": 63.9087,
        "y": 65.3159,
        "location": "Киноварный утёс"
      }
    ]
  },
  {
    "id": "inazuma",
    "name": "Инадзума",
    "sourceAreaId": 3,
    "x": 91.5132,
    "y": 77.9085,
    "sourceBounds": {
      "left": 2170,
      "top": 4550,
      "right": 4229,
      "bottom": 6286
    },
    "portals": [
      {
        "id": "inazuma-01",
        "sourcePointId": 12746,
        "sourceX": 3379,
        "sourceY": 4087,
        "x": 92.3436,
        "y": 70.659,
        "location": "Остров Дзинрэн"
      },
      {
        "id": "inazuma-02",
        "sourcePointId": 12738,
        "sourceX": 3840,
        "sourceY": 4910.5,
        "x": 94.4763,
        "y": 75.1443,
        "location": "Имение Камисато"
      },
      {
        "id": "inazuma-03",
        "sourcePointId": 12725,
        "sourceX": 3475.5,
        "sourceY": 5329,
        "x": 92.7901,
        "y": 77.4237,
        "location": "Равнина Бякко"
      },
      {
        "id": "inazuma-04",
        "sourcePointId": 13669,
        "sourceX": 2490.5,
        "sourceY": 5492.5,
        "x": 88.2333,
        "y": 78.3143,
        "location": "Лагерь Кудзё"
      },
      {
        "id": "inazuma-05",
        "sourcePointId": 12716,
        "sourceX": 1794,
        "sourceY": 5864,
        "x": 85.0111,
        "y": 80.3377,
        "location": "Отмель Надзути"
      },
      {
        "id": "inazuma-06",
        "sourcePointId": 12696,
        "sourceX": 1215.75,
        "sourceY": 5896.5,
        "x": 82.336,
        "y": 80.5147,
        "location": "Форт Фудзито"
      },
      {
        "id": "inazuma-07",
        "sourcePointId": 15951,
        "sourceX": 573,
        "sourceY": 6100.5,
        "x": 79.3625,
        "y": 81.6258,
        "location": "Озеро Суигэцу"
      },
      {
        "id": "inazuma-08",
        "sourcePointId": 15940,
        "sourceX": 9.5,
        "sourceY": 6325,
        "x": 76.7556,
        "y": 82.8486,
        "location": "Деревня Боро"
      },
      {
        "id": "inazuma-09",
        "sourcePointId": 12711,
        "sourceX": 1650.5,
        "sourceY": 6454.75,
        "x": 84.3472,
        "y": 83.5553,
        "location": "Шахта Дзякоцу"
      },
      {
        "id": "inazuma-10",
        "sourcePointId": 16018,
        "sourceX": 3505.5,
        "sourceY": 7113,
        "x": 92.9288,
        "y": 87.1405,
        "location": "Гора Тэнкумо"
      },
      {
        "id": "inazuma-11",
        "sourcePointId": 16012,
        "sourceX": 2953,
        "sourceY": 7013.5,
        "x": 90.3729,
        "y": 86.5986,
        "location": "Святилище Асасэ"
      },
      {
        "id": "inazuma-12",
        "sourcePointId": 18586,
        "sourceX": 2356,
        "sourceY": 8599.5,
        "x": 87.611,
        "y": 95.2369,
        "location": "Цуруми"
      }
    ]
  },
  {
    "id": "sumeru",
    "name": "Сумеру",
    "sourceAreaId": 4,
    "x": 56.1806,
    "y": 67.5027,
    "sourceBounds": {
      "left": -5852,
      "top": 2398,
      "right": -3024,
      "bottom": 4617
    },
    "portals": [
      {
        "id": "sumeru-01",
        "sourcePointId": 28734,
        "sourceX": -3208.75,
        "sourceY": 2955.75,
        "x": 61.8674,
        "y": 64.4975,
        "location": "Ущелье Чинват"
      },
      {
        "id": "sumeru-02",
        "sourcePointId": 28745,
        "sourceX": -3549.5,
        "sourceY": 2306,
        "x": 60.291,
        "y": 60.9586,
        "location": "Пещера Чатракам"
      },
      {
        "id": "sumeru-03",
        "sourcePointId": 69098,
        "sourceX": -4033,
        "sourceY": 1924.5,
        "x": 58.0542,
        "y": 58.8807,
        "location": "Гавань Бейда"
      },
      {
        "id": "sumeru-04",
        "sourcePointId": 28710,
        "sourceX": -4751.5,
        "sourceY": 3317,
        "x": 54.7303,
        "y": 66.4651,
        "location": "Потерянный питомник"
      },
      {
        "id": "sumeru-05",
        "sourcePointId": 28718,
        "sourceX": -3880.75,
        "sourceY": 4055.75,
        "x": 58.7586,
        "y": 70.4888,
        "location": "Чаща Апам"
      },
      {
        "id": "sumeru-06",
        "sourcePointId": 28716,
        "sourceX": -4302.25,
        "sourceY": 4325.75,
        "x": 56.8086,
        "y": 71.9594,
        "location": "Руины Дахри"
      },
      {
        "id": "sumeru-07",
        "sourcePointId": 36685,
        "sourceX": -4956.5,
        "sourceY": 5049.25,
        "x": 53.7819,
        "y": 75.9001,
        "location": "Земля верхнего Сетеха"
      },
      {
        "id": "sumeru-08",
        "sourcePointId": 36699,
        "sourceX": -5890,
        "sourceY": 5107,
        "x": 49.4634,
        "y": 76.2146,
        "location": "Дюна Ухищрения"
      },
      {
        "id": "sumeru-09",
        "sourcePointId": 36692,
        "sourceX": -6728,
        "sourceY": 4461,
        "x": 45.5866,
        "y": 72.6961,
        "location": "Гробница царя Дешрета"
      },
      {
        "id": "sumeru-10",
        "sourcePointId": 41830,
        "sourceX": -6429.75,
        "sourceY": 3030.25,
        "x": 46.9664,
        "y": 64.9033,
        "location": "Долина Переломай-ноги"
      },
      {
        "id": "sumeru-11",
        "sourcePointId": 46516,
        "sourceX": -6913,
        "sourceY": 2325.25,
        "x": 44.7308,
        "y": 61.0635,
        "location": "Горы Темир"
      },
      {
        "id": "sumeru-12",
        "sourcePointId": 46522,
        "sourceX": -7086.25,
        "sourceY": 1577.75,
        "x": 43.9293,
        "y": 56.9921,
        "location": "Пролом Туниги"
      }
    ]
  },
  {
    "id": "fontaine",
    "name": "Фонтейн",
    "sourceAreaId": 8,
    "x": 54.6378,
    "y": 43.5294,
    "sourceBounds": {
      "left": -6121,
      "top": -1997,
      "right": -3422,
      "bottom": 209
    },
    "portals": [
      {
        "id": "fontaine-01",
        "sourcePointId": 68341,
        "sourceX": -5071,
        "sourceY": 1155.0025999206864,
        "x": 53.2522,
        "y": 54.6896,
        "location": "Петрикор"
      },
      {
        "id": "fontaine-02",
        "sourcePointId": 50035,
        "sourceX": -5378.5,
        "sourceY": 149.5,
        "x": 51.8297,
        "y": 49.213,
        "location": "Район Берилл"
      },
      {
        "id": "fontaine-03",
        "sourcePointId": 50037,
        "sourceX": -5436.5,
        "sourceY": -94,
        "x": 51.5613,
        "y": 47.8867,
        "location": "Район Берилл"
      },
      {
        "id": "fontaine-04",
        "sourcePointId": 50077,
        "sourceX": -5573.75,
        "sourceY": -1300,
        "x": 50.9264,
        "y": 41.3181,
        "location": "Кур-де-Фонтейн"
      },
      {
        "id": "fontaine-05",
        "sourcePointId": 53852,
        "sourceX": -5732,
        "sourceY": -2133,
        "x": 50.1943,
        "y": 36.781,
        "location": "Восточный склон Мон Эсус"
      },
      {
        "id": "fontaine-06",
        "sourcePointId": 53861,
        "sourceX": -5056,
        "sourceY": -2426.75,
        "x": 53.3216,
        "y": 35.1811,
        "location": "Новый Исследовательский институт Фонтейна"
      },
      {
        "id": "fontaine-07",
        "sourcePointId": 53859,
        "sourceX": -4561.25,
        "sourceY": -2623,
        "x": 55.6104,
        "y": 34.1122,
        "location": "Руины Центральной лаборатории"
      },
      {
        "id": "fontaine-08",
        "sourcePointId": 53855,
        "sourceX": -4370.75,
        "sourceY": -2110.75,
        "x": 56.4917,
        "y": 36.9022,
        "location": "Руины Центральной лаборатории"
      },
      {
        "id": "fontaine-09",
        "sourcePointId": 55782,
        "sourceX": -3947.75,
        "sourceY": -1110,
        "x": 58.4486,
        "y": 42.3529,
        "location": "Путь в Туманном лесу"
      },
      {
        "id": "fontaine-10",
        "sourcePointId": 55770,
        "sourceX": -4122.375,
        "sourceY": -374.25,
        "x": 57.6408,
        "y": 46.3603,
        "location": "Руины форта Харибда"
      },
      {
        "id": "fontaine-11",
        "sourcePointId": 55771,
        "sourceX": -4202,
        "sourceY": 37.75,
        "x": 57.2724,
        "y": 48.6043,
        "location": "Морт"
      },
      {
        "id": "fontaine-12",
        "sourcePointId": 55762,
        "sourceX": -4565,
        "sourceY": -12.75,
        "x": 55.5931,
        "y": 48.3292,
        "location": "Район Белло"
      }
    ]
  },
  {
    "id": "natlan",
    "name": "Натлан",
    "sourceAreaId": 11,
    "x": 32.3163,
    "y": 70.4548,
    "sourceBounds": {
      "left": -11964,
      "top": 1905,
      "right": -7229,
      "bottom": 6194
    },
    "portals": [
      {
        "id": "natlan-01",
        "sourcePointId": 72413,
        "sourceX": -8379.750303334775,
        "sourceY": 3970.5023105552627,
        "x": 37.9453,
        "y": 70.0245,
        "location": "Склон Тепеакак"
      },
      {
        "id": "natlan-02",
        "sourcePointId": 72437,
        "sourceX": -8991.500640373415,
        "sourceY": 4064.001623633427,
        "x": 35.1152,
        "y": 70.5338,
        "location": "Долина Теквемекан"
      },
      {
        "id": "natlan-03",
        "sourcePointId": 72420,
        "sourceX": -9040.749797776816,
        "sourceY": 4852.997689444737,
        "x": 34.8874,
        "y": 74.8311,
        "location": "Пик Тетикпак"
      },
      {
        "id": "natlan-04",
        "sourcePointId": 72419,
        "sourceX": -9494.752359270478,
        "sourceY": 5344.866944280302,
        "x": 32.787,
        "y": 77.5102,
        "location": "Ручьи Тойек"
      },
      {
        "id": "natlan-05",
        "sourcePointId": 82561,
        "sourceX": -10551.003463774772,
        "sourceY": 5173.749279585209,
        "x": 27.9006,
        "y": 76.5782,
        "location": "Атокпан"
      },
      {
        "id": "natlan-06",
        "sourcePointId": 82564,
        "sourceX": -11115.127563193331,
        "sourceY": 5650.628100915841,
        "x": 25.2909,
        "y": 79.1755,
        "location": "Развалины Тетенанко"
      },
      {
        "id": "natlan-07",
        "sourcePointId": 82571,
        "sourceX": -11677.874930724505,
        "sourceY": 4696.249686776178,
        "x": 22.6875,
        "y": 73.9774,
        "location": "Поля падающих звёзд"
      },
      {
        "id": "natlan-08",
        "sourcePointId": 79482,
        "sourceX": -11477.681084142505,
        "sourceY": 3715.1499200217695,
        "x": 23.6136,
        "y": 68.6337,
        "location": "Бухта Теколоапан"
      },
      {
        "id": "natlan-09",
        "sourcePointId": 79055,
        "sourceX": -10718.249393330449,
        "sourceY": 3937.2522552115206,
        "x": 27.1269,
        "y": 69.8434,
        "location": "Повелители Ночного Ветра"
      },
      {
        "id": "natlan-10",
        "sourcePointId": 79387,
        "sourceX": -10054.196311260315,
        "sourceY": 3745.085576669484,
        "x": 30.1989,
        "y": 68.7968,
        "location": "Клан Цветочного Пера"
      },
      {
        "id": "natlan-11",
        "sourcePointId": 80036,
        "sourceX": -10563.803737525664,
        "sourceY": 2704.016613347847,
        "x": 27.8414,
        "y": 63.1265,
        "location": "Очканатлан"
      },
      {
        "id": "natlan-12",
        "sourcePointId": 79549,
        "sourceX": -10822.371018382812,
        "sourceY": 2302.791354088884,
        "x": 26.6452,
        "y": 60.9411,
        "location": "Очканатлан"
      }
    ]
  },
  {
    "id": "nod-krai",
    "name": "Нод-Край",
    "sourceAreaId": 13,
    "x": 27.4311,
    "y": 46.2745,
    "sourceBounds": {
      "left": -11997,
      "top": -1661,
      "right": -9308,
      "bottom": 881
    },
    "portals": [
      {
        "id": "nod-krai-01",
        "sourcePointId": 88142,
        "sourceX": -10198,
        "sourceY": 665,
        "x": 29.5337,
        "y": 52.0207,
        "location": "Нашгород"
      },
      {
        "id": "nod-krai-02",
        "sourcePointId": 88140,
        "sourceX": -10619.5,
        "sourceY": 611.5,
        "x": 27.5837,
        "y": 51.7293,
        "location": "Мастерская крумкаке «Дзынь-Клац»"
      },
      {
        "id": "nod-krai-03",
        "sourcePointId": 88130,
        "sourceX": -11298.5,
        "sourceY": 549,
        "x": 24.4425,
        "y": 51.3889,
        "location": "Анклав Морозной Луны"
      },
      {
        "id": "nod-krai-04",
        "sourcePointId": 88137,
        "sourceX": -11535,
        "sourceY": 46.5,
        "x": 23.3484,
        "y": 48.652,
        "location": "Озарённая платформа"
      },
      {
        "id": "nod-krai-05",
        "sourcePointId": 88160,
        "sourceX": -10645.5,
        "sourceY": -503,
        "x": 27.4635,
        "y": 45.659,
        "location": "Экспериментальное конструкторское бюро куувяки"
      },
      {
        "id": "nod-krai-06",
        "sourcePointId": 88161,
        "sourceX": -10568,
        "sourceY": -701.5,
        "x": 27.822,
        "y": 44.5779,
        "location": "Экспериментальное конструкторское бюро куувяки"
      },
      {
        "id": "nod-krai-07",
        "sourcePointId": 88166,
        "sourceX": -10056.5,
        "sourceY": -1217.5,
        "x": 30.1883,
        "y": 41.7674,
        "location": "Кладбище ночи"
      },
      {
        "id": "nod-krai-08",
        "sourcePointId": 88168,
        "sourceX": -10621,
        "sourceY": -1270,
        "x": 27.5768,
        "y": 41.4815,
        "location": "Остров Паха"
      },
      {
        "id": "nod-krai-09",
        "sourcePointId": 92874,
        "sourceX": -10593.752055935702,
        "sourceY": -2938.7539108201404,
        "x": 27.7028,
        "y": 32.3924,
        "location": "Пирамида"
      },
      {
        "id": "nod-krai-10",
        "sourcePointId": 92893,
        "sourceX": -10524.5,
        "sourceY": -3486,
        "x": 28.0232,
        "y": 29.4118,
        "location": "Штаб Ордо Фавониус"
      },
      {
        "id": "nod-krai-11",
        "sourcePointId": 92890,
        "sourceX": -10848.004516317771,
        "sourceY": -4009.5211941220514,
        "x": 26.5266,
        "y": 26.5603,
        "location": "Скала Кипумаки"
      },
      {
        "id": "nod-krai-12",
        "sourcePointId": 99219,
        "sourceX": -9223.929967140954,
        "sourceY": -3322.731754439979,
        "x": 34.0399,
        "y": 30.301,
        "location": "Дунаннский форпост"
      }
    ]
  },
  {
    "id": "snezhnaya",
    "name": "Снежная",
    "sourceAreaId": 16,
    "x": 40.4353,
    "y": 12.2467,
    "sourceBounds": {
      "left": -10038,
      "top": -8821,
      "right": -5645,
      "bottom": -4454
    },
    "portals": [
      {
        "id": "snezhnaya-01",
        "sourcePointId": 100647,
        "sourceX": -8724.748877024125,
        "sourceY": -5174.748719609823,
        "x": 36.3492,
        "y": 20.2138,
        "location": "Сретоморозск"
      },
      {
        "id": "snezhnaya-02",
        "sourcePointId": 100651,
        "sourceX": -8858.5,
        "sourceY": -5645.24850621146,
        "x": 35.7305,
        "y": 17.6512,
        "location": "Домик следопыта"
      },
      {
        "id": "snezhnaya-03",
        "sourcePointId": 100649,
        "sourceX": -8210.250102088716,
        "sourceY": -5626.997652618009,
        "x": 38.7294,
        "y": 17.7506,
        "location": "Тундра волкодлаков"
      },
      {
        "id": "snezhnaya-04",
        "sourcePointId": 100657,
        "sourceX": -7465.999795822569,
        "sourceY": -5816.000853593451,
        "x": 42.1725,
        "y": 16.7211,
        "location": "Пещера прилива"
      },
      {
        "id": "snezhnaya-05",
        "sourcePointId": 100654,
        "sourceX": -6854,
        "sourceY": -5860.74850621146,
        "x": 45.0037,
        "y": 16.4774,
        "location": "Дом Гесперид"
      },
      {
        "id": "snezhnaya-06",
        "sourcePointId": 100659,
        "sourceX": -7291.4998197252935,
        "sourceY": -6349.251324131412,
        "x": 42.9797,
        "y": 13.8167,
        "location": "Светлолёдовка"
      },
      {
        "id": "snezhnaya-07",
        "sourcePointId": 100663,
        "sourceX": -8078.624897911284,
        "sourceY": -6355.749039707367,
        "x": 39.3383,
        "y": 13.7813,
        "location": "Вечная мерзлота"
      },
      {
        "id": "snezhnaya-08",
        "sourcePointId": 100688,
        "sourceX": -9376.999183290274,
        "sourceY": -6430.4974392196455,
        "x": 33.3318,
        "y": 13.3742,
        "location": "Долина огненных перьев"
      },
      {
        "id": "snezhnaya-09",
        "sourcePointId": 100667,
        "sourceX": -8407.875306266147,
        "sourceY": -7135.625,
        "x": 37.8152,
        "y": 9.5336,
        "location": "Деревня Морепесок"
      },
      {
        "id": "snezhnaya-10",
        "sourcePointId": 100673,
        "sourceX": -7607.9998979112825,
        "sourceY": -7340.499679902456,
        "x": 41.5155,
        "y": 8.4178,
        "location": "Снежноград"
      },
      {
        "id": "snezhnaya-11",
        "sourcePointId": 100679,
        "sourceX": -6732,
        "sourceY": -7047.748719609823,
        "x": 45.5681,
        "y": 10.0123,
        "location": "Священное ущелье"
      },
      {
        "id": "snezhnaya-12",
        "sourcePointId": 100681,
        "sourceX": -6285.500306266149,
        "sourceY": -7752.498933008186,
        "x": 47.6337,
        "y": 6.1738,
        "location": "Берёзовый некрополь"
      }
    ]
  }
];
