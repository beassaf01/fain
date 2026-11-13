const WORKER_URL = "https://fain-worker.weraktesau.workers.dev/";

const STORAGE_KEYS = {
  ITEMS: "fain_cached_items_v2",
  READ_IDS: "fain_read_ids_v1",
  LAST_UPDATED: "fain_last_updated_v1"
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const TIME_BUCKETS = [
  { key: "today", label: "сегодня" },
  { key: "yesterday", label: "вчера" },
  { key: "week", label: "на этой неделе" },
  { key: "month", label: "в этом месяце" }
];

document.addEventListener("DOMContentLoaded", () => {
  initAsciiSineWaves();
  initNewsFeed();
});

// Загрузка, синхронизация кэша и рендер ленты
async function initNewsFeed() {
  const now = Date.now();
  let cachedItems = loadJson(STORAGE_KEYS.ITEMS, []);
  let readMap = loadJson(STORAGE_KEYS.READ_IDS, {});
  let lastUpdated = localStorage.getItem(STORAGE_KEYS.LAST_UPDATED) || null;

  // Очищаем кэш и список прочитанных от записей старше 30 дней
  cachedItems = filterRecentItems(cachedItems, now);
  readMap = cleanOldReadIds(readMap, now);

  // Сначала мгновенно показываем закэшированные непрочитанные новости
  if (cachedItems.length > 0) {
    renderFeed(cachedItems, readMap);
    updateFooterTimestamp(lastUpdated);
  }

  // Запрашиваем свежие новости у воркера и объединяем с локальным кэшем
  try {
    const response = await fetch(WORKER_URL, { method: "GET" });
    if (response.ok) {
      const remoteData = await response.json();
      if (remoteData && Array.isArray(remoteData.items)) {
        cachedItems = mergeNewsItems(cachedItems, remoteData.items, now);
        lastUpdated = remoteData.lastUpdated || new Date().toISOString();

        saveJson(STORAGE_KEYS.ITEMS, cachedItems);
        saveJson(STORAGE_KEYS.READ_IDS, readMap);
        localStorage.setItem(STORAGE_KEYS.LAST_UPDATED, lastUpdated);

        renderFeed(cachedItems, readMap);
        updateFooterTimestamp(lastUpdated);
        return;
      }
    }
  } catch (err) {
    console.warn("Воркер недоступен, используем локальный кэш:", err);
  }

  if (cachedItems.length === 0) {
    const feedEl = document.getElementById("news-feed");
    feedEl.innerHTML = `<div class="status-line">нет свежих новостей</div>`;
  }
}

function mergeNewsItems(localItems, remoteItems, now) {
  const byId = new Map();

  for (const item of localItems) {
    if (item && item.id) byId.set(item.id, item);
  }
  for (const item of remoteItems) {
    if (item && item.id) byId.set(item.id, item);
  }

  const merged = Array.from(byId.values());
  return filterRecentItems(merged, now)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 50);
}

function filterRecentItems(items, now) {
  return items.filter(item => {
    if (!item || !item.publishedAt) return false;
    const timestamp = new Date(item.publishedAt).getTime();
    return !Number.isNaN(timestamp) && (now - timestamp) <= THIRTY_DAYS_MS;
  });
}

function cleanOldReadIds(readMap, now) {
  const cleaned = {};
  for (const [id, readAt] of Object.entries(readMap)) {
    if (now - Number(readAt) <= THIRTY_DAYS_MS) {
      cleaned[id] = readAt;
    }
  }
  return cleaned;
}

// Распределение новостей по 4 временным меткам
function getTimeBucketKey(publishedAtIso) {
  const itemDate = new Date(publishedAtIso);
  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000;

  const ts = itemDate.getTime();

  if (ts >= startOfToday) return "today";
  if (ts >= startOfYesterday) return "yesterday";
  if (ts >= startOfWeek) return "week";
  return "month";
}

function renderFeed(allItems, readMap) {
  const feedEl = document.getElementById("news-feed");
  const unreadItems = allItems.filter(item => !readMap[item.id]);

  if (unreadItems.length === 0) {
    feedEl.innerHTML = `<div class="status-line">все новости прочитаны</div>`;
    return;
  }

  const grouped = {
    today: [],
    yesterday: [],
    week: [],
    month: []
  };

  for (const item of unreadItems) {
    const bucket = getTimeBucketKey(item.publishedAt);
    grouped[bucket].push(item);
  }

  feedEl.innerHTML = "";

  for (const bucketInfo of TIME_BUCKETS) {
    const itemsInBucket = grouped[bucketInfo.key];
    if (!itemsInBucket || itemsInBucket.length === 0) continue;

    const groupSection = document.createElement("div");
    groupSection.className = "time-group";
    groupSection.dataset.bucket = bucketInfo.key;

    const divider = document.createElement("div");
    divider.className = "time-divider";
    divider.textContent = bucketInfo.label;
    groupSection.appendChild(divider);

    for (const item of itemsInBucket) {
      groupSection.appendChild(createNewsCard(item));
    }

    feedEl.appendChild(groupSection);
  }
}

function createNewsCard(item) {
  const article = document.createElement("article");
  article.className = "news-item";
  article.dataset.id = item.id;

  // 1. Тег выше заголовка без рамки (если есть)
  if (item.tag && item.tag.trim() !== "") {
    const tagEl = document.createElement("span");
    tagEl.className = "news-tag";
    tagEl.textContent = item.tag.trim();
    article.appendChild(tagEl);
  }

  // 2. Заголовок-гиперссылка, раскрывающая ИИ-анализ
  const titleLink = document.createElement("a");
  titleLink.href = "#ai-analysis";
  titleLink.className = "news-title";
  titleLink.textContent = item.title;

  const analysisWrap = document.createElement("div");
  analysisWrap.className = "news-analysis-wrap";

  const analysisBox = document.createElement("div");
  analysisBox.className = "news-analysis";

  const analysisLabel = document.createElement("span");
  analysisLabel.className = "analysis-label";
  analysisLabel.textContent = "// ии-анализ";

  const analysisText = document.createElement("p");
  analysisText.textContent = item.analysis || "Анализ недоступен.";

  analysisBox.appendChild(analysisLabel);
  analysisBox.appendChild(analysisText);
  analysisWrap.appendChild(analysisBox);

  titleLink.addEventListener("click", e => {
    e.preventDefault();
    const isOpen = analysisWrap.classList.toggle("open");
    titleLink.classList.toggle("active", isOpen);
  });

  // 3. Описание (при клике — новость считается прочитанной и удаляется)
  const descEl = document.createElement("div");
  descEl.className = "news-description";
  descEl.title = "Нажмите, чтобы отметить прочитанным и скрыть";
  descEl.textContent = item.summary;

  descEl.addEventListener("click", () => {
    markAsReadAndRemove(item.id, article);
  });

  // 4. Ссылка «источник» справа снизу
  const metaRow = document.createElement("div");
  metaRow.className = "news-meta";

  const sourceLink = document.createElement("a");
  sourceLink.className = "news-source";
  sourceLink.href = item.url;
  sourceLink.target = "_blank";
  sourceLink.rel = "noopener noreferrer";
  sourceLink.textContent = "источник";

  metaRow.appendChild(sourceLink);

  article.appendChild(titleLink);
  article.appendChild(analysisWrap);
  article.appendChild(descEl);
  article.appendChild(metaRow);

  return article;
}

function markAsReadAndRemove(id, articleEl) {
  if (articleEl.classList.contains("terminal-collapse")) return;

  // Записываем ID прочитанной новости в localStorage
  const readMap = loadJson(STORAGE_KEYS.READ_IDS, {});
  readMap[id] = Date.now();
  saveJson(STORAGE_KEYS.READ_IDS, readMap);

  articleEl.classList.add("terminal-collapse");

  setTimeout(() => {
    const parentGroup = articleEl.closest(".time-group");
    articleEl.remove();

    // Если в группе времени больше не осталось новостей — удаляем и саму метку времени
    if (parentGroup && parentGroup.querySelectorAll(".news-item").length === 0) {
      parentGroup.remove();
    }

    const feedEl = document.getElementById("news-feed");
    if (feedEl && feedEl.querySelectorAll(".news-item").length === 0) {
      feedEl.innerHTML = `<div class="status-line">все новости прочитаны</div>`;
    }
  }, 340);
}

function updateFooterTimestamp(isoDate) {
  const el = document.getElementById("updated-date");
  if (!el || !isoDate) return;

  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return;

  const formatted = d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  el.textContent = formatted;
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("Ошибка сохранения в localStorage:", e);
  }
}

// Отрисовка боковых ASCII синусоидных графиков для ПК
function initAsciiSineWaves() {
  const leftEl = document.getElementById("ascii-left");
  const rightEl = document.getElementById("ascii-right");
  if (!leftEl || !rightEl) return;

  const width = 21;
  let phase = 0;
  let lastFrame = 0;

  function renderFrame(timestamp) {
    if (window.innerWidth <= 1120) {
      requestAnimationFrame(renderFrame);
      return;
    }

    // Ограничиваем частоту кадров ~18 FPS для спокойного терминального движения
    if (timestamp - lastFrame < 55) {
      requestAnimationFrame(renderFrame);
      return;
    }
    lastFrame = timestamp;

    const rows = Math.max(30, Math.floor(window.innerHeight / 13));
    let leftOut = "";
    let rightOut = "";

    const center = Math.floor(width / 2);
    const amplitude = Math.floor(width / 2) - 2;

    for (let y = 0; y < rows; y++) {
      // Две интерферирующие синусоиды слева и справа
      const waveL1 = Math.round(center + Math.sin(y * 0.22 + phase) * amplitude);
      const waveL2 = Math.round(center + Math.cos(y * 0.11 - phase * 0.7) * (amplitude * 0.6));

      const waveR1 = Math.round(center + Math.sin(y * 0.22 - phase) * amplitude);
      const waveR2 = Math.round(center + Math.sin(y * 0.13 + phase * 0.8) * (amplitude * 0.6));

      let rowL = "";
      let rowR = "";

      for (let x = 0; x < width; x++) {
        if (x === waveL1) rowL += "•";
        else if (x === waveL2) rowL += "·";
        else rowL += " ";

        if (x === waveR1) rowR += "•";
        else if (x === waveR2) rowR += "·";
        else rowR += " ";
      }

      leftOut += rowL + "\n";
      rightOut += rowR + "\n";
    }

    leftEl.textContent = leftOut;
    rightEl.textContent = rightOut;
    phase += 0.09;

    requestAnimationFrame(renderFrame);
  }

  requestAnimationFrame(renderFrame);
}
