const WORKER_URL = "https://fain-worker.weraktesau.workers.dev/";
const STORAGE_KEY = "fain_cached_feed_v8";
const READ_STORAGE_KEY = "fain_read_archive_v1";

const feedContainer = document.getElementById("news-feed");
const archiveView = document.getElementById("archive-view");
const archiveList = document.getElementById("archive-list");
const archiveToggleBtn = document.getElementById("archive-toggle");
const archiveCountEl = document.getElementById("archive-count");
const backToFeedBtn = document.getElementById("back-to-feed");
const clearArchiveBtn = document.getElementById("clear-archive");
const headerSubtitle = document.getElementById("header-subtitle");
const lastUpdatedEl = document.getElementById("last-updated");
const updateToastBtn = document.getElementById("update-toast");

let currentRenderedTimestamp = null;
let pendingFeedData = null;
let allFeedItems = [];
let readArchive = loadReadArchive();
let isArchiveOpen = false;

function loadReadArchive() {
  try {
    const raw = localStorage.getItem(READ_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveReadArchive() {
  localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(readArchive));
  updateArchiveBadge();
}

function updateArchiveBadge() {
  const count = readArchive.length;
  archiveCountEl.textContent = count;
  archiveCountEl.hidden = count === 0;
}

function isUrlRead(url) {
  return readArchive.some((entry) => entry.url === url);
}

function markItemAsRead(item, articleEl) {
  if (!item || !item.url || articleEl.classList.contains("removing")) return;
  articleEl.classList.add("removing");

  if (!isUrlRead(item.url)) {
    readArchive.unshift({
      url: item.url,
      title: item.title,
      source: item.source,
      date: item.date,
      tag: item.tag || "релиз",
      readAt: new Date().toISOString()
    });
    saveReadArchive();
  }

  setTimeout(() => {
    articleEl.remove();
    if (!feedContainer.querySelector("article")) {
      feedContainer.innerHTML = '<p class="status-message">Все свежие новости прочитаны.</p>';
    }
  }, 220);
}

archiveToggleBtn.addEventListener("click", () => {
  toggleView(!isArchiveOpen);
});

backToFeedBtn.addEventListener("click", () => {
  toggleView(false);
});

clearArchiveBtn.addEventListener("click", () => {
  readArchive = [];
  saveReadArchive();
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
  if (readArchive.length === 0) {
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
  localStorage.removeItem("fain_cached_feed_v5");
  localStorage.removeItem("fain_cached_feed_v6");
  localStorage.removeItem("fain_cached_feed_v7");
  updateArchiveBadge();

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

  allFeedItems = (data.items || []).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  renderArticles(allFeedItems);

  if (data.notice) {
    lastUpdatedEl.textContent = data.notice;
  } else if (data.updatedAt) {
    lastUpdatedEl.textContent = `Обновлено: ${new Date(data.updatedAt).toLocaleString("ru-RU")}`;
  }
}

function renderArticles(items) {
  const unreadItems = items.filter((item) => !isUrlRead(item.url));

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
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let isDragging = false;
  let pointerActive = false;

  article.addEventListener("pointerdown", (e) => {
    if (e.target.closest("a") || e.button > 0) return;
    pointerActive = true;
    isDragging = false;
    startX = e.clientX;
    startY = e.clientY;
    currentX = 0;
    article.style.transition = "none";
  });

  article.addEventListener("pointermove", (e) => {
    if (!pointerActive) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!isDragging) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
        pointerActive = false;
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

  function endPointer(e) {
    if (!pointerActive) return;
    pointerActive = false;
    article.style.transition = "";

    if (isDragging) {
      if (currentX > 85) {
        markItemAsRead(item, article);
      } else {
        article.style.transform = "";
        article.style.opacity = "";
      }
      return;
    }

    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;
    if (!e.target.closest("a")) {
      markItemAsRead(item, article);
    }
  }

  article.addEventListener("pointerup", endPointer);
  article.addEventListener("pointercancel", () => {
    pointerActive = false;
    isDragging = false;
    article.style.transition = "";
    article.style.transform = "";
    article.style.opacity = "";
  });
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

initFeed();
