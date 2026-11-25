export interface YoutubeSearchItem {
  videoId: string;
  title: string;
  channelTitle: string;
  descriptionSnippet: string;
  durationText: string | null;
  durationMs: number | null;
  viewCountText: string | null;
  publishedText: string | null;
  thumbnailUrl: string;
  watchUrl: string;
  embedUrl: string;
}

export interface YoutubeSearchResult {
  source: string;
  query: string;
  items: YoutubeSearchItem[];
}

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 50;

const searchCache = new Map<
  string,
  { expiresAt: number; data: YoutubeSearchResult }
>();

export function extractYoutubeVideoIdFromInput(input: string): string | null {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;
  if (YOUTUBE_ID_RE.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      const seg = parsed.pathname.split('/').filter(Boolean)[0] || '';
      return YOUTUBE_ID_RE.test(seg) ? seg : null;
    }
    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtube-nocookie.com'
    ) {
      const vParam = parsed.searchParams.get('v');
      if (vParam && YOUTUBE_ID_RE.test(vParam)) return vParam;

      const segments = parsed.pathname.split('/').filter(Boolean);
      if (
        segments.length >= 2 &&
        ['embed', 'shorts', 'live', 'v'].includes(segments[0]) &&
        YOUTUBE_ID_RE.test(segments[1])
      ) {
        return segments[1];
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function parseDurationTextToMs(text?: string | null): number | null {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text.trim();
  if (!/^\d+(?::\d{1,2}){1,2}$/.test(cleaned)) return null;
  const parts = cleaned.split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return null;
  let seconds = 0;
  if (parts.length === 2) {
    seconds = parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return seconds > 0 ? seconds * 1000 : null;
}

export function parseIso8601DurationToMs(iso?: string | null): number | null {
  if (!iso || typeof iso !== 'string') return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(iso.trim());
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const totalSec = hours * 3600 + minutes * 60 + seconds;
  return totalSec > 0 ? totalSec * 1000 : null;
}

export function formatMsToClock(ms?: number | null): string | null {
  if (!ms || ms <= 0) return null;
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function extractBalancedJsonObject(
  html: string,
  markers: string[],
): unknown {
  for (const marker of markers) {
    const idx = html.indexOf(marker);
    if (idx === -1) continue;
    const startBrace = html.indexOf('{', idx + marker.length);
    if (startBrace === -1) continue;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = startBrace; i < html.length; i += 1) {
      const ch = html[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (inString) {
        if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          const jsonStr = html.slice(startBrace, i + 1);
          try {
            return JSON.parse(jsonStr);
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

function readRunsText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const obj = node as { simpleText?: unknown; runs?: Array<{ text?: unknown }> };
  if (typeof obj.simpleText === 'string') return obj.simpleText;
  if (Array.isArray(obj.runs)) {
    return obj.runs
      .map((r) => (typeof r?.text === 'string' ? r.text : ''))
      .join('');
  }
  return '';
}

function collectVideoRenderers(
  node: unknown,
  out: Array<Record<string, unknown>>,
  limit: number,
) {
  if (!node || typeof node !== 'object' || out.length >= limit * 2) return;
  if (Array.isArray(node)) {
    for (const item of node) {
      collectVideoRenderers(item, out, limit);
      if (out.length >= limit * 2) return;
    }
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj.videoRenderer && typeof obj.videoRenderer === 'object') {
    out.push(obj.videoRenderer as Record<string, unknown>);
  }
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object') {
      collectVideoRenderers(val, out, limit);
      if (out.length >= limit * 2) return;
    }
  }
}

function buildCanonicalItem(
  videoId: string,
  partial: {
    title: string;
    channelTitle?: string | null;
    descriptionSnippet?: string | null;
    durationText?: string | null;
    durationMs?: number | null;
    viewCountText?: string | null;
    publishedText?: string | null;
  },
): YoutubeSearchItem {
  const durationMs =
    partial.durationMs ?? parseDurationTextToMs(partial.durationText);
  const durationText =
    partial.durationText || formatMsToClock(durationMs) || null;
  return {
    videoId,
    title: (partial.title || 'Video YouTube').trim(),
    channelTitle: (partial.channelTitle || 'YouTube').trim(),
    descriptionSnippet: (partial.descriptionSnippet || '').trim(),
    durationText,
    durationMs,
    viewCountText: partial.viewCountText?.trim() || null,
    publishedText: partial.publishedText?.trim() || null,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`,
  };
}

async function resolveDirectYoutubeUrl(
  videoId: string,
  query: string,
): Promise<YoutubeSearchResult> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
    { signal: AbortSignal.timeout(6000), cache: 'no-store' },
  );
  if (!res.ok) {
    throw new Error(`Không tìm thấy video YouTube hợp lệ (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as {
    title?: string;
    author_name?: string;
  };
  return {
    source: 'youtube-direct-url',
    query,
    items: [
      buildCanonicalItem(videoId, {
        title: data.title || `Video ${videoId}`,
        channelTitle: data.author_name || 'YouTube',
      }),
    ],
  };
}

async function searchViaVideoMcp(
  mcpUrl: string,
  query: string,
  lang: 'all' | 'vi' | 'en',
  limit: number,
): Promise<YoutubeSearchResult | null> {
  const base = mcpUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/api/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.VIDEO_API_TOKEN
        ? { Authorization: `Bearer ${process.env.VIDEO_API_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({
      query,
      language: lang === 'all' ? 'vi' : lang,
      limit,
    }),
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const payload = (await res.json()) as {
    source?: string;
    videos?: Array<{
      video_id?: string;
      videoId?: string;
      title?: string;
      channel?: string;
      description?: string;
    }>;
  };
  const videos = Array.isArray(payload.videos) ? payload.videos : [];
  const items: YoutubeSearchItem[] = [];
  for (const v of videos) {
    const id = v.video_id || v.videoId || '';
    if (!YOUTUBE_ID_RE.test(id)) continue;
    items.push(
      buildCanonicalItem(id, {
        title: v.title || `Video ${id}`,
        channelTitle: v.channel || 'YouTube',
        descriptionSnippet: v.description || '',
      }),
    );
    if (items.length >= limit) break;
  }
  if (items.length === 0) return null;
  return {
    source: payload.source || 'video-mcp',
    query,
    items,
  };
}

async function searchViaYoutubeDataApi(
  apiKey: string,
  query: string,
  lang: 'all' | 'vi' | 'en',
  limit: number,
): Promise<YoutubeSearchResult> {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    q: query,
    maxResults: String(limit),
    videoEmbeddable: 'true',
  });
  if (lang === 'vi' || lang === 'en') {
    params.set('relevanceLanguage', lang);
  }
  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
    {
      headers: { 'X-Goog-Api-Key': apiKey },
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    },
  );
  if (!searchRes.ok) {
    throw new Error(`YouTube Data API trả về HTTP ${searchRes.status}.`);
  }
  const searchBody = (await searchRes.json()) as {
    items?: Array<{
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        channelTitle?: string;
        description?: string;
        publishedAt?: string;
      };
    }>;
  };
  const rawItems = searchBody.items || [];
  const ids = rawItems
    .map((it) => it.id?.videoId)
    .filter((id): id is string => Boolean(id && YOUTUBE_ID_RE.test(id)));

  const detailsById = new Map<
    string,
    { durationMs: number | null; viewCount: string | null }
  >();
  if (ids.length > 0) {
    const detParams = new URLSearchParams({
      part: 'contentDetails,statistics',
      id: ids.join(','),
    });
    const detRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?${detParams.toString()}`,
      {
        headers: { 'X-Goog-Api-Key': apiKey },
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
      },
    );
    if (detRes.ok) {
      const detBody = (await detRes.json()) as {
        items?: Array<{
          id?: string;
          contentDetails?: { duration?: string };
          statistics?: { viewCount?: string };
        }>;
      };
      for (const d of detBody.items || []) {
        if (!d.id) continue;
        const viewNum = d.statistics?.viewCount
          ? Number(d.statistics.viewCount)
          : NaN;
        detailsById.set(d.id, {
          durationMs: parseIso8601DurationToMs(d.contentDetails?.duration),
          viewCount: Number.isFinite(viewNum)
            ? `${viewNum.toLocaleString('en-US')} lượt xem`
            : null,
        });
      }
    }
  }

  const items: YoutubeSearchItem[] = [];
  for (const raw of rawItems) {
    const id = raw.id?.videoId;
    if (!id || !YOUTUBE_ID_RE.test(id)) continue;
    const extra = detailsById.get(id);
    items.push(
      buildCanonicalItem(id, {
        title: raw.snippet?.title || `Video ${id}`,
        channelTitle: raw.snippet?.channelTitle || 'YouTube',
        descriptionSnippet: raw.snippet?.description || '',
        durationMs: extra?.durationMs ?? null,
        viewCountText: extra?.viewCount ?? null,
        publishedText: raw.snippet?.publishedAt
          ? raw.snippet.publishedAt.slice(0, 10)
          : null,
      }),
    );
  }

  return {
    source: 'youtube-data-api',
    query,
    items,
  };
}

async function searchViaYoutubePublicHtml(
  query: string,
  lang: 'all' | 'vi' | 'en',
  limit: number,
): Promise<YoutubeSearchResult> {
  const hl = lang === 'en' ? 'en' : 'vi';
  const acceptLanguage =
    lang === 'en'
      ? 'en-US,en;q=0.9'
      : lang === 'vi'
        ? 'vi-VN,vi;q=0.9,en;q=0.5'
        : 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7';

  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=${hl}&sp=EgIQAQ%253D%253D`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': acceptLanguage,
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Không thể kết nối tìm kiếm YouTube (HTTP ${res.status}).`);
  }

  const html = await res.text();
  const initialData = extractBalancedJsonObject(html, [
    'var ytInitialData = ',
    'window["ytInitialData"] = ',
    'ytInitialData = ',
  ]);
  if (!initialData) {
    throw new Error(
      'YouTube chưa trả về dữ liệu tìm kiếm (có thể bị giới hạn tạm thời hoặc yêu cầu xác minh). Bạn có thể dán trực tiếp link YouTube vào ô tìm kiếm.',
    );
  }

  const renderers: Array<Record<string, unknown>> = [];
  collectVideoRenderers(initialData, renderers, limit);

  const seen = new Set<string>();
  const items: YoutubeSearchItem[] = [];
  for (const vr of renderers) {
    const id = typeof vr.videoId === 'string' ? vr.videoId : '';
    if (!YOUTUBE_ID_RE.test(id) || seen.has(id)) continue;

    // Bỏ qua video livestream đang phát (không có thời lượng cố định)
    const lengthText = readRunsText(vr.lengthText).trim();
    if (!lengthText) continue;

    const title = readRunsText(vr.title);
    if (!title) continue;

    seen.add(id);
    const channelTitle =
      readRunsText(vr.ownerText) || readRunsText(vr.longBylineText) || 'YouTube';
    const descriptionSnippet =
      readRunsText(vr.detailedMetadataSnippets) ||
      (Array.isArray(vr.detailedMetadataSnippets) &&
      vr.detailedMetadataSnippets[0] &&
      typeof vr.detailedMetadataSnippets[0] === 'object'
        ? readRunsText(
            (vr.detailedMetadataSnippets[0] as { snippetText?: unknown })
              .snippetText,
          )
        : '') ||
      readRunsText(vr.descriptionSnippet);
    const viewCountText =
      readRunsText(vr.shortViewCountText) || readRunsText(vr.viewCountText);
    const publishedText = readRunsText(vr.publishedTimeText);

    items.push(
      buildCanonicalItem(id, {
        title,
        channelTitle,
        descriptionSnippet,
        durationText: lengthText,
        viewCountText,
        publishedText,
      }),
    );

    if (items.length >= limit) break;
  }

  return {
    source: 'youtube-web',
    query,
    items,
  };
}

export async function searchYoutubeVideos(input: {
  query: string;
  lang?: 'all' | 'vi' | 'en';
  limit?: number;
}): Promise<YoutubeSearchResult> {
  const query = (input.query || '').trim().slice(0, 150);
  if (!query) {
    throw new Error('Vui lòng nhập từ khóa hoặc liên kết YouTube.');
  }
  const lang: 'all' | 'vi' | 'en' =
    input.lang === 'vi' || input.lang === 'en' ? input.lang : 'all';
  const limit = Math.min(Math.max(Math.round(input.limit || 8), 1), 12);

  const cacheKey = `${lang}::${limit}::${query.toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  let result: YoutubeSearchResult | null = null;
  const directId = extractYoutubeVideoIdFromInput(query);
  if (directId) {
    result = await resolveDirectYoutubeUrl(directId, query);
  } else {
    if (process.env.VIDEO_MCP_URL) {
      try {
        result = await searchViaVideoMcp(
          process.env.VIDEO_MCP_URL,
          query,
          lang,
          limit,
        );
      } catch {
        result = null;
      }
    }

    if (!result && process.env.YOUTUBE_API_KEY) {
      result = await searchViaYoutubeDataApi(
        process.env.YOUTUBE_API_KEY,
        query,
        lang,
        limit,
      );
    }

    if (!result) {
      result = await searchViaYoutubePublicHtml(query, lang, limit);
    }
  }

  if (searchCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) searchCache.delete(oldestKey);
  }
  searchCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data: result,
  });

  return result;
}
