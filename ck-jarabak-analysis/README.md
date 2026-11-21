# CK ORTHODONTICS — Jarabak Analysis · Vertical Facial Patterns

Образовательная медицинская 3D-анимация (Three.js / WebGL) · **60 с · 1080 × 1920 · 30 fps** · русская озвучка.

| | |
|---|---|
| Видео | `export/CK_ORTHODONTICS_Jarabak_Analysis.mp4` (H.264 High + AAC, 1080×1920, 30 fps, 60 с, ≤ 25 МБ) |
| Плеер | `index.html` (нужен локальный веб-сервер, см. ниже) |
| Озвучка / звук | `assets/audio/voiceover.m4a`, `assets/audio/sfx.m4a`, `assets/audio/mix.m4a`; клипы `assets/voice/vo1…6.mp3` |
| Сценарий с таймкодами | [docs/SCRIPT.md](docs/SCRIPT.md), субтитры [docs/voiceover_ru.srt](docs/voiceover_ru.srt) |
| Наука, модель, проверка, источники | [docs/SCIENCE.md](docs/SCIENCE.md) |
| Бренд (фон, логотип, верхняя надпись) | [docs/BRAND.md](docs/BRAND.md) |
| 3D-анатомия | Z-Anatomy / BodyParts3D, CC BY-SA 4.0 (тот же экспорт черепа, что в `ck-skeletal-patterns`) |

Существующие проекты (`ck-skeletal-patterns` и др.) не изменялись: всё лежит в этой папке.

## Запуск

```bash
cd ck-jarabak-analysis
node tools/serve.cjs 8123          # → http://localhost:8123/   (подойдёт любой статический сервер)
```

ES-модули и `fetch` требуют веб-сервера — открыть `index.html` с диска нельзя. Сборка и интернет не нужны
(three.js и mp4-muxer лежат в `vendor/`).

Управление: **▶ Play / ❚❚ Пауза** (пробел), **↺ Restart**, скраббер, ←/→ кадр (Shift — 1 с), кнопки сцен,
звук, субтитры (по умолчанию выкл.), **♪ Импорт аудио** (своя дорожка с 00:00). Интерфейс адаптирован под смартфон.
Пока звук включён, аудио — ведущие часы (синхронизация губ/текста); каждое положение объектов — чистая функция
времени (`src/timeline.js`), поэтому плеер, перемотка и экспорт дают одинаковые кадры.

## Экспорт

**В браузере (Chrome / Edge):**
* **● Запись WebM** — запись в реальном времени холста 1080×1920 вместе со звуком (MediaRecorder, VP9/Opus).
  Держите вкладку видимой.
* **⬇ Экспорт MP4 (покадрово)** — детерминированный рендер каждого кадра + H.264 и AAC через WebCodecs и mp4-muxer;
  не зависит от скорости компьютера. Битрейт видео 2.6 Мбит/с → ≈ 21 МБ.

WebM → MP4 через FFmpeg:

```bash
ffmpeg -i CK_ORTHODONTICS_Jarabak_Analysis.webm -c:v libx264 -preset slow -b:v 2900k -pix_fmt yuv420p -r 30 \
  -vf "scale=1080:1920:flags=lanczos" -c:a aac -b:a 160k -movflags +faststart CK_ORTHODONTICS_Jarabak_Analysis.mp4
```

**Офлайн (сервер/CI, GPU не нужен; так сделан файл в `export/`):**

```bash
node tools/build_audio.mjs                 # SFX + дорожка озвучки + микс (или: node tools/build_audio.mjs my_vo.wav)
node tools/render.cjs build/frames 4       # headless Chromium (SwiftShader) → 1800 JPEG-кадров
bash tools/encode.sh build/frames          # 2-проходный H.264 2.9 Мбит/с + AAC 160 кбит/с → export/…mp4
node tools/stills.cjs build/stills 16 27 38 50     # контрольные кадры
node tools/qa.mjs                          # все числа ролика, измеренные на деформированной кости
node tools/make_srt.mjs                    # субтитры из таймингов
```

Playwright должен быть доступен (`npm i -D playwright`, если его нет). Перегенерация озвучки через API ElevenLabs:
`ELEVENLABS_API_KEY=… node tools/voiceover.mjs` (голос Evgeniy Rybakov).

## Структура

```
index.html            плеер (Play/Pause/Restart, скраббер, звук, импорт аудио, WebM, MP4)
src/timeline.js       сцены, камера, состояния черепов, тайминг текста и озвучки (чистые функции t)
src/morph.js          модель вертикальной морфологии (JS + GLSL из одного определения) и построение S, N, Ar, Go, Me
src/contours.js       рентгенологические контуры челюсти и основания черепа (генерируется tools/contours.py)
src/skull.js          загрузка сетки, материалы кости/эмали, деформация на GPU с точными нормалями
src/film.js           сцена Three.js, свет, оверлей: точки, линии, дуги, формулы, подписи
src/brand.js          CK ORTHODONTICS: фон, логотип, концовка, верхняя надпись
src/main.js           воспроизведение, запись, экспорт, API для офлайн-рендера
tools/                контуры, QA, офлайн-рендер, звук, кодирование, субтитры, стоп-кадры
```

## Лицензии

* Череп, зубы и производные (включая видео) — **CC BY-SA 4.0**: Z-Anatomy (Gauthier Kervyn, Marcin Zielinski),
  на основе BodyParts3D © DBCLS (CC BY-SA 2.1 JP).
* three.js, mp4-muxer — MIT. Montserrat, Inter — SIL OFL 1.1.
* Озвучка — ElevenLabs (голос Evgeniy Rybakov) по аккаунту владельца. Саунд-дизайн — процедурный (`tools/build_audio.mjs`).
