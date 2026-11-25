# CK BIOMECHANICS — Molar Uprighting

Образовательная медицинская 3D-анимация (Three.js / WebGL) для Instagram Reels: **апрайтинг нижнего второго моляра (47)
кантилевером**, экструзивный побочный эффект и вертикальный контроль со скелетной опорой.
**60 с · 9:16 · 1080 × 1920 · 30 fps · H.264 + AAC · ≤ 25 МБ**. Русская озвучка (ElevenLabs, голос **Принц Нури**),
английские научные обозначения в кадре.

| | |
|---|---|
| Итоговое видео | `export/CK_BIOMECHANICS_Molar_Uprighting_FINAL.mp4` |
| Научные источники и система сил | [SCIENTIFIC_REFERENCES.md](SCIENTIFIC_REFERENCES.md) |
| Текст озвучки и синхронизация | [docs/VOICEOVER_RU.md](docs/VOICEOVER_RU.md), SRT: [docs/voiceover_ru.srt](docs/voiceover_ru.srt), [docs/subtitles_ru.srt](docs/subtitles_ru.srt) |
| Сценарий по таймкодам | [docs/SCRIPT.md](docs/SCRIPT.md) |
| 3D-модели и лицензии | [docs/ASSETS.md](docs/ASSETS.md) |
| Плеер | `index.html` (нужен веб-сервер) |

Пайплайн, бренд-кит и типографика — как в предыдущих проектах серии (`ck-space-retraction`, `ck-jarabak-analysis`,
`ck-skeletal-patterns`). Фон, логотип и 3-секундная концовка взяты из `src/brand.js` без изменений. Постоянная верхняя
надпись CK BIOMECHANICS повторяет типографику серии: Inter Medium 28 px, широкая разрядка, базовая линия 212,5 px.

## Запуск

```bash
cd ck-molar-uprighting
node tools/serve.cjs 8123        # → http://localhost:8123/   (или python3 -m http.server)
```

Управление: ▶ / ❚❚ (пробел), ↺, ползунок, ←/→ — кадр (Shift — 1 с), кнопки сцен, 🔊 звук, 💬 субтитры
(`?subs=0` — без них), `?t=30` — открыть на 30-й секунде.

## Производство (так собран файл в `export/`)

```bash
pip install numpy scipy scikit-image trimesh
python3 -I tools/build_assets.py      # 3D-ассеты из Z-Anatomy (сегмент 42–47 без 46, антагонисты, кость, PDL, место мини-винта)
node tools/qa.mjs                     # QA на реальных мешах: окклюзионные контакты по позам, система сил, моменты
node tools/build_audio.mjs            # музыка + саунд-дизайн + озвучка → микс −15 LUFS (assets/audio/mix.m4a)
node tools/render.cjs build/frames 4  # headless Chromium (SwiftShader) → 1800 JPEG-кадров
bash tools/encode.sh build/frames     # 2-проходный H.264 + AAC → export/CK_BIOMECHANICS_Molar_Uprighting_FINAL.mp4 (проверка ≤ 25 МБ)
node tools/stills.cjs build/stills 0 9.9 18.5 27 38.4 44.6 54.5     # контрольные кадры
node tools/make_srt.mjs               # SRT из таймингов
```

Озвучка сгенерирована через ElevenLabs (голос «Принц Нури», `gJEfHTTiifXEDmO687lC`, eleven_multilingual_v2), по одному
дублю на фразу. Тайминги слов — транскрипция ElevenLabs Scribe (`src/words.js`). Каждый кадр — чистая функция времени,
поэтому плеер, перемотка и офлайн-рендер дают одинаковые кадры.

## Структура

```
index.html            плеер
src/timeline.js       60 с: сцены, расписание, позы 47, антагонисты, видимость слоёв, камера, субтитры (чистые функции t)
src/voice.js          фразы озвучки и их размещение; src/words.js — тайминги слов
src/kinetic.js        кинетическая типографика (английские термины на слове озвучки)
src/model.js          биомеханическая модель: позы 47, система сил кантилевера и эластика, моменты относительно CR
src/poses.json        стартовая и конечные позы 47 (общие для Python-сборки и JS)
src/scene.js          геометрия аппаратуры: брекеты 43–45, опорная дуга, трубка 47, крючок, мини-винт
src/wire.js           кантилевер: «черепашка» (прямые/дуги/спираль), изготовление с сохранением длины, пассивная форма, активация
src/geom.js           процедурные брекет, трубка с крючком, прямоугольная проволока (sweep), мини-винт
src/film.js           сцена Three.js, материалы, все сцены, векторы, моменты, траектории, типографика, бренд
src/brand.js          бренд-кит CK BIOMECHANICS (без изменений)
src/main.js           плеер, запись WebM, экспорт MP4, API офлайн-рендера
tools/                ассеты (bpy не нужен), QA, звук, рендер, кодирование, стоп-кадры, SRT
assets/dentition.*    меши (зубы — локальные координаты вокруг CR), кость, PDL, метаданные (позы, QA, место винта)
assets/voice/         клипы озвучки; assets/audio/ — music, sfx, voiceover, mix
```

## Честные оговорки

* **Референсного видео с изготовлением кантилевера в репозиториях нет.** В ветках есть только `TRG_reference_under_10MB.MP4`
  (типы лица по Sassouni) и удалённый референс предыдущего ролика. Конструкция кантилевера поэтому построена по опубликованной
  односвязной схеме: фиксированный конец в трубке, ступенька, спираль, tip-back, рабочее плечо, крючок на опорном сегменте
  (Lindauer & Isaacson 1995; Kuhlberg 2001; Roberts et al. 1982). Размеры, сечение и величина активации **не указаны**.
  Если пришлёте референс, последовательность гибки в `src/wire.js → program()` правится в одном месте.
* Модель **качественная**: CR ориентировочный (≈ 0,45 длины корня от гребня), величины смещений иллюстративные.
  Подробности — в SCIENTIFIC_REFERENCES.md.
* Зубы BodyParts3D низкополигональные (сглажены подразделением Loop), это не фотограмметрия и не КЛКТ.
