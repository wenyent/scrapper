import {
  createSnippet,
  getMatchedKeywords,
  isSingaporeRelated,
} from "./matching.js";

const POST_SEARCH_LIMIT = 25;
const MAX_COMMENT_THREADS = 15;
const PUBLIC_REDDIT_BASE_URL = "https://www.reddit.com";
const OAUTH_REDDIT_BASE_URL = "https://oauth.reddit.com";
const SINGAPORE_SUBREDDIT_SEARCH = [
  "singapore",
  "askSingapore",
  "asksg",
  "askSingaporeans",
  "SingaporeRaw",
  "sgtalk",
  "SGwomen",
  "SingaporePR",
  "SingaporeEats",
  "ChannelNewsAsia",
  "straitstimes",
  "singaporefi",
  "singaporedaily",
  "SingaporeLife",
].join("+");
let accessTokenCache = null;

export async function searchRedditMentions({ keywords, timeRangeDays }) {
  const cutoffMs = Date.now() - timeRangeDays * 24 * 60 * 60 * 1000;
  const postsById = new Map();

  for (const keyword of keywords) {
    const [globalPosts, singaporeSubredditPosts] = await Promise.all([
      searchPosts({ keyword, subredditPath: null }),
      searchPosts({ keyword, subredditPath: SINGAPORE_SUBREDDIT_SEARCH }),
    ]);

    for (const post of [...globalPosts, ...singaporeSubredditPosts]) {
      if (post.createdAtMs >= cutoffMs) {
        postsById.set(post.id, post);
      }
    }
  }

  const posts = [...postsById.values()].sort((a, b) => b.createdAtMs - a.createdAtMs);
  const mentions = [];

  for (const post of posts) {
    mentions.push(...mentionsFromPost(post, keywords));
  }

  const postsToCheckForComments = posts.slice(0, MAX_COMMENT_THREADS);
  const commentGroups = await Promise.all(
    postsToCheckForComments.map((post) => searchCommentsInPost({ post, keywords, cutoffMs })),
  );

  for (const group of commentGroups) {
    mentions.push(...group);
  }

  return mentions.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

async function searchPosts({ keyword, subredditPath }) {
  const useOauth = hasRedditCredentials();
  const basePath = subredditPath ? `/r/${subredditPath}/search` : "/search";
  const url = new URL(`${useOauth ? OAUTH_REDDIT_BASE_URL : PUBLIC_REDDIT_BASE_URL}${basePath}${useOauth ? "" : ".json"}`);
  url.searchParams.set("q", keyword);
  url.searchParams.set("sort", "new");
  url.searchParams.set("limit", String(POST_SEARCH_LIMIT));
  url.searchParams.set("t", "month");

  if (subredditPath) {
    url.searchParams.set("restrict_sr", "on");
  }

  const json = await fetchRedditJson(url);
  return (json.data?.children || [])
    .map((child) => child.data)
    .filter(Boolean)
    .map(normalizePost);
}

async function searchCommentsInPost({ post, keywords, cutoffMs }) {
  const useOauth = hasRedditCredentials();
  const url = new URL(
    useOauth
      ? `${OAUTH_REDDIT_BASE_URL}/comments/${post.id}`
      : `${PUBLIC_REDDIT_BASE_URL}${post.permalink}.json`,
  );
  url.searchParams.set("limit", "500");
  url.searchParams.set("sort", "new");

  const json = await fetchRedditJson(url);
  const commentsListing = json?.[1]?.data?.children || [];
  const comments = flattenComments(commentsListing).filter((comment) => comment.createdAtMs >= cutoffMs);

  return comments.flatMap((comment) => mentionsFromComment({ comment, post, keywords }));
}

function mentionsFromPost(post, keywords) {
  const text = `${post.title} ${post.text}`;
  const matchedKeywords = getMatchedKeywords(text, keywords);

  if (matchedKeywords.length === 0 || !isSingaporeRelated(post)) {
    return [];
  }

  return matchedKeywords.map((keyword) => ({
    id: `reddit-post-${post.id}-${keyword}`,
    keyword,
    title: post.title,
    snippet: createSnippet(post.text || post.title),
    publishedAt: new Date(post.createdAtMs).toISOString(),
    platform: "Reddit",
    type: "Post",
    url: `${PUBLIC_REDDIT_BASE_URL}${post.permalink}`,
  }));
}

function mentionsFromComment({ comment, post, keywords }) {
  const matchedKeywords = getMatchedKeywords(comment.text, keywords);
  const singaporeRelated = isSingaporeRelated(post) || isSingaporeRelated({ text: comment.text });

  if (matchedKeywords.length === 0 || !singaporeRelated) {
    return [];
  }

  return matchedKeywords.map((keyword) => ({
    id: `reddit-comment-${comment.id}-${keyword}`,
    keyword,
    title: post.title,
    snippet: createSnippet(comment.text),
    publishedAt: new Date(comment.createdAtMs).toISOString(),
    platform: "Reddit",
    type: "Comment",
    url: `${PUBLIC_REDDIT_BASE_URL}${comment.permalink}`,
  }));
}

function flattenComments(children) {
  const comments = [];

  for (const child of children) {
    if (child.kind !== "t1" || !child.data?.body) {
      continue;
    }

    comments.push({
      id: child.data.id,
      text: child.data.body,
      permalink: child.data.permalink,
      createdAtMs: child.data.created_utc * 1000,
    });

    if (child.data.replies?.data?.children) {
      comments.push(...flattenComments(child.data.replies.data.children));
    }
  }

  return comments;
}

function normalizePost(data) {
  return {
    id: data.id,
    subreddit: data.subreddit,
    title: data.title || "",
    text: data.selftext || "",
    permalink: data.permalink,
    createdAtMs: data.created_utc * 1000,
  };
}

async function fetchRedditJson(url) {
  const headers = {
    "User-Agent": "GrowlMentionsMVP/0.1 by local-user",
  };

  if (hasRedditCredentials()) {
    headers.Authorization = `Bearer ${await getAccessToken()}`;
  }

  const response = await fetch(url, {
    headers,
  });

  if (!response.ok) {
    const authHint = hasRedditCredentials()
      ? "Check the Reddit API credentials configured for this server."
      : "Public Reddit JSON is blocked here. Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET to use Reddit API access.";
    throw new Error(`Reddit request failed with status ${response.status}. ${authHint}`);
  }

  return response.json();
}

async function getAccessToken() {
  if (accessTokenCache && accessTokenCache.expiresAtMs > Date.now() + 60_000) {
    return accessTokenCache.token;
  }

  const credentials = Buffer.from(
    `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`,
  ).toString("base64");

  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "GrowlMentionsMVP/0.1 by local-user",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error(`Reddit token request failed with status ${response.status}.`);
  }

  const data = await response.json();
  accessTokenCache = {
    token: data.access_token,
    expiresAtMs: Date.now() + data.expires_in * 1000,
  };

  return accessTokenCache.token;
}

function hasRedditCredentials() {
  return Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
}
