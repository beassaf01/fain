const WORKER_URL = "https://fain-worker.weraktesau.workers.dev/";
const STORAGE_KEY = "fain_cached_feed_v7";

const feedContainer = document.getElementById("news-feed");
const lastUpdatedEl = document.getElementById("last-updated");
const updateToastBtn = document.getElementById("update-toast");

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
  localStorage.removeItem("fain_cached_feed_v5");
  localStorage.removeItem("fain_cached_feed_v6");

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

  await fetchFromWorker();
}

async function fetchFromWorker() {
  try {
    const response = await fetch(WORKER_URL, { cache: "no-store" });
    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    if (!currentRenderedTimestamp) {
      applyFeedData(data);
    } else if (data.updatedAt && data.updatedAt !== currentRenderedTimestamp) {
      pendingFeedData = data;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      updateToastBtn.hidden = false;
    }

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

  const sortedItems = (data.items || []).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  renderArticles(sortedItems);

  if (data.notice) {
    lastUpdatedEl.textContent = data.notice;
  } else if (data.updatedAt) {
    lastUpdatedEl.textContent = `Обновлено: ${new Date(data.updatedAt).toLocaleString("ru-RU")}`;
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
