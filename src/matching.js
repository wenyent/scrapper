export function parseKeywords(input) {
  return [...new Set(String(input || "")
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean))];
}

export function getMatchedKeywords(text, keywords) {
  const normalizedText = normalize(text);
  return keywords.filter((keyword) => normalizedText.includes(normalize(keyword)));
}

export function isSingaporeRelated({ subreddit = "", title = "", text = "" }) {
  const normalizedSubreddit = normalize(subreddit);
  const normalizedText = ` ${normalize(`${title} ${text}`)} `;

  if (SINGAPORE_SUBREDDITS.has(normalizedSubreddit)) {
    return true;
  }

  return SINGAPORE_TEXT_SIGNALS.some((signal) => normalizedText.includes(signal));
}

export function createSnippet(text) {
  const cleanText = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanText) {
    return "";
  }

  const sentences = cleanText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanText];
  return sentences.slice(0, 2).map((sentence) => sentence.trim()).join(" ");
}

function normalize(value) {
  return String(value || "").toLowerCase();
}

const SINGAPORE_SUBREDDITS = new Set([
  "singapore",
  "asksingapore",
  "asksg",
  "asksingaporeans",
  "singaporeraw",
  "sgtalk",
  "sgwomen",
  "singaporepr",
  "singaporeeats",
  "channelnewsasia",
  "straitstimes",
  "singaporefi",
  "singaporedaily",
  "singaporelife",
]);

const SINGAPORE_TEXT_SIGNALS = [
  "singapore",
  " sg ",
  "hdb",
  "mrt",
  "cpf",
  "polyclinic",
  "ntuc",
];
