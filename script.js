const WORKER_URL = "https://fain-worker.weraktesau.workers.dev/";
const STORAGE_KEY = "fain_cached_feed_v10";
const ARCHIVE_KEY = "fain_read_archive_v2";
const DISMISSED_KEY = "fain_dismissed_urls_v1";
const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const feedContainer = document.getElementById("news-feed");
const archiveView = document.getElementById("archive-view");
const archiveList = document.getElementById("archive-list");
const archiveDetail = document.getElementById("archive-detail");
const archiveToggleBtn = document.getElementById("archive-toggle");
const archiveCountEl = document.getElementById("archive-count");
const backToFeedBtn = document.getElementById("back-to-feed");
const clearArchiveBtn = document.getElementById("clear-archive");
const headerSubtitle = document.getElementById("header-subtitle");
const lastUpdatedEl = document.getElementById("last-updated");

let currentRenderedTimestamp = null;
let allFeedItems = [];
let isArchiveOpen = false;

let readArchive = loadArrayJSON(ARCHIVE_KEY, null);
if (!readArchive) {
  // Миграция со старой версии архива, если она была
  readArchive = loadArrayJSON("fain_read_archive_v1", []);
}
let dismissedUrls = new Set(loadArrayJSON(DISMISSED_KEY, readArchive.map((i) => i.url)));

function loadArrayJSON(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

function loadObjectJSON(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
}

function saveState() {
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(readArchive));
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissedUrls]));
  archiveCountEl.textContent = readArchive.length;
  archiveCountEl.hidden = readArchive.length === 0;
}

// Генерация ASCII-синусоид по бокам экрана
function generateSideWaves() {
  const leftEl = document.getElementById("ascii-left");
  const rightEl = document.getElementById("ascii-right");
  if (!leftEl || !rightEl) return;

  if (window.innerWidth < 1080) {
    leftEl.textContent = "";
    rightEl.textContent = "";
    return;
  }

  const rows = Math.ceil(window.innerHeight / 15);
  const cols = 26;
  const palette = "@#%*+:-.";

  const buildWave = (phaseOffset) => {
    const lines = [];
    for (let y = 0; y < rows; y++) {
      const wave1 = Math.sin(y * 0.16 + phaseOffset) * 7.5 + 12.5;
      const wave2 = Math.cos(y * 0.08 - phaseOffset) * 3.5;
      const center = wave1 + wave2 * 0.5;
      let line = "";

      for (let x = 0; x < cols; x++) {
        const dist = Math.abs(x - center);
        if (dist < 3.6) {
          const idx = Math.min(palette.length - 1, Math.floor((dist / 3.6) * palette.length));
          line += palette[idx];
        } else if (x === 2 || x === cols - 3) {
          line += y % 3 === 0 ? ":" : ".";
        } else {
          line += " ";
        }
      }
      lines.push(line);
    }
    return lines.join("\n");
  };

  leftEl.textContent = buildWave(0);
  rightEl.textContent = buildWave(Math.PI);
}

function getItemSortTime(item) {
  const raw = item.timestamp || item.date || "";
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? 0 : ms;
}

function formatTimeSlotLabel(item) {
  const raw = item.timestamp || item.date;
  const parsed = raw ? new Date(raw) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return item.date || "Ранее";
  }

  const now = new Date();
  const todayStr = now.toLocaleDateString("ru-RU");
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString("ru-RU");
  const itemDateStr = parsed.toLocaleDateString("ru-RU");

  const hasExactTime = Boolean(item.timestamp && item.timestamp.includes("T"));
  const hourSlot = hasExactTime
    ? `${String(parsed.getHours()).padStart(2, "0")}:00`
    : null;

  if (itemDateStr === todayStr) {
    return hourSlot ? `Сегодня · ${hourSlot}` : "Сегодня";
  }
  if (itemDateStr === yesterdayStr) {
    return hourSlot ? `Вчера · ${hourSlot}` : "Вчера";
  }

  const formattedDate = parsed.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long"
  });
  return hourSlot ? `${formattedDate} · ${hourSlot}` : formattedDate;
}

function formatItemTime(item) {
  if (item.timestamp && item.timestamp.includes("T")) {
    const parsed = new Date(item.timestamp);
    if (!Number.isNaN(parsed.getTime())) {
      const datePart = parsed.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
      const timePart = parsed.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit"
      });
      return `${datePart} · ${timePart}`;
    }
  }
  return item.date || "";
}

function markItemAsRead(item, articleEl) {
  if (!item?.url || articleEl.classList.contains("removing")) return;
  articleEl.classList.add("removing");

  dismissedUrls.add(item.url);
  if (!readArchive.some((entry) => entry.url === item.url)) {
    readArchive.unshift({
      url: item.url,
      title: item.title,
      summary: item.summary || "",
      source: item.source,
      date: item.date,
      timestamp: item.timestamp || item.date,
      tag: item.tag || "релиз"
    });
  }
  saveState();

  setTimeout(() => {
    const groupEl = articleEl.closest(".time-group");
    articleEl.remove();
    if (groupEl && !groupEl.querySelector("article")) {
      groupEl.remove();
    }
    if (!feedContainer.querySelector("article")) {
      feedContainer.innerHTML = '<p class="status-message">Все свежие новости прочитаны.</p>';
    }
  }, 220);
}

archiveToggleBtn.addEventListener("click", () => toggleView(!isArchiveOpen));
backToFeedBtn.addEventListener("click", () => toggleView(false));

// Очищает архив, но прочитанные новости не возвращаются в ленту
clearArchiveBtn.addEventListener("click", () => {
  readArchive = [];
  saveState();
  closeArchiveDetail();
  renderArchive();
});

function toggleView(showArchive) {
  isArchiveOpen = showArchive;
  feedContainer.hidden = showArchive;
  archiveView.hidden = !showArchive;
  archiveToggleBtn.classList.toggle("active", showArchive);
  headerSubtitle.textContent = showArchive
    ? "архив прочитанных материалов"
    : "free ai news — минималистичные ИИ-новости про ИИ";

  if (showArchive) {
    closeArchiveDetail();
    renderArchive();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function openArchiveDetail(item) {
  // Если запись из старого кэша без summary, пробуем подтянуть из ленты
  const fallbackItem = allFeedItems.find((f) => f.url === item.url);
  const summaryText = item.summary || fallbackItem?.summary || "Описание материала недоступно.";

  archiveDetail.innerHTML = "";

  const topBar = document.createElement("div");
  topBar.className = "archive-detail-top";

  const tagEl = document.createElement("span");
  tagEl.className = "news-tag";
  tagEl.textContent = `#${item.tag || "релиз"}`;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "text-btn";
  closeBtn.textContent = "Закрыть ✕";
  closeBtn.addEventListener("click", closeArchiveDetail);

  topBar.append(tagEl, closeBtn);

  const h2 = document.createElement("h2");
  const titleLink = document.createElement("a");
  titleLink.href = item.url;
  titleLink.target = "_blank";
  titleLink.rel = "noopener noreferrer";
  titleLink.textContent = item.title;
  h2.appendChild(titleLink);

  const summary = document.createElement("p");
  summary.textContent = summaryText;

  const footer = document.createElement("div");
  footer.className = "archive-detail-footer";

  const meta = document.createElement("span");
  meta.textContent = `${item.source || ""} · ${formatItemTime(item)}`;

  const sourceLink = document.createElement("a");
  sourceLink.href = item.url;
  sourceLink.target = "_blank";
  sourceLink.rel = "noopener noreferrer";
  sourceLink.className = "archive-source-link";
  sourceLink.textContent = "Читать в источнике ↗";

  footer.append(meta, sourceLink);
  archiveDetail.append(topBar, h2, summary, footer);
  archiveDetail.hidden = false;
  archiveDetail.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeArchiveDetail() {
  archiveDetail.hidden = true;
  archiveDetail.innerHTML = "";
}

function renderArchive() {
  archiveList.innerHTML = "";
  if (!readArchive.length) {
    archiveList.innerHTML = '<li class="status-message">Архив прочитанных новостей пуст.</li>';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of readArchive) {
    const li = document.createElement("li");
    li.className = "archive-item";
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.title = "Нажмите, чтобы открыть новость крупным планом";

    const title = document.createElement("span");
    title.className = "archive-item-title";
    title.textContent = item.title;

    const meta = document.createElement("span");
    meta.className = "archive-meta";
    meta.textContent = `${item.tag ? "#" + item.tag + " · " : ""}${item.source || ""} · ${formatItemTime(item)}`;

    li.append(title, meta);

    li.addEventListener("click", () => openArchiveDetail(item));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openArchiveDetail(item);
      }
    });

    fragment.appendChild(li);
  }
  archiveList.appendChild(fragment);
}

// Объединение новых новостей со старыми без потери истории
function mergeFeedItems(existingItems, incomingItems) {
  const map = new Map();
  for (const item of existingItems) {
    if (item?.url) map.set(item.url, item);
  }
  const newUrls = new Set();
  for (const item of incomingItems) {
    if (!item?.url) continue;
    if (!map.has(item.url)) {
      newUrls.add(item.url);
    }
    map.set(item.url, { ...map.get(item.url), ...item });
  }
  const merged = [...map.values()].sort((a, b) => getItemSortTime(b) - getItemSortTime(a));
  return { merged: merged.slice(0, 80), newUrls };
}

async function initFeed() {
  // Переносим старые новости из v9 при первом переходе на v10
  const prevCache = loadObjectJSON("fain_cached_feed_v9");
  const currentCache = loadObjectJSON(STORAGE_KEY) || prevCache;

  ["v5", "v6", "v7", "v8", "v9"].forEach((v) => localStorage.removeItem(`fain_cached_feed_${v}`));
  saveState();
  generateSideWaves();
  window.addEventListener("resize", generateSideWaves, { passive: true });

  if (currentCache?.items?.length) {
    applyFeedData(currentCache, false);
  }

  await fetchFromWorker();

  // Автоматическая подгрузка новых новостей без кнопки обновления
  setInterval(fetchFromWorker, AUTO_REFRESH_INTERVAL_MS);
}

async function fetchFromWorker() {
  try {
    const response = await fetch(WORKER_URL, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);

    if (!currentRenderedTimestamp || (data.updatedAt && data.updatedAt !== currentRenderedTimestamp)) {
      applyFeedData(data, Boolean(currentRenderedTimestamp));
    }

    if (data.stale) pollForBackgroundUpdate(data.updatedAt);
  } catch (err) {
    if (!currentRenderedTimestamp && !allFeedItems.length) {
      feedContainer.innerHTML = `<p class="status-message">Не удалось загрузить новости: ${escapeHTML(err.message)}</p>`;
    }
  }
}

function pollForBackgroundUpdate(previousTimestamp, attempt = 1) {
  if (attempt > 8) return;
  setTimeout(async () => {
    try {
      const res = await fetch(`${WORKER_URL}?status=1`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.updatedAt && data.updatedAt !== previousTimestamp && Array.isArray(data.items)) {
        applyFeedData(data, true);
      } else {
        pollForBackgroundUpdate(previousTimestamp, attempt + 1);
      }
    } catch (_) {}
  }, 12000);
}

function applyFeedData(data, isLiveUpdate = false) {
  currentRenderedTimestamp = data.updatedAt || new Date().toISOString();

  const { merged, newUrls } = mergeFeedItems(allFeedItems, data.items || []);
  allFeedItems = merged;

  // Дополняем summary в архиве, если раньше его не было
  let archiveUpdated = false;
  for (const entry of readArchive) {
    if (!entry.summary) {
      const match = allFeedItems.find((i) => i.url === entry.url);
      if (match?.summary) {
        entry.summary = match.summary;
        archiveUpdated = true;
      }
    }
  }
  if (archiveUpdated) saveState();

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      updatedAt: currentRenderedTimestamp,
      items: allFeedItems
    })
  );

  if (!isLiveUpdate || newUrls.size > 0 || !feedContainer.querySelector("article")) {
    renderArticles(allFeedItems, isLiveUpdate ? newUrls : new Set());
  }

  lastUpdatedEl.textContent = data.notice
    ? data.notice
    : data.updatedAt
    ? `Обновлено: ${new Date(data.updatedAt).toLocaleString("ru-RU")}`
    : lastUpdatedEl.textContent;
}

function renderArticles(items, highlightUrls = new Set()) {
  const unreadItems = items.filter((item) => !dismissedUrls.has(item.url));
  if (!unreadItems.length) {
    feedContainer.innerHTML = '<p class="status-message">Все свежие новости прочитаны.</p>';
    return;
  }

  feedContainer.innerHTML = "";
  const fragment = document.createDocumentFragment();

  let currentSlotLabel = null;
  let currentGroupEl = null;

  for (const item of unreadItems) {
    const slotLabel = formatTimeSlotLabel(item);
    if (slotLabel !== currentSlotLabel) {
      currentSlotLabel = slotLabel;
      currentGroupEl = document.createElement("section");
      currentGroupEl.className = "time-group";

      const divider = document.createElement("div");
      divider.className = "time-divider";
      divider.textContent = slotLabel;

      currentGroupEl.appendChild(divider);
      fragment.appendChild(currentGroupEl);
    }

    const article = document.createElement("article");
    article.title = "Клик вне заголовка — убрать в прочитанное";
    if (highlightUrls.has(item.url)) {
      article.classList.add("entering");
    }

    if (item.tag) {
      const tagEl = document.createElement("span");
      tagEl.className = "news-tag";
      tagEl.textContent = `#${item.tag}`;
      article.appendChild(tagEl);
    }

    const h2 = document.createElement("h2");
    const link = document.createElement("a");
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.title;
    h2.appendChild(link);

    const summary = document.createElement("p");
    summary.textContent = item.summary;

    const footer = document.createElement("footer");
    const source = document.createElement("span");
    source.textContent = item.source;

    const time = document.createElement("time");
    const isoAttr = item.timestamp || item.date;
    if (isoAttr) {
      time.setAttribute("datetime", isoAttr);
      time.textContent = formatItemTime(item);
    }

    footer.append(source, time);
    article.append(h2, summary, footer);
    attachClickToRead(article, item);
    currentGroupEl.appendChild(article);
  }

  feedContainer.appendChild(fragment);
}

function attachClickToRead(article, item) {
  article.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    if (window.getSelection()?.toString().trim().length) return;
    markItemAsRead(item, article);
  });
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

initFeed();
