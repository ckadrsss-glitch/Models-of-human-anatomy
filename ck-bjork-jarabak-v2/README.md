# CK BIOMECHANICS — Björk–Jarabak Analysis V2

Образовательная медицинская 3D-анимация (Three.js / WebGL) · **80 с · 1080 × 1920 · 30 fps** · русская озвучка
(ElevenLabs, «Принц Нури») · английская терминология с короткими русскими пояснениями.

V2 — доработка ролика `ck-jarabak-analysis` (V1 сохранён без изменений в своей папке).

| | |
|---|---|
| MASTER | `export/CK_BIOMECHANICS_BJORK_JARABAK_V2_MASTER.mp4` — H.264 High CRF 12 + AAC 320 kbit/s |
| INSTAGRAM | `export/CK_BIOMECHANICS_BJORK_JARABAK_V2_INSTAGRAM.mp4` — 2-pass 2.25 Mbit/s + AAC 160 kbit/s, ≤ 25 МБ |
| Плеер / исходный проект | `index.html` + `src/` (редактируемый) |
| Сценарий, протокол удержания, звук | [docs/SCRIPT.md](docs/SCRIPT.md) · субтитры [docs/voiceover_ru.srt](docs/voiceover_ru.srt) |
| Наука: определения, модель, выбор референсов, расхождения, источники | [docs/SCIENCE.md](docs/SCIENCE.md) |
| Численная проверка (53 проверки) | [docs/QA_REPORT.json](docs/QA_REPORT.json) — `node tools/qa.mjs` |
| Бренд | [docs/BRAND.md](docs/BRAND.md) |

## Что изменилось по сравнению с V1

* Полностью новая драматургия (11 сцен) по CK BIOMECHANICS Audience Retention Protocol: визуальный хук с первого кадра,
  тройной хук, curiosity gap, rehook на 31 с, визуальная развязка, вопрос аудитории.
* Новая параметрическая модель: седловидный угол (основание черепа), длина заднего основания черепа, ориентация ветви,
  высота ветви, гониальный угол, длина тела, симфиз — каждый компонент меняется отдельно и измеряется.
* Полный анализ Björk–Jarabak: N, S, Ar (рентгенологическая точка), Go (конструированный), Me; три угла и сумма;
  верхний/нижний гониальный угол; S–N, S–Ar, Ar–Go, Go–Me; S–Go / N–Me.
* Калибровка (`tools/calibrate.mjs`): измеренные на кости значения точно совпадают с выбранной системой референсов
  (123° + 143° + 130° = 396°, S–N = Go–Me = 71 мм, 63.8 %); все модели сцены 01/09/10 имеют одинаковую длину тела 71 мм.
* Пословная синхронизация типографики с голосом; постоянный цветовой код; активное измерение яркое, остальные приглушены.
* Фон графитово-синий светлее V1, верхний титр CK BIOMECHANICS, финальный логотип CK в тонком круге + BIOMECHANICS.
* Музыка «cinematic scientific ambient» + акценты, ducking под голос.

## Запуск

```bash
cd ck-bjork-jarabak-v2
node tools/serve.cjs 8123        # → http://localhost:8123/
```

Плеер: Play / Пауза (пробел), Restart, скраббер, ←/→ (Shift — 1 с), кнопки сцен, звук, субтитры (выкл.),
импорт своей аудиодорожки, запись WebM со звуком, покадровый экспорт MP4 со звуком (Chrome/Edge, WebCodecs).
Адаптирован под смартфон. Каждое положение объектов — чистая функция времени: плеер, перемотка и экспорт дают
одинаковые кадры.

## Офлайн-производство (так собраны файлы в `export/`)

```bash
node tools/calibrate.mjs                 # параметры всех моделей → src/states.js
node tools/qa.mjs                        # научная/численная проверка → docs/QA_REPORT.json
node tools/build_audio.mjs               # музыка + голос + микс (или: node tools/build_audio.mjs my_vo.wav)
node tools/render.cjs build/frames 4     # headless Chromium (SwiftShader) → 2400 кадров
bash tools/encode.sh build/frames        # MASTER + INSTAGRAM
node tools/stills.cjs build/stills 3 27 35 60    # контрольные кадры
node tools/debugshots.cjs build/dbg REF HYPER COMP   # отладочные виды моделей с сеткой и контурами
node tools/make_srt.mjs                  # субтитры
```

Перегенерация голоса: `ELEVENLABS_API_KEY=… node tools/voiceover.mjs` (после замены клипов обновите `src/words.js`).

## Структура

```
src/morph.js       параметрическая модель (JS + GLSL из одного определения), построение S, N, Ar, Go, Me, Pog и все измерения
src/states.js      откалиброванные модели (REF, HYPER, HYPO, SAD_LO, SAD_HI, COMP, RAM_S, RAM_L)
src/timeline.js    сцены, камеры, состояния, переходы; якоря на произносимые слова
src/kinetic.js     кинетическая типографика
src/film.js        рендер сцен: точки, линии, дуги, подписи, сравнения
src/voice.js       реплики и их размещение · src/words.js — пословные таймкоды
src/brand.js       фон, верхний титр, логотип, концовка
tools/             контуры, калибровка, QA, звук, рендер, кодирование, стоп-кадры
```

## Лицензии

Череп и производные — CC BY-SA 4.0: Z-Anatomy (Gauthier Kervyn, Marcin Zielinski), на основе BodyParts3D © DBCLS
(CC BY-SA 2.1 JP). three.js, mp4-muxer — MIT. Montserrat, Inter — SIL OFL 1.1. Музыка и SFX — процедурные
(`tools/build_audio.mjs`). Голос — ElevenLabs по аккаунту владельца.
