# CK BIOMECHANICS — Space Creation & Anterior Retraction

Образовательная медицинская 3D-анимация (Three.js / WebGL) для Instagram Reels · **55 с · 9:16 · 1080 × 1920 · 30 fps** · русская озвучка (ElevenLabs, голос **Принц Нури**).

Тема: как вернуть выступающие передние зубы назад за счёт пространства, созданного **последовательной дистализацией боковых зубов** (7 → 6 → 5 → 4), с последующей **контролируемой ретракцией фронта**. **Без удаления зубов** — все 28 зубов сохраняются.

| | |
|---|---|
| Видео | `export/CK_BIOMECHANICS_Space_Creation_Anterior_Retraction.mp4` (H.264 High + AAC, 1080×1920, 30 fps, 55 с, субтитры вшиты) |
| Плеер | `index.html` (нужен веб-сервер; GitHub Pages подходит) |
| Сценарий и таймкоды | [docs/SCRIPT.md](docs/SCRIPT.md), субтитры [docs/subtitles_ru.srt](docs/subtitles_ru.srt), фразы озвучки [docs/voiceover_ru.srt](docs/voiceover_ru.srt) |
| Модель движения, допущения, ограничения | [docs/SCIENCE.md](docs/SCIENCE.md) |
| 3D-модели и лицензии | [docs/ASSETS.md](docs/ASSETS.md) |
| Озвучка / звук | `assets/voice/nuri1…9.mp3` (Принц Нури; прежний дубль Evgeniy Rybakov — `assets/voice/rybakov/`), `assets/audio/mix.m4a` (голос + саунд-дизайн), `voiceover.m4a`, `sfx.m4a` |

## Запуск локально

```bash
cd ck-space-retraction
node tools/serve.cjs 8123        # → http://localhost:8123/   (подойдёт любой статический сервер, напр. python3 -m http.server)
```

Открыть `index.html` двойным щелчком (`file://`) нельзя — браузер блокирует ES-модули и `fetch`.
Сборка и интернет не нужны: three.js r170 и mp4-muxer лежат в `vendor/`, шрифты — в `assets/fonts/`.

## Публикация на GitHub Pages

Все пути относительные. Папку можно публиковать как есть:

* в этом репозитории: **Settings → Pages → Deploy from a branch → `master` / `(root)`**; ролик будет по адресу
  `https://<логин>.github.io/Models-of-human-anatomy/ck-space-retraction/`;
* или скопируйте содержимое папки в корень отдельного репозитория — ничего менять не нужно.

## Визуальные варианты

`?look=A` — Original Dark (фирменный фон без изменений), `?look=B` — Enhanced Dark (по умолчанию: мягкий радиальный свет за моделью, усиленный контурный свет). Для офлайн-рендера: `LOOK=A node tools/render.cjs …`. Превью обоих вариантов — `export/preview/`.

## Управление

**▶ / ❚❚** (пробел или клик по кадру), **↺** с начала, ползунок перемотки, **⛶** полный экран (F; на iPhone — растяжение на всё окно), ←/→ — кадр (Shift — 1 с), кнопки сцен, **🔊 Звук**, **💬 Субтитры** (по умолчанию вкл.; `?subs=0` — без них), **♪ Импорт аудио** (своя дорожка с 00:00), `?t=30` — открыть на 30-й секунде, `?autoplay` — автозапуск. Интерфейс адаптирован под смартфон.

## Экспорт в MP4

**В браузере (Chrome / Edge):** «⬇ Экспорт MP4» — покадровый детерминированный рендер + H.264/AAC (WebCodecs); «● Запись WebM» — запись в реальном времени со звуком. WebM → MP4:

```bash
ffmpeg -i in.webm -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30 -c:a aac -b:a 160k -movflags +faststart out.mp4
```

**Офлайн (так сделан файл в `export/`; GPU не нужен, нужен Playwright):**

```bash
python3 -I tools/build_assets.py      # 3D-ассеты из Z-Anatomy-экспорта (numpy, scipy, scikit-image)
node tools/qa.mjs                     # проверка контактов/проникновений зубов на реальных мешах
node tools/build_audio.mjs            # саунд-дизайн + дорожка озвучки + микс (−16 LUFS)
node tools/render.cjs build/frames 4  # headless Chromium (SwiftShader) → 1650 JPEG-кадров
bash tools/encode.sh build/frames     # 2-проходный H.264 + AAC → export/…mp4
SUBS=0 node tools/render.cjs build/frames_clean 4   # вариант без субтитров
node tools/stills.cjs build/stills 4 11 21 28.5 36 46.5 51   # контрольные кадры
node tools/make_srt.mjs               # SRT из таймингов
```

## Озвучка

Голос **Принц Нури** (`gJEfHTTiifXEDmO687lC`, eleven_multilingual_v2), по одному дублю на фразу. Фразы 1, 2, 3, 6, 8, 9 — дословно из ТЗ; 4, 5, 7 — короткие связки, добавленные, чтобы убрать паузы по 8–9 с во время дистализации и ретракции (максимальная пауза теперь ≈ 2,8 с). Тексты и время — `VOICE` в `src/timeline.js`, субтитры строятся из них автоматически.
Перегенерация: `ELEVENLABS_API_KEY=… node tools/voiceover.mjs`, проверка длительностей: `node tools/voiceover.mjs --check`. Свою дорожку можно подложить: `node tools/build_audio.mjs my_vo.wav`.

## Структура

```
index.html            плеер (9:16, кнопки, полноэкранный режим, экспорт)
src/timeline.js       таймлайн 55 с: сцены, озвучка, субтитры, расписание движения, камера, окна видимости
src/words.js          таймкоды слов фактической озвучки (ElevenLabs Scribe)
src/kinetic.js        кинетическая типографика: ключевые слова, синхронизация, фокус внимания
src/model.js          модель перемещения зубов (чистая математика; общая для плеера и QA)
src/film.js           3D-сцена, материалы, наложения (векторы, титры), субтитры, концовка
src/brand.js          бренд-кит CK BIOMECHANICS (без изменений из ck-skeletal-patterns)
src/main.js           плеер, запись WebM, экспорт MP4, API для офлайн-рендера
assets/dentition.*    14 отдельных верхних зубов, кость, десна, нижняя челюсть, оболочка мягких тканей
tools/                сборка ассетов, QA, звук, рендер, кодирование, субтитры, озвучка
docs/                 сценарий, наука, ассеты, SRT
```
