const WORKER_URL = "https://workernamejob-post-parser-api.joshua-mjones.workers.dev/";

let parsedJobs = [];
let reviewJobs = [];

document.addEventListener("DOMContentLoaded", () => {
  const urlInput = document.getElementById("urlInput");
  const parseBtn = document.getElementById("parseBtn");
  const clearBtn = document.getElementById("clearBtn");
  const copyAllBtn = document.getElementById("copyAllBtn");
  const statusEl = document.getElementById("status");
  const resultsEl = document.getElementById("results");
  const reviewResultsEl = document.getElementById("reviewResults");
  const parsedCountEl = document.getElementById("parsedCount");
  const reviewCountEl = document.getElementById("reviewCount");

  parseBtn.addEventListener("click", async () => {
    const urls = getUrls(urlInput.value);

    if (urls.length === 0) {
      statusEl.textContent = "Paste at least one job URL first.";
      return;
    }

    setLoading(parseBtn, true, "Parsing...");
    statusEl.textContent = `Parsing ${urls.length} URL(s)...`;

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
      const jobs = Array.isArray(data.results) ? data.results : [];

      for (const job of jobs) {
        if (isUsefulJob(job)) {
          addParsedJob(job);
        } else {
          addReviewJob({
            url: job.url || "",
            reason: job.error || "The page did not return enough useful job details.",
            suggestedTitle: job.title || "",
            suggestedCompany: job.company || "",
          });
        }
      }

      renderAll(resultsEl, reviewResultsEl, statusEl, parsedCountEl, reviewCountEl);
      statusEl.textContent = `Finished. Parsed ${parsedJobs.length} job(s). ${reviewJobs.length} need manual review.`;
    } catch (error) {
      console.error(error);

      for (const url of urls) {
        addReviewJob({
          url,
          reason: error.name === "AbortError" ? "Parser timed out." : error.message,
          suggestedTitle: "",
          suggestedCompany: "",
        });
      }

      renderAll(resultsEl, reviewResultsEl, statusEl, parsedCountEl, reviewCountEl);
      statusEl.textContent = "Parser issue. URLs were moved to manual review.";
    } finally {
      setLoading(parseBtn, false, "Parse Jobs");
    }
  });

  clearBtn.addEventListener("click", () => {
    parsedJobs = [];
    reviewJobs = [];
    urlInput.value = "";
    renderAll(resultsEl, reviewResultsEl, statusEl, parsedCountEl, reviewCountEl);
    statusEl.textContent = "Cleared. Paste job URLs to start again.";
  });

  copyAllBtn.addEventListener("click", async () => {
    if (parsedJobs.length === 0) {
      statusEl.textContent = "No parsed jobs to copy.";
      return;
    }

    await copyText(parsedJobs.map(formatJob).join("\n\n"));
    statusEl.textContent = "Copied all parsed jobs to clipboard.";
  });

  renderAll(resultsEl, reviewResultsEl, statusEl, parsedCountEl, reviewCountEl);
});

function addParsedJob(job) {
  const normalized = normalizeJob(job);

  const duplicate = parsedJobs.some(existing =>
    existing.url === normalized.url && existing.title === normalized.title
  );

  if (!duplicate) parsedJobs.push(normalized);
}

function addReviewJob(job) {
  if (!job.url) return;

  const alreadyParsed = parsedJobs.some(existing => existing.url === job.url);
  const alreadyReview = reviewJobs.some(existing => existing.url === job.url);

  if (!alreadyParsed && !alreadyReview) reviewJobs.push(job);
}

function isUsefulJob(job) {
  const normalized = normalizeJob(job);

  const title = normalized.title.toLowerCase();
  const company = normalized.company.toLowerCase();
  const location = normalized.location.toLowerCase();

  const badTitles = [
    "career search",
    "javascript is disabled",
    "not found",
    "open positions for renton school district 403",
    "teaching jobs, educator jobs, school jobs",
    "finding teaching jobs and other education jobs",
  ];

  const badCompanies = [
    "recruiting",
    "recruiting2",
    "secure4",
    "careers",
    "jobs",
    "job-boards",
    "applitrack",
    "schoolspring.com",
    "not found",
  ];

  const badLocationPhrases = [
    "search by zip code",
    "what we offer",
    "competitive starting wages",
    "advanced",
  ];

  if (badTitles.includes(title)) return false;
  if (badCompanies.includes(company)) return false;
  if (badLocationPhrases.some(phrase => location.includes(phrase))) return false;

  const hasTitle = normalized.title !== "Not found";
  const hasCompany = normalized.company !== "Not found";
  const hasLocation = normalized.location !== "Not found";
  const hasSalary = normalized.salary !== "Not found";

  return hasTitle && (hasCompany || hasLocation || hasSalary);
}

function normalizeJob(job) {
  return {
    company: cleanValue(job.company) || "Not found",
    title: cleanValue(job.title) || "Not found",
    salary: cleanValue(job.salary) || "Not found",
    location: cleanValue(job.location) || "Not found",
    workType: cleanValue(job.workType) || "Not found",
    url: cleanValue(job.url) || "Not found",
    status: job.status || "parsed",
    error: job.error || "",
  };
}

function renderAll(resultsEl, reviewResultsEl, statusEl, parsedCountEl, reviewCountEl) {
  renderReviewJobs(reviewResultsEl, statusEl);
  renderParsedJobs(resultsEl, statusEl);

  parsedCountEl.textContent = parsedJobs.length;
  reviewCountEl.textContent = reviewJobs.length;
}

function renderParsedJobs(resultsEl, statusEl) {
  resultsEl.innerHTML = "";

  if (parsedJobs.length === 0) {
    resultsEl.innerHTML = `<p class="hint">No parsed jobs yet.</p>`;
    return;
  }

  parsedJobs.forEach((job, index) => {
    const meta = [job.location, job.salary, job.workType]
      .filter(value => value && value !== "Not found")
      .join(" • ");

    const card = document.createElement("article");
    card.className = "job-card";

    card.innerHTML = `
      <span class="badge parsed">Parsed</span>

      <div class="job-title-line">${escapeHtml(job.title)}</div>
      <div class="job-company-line">${escapeHtml(job.company)}</div>
      <div class="job-meta-line">${escapeHtml(meta || "Details incomplete")}</div>
      <div class="job-url-line">
        <a href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(job.url)}</a>
      </div>

      <div class="card-actions">
        <button class="copy-one-btn" data-index="${index}">Copy Job</button>
        <button class="secondary show-text-btn" data-index="${index}">Show Copy Text</button>
        <button class="secondary edit-btn" data-index="${index}">Edit / Review</button>
        <button class="danger remove-parsed-btn" data-index="${index}">Remove</button>
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

  document.querySelectorAll(".remove-parsed-btn").forEach(button => {
    button.addEventListener("click", () => {
      parsedJobs.splice(Number(button.dataset.index), 1);
      rerender(statusEl, "Removed parsed job.");
    });
  });

  document.querySelectorAll(".edit-btn").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      const job = parsedJobs[index];

      reviewJobs.push({
        url: job.url,
        reason: "Moved here for manual correction.",
        suggestedTitle: job.title,
        suggestedCompany: job.company,
      });

      parsedJobs.splice(index, 1);
      rerender(statusEl, "Moved job to manual review.");
    });
  });
}

function renderReviewJobs(reviewResultsEl, statusEl) {
  reviewResultsEl.innerHTML = "";

  if (reviewJobs.length === 0) {
    reviewResultsEl.innerHTML = `<p class="hint">No URLs need manual review.</p>`;
    return;
  }

  reviewJobs.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "review-card";

    card.innerHTML = `
      <span class="badge review">Needs Manual Review</span>
      <div class="job-title-line">${escapeHtml(item.suggestedTitle || "Blocked or incomplete job page")}</div>
      <div class="job-company-line">${escapeHtml(item.suggestedCompany || "Manual details needed")}</div>
      <div class="job-meta-line">${escapeHtml(item.reason || "Not enough job data was found.")}</div>
      <p><a class="small-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a></p>

      <textarea class="manual-text" id="manualText-${index}" placeholder="Open the URL, copy the job posting text, and paste it here..."></textarea>

      <div class="card-actions">
        <button class="parse-manual-btn" data-index="${index}">Parse Manual Text</button>
        <button class="secondary skip-review-btn" data-index="${index}">Remove From Review</button>
      </div>
    `;

    reviewResultsEl.appendChild(card);
  });

  document.querySelectorAll(".parse-manual-btn").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      const textEl = document.getElementById(`manualText-${index}`);
      const text = textEl.value.trim();

      if (!text) {
        statusEl.textContent = "Paste job text into the review card first.";
        return;
      }

      const reviewItem = reviewJobs[index];
      const parsed = parseManualText(text, reviewItem.url);

      addParsedJob(parsed);
      reviewJobs.splice(index, 1);
      rerender(statusEl, "Manual job parsed and added.");
    });
  });

  document.querySelectorAll(".skip-review-btn").forEach(button => {
    button.addEventListener("click", () => {
      reviewJobs.splice(Number(button.dataset.index), 1);
      rerender(statusEl, "Removed URL from manual review.");
    });
  });
}

function parseManualText(text, url) {
  const lines = text
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);

  const clean = text.replace(/\s+/g, " ").trim();

  return normalizeJob({
    url: url || "Not provided",
    company: extractManualCompany(clean, lines),
    title: extractManualTitle(clean, lines),
    salary: extractManualSalary(clean),
    location: extractManualLocation(clean),
    workType: extractManualWorkType(clean),
    status: "parsed",
    error: "",
  });
}

function extractManualCompany(text, lines) {
  const patterns = [
    /\b(Boise Cascade|AAA Washington|Compass Group|Impact Public Schools|American Capital Group|The Bear Creek School|CBRE)\b/i,
    /Company:\s*([^|]+?)(?=\s+(Job Title|Title|Location|Salary|Description):|$)/i,
    /Organization:\s*([^|]+?)(?=\s+(Job Title|Title|Location|Salary|Description):|$)/i,
    /Employer:\s*([^|]+?)(?=\s+(Job Title|Title|Location|Salary|Description):|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return cleanValue(match[1] || match[0]);
  }

  const filtered = lines.filter(line => !isJunkLine(line));
  return cleanValue(filtered[0]) || "Not found";
}

function extractManualTitle(text, lines) {
  const patterns = [
    /\b(Administrative Specialist|Operations Assistant|Executive Assistant|Office Admin Personnel|Workplace Experience Coordinator|Call Center Scheduler|Middle School Classroom Assistant|Classroom Assistant|Administrative Assistant|Office Assistant|Program Coordinator|Project Coordinator|IT Manager|Service Desk Manager|Endpoint Manager)\b/i,
    /Job Title:\s*([^|]+?)(?=\s+(Company|Location|Salary|Description):|$)/i,
    /Title:\s*([^|]+?)(?=\s+(Company|Location|Salary|Description):|$)/i,
    /Position:\s*([^|]+?)(?=\s+(Company|Location|Salary|Description):|$)/i,
    /Role:\s*([^|]+?)(?=\s+(Company|Location|Salary|Description):|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return cleanValue(match[1] || match[0]);
  }

  const filtered = lines.filter(line => !isJunkLine(line));
  return cleanValue(
    filtered.find(line =>
      line.length < 90 &&
      /assistant|specialist|coordinator|manager|administrator|engineer|analyst|personnel|scheduler/i.test(line)
    )
  ) || "Not found";
}

function extractManualSalary(text) {
  const patterns = [
    /Pay or shift range:\s*([^|]+?)(?=\s+The estimated range|\s+Job Details|\s+Description|$)/i,
    /Salary Range:\s*([^|]+?)(?=\s+(Location|Benefits|Job|Description|Schedule):|$)/i,
    /Salary:\s*([^|]+?)(?=\s+(Location|Benefits|Job|Description|Schedule):|$)/i,
    /Pay Range:\s*([^|]+?)(?=\s+(Location|Benefits|Job|Description|Schedule):|$)/i,
    /Compensation:\s*([^|]+?)(?=\s+(Location|Benefits|Job|Description|Schedule):|$)/i,
    /\$[0-9]{2,3}(?:,[0-9]{3})?(?:\.\d{2})?\s*(?:USD\s*)?(?:-|–|to)?\s*\$?[0-9]{0,3}(?:,[0-9]{3})?(?:\.\d{2})?\s*(?:USD)?\s*(?:\/hour|\/hr|per hour|hourly|\/year|\/yr|per year|annually)?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return cleanValue(match[1] || match[0]);
  }

  return "Not found";
}

function extractManualLocation(text) {
  const patterns = [
    /Locations?Showing\s+\d+\s+location\s+.*?\s+([A-Z][a-zA-Z .'-]+,\s?(WA|OR|CA|TX|NY|FL|GA|TN|AZ|CO|IL|NC|SC|VA|DC))/i,
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
  const parts = [];

  if (/\bfull-time\b|\bfull time\b/i.test(text)) parts.push("Full-Time");
  if (/\bpart-time\b|\bpart time\b/i.test(text)) parts.push("Part-Time");

  if (/\bhybrid\b/i.test(text)) parts.push("Hybrid");
  else if (/\bremote\b/i.test(text)) parts.push("Remote");
  else if (/\bon-site\b|\bonsite\b|\bin person\b|\bin-person\b|physical presence/i.test(text)) parts.push("On-site");

  return [...new Set(parts)].join(" / ") || "Not found";
}

function isJunkLine(line) {
  return /skip to main content|accessibility|reasonable accommodation|toggle navigation|posting details|job details|description|equal opportunity|1password|parse manual text|results|copy all/i.test(line);
}

function formatJob(job) {
  return `Company: ${job.company || "Not found"}
Job Title: ${job.title || "Not found"}
Salary: ${job.salary || "Not found"}
Location: ${job.location || "Not found"}
Work Type: ${job.workType || "Not found"}
URL: ${job.url || "Not found"}`;
}

function getUrls(text) {
  return text
    .split(/\s+/)
    .map(item => item.trim())
    .filter(item => item.startsWith("http://") || item.startsWith("https://"))
    .filter((item, index, arr) => arr.indexOf(item) === index);
}

function rerender(statusEl, message) {
  renderAll(
    document.getElementById("results"),
    document.getElementById("reviewResults"),
    statusEl,
    document.getElementById("parsedCount"),
    document.getElementById("reviewCount")
  );

  statusEl.textContent = message;
}

function cleanValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^\s*[-:|]\s*/, "")
    .trim()
    .slice(0, 220);
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
