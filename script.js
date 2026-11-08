// Укажи рабочий URL своего Cloudflare Worker
const WORKER_URL = "https://fain.weraktesau.workers.dev/";

const feedContainer = document.getElementById("news-feed");
const lastUpdatedEl = document.getElementById("last-updated");

async function loadNews() {
  try {
    const response = await fetch(WORKER_URL);
    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    const sortedItems = (data.items || []).sort((a, b) => {
      const dateA = a.date || "";
      const dateB = b.date || "";
      return dateB.localeCompare(dateA);
    });

    renderArticles(sortedItems);

    if (data.notice) {
      lastUpdatedEl.textContent = data.notice;
    } else if (data.updatedAt) {
      const date = new Date(data.updatedAt);
      lastUpdatedEl.textContent = `Обновлено: ${date.toLocaleString("ru-RU")}`;
    }
  } catch (err) {
    feedContainer.innerHTML = `<p class="status-message">Не удалось загрузить новости: ${escapeHTML(err.message)}</p>`;
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

loadNews();