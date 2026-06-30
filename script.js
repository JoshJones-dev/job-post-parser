const WORKER_URL = "https://workernamejob-post-parser-api.joshua-mjones.workers.dev/";

const urlInput = document.getElementById("urlInput");
const parseBtn = document.getElementById("parseBtn");
const clearBtn = document.getElementById("clearBtn");
const copyAllBtn = document.getElementById("copyAllBtn");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

let parsedJobs = [];

parseBtn.addEventListener("click", parseJobs);
clearBtn.addEventListener("click", clearAll);
copyAllBtn.addEventListener("click", copyAllJobs);

async function parseJobs() {
  const urls = getUrls(urlInput.value);

  if (urls.length === 0) {
    statusEl.textContent = "Paste at least one job URL first.";
    return;
  }

  parseBtn.disabled = true;
  parseBtn.textContent = "Parsing...";
  statusEl.textContent = `Parsing ${urls.length} URL(s)...`;
  resultsEl.innerHTML = "";

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ urls }),
    });

    const data = await response.json();

    parsedJobs = data.results || [];
    renderResults(parsedJobs);
    statusEl.textContent = `Parsed ${parsedJobs.length} job(s).`;
  } catch (error) {
    statusEl.textContent = "Could not reach the parser API. Check the Worker URL.";
    console.error(error);
  } finally {
    parseBtn.disabled = false;
    parseBtn.textContent = "Parse Jobs";
  }
}

function getUrls(text) {
  return text
    .split(/\s+/)
    .map(item => item.trim())
    .filter(item => item.startsWith("http://") || item.startsWith("https://"))
    .filter((item, index, arr) => arr.indexOf(item) === index);
}

function renderResults(jobs) {
  resultsEl.innerHTML = "";

  if (jobs.length === 0) {
    resultsEl.innerHTML = "";
    statusEl.textContent = "No jobs found.";
    return;
  }

  jobs.forEach((job, index) => {
    const card = document.createElement("article");
    card.className = "job-card";

    const copyText = formatJob(job);

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
        <button onclick="copySingleJob(${index})">Copy Job</button>
        <button class="secondary" onclick="toggleCopyText(${index})">Show Copy Text</button>
      </div>

      <textarea class="copy-text" id="copyText-${index}" style="display:none;" readonly>${escapeHtml(copyText)}</textarea>
    `;

    resultsEl.appendChild(card);
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

async function copySingleJob(index) {
  const text = formatJob(parsedJobs[index]);
  await navigator.clipboard.writeText(text);
  statusEl.textContent = "Copied job to clipboard.";
}

async function copyAllJobs() {
  if (parsedJobs.length === 0) {
    statusEl.textContent = "No parsed jobs to copy.";
    return;
  }

  const text = parsedJobs.map(formatJob).join("\n\n");
  await navigator.clipboard.writeText(text);
  statusEl.textContent = "Copied all jobs to clipboard.";
}

function toggleCopyText(index) {
  const el = document.getElementById(`copyText-${index}`);
  el.style.display = el.style.display === "none" ? "block" : "none";
}

function clearAll() {
  urlInput.value = "";
  parsedJobs = [];
  resultsEl.innerHTML = "";
  statusEl.textContent = "No jobs parsed yet.";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
