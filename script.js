export default {
  async fetch(request) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    if (request.method !== "POST") {
      return Response.json({ error: "Use POST with { urls: [...] }" }, { status: 405, headers: corsHeaders });
    }

    try {
      const { urls } = await request.json();
      const results = await Promise.all((urls || []).map(parseJobUrl));
      return Response.json({ results }, { headers: corsHeaders });
    } catch (error) {
      return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }
  },
};

async function parseJobUrl(url) {
  const result = {
    url,
    company: "",
    title: "",
    salary: "",
    location: "",
    workType: "",
    status: "parsed",
    error: "",
  };

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const html = await response.text();
    const text = cleanText(html);
    const jsonLd = extractJsonLd(html);

    result.title =
      pick(jsonLd.title, meta(html, "og:title"), h1(html), titleTag(html));

    result.company =
      pick(jsonLd.company, jsonLd.hiringOrganization, meta(html, "og:site_name"), companyFromText(text), companyFromUrl(url));

    result.salary =
      pick(jsonLd.salary, extractSalary(text));

    result.location =
      pick(jsonLd.location, extractLocation(text));

    result.workType = extractWorkType(text);

    result.title = cleanTitle(result.title);
    result.company = cleanCompany(result.company, url);

    return result;
  } catch (error) {
    result.status = "failed";
    result.error = "Could not fetch this page. Paste the job text manually.";
    return result;
  }
}

function extractJsonLd(html) {
  const out = {};
  const blocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];

  for (const block of blocks) {
    try {
      const raw = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
      const data = JSON.parse(raw);
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        const job = item["@type"] === "JobPosting" ? item : null;
        if (!job) continue;

        out.title = job.title;
        out.company = job.hiringOrganization?.name;
        out.hiringOrganization = job.hiringOrganization?.name;

        if (job.jobLocation) {
          const loc = Array.isArray(job.jobLocation) ? job.jobLocation[0] : job.jobLocation;
          const addr = loc.address || {};
          out.location = [addr.addressLocality, addr.addressRegion].filter(Boolean).join(", ");
        }

        if (job.baseSalary) {
          const val = job.baseSalary.value || {};
          out.salary = val.minValue && val.maxValue
            ? `$${val.minValue} - $${val.maxValue}`
            : val.value ? `$${val.value}` : "";
        }
      }
    } catch {}
  }

  return out;
}

function cleanText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function meta(html, property) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i");
  return html.match(re)?.[1] || "";
}

function h1(html) {
  return cleanText(html.match(/<h1[^>]*>(.*?)<\/h1>/i)?.[1] || "");
}

function titleTag(html) {
  return cleanText(html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || "");
}

function extractSalary(text) {
  const match = text.match(/\$[0-9]{2,3}(?:,[0-9]{3})?(?:\.\d{2})?\s*(?:-|–|to)?\s*\$?[0-9]{0,3}(?:,[0-9]{3})?(?:\.\d{2})?\s*(?:\/hour|\/hr|per hour|hourly|\/year|\/yr|per year|annually)?/i);
  return match ? match[0].trim() : "";
}

function extractLocation(text) {
  const match = text.match(/\b([A-Z][a-zA-Z .'-]+,\s?(WA|OR|CA|TX|NY|FL|GA|TN|AZ|CO|IL|NC|SC|VA|DC))\b/);
  return match ? match[0].trim() : "";
}

function extractWorkType(text) {
  if (/hybrid/i.test(text)) return "Hybrid";
  if (/remote/i.test(text)) return "Remote";
  if (/on-site|onsite|in person|in-person/i.test(text)) return "On-site";
  return "";
}

function companyFromText(text) {
  const patterns = [
    /Company:\s*([^|]+?)(?:\s{2,}|Location:|Job)/i,
    /Organization:\s*([^|]+?)(?:\s{2,}|Location:|Job)/i,
    /Employer:\s*([^|]+?)(?:\s{2,}|Location:|Job)/i,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }

  return "";
}

function companyFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    return host.split(".")[0];
  } catch {
    return "";
  }
}

function cleanTitle(title) {
  return String(title || "")
    .replace(/\s+/g, " ")
    .replace(/\s*\|\s*.*$/g, "")
    .replace(/\s*-\s*Careers.*$/i, "")
    .replace(/\s*-\s*Job.*$/i, "")
    .trim()
    .slice(0, 140);
}

function cleanCompany(company, url) {
  const bad = ["recruiting", "recruiting2", "secure4", "careers", "jobs", "job-boards", "applitrack"];
  const cleaned = String(company || "").trim();

  if (!cleaned || bad.includes(cleaned.toLowerCase())) {
    return companyFromUrl(url);
  }

  return cleaned;
}

function pick(...values) {
  return values.find(v => v && String(v).trim()) || "";
}
