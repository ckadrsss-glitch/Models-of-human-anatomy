# CK BIOMECHANICS — Прикус, дыхание и положение языка

3D-ролик для Instagram Reels на Three.js: **«Как дыхание и положение языка связаны с формированием прикуса?»**

| Параметр | Значение |
|---|---|
| Длительность | 69 с (6 сцен) |
| Формат | 9:16, 1080×1920, 30 fps |
| Итоговый файл | `export/CK_BIOMECHANICS_occlusion_breathing.mp4` (H.264 + AAC, ≤ 25 МБ) |
| Анатомия | Z-Anatomy / BodyParts3D (CC BY-SA), см. [docs/ASSETS.md](docs/ASSETS.md) |
| Озвучка | ElevenLabs, голос **Evgeniy Rybakov** (`ws3YyKFd5whKb21yaXES`), eleven_multilingual_v2, `assets/voice/` |
| Научные оговорки | [docs/SCIENCE.md](docs/SCIENCE.md) |
| Раскадровка | [docs/STORYBOARD.md](docs/STORYBOARD.md) |
| Бренд (фон, логотип, концовка) | [docs/BRAND.md](docs/BRAND.md), `src/brand.js`, `brand.html` |

## Запуск плеера

```bash
npm install          # только для инструментов; плеер работает на vendor/ без сети
npm start            # http://localhost:8123/
```

Плеер: пуск/пауза (пробел), перемотка ползунком, ←/→ — покадрово (Shift — по 5 с), кнопки сцен, звук.

* **Экспорт MP4** — покадровый рендер прямо в браузере (WebCodecs + mp4-muxer), 1080×1920, 30 fps, видео 2.6 Мбит/с + AAC 128 кбит/с → ~23 МБ. Нужен Chrome/Edge ≥ 113.
* **Запись WebM** — запись в реальном времени (MediaRecorder), если WebCodecs недоступен.

Все параметры анимации — чистые функции времени (`src/timeline.js`), поэтому любой кадр воспроизводится одинаково при перемотке, в плеере и в экспорте.

## Офлайн-рендер (сервер / CI, без GPU)

```bash
node tools/render.cjs build/frames 2     # headless Chromium → 2070 JPEG-кадров (~35–45 мин на 4 ядрах CPU)
node tools/build_audio.mjs               # озвучка по таймкодам + тихий эмбиент, −14 LUFS
bash tools/encode.sh build/frames        # двухпроходный H.264 под лимит 25 МБ
```

`node tools/stills.cjs <dir> 3 21.5 46` — контрольные кадры по таймкодам.

## Озвучка ElevenLabs

Тексты и таймкоды — в `VOICE` (`src/timeline.js`). Перегенерация другим голосом:

```bash
ELEVENLABS_API_KEY=... node tools/voiceover.mjs <voiceId> [modelId]
node tools/voiceover.mjs --check         # проверка, что фразы не перекрываются
node tools/build_audio.mjs && bash tools/encode.sh
```

## Структура

```
index.html            плеер + importmap (three из vendor/)
src/timeline.js       сцены, камера, тексты, таймкоды озвучки, расписание прорезывания
src/film.js           сборка сцены, применение состояния, прорезывание/резорбция, стрелки
src/anatomy.js        загрузка GLB, зубы (ось, CEJ), молочные зубы, язык, кожа, десна, шарнир ВНЧС
src/airway.js         аденоид (глоточная миндалина), просвет, частицы воздушного потока
src/materials.js      «стеклянная» кость, PBR-эмаль с осевым срезом (формирование/резорбция корня)
src/overlay.js        титры, возрастная шкала, чипы А/Б, цефалометрия
src/brand.js          фирменный фон, логотип и универсальная 3-с концовка CK BIOMECHANICS
assets/head.glb       экспорт из Z-Anatomy (tools/export_head.py)
tools/                экспорт анатомии, рендер, звук, кодирование
```

## Лицензии

* Анатомические модели и производные (`assets/head.glb`, ролик) — **CC BY-SA 4.0**: Z-Anatomy (Gauthier Kervyn, Marcin Zielinski) на основе BodyParts3D © DBCLS (CC BY-SA 2.1 JP). Атрибуция выводится в финальном кадре.
* three.js и mp4-muxer — MIT (`vendor/`). Шрифт Montserrat — SIL OFL 1.1.
* Озвучка сгенерирована в ElevenLabs (голос Evgeniy Rybakov) по аккаунту владельца проекта.
