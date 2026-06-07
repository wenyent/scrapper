const form = document.querySelector("#search-form");
const searchButton = document.querySelector("#search-button");
const summary = document.querySelector("#results-summary");
const resultsList = document.querySelector("#results-list");

resultsList.innerHTML = '<div class="empty-state">No search has been run yet.</div>';
showFileOpenNotice();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (window.location.protocol === "file:") {
    showFileOpenNotice();
    return;
  }

  const formData = new FormData(form);
  const payload = {
    searchName: formData.get("searchName"),
    keywords: formData.get("keywords"),
    region: formData.get("region"),
    timeRangeDays: Number(formData.get("timeRange")),
  };

  setSearching(true);
  summary.textContent = `Searching Reddit for "${payload.searchName}"...`;
  resultsList.innerHTML = '<div class="empty-state">Checking posts and comments now.</div>';

  try {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Search failed.");
    }

    renderResults(data);
  } catch (error) {
    summary.textContent = "Search could not be completed.";
    resultsList.innerHTML = `<div class="empty-state error-state">${escapeHtml(error.message)}</div>`;
  } finally {
    setSearching(false);
  }
});

function showFileOpenNotice() {
  if (window.location.protocol !== "file:") {
    return;
  }

  summary.textContent = "Local server required.";
  resultsList.innerHTML = `
    <div class="empty-state error-state">
      This app needs to be opened from http://localhost:3000 so it can call the Reddit search API.
    </div>
  `;
}

function renderResults(data) {
  const results = Array.isArray(data.results) ? data.results : [];
  const mentionLabel = results.length === 1 ? "mention" : "mentions";

  summary.textContent = `${results.length} ${mentionLabel} found for "${data.searchName}" in the last ${data.timeRangeDays} days.`;

  if (results.length === 0) {
    resultsList.innerHTML = '<div class="empty-state">No matching Singapore-related mentions found.</div>';
    return;
  }

  resultsList.innerHTML = results.map(renderResult).join("");
}

function renderResult(result) {
  const date = formatDate(result.publishedAt);
  const type = result.type ? `${result.platform} ${result.type}` : result.platform;

  return `
    <article class="result-card">
      <div class="result-meta">
        <span class="keyword-pill">${escapeHtml(result.keyword)}</span>
        <span>${escapeHtml(type)}</span>
        <span>${escapeHtml(date)}</span>
      </div>
      <h3>${escapeHtml(result.title)}</h3>
      <p>${escapeHtml(result.snippet || "No snippet available.")}</p>
      <a href="${escapeAttribute(result.url)}" target="_blank" rel="noreferrer">Open thread</a>
    </article>
  `;
}

function setSearching(isSearching) {
  searchButton.disabled = isSearching;
  searchButton.textContent = isSearching ? "Searching..." : "Search Reddit";
}

function formatDate(value) {
  if (!value) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
