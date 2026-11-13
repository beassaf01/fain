<div align="center">
<img src="logo.svg" alt="fain logo" width="120" height="120" />

# fain
**free ai news**


<br />

<!-- Главные кнопки: Сайт, Android APK, Репозиторий приложения и VirusTotal -->
[![открыть веб-версию](https://img.shields.io/badge/web-открыть_поток-ffffff?style=for-the-badge&logo=googlechrome&logoColor=000000&labelColor=0a0a0a)](https://lqsaf.github.io/fain/)
[![скачать android apk](https://img.shields.io/badge/android-скачать_apk-ffffff?style=for-the-badge&logo=android&logoColor=000000&labelColor=0a0a0a)](https://github.com/lqsaf/fain/releases/latest)

[![fain-app repo](https://img.shields.io/badge/repo-fain--app-525252?style=flat-square&logo=github&logoColor=ffffff&labelColor=0a0a0a)](https://github.com/lqsaf/fain-app)
[![virustotal](https://img.shields.io/badge/virustotal-проверено-525252?style=flat-square&logo=virustotal&logoColor=ffffff&labelColor=0a0a0a)](https://www.virustotal.com/gui/file/4706304c6ddfe293ee46a127b873145495176d0e101297e3fbd341f1411a9b78?nocache=1)
[![worker](https://img.shields.io/badge/pipeline-fain--worker_(private)-525252?style=flat-square&logo=cloudflare&logoColor=ffffff&labelColor=0a0a0a)](https://github.com/lqsaf/fain)
[![cron](https://img.shields.io/badge/синхронизация-каждый_час-525252?style=flat-square&labelColor=0a0a0a)](https://github.com/lqsaf/fain)

</div>

---

### `// о проекте`

**fain** — автономный русскоязычный агрегатор ключевых событий из мира искусственного интеллекта. Никаких рекламных баннеров, бесконечных лент, кликбейта и дублирующихся заметок об одном и том же релизе. Только выжимка главного в строгом монохромном интерфейсе.

Поток автоматически собирается каждый час, проходит многоступенчатую фильтрацию и перевод через каскад LLM-моделей, после чего отдается в легкий веб-клиент и Android-приложение.

---

### `// механика интерфейса`

* **интерактивное чтение («прочитал — скрыл»)** — клик по тексту описания отмечает новость прочитанной и плавно схлопывает карточку терминальной анимацией. Повторно она не появится.
* **`// ии-анализ` по клику** — клик по заголовку новости раскрывает аналитический блок: как событие повлияет на индустрию, разработчиков и обычных пользователей.
* **умная группировка по времени** — непрочитанные материалы автоматически распределяются по 4 временным корзинам: `сегодня`, `вчера`, `на этой неделе`, `в этом месяце`. Пустые секции скрываются на лету.
* **local-first и офлайн-кэш** — клиент мгновенно рендерит поток из `localStorage`, хранит историю прочитанных ID за последние 30 дней и бесшовно догружает дельту с сервера.
* **терминальная эстетика** — чистый шрифт моноширинного семейства (`JetBrains Mono` / `Fira Code`), строгая черно-белая палитра и боковые интерферирующие ASCII-синусоиды на десктопе с частотой `~18 fps`.

---

### `// архитектура и ии-конвейер`

Экосистема проекта разделена на три репозитория:
1. **`fain` (публичный)** — легковесный веб-клиент на чистом HTML5, CSS3 и Vanilla JS без сборщиков и фреймворков.
2. **[`fain-app`](https://github.com/lqsaf/fain-app) (публичный)** — исходный код оболочки Android-приложения. Готовые сборки публикуются в [Releases](https://github.com/lqsaf/fain/releases/latest) ([отчет VirusTotal](https://www.virustotal.com/gui/file/4706304c6ddfe293ee46a127b873145495176d0e101297e3fbd341f1411a9b78?nocache=1)).
3. **`fain-worker` (приватный)** — серверный конвейер на базе **Cloudflare Workers**, хранилища **Cloudflare KV** и почасовых Cron-триггеров (`0 * * * *`).

#### как работает `fain-worker`:

```text
[ 13 RSS/Atom источников ] 
       │  (OpenAI, DeepMind, Google AI, MIT, Hugging Face, Simon Willison и др.)
       ▼
[ 0. пре-фильтр ] ──► отсев рекламы, старых записей (>30 дней) и токенизированных дублей
       │
       ▼
[ 1. отбор ]      ──► жесткий фильтр только прорывных ИИ-новостей (правило одного сюжета)
       │
       ▼
[ 2. дедупликация]──► семантическая сверка кандидатов с историей публикаций в базе KV
       │
       ▼
[ 3. редактор ]   ──► перевод и составление емкого русского заголовка и сути (2–3 предложения)
       │
       ▼
[ 4. тегировщик ] ──► классификация: #релиз, #анонс, #исследование
       │
       ▼
[ 5. ии-аналитик ]──► глубокий разбор влияния новости на индустрию и разработчиков
       │
       ▼
[ Cloudflare KV ] ──► раздача готового JSON-слепка клиентам fain
```

---

### `// структура репозитория`

```text
fain/
├── index.html      # разметка страницы, SVG-логотип и контейнеры ASCII-графиков
├── styles.css      # монохромная тема, анимации схлопывания и адаптивная сетка
├── script.js       # синхронизация с воркером, кэш в localStorage и рендер синусоид
├── logo.svg        # анимированный векторный логотип проекта
└── logo.jpg        # растровый логотип проекта
```

---

### `// запуск и установка`

**Android:**
Скачайте актуальный `.apk` из раздела [**Releases**](https://github.com/lqsaf/fain/releases/latest) ([проверка VirusTotal](https://www.virustotal.com/gui/file/4706304c6ddfe293ee46a127b873145495176d0e101297e3fbd341f1411a9b78?nocache=1)). Исходный код приложения доступен в репозитории [**lqsaf/fain-app**](https://github.com/lqsaf/fain-app).

**Локальный запуск веб-клиента:**
Проект не требует сборки. Достаточно раздать статику любым локальным сервером:

```bash
git clone [https://github.com/lqsaf/fain.git](https://github.com/lqsaf/fain.git)
cd fain
python3 -m http.server 8080
# откройте http://localhost:8080
```

<div align="center">
<br />
<sub>синхронизация потока // <a href="https://github.com/lqsaf/fain">github.com/lqsaf/fain</a></sub>
</div>
