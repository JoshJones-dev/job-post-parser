const jobPost = document.getElementById('jobPost');
const output = document.getElementById('output');
const extractBtn = document.getElementById('extractBtn');
const copyBtn = document.getElementById('copyBtn');
const clearBtn = document.getElementById('clearBtn');
const titleField = document.getElementById('titleField');
const salaryField = document.getElementById('salaryField');
const locationField = document.getElementById('locationField');

function clean(value) {
  return value ? value.replace(/\s+/g, ' ').replace(/[|•]+$/g, '').trim() : '';
}

function getLines(text) {
  return text
    .split(/\r?\n/)
    .map(line => clean(line))
    .filter(Boolean);
}

function extractTitle(text) {
  const lines = getLines(text);

  const labeled = text.match(/(?:job title|title|position|role)\s*[:\-]\s*(.+)/i);
  if (labeled) return clean(labeled[1]);

  const badWords = /(salary|pay|compensation|location|remote|benefits|about|description|requirements|responsibilities|qualifications|apply|posted)/i;
  const likelyTitle = lines.find(line =>
    line.length >= 4 &&
    line.length <= 90 &&
    !badWords.test(line) &&
    /\b(manager|director|engineer|analyst|specialist|administrator|technician|developer|designer|assistant|coordinator|lead|intern|consultant|architect|support)\b/i.test(line)
  );

  return likelyTitle || 'Not found';
}

function extractSalary(text) {
  const salaryPatterns = [
    /(?:salary|pay range|compensation|base pay|annual salary)\s*[:\-]?\s*((?:\$|USD\s*)?[\d,]+(?:\.\d{2})?\s*(?:k|K)?\s*(?:-|–|to)\s*(?:\$|USD\s*)?[\d,]+(?:\.\d{2})?\s*(?:k|K)?(?:\s*(?:per year|a year|yearly|annually|\/year|per hour|hourly|\/hour|hr))?)/i,
    /((?:\$|USD\s*)[\d,]+(?:\.\d{2})?\s*(?:k|K)?\s*(?:-|–|to)\s*(?:\$|USD\s*)?[\d,]+(?:\.\d{2})?\s*(?:k|K)?(?:\s*(?:per year|a year|yearly|annually|\/year|per hour|hourly|\/hour|hr))?)/i,
    /((?:\$|USD\s*)[\d,]+(?:\.\d{2})?\s*(?:k|K)?\s*(?:per year|a year|yearly|annually|\/year|per hour|hourly|\/hour|hr))/i
  ];

  for (const pattern of salaryPatterns) {
    const match = text.match(pattern);
    if (match) return clean(match[1]);
  }

  return 'Not listed';
}

function extractLocation(text) {
  const lines = getLines(text);

  const labeled = text.match(/(?:location|job location|work location)\s*[:\-]\s*(.+)/i);
  if (labeled) return clean(labeled[1]);

  const remote = text.match(/\b(remote|hybrid|on-site|onsite)\b/i);
  const cityState = text.match(/\b([A-Z][a-zA-Z .'-]+,\s*[A-Z]{2})(?:\b|\s|\))/);

  if (remote && cityState) return `${clean(cityState[1])} (${clean(remote[1])})`;
  if (cityState) return clean(cityState[1]);
  if (remote) return clean(remote[1]);

  const locationLine = lines.find(line => /\b(remote|hybrid|on-site|onsite|United States|USA)\b/i.test(line));
  return locationLine || 'Not found';
}

function extractJobInfo() {
  const text = jobPost.value.trim();
  if (!text) return;

  const title = extractTitle(text);
  const salary = extractSalary(text);
  const location = extractLocation(text);

  titleField.textContent = title;
  salaryField.textContent = salary;
  locationField.textContent = location;

  output.value = `Job Title: ${title}\nSalary: ${salary}\nLocation: ${location}`;
}

async function copyOutput() {
  if (!output.value.trim()) return;
  await navigator.clipboard.writeText(output.value);
  copyBtn.textContent = 'Copied!';
  setTimeout(() => copyBtn.textContent = 'Copy Output', 1200);
}

function clearAll() {
  jobPost.value = '';
  output.value = '';
  titleField.textContent = '—';
  salaryField.textContent = '—';
  locationField.textContent = '—';
}

extractBtn.addEventListener('click', extractJobInfo);
copyBtn.addEventListener('click', copyOutput);
clearBtn.addEventListener('click', clearAll);
