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

    if (!urls.length) {
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

      jobs.forEach(job => {
        if (isUsefulJob(job)) {
          addParsedJob(job);
        } else {
          addReviewJob({
            url: job.url || "",
            reason: job.error || "Not enough useful job details were found.",
            suggestedTitle: safeValue(job.title),
            suggestedCompany: safeValue(job.company),
          });
        }
      });

      renderAll();
      statusEl.textContent = `Finished. Parsed ${parsedJobs.length} job(s). ${reviewJobs.length} need manual review.`;
    } catch (error) {
      urls.forEach(url => addReviewJob({
        url,
        reason: error.name === "AbortError" ? "Parser timed out." : error.message,
        suggestedTitle: "",
        suggestedCompany: "",
      }));

      renderAll();
      statusEl.textContent = "Parser issue. URLs were moved to manual review.";
    } finally {
      setLoading(parseBtn, false, "Parse Jobs");
    }
  });

  clearBtn.addEventListener("click", () => {
    parsedJobs = [];
    reviewJobs = [];
    urlInput.value = "";
    renderAll();
    statusEl.textContent = "Cleared. Paste job URLs to start again.";
  });

  copyAllBtn.addEventListener("click", async () => {
    if (!parsedJobs.length) {
      statusEl.textContent = "No parsed jobs to copy.";
      return;
    }

    await copyText(parsedJobs.map(formatJob).join("\n\n"));
    statusEl.textContent = "Copied all parsed jobs to clipboard.";
  });

  function renderAll() {
    renderParsedJobs(resultsEl, statusEl);
    renderReviewJobs(reviewResultsEl, statusEl);
    parsedCountEl.textContent = parsedJobs.length;
    reviewCountEl.textContent = reviewJobs.length;
  }

  renderAll();
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

function normalizeJob(job) {
  return {
    company: cleanShort(job.company),
    title: cleanTitle(job.title),
    salary: cleanSalary(job.salary),
    location: cleanLocation(job.location),
    workType: cleanShort(job.workType),
    url: cleanUrl(job.url),
    status: job.status || "parsed",
    error: job.error || "",
  };
}

function isUsefulJob(job) {
  const j = normalizeJob(job);

  const badTitles = [
    "career search",
    "javascript is disabled",
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
  ];

  if (!j.title) return false;
  if (badTitles.includes(j.title.toLowerCase())) return false;
  if (j.company && badCompanies.includes(j.company.toLowerCase())) return false;

  if (j.title.length > 90) return false;
  if (j.salary.length > 120) return false;
  if (j.location.length > 100) return false;

  return Boolean(j.company || j.salary || j.location || j.workType);
}

function renderParsedJobs(resultsEl, statusEl) {
  resultsEl.innerHTML = "";

  if (!parsedJobs.length) {
    resultsEl.innerHTML = `<p class="hint">No parsed jobs yet.</p>`;
    return;
  }

  parsedJobs.forEach((job, index) => {
    const card = document.createElement("article");
    card.className = "job-card";

    const details = [
      job.company ? `<div><strong>Company:</strong> ${escapeHtml(job.company)}</div>` : "",
      job.title ? `<div><strong>Job Title:</strong> ${escapeHtml(job.title)}</div>` : "",
      job.salary ? `<div><strong>Salary:</strong> ${escapeHtml(job.salary)}</div>` : "",
      job.location ? `<div><strong>Location:</strong> ${escapeHtml(job.location)}</div>` : "",
      job.workType ? `<div><strong>Work Type:</strong> ${escapeHtml(job.workType)}</div>` : "",
      job.url ? `<div><strong>URL:</strong> <a href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(job.url)}</a></div>` : "",
    ].filter(Boolean).join("");

    card.innerHTML = `
      <span class="badge parsed">Parsed</span>

      <div class="job-title-line">${escapeHtml(job.title || "Untitled Job")}</div>

      <div class="clean-details">
        ${details}
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
      await copyText(formatJob(parsedJobs[Number(button.dataset.index)]));
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
      rerender("Removed parsed job.");
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
      rerender("Moved job to manual review.");
    });
  });
}

function renderReviewJobs(reviewResultsEl, statusEl) {
  reviewResultsEl.innerHTML = "";

  if (!reviewJobs.length) {
    reviewResultsEl.innerHTML = `<p class="hint">No URLs need manual review.</p>`;
    return;
  }

  reviewJobs.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "review-card";

    card.innerHTML = `
      <span class="badge review">Needs Manual Review</span>
      <div class="job-title-line">${escapeHtml(item.suggestedTitle || "Blocked or incomplete job page")}</div>
      ${item.suggestedCompany ? `<div class="job-company-line">${escapeHtml(item.suggestedCompany)}</div>` : ""}
      <div class="job-meta-line">${escapeHtml(item.reason || "Manual details needed.")}</div>
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
      const text = document.getElementById(`manualText-${index}`).value.trim();

      if (!text) {
        statusEl.textContent = "Paste job text into the review card first.";
        return;
      }

      const parsed = parseManualText(text, reviewJobs[index].url);

      if (isUsefulJob(parsed)) {
        addParsedJob(parsed);
        reviewJobs.splice(index, 1);
        rerender("Manual job parsed and added.");
      } else {
        statusEl.textContent = "Manual text still did not produce enough useful details.";
      }
    });
  });

  document.querySelectorAll(".skip-review-btn").forEach(button => {
    button.addEventListener("click", () => {
      reviewJobs.splice(Number(button.dataset.index), 1);
      rerender("Removed URL from manual review.");
    });
  });
}

function parseManualText(text, url) {
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const clean = text.replace(/\s+/g, " ").trim();

  return normalizeJob({
    url,
    company: extractManualCompany(clean, lines),
    title: extractManualTitle(clean, lines),
    salary: extractManualSalary(clean),
    location: extractManualLocation(clean),
    workType: extractManualWorkType(clean),
  });
}

function extractManualCompany(text, lines) {
  const patterns = [
    /\b(Boise Cascade|AAA Washington|Compass Group|Impact Public Schools|American Capital Group|The Bear Creek School|CBRE|Renton School District|Northshore School District)\b/i,
    /Company:\s*([^|]+?)(?=\s+(Job Title|Title|Location|Salary|Description):|$)/i,
    /Organization:\s*([^|]+?)(?=\s+(Job Title|Title|Location|Salary|Description):|$)/i,
    /Employer:\s*([^|]+?)(?=\s+(Job Title|Title|Location|Salary|Description):|$)/i,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m) return cleanShort(m[1] || m[0]);
  }

  return cleanShort(lines.filter(line => !isJunkLine(line))[0]);
}

function extractManualTitle(text, lines) {
  const patterns = [
    /\b(Administrative Specialist|Operations Assistant|Executive Assistant|Office Admin Personnel|Workplace Experience Coordinator|Call Center Scheduler|Middle School Classroom Assistant|Classroom Assistant|Administrative Assistant|Office Assistant|Program Coordinator|Project Coordinator|Academic Advancement Coordinator|IT Manager|Service Desk Manager|Endpoint Manager)\b/i,
    /Job Title:\s*([^|]+?)(?=\s+(Company|Location|Salary|Description):|$)/i,
    /Title:\s*([^|]+?)(?=\s+(Company|Location|Salary|Description):|$)/i,
    /Position:\s*([^|]+?)(?=\s+(Company|Location|Salary|Description):|$)/i,
    /Role:\s*([^|]+?)(?=\s+(Company|Location|Salary|Description):|$)/i,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m) return cleanTitle(m[1] || m[0]);
  }

  return cleanTitle(lines.filter(line => !isJunkLine(line)).find(line =>
    line.length < 90 &&
    /assistant|specialist|coordinator|manager|administrator|engineer|analyst|personnel|scheduler/i.test(line)
  ));
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

  for (const p of patterns) {
    const m = text.match(p);
    if (m) return cleanSalary(m[1] || m[0]);
  }

  return "";
}

function extractManualLocation(text) {
  const patterns = [
    /Locations?Showing\s+\d+\s+location\s+.*?\s+([A-Z][a-zA-Z .'-]+,\s?(WA|OR|CA|TX|NY|FL|GA|TN|AZ|CO|IL|NC|SC|VA|DC))/i,
    /\b([A-Z][a-zA-Z .'-]+,\s?(WA|OR|CA|TX|NY|FL|GA|TN|AZ|CO|IL|NC|SC|VA|DC))\b/,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m) return cleanLocation(m[1] || m[0]);
  }

  if (/\bremote\b/i.test(text)) return "Remote";
  return "";
}

function extractManualWorkType(text) {
  const parts = [];

  if (/\bfull-time\b|\bfull time\b/i.test(text)) parts.push("Full-Time");
  if (/\bpart-time\b|\bpart time\b/i.test(text)) parts.push("Part-Time");

  if (/\bhybrid\b/i.test(text)) parts.push("Hybrid");
  else if (/\bremote\b/i.test(text)) parts.push("Remote");
  else if (/\bon-site\b|\bonsite\b|\bin person\b|\bin-person\b/i.test(text)) parts.push("On-site");

  return [...new Set(parts)].join(" / ");
}

function formatJob(job) {
  const lines = [];

  if (job.company) lines.push(`Company: ${job.company}`);
  if (job.title) lines.push(`Job Title: ${job.title}`);
  if (job.salary) lines.push(`Salary: ${job.salary}`);
  if (job.location) lines.push(`Location: ${job.location}`);
  if (job.workType) lines.push(`Work Type: ${job.workType}`);
  if (job.url) lines.push(`URL: ${job.url}`);

  return lines.join("\n");
}

function getUrls(text) {
  return text
    .split(/\s+/)
    .map(item => item.trim())
    .filter(item => item.startsWith("http://") || item.startsWith("https://"))
    .filter((item, index, arr) => arr.indexOf(item) === index);
}

function rerender(message) {
  renderParsedJobs(document.getElementById("results"), document.getElementById("status"));
  renderReviewJobs(document.getElementById("reviewResults"), document.getElementById("status"));
  document.getElementById("parsedCount").textContent = parsedJobs.length;
  document.getElementById("reviewCount").textContent = reviewJobs.length;
  document.getElementById("status").textContent = message;
}

function safeValue(value) {
  const cleaned = cleanShort(value);
  return cleaned.toLowerCase() === "not found" ? "" : cleaned;
}

function cleanShort(value) {
  const cleaned = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^\s*[-:|]\s*/, "")
    .trim();

  if (!cleaned || cleaned.toLowerCase() === "not found") return "";
  return cleaned.slice(0, 90);
}

function cleanTitle(value) {
  const cleaned = cleanShort(value)
    .replace(/\s*Job Details$/i, "")
    .replace(/\s*\(FULL TIME\)/i, "")
    .trim();

  if (cleaned.length > 90) return "";
  return cleaned;
}

function cleanSalary(value) {
  const cleaned = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.toLowerCase() === "not found") return "";
  return cleaned.slice(0, 120);
}

function cleanLocation(value) {
  const cleaned = cleanShort(value);

  if (/search by zip code|competitive starting wages|what we offer|advanced/i.test(cleaned)) {
    return "";
  }

  const cityState = cleaned.match(/\b([A-Z][a-zA-Z .'-]+,\s?(WA|OR|CA|TX|NY|FL|GA|TN|AZ|CO|IL|NC|SC|VA|DC))\b/);
  return cityState ? cityState[0] : cleaned;
}

function cleanUrl(value) {
  const cleaned = String(value || "").trim();
  if (!cleaned || cleaned.toLowerCase() === "not found") return "";
  return cleaned;
}

function isJunkLine(line) {
  return /skip to main content|accessibility|reasonable accommodation|toggle navigation|posting details|job details|description|equal opportunity|1password|parse manual text|results|copy all/i.test(line);
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
