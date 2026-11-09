const WORKER_URL = "https://fain.weraktesau.workers.dev/";
const STORAGE_KEY = "fain_cached_feed_v5";

const feedContainer = document.getElementById("news-feed");
const lastUpdatedEl = document.getElementById("last-updated");
const updateToastBtn = document.getElementById("update-toast");

const TAG_CONFIG = {
  "релиз": { label: "#релиз", className: "tag-release" },
  "анонс": { label: "#анонс", className: "tag-announce" },
  "инструмент": { label: "#инструмент", className: "tag-tool" },
  "исследование": { label: "#исследование", className: "tag-research" },
  "опенсорс": { label: "#опенсорс", className: "tag-opensource" },
  "индустрия": { label: "#индустрия", className: "tag-industry" }
};

let currentRenderedTimestamp = null;
let pendingFeedData = null;

updateToastBtn.addEventListener("click", () => {
  if (pendingFeedData) {
    applyFeedData(pendingFeedData);
    pendingFeedData = null;
    updateToastBtn.hidden = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

async function initFeed() {
  // 1. Мгновенно показываем локальный кэш браузера, если он есть
  const localRaw = localStorage.getItem(STORAGE_KEY);
  if (localRaw) {
    try {
      const localData = JSON.parse(localRaw);
      if (localData && Array.isArray(localData.items) && localData.items.length > 0) {
        applyFeedData(localData);
      }
    } catch (_) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  // 2. Запрашиваем актуальные данные с воркера
  await fetchFromWorker();
}

async function fetchFromWorker(forceBgCheck = false) {
  try {
    const targetUrl = forceBgCheck ? `${WORKER_URL}?check=1` : WORKER_URL;
    const response = await fetch(targetUrl);
    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    // Если экран был пустым (первый визит), сразу рисуем ответ воркера
    if (!currentRenderedTimestamp) {
      applyFeedData(data);
    } else if (data.updatedAt && data.updatedAt !== currentRenderedTimestamp) {
      // Если у пользователя уже открыта старая лента, а пришла новая — показываем кнопку
      pendingFeedData = data;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      updateToastBtn.hidden = false;
    }

    // Если воркер отдал старый кэш и запустил фоновую пересборку — ждем ее завершения
    if (data.stale) {
      pollForBackgroundUpdate(data.updatedAt);
    }
  } catch (err) {
    if (!currentRenderedTimestamp) {
      feedContainer.innerHTML = `<p class="status-message">Не удалось загрузить новости: ${escapeHTML(err.message)}</p>`;
    }
  }
}

function pollForBackgroundUpdate(previousTimestamp, attempt = 1) {
  if (attempt > 8) return; // Максимум 8 проверок с интервалом 12 секунд
  setTimeout(async () => {
    try {
      const res = await fetch(`${WORKER_URL}?status=1`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.updatedAt && data.updatedAt !== previousTimestamp && Array.isArray(data.items)) {
        pendingFeedData = data;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        updateToastBtn.hidden = false;
      } else {
        pollForBackgroundUpdate(previousTimestamp, attempt + 1);
      }
    } catch (_) {
      // Игнорируем сетевые сбои при фоновом опросе
    }
  }, 12000);
}

function applyFeedData(data) {
  currentRenderedTimestamp = data.updatedAt || new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

  const sortedItems = (data.items || []).sort((a, b) => {
    return (b.date || "").localeCompare(a.date || "");
  });

  renderArticles(sortedItems);

  if (data.notice) {
    lastUpdatedEl.textContent = data.notice;
  } else if (data.updatedAt) {
    const date = new Date(data.updatedAt);
    lastUpdatedEl.textContent = `Обновлено: ${date.toLocaleString("ru-RU")}`;
  }
}

function renderArticles(items) {
  if (!items.length) {
    feedContainer.innerHTML = '<p class="status-message">Значимых новостей за последнее время не найдено.</p>';
    return;
  }

  feedContainer.innerHTML = "";
  const fragment = document.createDocumentFragment();

  for (const item of items) {
    const article = document.createElement("article");
    const header = document.createElement("header");

    const rawTag = (item.tag || "релиз").toLowerCase().replace(/^#/, "");
    const tagMeta = TAG_CONFIG[rawTag] || TAG_CONFIG["релиз"];

    const tagBadge = document.createElement("span");
    tagBadge.className = `news-tag ${tagMeta.className}`;
    tagBadge.textContent = tagMeta.label;
    header.appendChild(tagBadge);

    const h2 = document.createElement("h2");
    const link = document.createElement("a");
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.title;
    h2.appendChild(link);
    header.appendChild(h2);

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
    article.append(header, summary, footer);
    fragment.appendChild(article);
  }

  feedContainer.appendChild(fragment);
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

initFeed();
