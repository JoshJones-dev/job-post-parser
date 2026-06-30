const WORKER_URL = "https://workernamejob-post-parser-api.joshua-mjones.workers.dev/";

let parsedJobs = [];

document.addEventListener("DOMContentLoaded", () => {
  const urlInput = document.getElementById("urlInput");
  const parseBtn = document.getElementById("parseBtn");
  const clearBtn = document.getElementById("clearBtn");
  const copyAllBtn = document.getElementById("copyAllBtn");
  const statusEl = document.getElementById("status");
  const resultsEl = document.getElementById("results");

  if (!urlInput || !parseBtn || !clearBtn || !copyAllBtn || !statusEl || !resultsEl) {
    console.error("Missing HTML elements. Check index.html IDs.");
    return;
  }

  parseBtn.addEventListener("click", async () => {
    const urls = getUrls(urlInput.value);

    if (urls.length === 0) {
      statusEl.textContent = "Paste at least one job URL first.";
      return;
    }

    setLoading(true, parseBtn);
    statusEl.textContent = `Parsing ${urls.length} URL(s)...`;
    resultsEl.innerHTML = "";

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Parser API returned ${response.status}`);
      }

      const data = await response.json();

      parsedJobs = Array.isArray(data.results) ? data.results : [];

      renderResults(parsedJobs, resultsEl, statusEl);

      statusEl.textContent = `Parsed ${parsedJobs.length} job(s).`;
    } catch (error) {
      console.error(error);

      if (error.name === "AbortError") {
        statusEl.textContent = "The parser timed out. Try fewer URLs at once.";
      } else {
        statusEl.textContent = `Parser error: ${error.message}`;
      }
    } finally {
      setLoading(false, parseBtn);
    }
  });

  clearBtn.addEventListener("click", () => {
    parsedJobs = [];
    urlInput.value = "";
    resultsEl.innerHTML = "";
    statusEl.textContent = "Cleared. Paste job URLs to start again.";
    setLoading(false, parseBtn);
  });

  copyAllBtn.addEventListener("click", async () => {
    if (parsedJobs.length === 0) {
      statusEl.textContent = "No parsed jobs to copy.";
      return;
    }

    const text = parsedJobs.map(formatJob).join("\n\n");
    await copyText(text);
    statusEl.textContent = "Copied all jobs to clipboard.";
  });
});

function setLoading(isLoading, parseBtn) {
  parseBtn.disabled = isLoading;
  parseBtn.textContent = isLoading ? "Parsing..." : "Parse Jobs";
}

function getUrls(text) {
  return text
    .split(/\s+/)
    .map(item => item.trim())
    .filter(item => item.startsWith("http://") || item.startsWith("https://"))
    .filter((item, index, arr) => arr.indexOf(item) === index);
}

function renderResults(jobs, resultsEl, statusEl) {
  resultsEl.innerHTML = "";

  if (jobs.length === 0) {
    statusEl.textContent = "No jobs found.";
    return;
  }

  jobs.forEach((job, index) => {
    const card = document.createElement("article");
    card.className = "job-card";

    const copyTextValue = formatJob(job);

    card.innerHTML = `
      <span class="badge ${job.status === "failed" ? "failed" : "parsed"}">
        ${job.status === "failed" ? "Needs Manual Review" : "Parsed"}
      </span>

      <h3>${escapeHtml(job.title || "Untitled Job")}</h3>

      <div class="job-grid">
        <div class="key">Company</div>
        <div class="value">${escapeHtml(job.company || "Not found")}</div>

        <div class="key">Job Title</div>
        <div class="value">${escapeHtml(job.title || "Not found")}</div>

        <div class="key">Salary</div>
        <div class="value">${escapeHtml(job.salary || "Not found")}</div>

        <div class="key">Location</div>
        <div class="value">${escapeHtml(job.location || "Not found")}</div>

        <div class="key">Work Type</div>
        <div class="value">${escapeHtml(job.workType || "Not found")}</div>

        <div class="key">URL</div>
        <div class="value">
          <a href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(job.url)}
          </a>
        </div>
      </div>

      ${job.error ? `<p class="hint">${escapeHtml(job.error)}</p>` : ""}

      <div class="card-actions">
        <button class="copy-one-btn" data-index="${index}">Copy Job</button>
        <button class="secondary show-text-btn" data-index="${index}">Show Copy Text</button>
      </div>

      <textarea class="copy-text" id="copyText-${index}" style="display:none;" readonly>${escapeHtml(copyTextValue)}</textarea>
    `;

    resultsEl.appendChild(card);
  });

  document.querySelectorAll(".copy-one-btn").forEach(button => {
    button.addEventListener("click", async () => {
      const index = Number(button.dataset.index);
      await copyText(formatJob(parsedJobs[index]));
      statusEl.textContent = "Copied job to clipboard.";
    });
  });

  document.querySelectorAll(".show-text-btn").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      const el = document.getElementById(`copyText-${index}`);

      if (el.style.display === "none") {
        el.style.display = "block";
        button.textContent = "Hide Copy Text";
      } else {
        el.style.display = "none";
        button.textContent = "Show Copy Text";
      }
    });
  });
}

function formatJob(job) {
  return `==================================================

Company:
${job.company || "Not found"}

Job Title:
${job.title || "Not found"}

Salary:
${job.salary || "Not found"}

Location:
${job.location || "Not found"}

Work Type:
${job.workType || "Not found"}

URL:
${job.url || "Not found"}

==================================================`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const temp = document.createElement("textarea");
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    temp.remove();
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
