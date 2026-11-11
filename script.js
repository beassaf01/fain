const WORKER_URL = "https://fain-worker.weraktesau.workers.dev/";
const STORAGE_KEY = "fain_cached_feed_v9";
const ARCHIVE_KEY = "fain_read_archive_v1";
const DISMISSED_KEY = "fain_dismissed_urls_v1";

const feedContainer = document.getElementById("news-feed");
const archiveView = document.getElementById("archive-view");
const archiveList = document.getElementById("archive-list");
const archiveToggleBtn = document.getElementById("archive-toggle");
const archiveCountEl = document.getElementById("archive-count");
const backToFeedBtn = document.getElementById("back-to-feed");
const clearArchiveBtn = document.getElementById("clear-archive");
const restoreArchiveBtn = document.getElementById("restore-archive");
const headerSubtitle = document.getElementById("header-subtitle");
const lastUpdatedEl = document.getElementById("last-updated");
const updateToastBtn = document.getElementById("update-toast");

let currentRenderedTimestamp = null;
let pendingFeedData = null;
let allFeedItems = [];
let isArchiveOpen = false;

let readArchive = loadJSON(ARCHIVE_KEY, []);
// Синхронизируем скрытые URL с уже имеющимся архивом при первом запуске
let dismissedUrls = new Set(loadJSON(DISMISSED_KEY, readArchive.map((i) => i.url)));

function loadJSON(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(readArchive));
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissedUrls]));
  archiveCountEl.textContent = readArchive.length;
  archiveCountEl.hidden = readArchive.length === 0;
}

// Генерация ASCII-синусоид по бокам экрана (только если есть место)
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

function markItemAsRead(item, articleEl) {
  if (!item?.url || articleEl.classList.contains("removing")) return;
  articleEl.classList.add("removing");

  dismissedUrls.add(item.url);
  if (!readArchive.some((entry) => entry.url === item.url)) {
    readArchive.unshift({
      url: item.url,
      title: item.title,
      source: item.source,
      date: item.date,
      tag: item.tag || "релиз"
    });
  }
  saveState();

  setTimeout(() => {
    articleEl.remove();
    if (!feedContainer.querySelector("article")) {
      feedContainer.innerHTML = '<p class="status-message">Все свежие новости прочитаны.</p>';
    }
  }, 220);
}

archiveToggleBtn.addEventListener("click", () => toggleView(!isArchiveOpen));
backToFeedBtn.addEventListener("click", () => toggleView(false));

// Очищает только список в архиве, прочитанные новости НЕ возвращаются в ленту
clearArchiveBtn.addEventListener("click", () => {
  readArchive = [];
  saveState();
  renderArchive();
});

// Очищает и архив, и память скрытых URL — новости возвращаются в ленту
restoreArchiveBtn.addEventListener("click", () => {
  readArchive = [];
  dismissedUrls.clear();
  saveState();
  renderArchive();
  renderArticles(allFeedItems);
});

function toggleView(showArchive) {
  isArchiveOpen = showArchive;
  feedContainer.hidden = showArchive;
  archiveView.hidden = !showArchive;
  archiveToggleBtn.classList.toggle("active", showArchive);
  headerSubtitle.textContent = showArchive
    ? "архив прочитанных материалов"
    : "free ai news — свободные новости про ИИ, от ИИ";

  if (showArchive) {
    renderArchive();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
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

    const a = document.createElement("a");
    a.href = item.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = item.title;

    const meta = document.createElement("span");
    meta.className = "archive-meta";
    meta.textContent = `${item.tag ? "#" + item.tag + " · " : ""}${item.source || ""} · ${item.date || ""}`;

    li.append(a, meta);
    fragment.appendChild(li);
  }
  archiveList.appendChild(fragment);
}

updateToastBtn.addEventListener("click", () => {
  if (pendingFeedData) {
    applyFeedData(pendingFeedData);
    pendingFeedData = null;
    updateToastBtn.hidden = true;
    if (isArchiveOpen) toggleView(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

async function initFeed() {
  ["v5", "v6", "v7", "v8"].forEach((v) => localStorage.removeItem(`fain_cached_feed_${v}`));
  saveState();
  generateSideWaves();
  window.addEventListener("resize", generateSideWaves, { passive: true });

  const localData = loadJSON(STORAGE_KEY, null);
  if (localData && !Array.isArray(localData)) {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (parsed?.items?.length) applyFeedData(parsed);
    } catch (_) {}
  }

  await fetchFromWorker();
}

async function fetchFromWorker() {
  try {
    const response = await fetch(WORKER_URL, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);

    if (!currentRenderedTimestamp) {
      applyFeedData(data);
    } else if (data.updatedAt && data.updatedAt !== currentRenderedTimestamp) {
      pendingFeedData = data;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      updateToastBtn.hidden = false;
    }

    if (data.stale) pollForBackgroundUpdate(data.updatedAt);
  } catch (err) {
    if (!currentRenderedTimestamp) {
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
        pendingFeedData = data;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        updateToastBtn.hidden = false;
      } else {
        pollForBackgroundUpdate(previousTimestamp, attempt + 1);
      }
    } catch (_) {}
  }, 12000);
}

function applyFeedData(data) {
  currentRenderedTimestamp = data.updatedAt || new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

  allFeedItems = (data.items || []).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  renderArticles(allFeedItems);

  lastUpdatedEl.textContent = data.notice
    ? data.notice
    : data.updatedAt
    ? `Обновлено: ${new Date(data.updatedAt).toLocaleString("ru-RU")}`
    : lastUpdatedEl.textContent;
}

function renderArticles(items) {
  const unreadItems = items.filter((item) => !dismissedUrls.has(item.url));
  if (!unreadItems.length) {
    feedContainer.innerHTML = '<p class="status-message">Все свежие новости прочитаны.</p>';
    return;
  }

  feedContainer.innerHTML = "";
  const fragment = document.createDocumentFragment();

  for (const item of unreadItems) {
    const article = document.createElement("article");
    article.title = "Клик вне ссылки или свайп вправо — в прочитанное";

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
    if (item.date) {
      time.setAttribute("datetime", item.date);
      time.textContent = item.date;
    }

    footer.append(source, time);
    article.append(h2, summary, footer);
    attachSwipeAndClick(article, item);
    fragment.appendChild(article);
  }

  feedContainer.appendChild(fragment);
}

function attachSwipeAndClick(article, item) {
  let startX = 0, startY = 0, currentX = 0, isDragging = false, active = false;

  article.addEventListener("pointerdown", (e) => {
    if (e.target.closest("a") || e.button > 0) return;
    active = true;
    isDragging = false;
    startX = e.clientX;
    startY = e.clientY;
    currentX = 0;
    article.style.transition = "none";
  });

  article.addEventListener("pointermove", (e) => {
    if (!active) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!isDragging) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
        active = false;
        article.style.transition = "";
        return;
      }
      if (dx > 8) {
        isDragging = true;
        article.setPointerCapture(e.pointerId);
      }
    }

    if (isDragging) {
      currentX = Math.max(0, dx);
      article.style.transform = `translateX(${currentX}px)`;
      article.style.opacity = String(Math.max(0.25, 1 - currentX / 260));
    }
  });

  article.addEventListener("pointerup", (e) => {
    if (!active) return;
    active = false;
    article.style.transition = "";

    if (isDragging) {
      if (currentX > 85) markItemAsRead(item, article);
      else {
        article.style.transform = "";
        article.style.opacity = "";
      }
      return;
    }

    if (!window.getSelection()?.toString().length && !e.target.closest("a")) {
      markItemAsRead(item, article);
    }
  });

  article.addEventListener("pointercancel", () => {
    active = isDragging = false;
    article.style.transition = article.style.transform = article.style.opacity = "";
  });
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

initFeed();
