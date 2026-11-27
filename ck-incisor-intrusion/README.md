# CK BIOMECHANICS — Incisor Intrusion: One Force, Three Outcomes

Образовательная 3D-анимация (Three.js / WebGL) для Instagram Reels: **интрузия четырёх нижних резцов двумя кантилеверами
в трёхкомпонентной сегментарной механике Burstone**. Одна и та же результирующая сила, пять точек приложения, три результата:
интрузия с вестибулярным наклоном, чистая интрузия и интрузия с ретроклинацией.
**60 с · 9:16 · 1080 × 1920 · 30 fps · H.264 + AAC · ≤ 25 МБ.** Русская озвучка (ElevenLabs, голос **Принц Нури**),
английская научная типографика, русские субтитры.

| | |
|---|---|
| Итоговое видео | `export/CK_BIOMECHANICS_Incisor_Intrusion_Three_Piece_Arch_FINAL.mp4` |
| Научные источники и система сил | [SCIENTIFIC_REFERENCES.md](SCIENTIFIC_REFERENCES.md) |
| Сценарий по таймкодам | [docs/SCRIPT.md](docs/SCRIPT.md) |
| Озвучка, тайминги, SRT | [docs/VOICEOVER_RU.md](docs/VOICEOVER_RU.md), [docs/voiceover_ru.srt](docs/voiceover_ru.srt), [docs/subtitles_ru.srt](docs/subtitles_ru.srt) |
| Проверка геометрии и механики | [docs/QA_REPORT.json](docs/QA_REPORT.json) (119 проверок), тестовые кадры `docs/qa/` |
| 3D-модели и лицензии | [docs/ASSETS.md](docs/ASSETS.md) |
| Плеер | `index.html` (нужен веб-сервер) |

Пайплайн, бренд-кит, свет, материалы, типографика и звук взяты из **Molar Uprighting** — эталона серии. `src/brand.js`
и фирменная концовка не изменены. Постоянная верхняя надпись CK BIOMECHANICS: Inter Medium 28 px.

## Запуск

```bash
cd ck-incisor-intrusion
node tools/serve.cjs 8123        # → http://localhost:8123/   (или python3 -m http.server)
```

Управление: ▶ / ❚❚ (пробел), ↺, ползунок, ←/→ — кадр (Shift — 1 с), кнопки сцен, 🔊 звук, 💬 субтитры (`?subs=0`),
`?t=30` — открыть на 30-й секунде.

## Производство (так собран файл в `export/`)

```bash
pip install numpy scipy scikit-image trimesh
python3 -I tools/build_assets.py      # дентиция Z-Anatomy → система дуги, ЦС сегмента, кость, точки 1–5, позы, QA
node tools/qa.mjs                     # 119 проверок: зазоры аппаратуры, окклюзионная плоскость, знаки моментов, равновесие
node tools/qa_stills.cjs docs/qa      # тестовые кадры конструкции: фронтальный / вестибулярный / окклюзионный, точки 3–5
node tools/build_audio.mjs            # музыка + саунд-дизайн + озвучка → микс −15 LUFS (assets/audio/mix.m4a)
node tools/render.cjs build/frames 4  # headless Chromium (SwiftShader) → 1800 JPEG-кадров (докачивает недостающие)
bash tools/encode.sh build/frames     # 2-проходный H.264 + AAC → export/…FINAL.mp4 (проверка ≤ 25 МБ)
node tools/make_srt.mjs               # SRT из таймингов
```

Перерендерить одну сцену: удалите её кадры из `build/frames` (кадр = t × 30) и снова запустите `render.cjs` — он дорисует
только недостающие кадры. Каждый кадр — чистая функция времени, поэтому плеер, перемотка и офлайн-рендер совпадают.

Озвучка: ElevenLabs, голос «Принц Нури» (`gJEfHTTiifXEDmO687lC`), `eleven_multilingual_v2`, по одному дублю на фразу.
Тексты — дословно из брифа. Тайминги слов получены транскрипцией ElevenLabs Scribe (`src/words.js`). Вся кинетическая
типографика и события анимации привязаны к фактическим словам озвучки (`src/timeline.js → W`).

## Структура

```
index.html            плеер
src/timeline.js       60 с: сцены, события на словах озвучки, расписание, камера, видимость слоёв, субтитры
src/voice.js          фразы озвучки и их размещение; src/words.js — тайминги слов (Scribe)
src/kinetic.js        кинетическая типографика (английские термины на слове озвучки)
src/model.js          биомеханика: позы сегмента, система сил двух кантилеверов, d, M = F × d, реакции, центр вращения
src/appliance.js      трёхкомпонентная аппаратура: сегменты, ступенчатые продолжения, точки 1–5, кантилевер (изготовление,
                      пассив, активация, крючок), огибающая зазоров
src/geom.js           процедурные брекет, двойная/одинарная трубка, прямоугольная проволока (sweep)
src/film.js           сцена Three.js, материалы, split-screen, векторы, моменты, траектории, типографика, бренд
src/brand.js          бренд-кит CK BIOMECHANICS (без изменений)
src/main.js           плеер, запись WebM, экспорт MP4, API офлайн-рендера
tools/                ассеты, QA, тестовые кадры, звук, рендер, кодирование, стоп-кадры, SRT
assets/dentition.*    меши (система дуги, начало = ЦС 4-резцового сегмента), кость, точки, позы, метаданные QA
assets/voice/         10 клипов озвучки; assets/audio/ — music, sfx, voiceover, mix
```

## Честные оговорки

* **Приложенных фотографий и схем Machado, а также конспектов лекций в репозиториях нет.** Пять точек и форма продолжений
  восстановлены по публикациям (Caldas et al. 2014; de Brito et al. 2019). Подробнее — в SCIENTIFIC_REFERENCES.md.
  Правка точек — в одном месте (`tools/build_assets.py`).
* Модель **качественная**: ЦС оценён (≈), магнитуды перемещений иллюстративные. Точка 4 даёт d ≈ 0 **в этой модели** и не
  является универсальной точкой чистой интрузии.
* Зубы BodyParts3D низкополигональные (сглажены подразделением Loop), это не КЛКТ конкретного пациента.
