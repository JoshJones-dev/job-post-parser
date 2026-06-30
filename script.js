const WORKER_URL = "https://workernamejob-post-parser-api.joshua-mjones.workers.dev/";

let parsedJobs = [];

document.addEventListener("DOMContentLoaded", () => {
  const urlInput = document.getElementById("urlInput");
  const manualUrlInput = document.getElementById("manualUrlInput");
  const manualTextInput = document.getElementById("manualTextInput");
  const parseBtn = document.getElementById("parseBtn");
  const parseTextBtn = document.getElementById("parseTextBtn");
  const clearBtn = document.getElementById("clearBtn");
  const copyAllBtn = document.getElementById("copyAllBtn");
  const statusEl = document.getElementById("status");
  const resultsEl = document.getElementById("results");

  parseBtn.addEventListener("click", async () => {
    const urls = getUrls(urlInput.value);

    if (urls.length === 0) {
      statusEl.textContent = "Paste at least one job URL first.";
      return;
    }

    setLoading(parseBtn, true, "Parsing...");
    statusEl.textContent = `Parsing ${urls.length} URL(s)...`;
    resultsEl.innerHTML = "";

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      const response = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) throw new Error(`Parser API returned ${response.status}`);

      const data = await response.json();
      parsedJobs = Array.isArray(data.results) ? data.results : [];

      renderResults(resultsEl, statusEl);
      statusEl.textContent = `Parsed ${parsedJobs.length} job(s).`;
    } catch (error) {
      console.error(error);
      statusEl.textContent =
        error.name === "AbortError"
          ? "Parser timed out. Try fewer URLs at once."
          : `Parser error: ${error.message}`;
    } finally {
      setLoading(parseBtn, false, "Parse Jobs");
    }
  });

  parseTextBtn.addEventListener("click", () => {
    const text = manualTextInput.value.trim();
    const url = manualUrlInput.value.trim();

    if (!text) {
      statusEl.textContent = "Paste job text first.";
      return;
    }

    const job = parseManualText(text, url);
    parsedJobs.push(job);

    renderResults(resultsEl, statusEl);
    statusEl.textContent = "Manual job parsed and added.";
  });

  clearBtn.addEventListener("click", () => {
    parsedJobs = [];
    urlInput.value = "";
    manualUrlInput.value = "";
    manualTextInput.value = "";
    resultsEl.innerHTML = "";
    statusEl.textContent = "Cleared. Paste job URLs to start again.";
    setLoading(parseBtn, false, "Parse Jobs");
  });

  copyAllBtn.addEventListener("click", async () => {
    if (parsedJobs.length === 0) {
      statusEl.textContent = "No parsed jobs to copy.";
      return;
    }

    await copyText(parsedJobs.map(formatJob).join("\n\n"));
    statusEl.textContent = "Copied all jobs to clipboard.";
  });
});

function getUrls(text) {
  return text
    .split(/\s+/)
    .map(item => item.trim())
    .filter(item => item.startsWith("http://") || item.startsWith("https://"))
    .filter((item, index, arr) => arr.indexOf(item) === index);
}

function parseManualText(text, url) {
  const clean = text.replace(/\s+/g, " ").trim();

  return {
    url: url || "Not provided",
    company: extractManualCompany(clean),
    title: extractManualTitle(clean),
    salary: extractManualSalary(clean),
    location: extractManualLocation(clean),
    workType: extractManualWorkType(clean),
    status: "parsed",
    error: "",
  };
}

function extractManualCompany(text) {
  const patterns = [
    /Company:\s*([^|]+?)(?=\s+(Job Title|Title|Location|Salary|Description):|$)/i,
    /Organization:\s*([^|]+?)(?=\s+(Job Title|Title|Location|Salary|Description):|$)/i,
    /Employer:\s*([^|]+?)(?=\s+(Job Title|Title|Location|Salary|Description):|$)/i,
    /About\s+([A-Z][A-Za-z0-9 &.'-]{2,80})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return cleanValue(match[1]);
  }

  const lines = splitLines(text);
  return lines[0] || "Not found";
}

function extractManualTitle(text) {
  const patterns = [
    /Job Title:\s*([^|]+?)(?=\s+(Company|Location|Salary|Description):|$)/i,
    /Title:\s*([^|]+?)(?=\s+(Company|Location|Salary|Description):|$)/i,
    /Position:\s*([^|]+?)(?=\s+(Company|Location|Salary|Description):|$)/i,
    /Role:\s*([^|]+?)(?=\s+(Company|Location|Salary|Description):|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return cleanValue(match[1]);
  }

  const commonTitle = text.match(/\b(Operations Assistant|Executive Assistant|Office Admin Personnel|Workplace Experience Coordinator|Call Center Scheduler|Middle School Classroom Assistant|Classroom Assistant|Administrative Assistant|Office Assistant|Program Coordinator|Project Coordinator|IT Manager|Service Desk Manager|Endpoint Manager)\b/i);

  if (commonTitle) return cleanValue(commonTitle[0]);

  const lines = splitLines(text);
  return lines[1] || lines[0] || "Not found";
}

function extractManualSalary(text) {
  const patterns = [
    /Salary Range:\s*([^|]+?)(?=\s+(Location|Benefits|Job|Description|Schedule):|$)/i,
    /Salary:\s*([^|]+?)(?=\s+(Location|Benefits|Job|Description|Schedule):|$)/i,
    /Pay Range:\s*([^|]+?)(?=\s+(Location|Benefits|Job|Description|Schedule):|$)/i,
    /Compensation:\s*([^|]+?)(?=\s+(Location|Benefits|Job|Description|Schedule):|$)/i,
    /\$[0-9]{2,3}(?:,[0-9]{3})?(?:\.\d{2})?\s*(?:-|–|to)?\s*\$?[0-9]{0,3}(?:,[0-9]{3})?(?:\.\d{2})?\s*(?:\/hour|\/hr|per hour|hourly|\/year|\/yr|per year|annually)?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return cleanValue(match[1] || match[0]);
  }

  return "Not found";
}

function extractManualLocation(text) {
  const patterns = [
    /Location:\s*([^|]+?)(?=\s+(Salary|Benefits|Job|Description|Schedule|Work Type):|$)/i,
    /\b([A-Z][a-zA-Z .'-]+,\s?(WA|OR|CA|TX|NY|FL|GA|TN|AZ|CO|IL|NC|SC|VA|DC))\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return cleanValue(match[1] || match[0]);
  }

  if (/remote/i.test(text)) return "Remote";

  return "Not found";
}

function extractManualWorkType(text) {
  if (/hybrid/i.test(text)) return "Hybrid";
  if (/remote/i.test(text)) return "Remote";
  if (/on-site|onsite|in person|in-person|physical presence/i.test(text)) return "On-site";
  return "Not found";
}

function renderResults(resultsEl, statusEl) {
  resultsEl.innerHTML = "";

  if (parsedJobs.length === 0) {
    statusEl.textContent = "No jobs found.";
    return;
  }

  parsedJobs.forEach((job, index) => {
    const card = document.createElement("article");
    card.className = "job-card";

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
          <a href="${escapeHtml(job.url || "#")}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(job.url || "Not found")}
          </a>
        </div>
      </div>

      ${job.error ? `<p class="hint">${escapeHtml(job.error)}</p>` : ""}

      <div class="card-actions">
        <button class="copy-one-btn" data-index="${index}">Copy Job</button>
        <button class="secondary show-text-btn" data-index="${index}">Show Copy Text</button>
        <button class="secondary remove-btn" data-index="${index}">Remove</button>
      </div>

      <textarea class="copy-text" id="copyText-${index}" style="display:none;" readonly>${escapeHtml(formatJob(job))}</textarea>
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
      const showing = el.style.display !== "none";
      el.style.display = showing ? "none" : "block";
      button.textContent = showing ? "Show Copy Text" : "Hide Copy Text";
    });
  });

  document.querySelectorAll(".remove-btn").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      parsedJobs.splice(index, 1);
      renderResults(resultsEl, statusEl);
      statusEl.textContent = "Removed job.";
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

function splitLines(text) {
  return text
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);
}

function cleanValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^\s*[-:|]\s*/, "")
    .trim()
    .slice(0, 180);
}

function setLoading(button, isLoading, label) {
  button.disabled = isLoading;
  button.textContent = label;
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
