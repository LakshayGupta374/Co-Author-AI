const axios = require('axios');

// ── Groq helper ───────────────────────────────────────────────────────────────
const groq = (messages, maxTokens = 150, temperature = 0.3) =>
  axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    { model: 'llama-3.1-8b-instant', messages, max_tokens: maxTokens, temperature },
    { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
  );

// ── Extract visual keywords from story text using Groq ────────────────────────
const extractKeywords = async (text, genres = []) => {
  const genreHint = genres.length ? `Story genres: ${genres.join(', ')}.` : '';
  try {
    const r = await groq([
      {
        role: 'system',
        content:
          'You are a visual keyword extractor for image search. ' +
          'Extract 4-5 vivid, concrete, searchable keywords or short phrases from the given story text. ' +
          'Focus on settings, objects, moods, and visuals — not abstract concepts. ' +
          'Return ONLY a valid JSON array of strings. Example: ["dark forest", "knight", "moonlit castle", "fog"]',
      },
      {
        role: 'user',
        content: `${genreHint}\n\nExtract visual keywords from:\n\n"${text.slice(0, 1500)}"\n\nReturn ONLY a JSON array.`,
      },
    ]);

    const raw   = r.data.choices[0].message.content.trim();
    const match = raw.match(/\[[\s\S]*?\]/);
    if (!match) throw new Error('No JSON array found');
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) && parsed.length ? parsed.slice(0, 5) : ['cinematic story', 'fiction'];
  } catch {
    const fallbacks = {
      Fantasy: 'fantasy castle', Horror: 'dark forest night',
      Romance: 'sunset landscape', 'Science Fiction': 'futuristic city',
      Thriller: 'dark city rain', Mystery: 'foggy alley',
    };
    const fallback = genres.map(g => fallbacks[g]).filter(Boolean)[0];
    return [fallback || 'cinematic story scene', 'dramatic lighting', 'atmospheric'];
  }
};

// ── Pexels fetcher ────────────────────────────────────────────────────────────
const fetchPexels = async (query, count = 3, orientation = 'landscape', page = 1) => {
  if (!process.env.PEXELS_API_KEY) {
    console.warn('PEXELS_API_KEY not set — skipping Pexels');
    return [];
  }
  try {
    const r = await axios.get('https://api.pexels.com/v1/search', {
      params: { query, per_page: count, orientation, size: 'medium', page },
      headers: { Authorization: process.env.PEXELS_API_KEY },
      timeout: 8000,
    });
    return (r.data.photos || []).map(p => ({
      id:              `pexels_${p.id}`,
      url:             p.src.large,
      thumb:           p.src.medium,
      small:           p.src.small,
      photographer:    p.photographer,
      photographerUrl: p.photographer_url,
      alt:             p.alt || query,
      sourceUrl:       p.url,          // unified field — link to photo page
      source:          'pexels',       // which API supplied this image
    }));
  } catch (err) {
    console.warn(`Pexels fetch failed for "${query}":`, err.message);
    return [];
  }
};

// ── Unsplash fetcher ──────────────────────────────────────────────────────────
const fetchUnsplash = async (query, count = 3, orientation = 'landscape', page = 1) => {
  if (!process.env.UNSPLASH_ACCESS_KEY) {
    console.warn('UNSPLASH_ACCESS_KEY not set — skipping Unsplash');
    return [];
  }
  try {
    const r = await axios.get('https://api.unsplash.com/search/photos', {
      params: { query, per_page: count, orientation, page },
      headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
      timeout: 8000,
    });
    return (r.data.results || []).map(p => ({
      id:              `unsplash_${p.id}`,
      url:             p.urls.regular,
      thumb:           p.urls.small,
      small:           p.urls.thumb,
      photographer:    p.user.name,
      photographerUrl: p.user.links.html,
      alt:             p.alt_description || p.description || query,
      sourceUrl:       p.links.html,   // unified field — link to photo page
      source:          'unsplash',     // which API supplied this image
    }));
  } catch (err) {
    console.warn(`Unsplash fetch failed for "${query}":`, err.message);
    return [];
  }
};

// ── Collaborative fetch — both APIs in parallel, interleaved results ───────────
// Strategy: fetch from Pexels AND Unsplash simultaneously for each keyword,
// then interleave so the user always sees a mix of both sources.
// Graceful: if one API has no key / fails, the other still works.
const fetchBoth = async (query, countEach = 3, orientation = 'landscape', page = 1) => {
  const [pexels, unsplash] = await Promise.all([
    fetchPexels(query, countEach, orientation, page),
    fetchUnsplash(query, countEach, orientation, page),
  ]);

  // Interleave: Pexels[0], Unsplash[0], Pexels[1], Unsplash[1] ...
  // so results are always visually mixed regardless of which APIs responded
  const merged = [];
  const len = Math.max(pexels.length, unsplash.length);
  for (let i = 0; i < len; i++) {
    if (pexels[i])   merged.push(pexels[i]);
    if (unsplash[i]) merged.push(unsplash[i]);
  }
  return merged;
};

// ── POST /api/images/scenes ───────────────────────────────────────────────────
exports.getSceneImages = async (req, res) => {
  try {
    const { text, genres = [], page = 1 } = req.body;

    const keywords = await extractKeywords(text, genres);

    // Fetch from BOTH APIs for top-3 keywords in parallel
    const results = await Promise.allSettled(
      keywords.slice(0, 3).map(kw => fetchBoth(kw, 2, 'landscape', page))
    );

    const images = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .slice(0, 6);

    if (!images.length) {
      return res.status(502).json({
        message: 'No images found. Make sure at least one of PEXELS_API_KEY or UNSPLASH_ACCESS_KEY is set in .env and your backend is restarted.',
      });
    }

    // Report which sources contributed
    const sources = [...new Set(images.map(img => img.source))];
    res.json({ images, keywords, sources });

  } catch (err) {
    console.error('Scene images error:', err.message);
    res.status(500).json({ message: 'Failed to fetch scene images.' });
  }
};

// ── POST /api/images/cover ────────────────────────────────────────────────────
exports.getCoverImages = async (req, res) => {
  try {
    const { text, genres = [], page = 1 } = req.body;

    const MOOD_MAP = {
      Fantasy:          'cinematic fantasy magical landscape epic',
      Horror:           'dark horror atmospheric moody cinematic',
      Thriller:         'cinematic thriller dark suspense dramatic',
      Crime:            'noir cinematic dark city night',
      Romance:          'cinematic romantic golden hour ethereal',
      'Science Fiction':'cinematic sci-fi futuristic dramatic',
      Dystopian:        'dystopian cinematic dark dramatic landscape',
      Historical:       'epic historical cinematic period landscape',
      Adventure:        'cinematic adventure epic landscape dramatic',
      Western:          'western cinematic desert landscape golden',
      Mystery:          'cinematic mystery fog atmospheric dark',
      Mythology:        'epic mythological cinematic dramatic',
      Supernatural:     'supernatural cinematic mystical atmospheric',
      Comedy:           'bright cinematic vibrant joyful',
      Drama:            'cinematic drama emotional atmospheric',
    };

    const moodParts  = genres.map(g => MOOD_MAP[g] || '').filter(Boolean);
    const baseMood   = moodParts.length ? moodParts[0] : 'cinematic dramatic atmospheric';
    const keywords   = await extractKeywords(text, genres);
    const coverQuery = `${baseMood} ${keywords[0] || ''}`.trim();

    // Portrait orientation for cover-style images, fetched from both APIs
    const images = await fetchBoth(coverQuery, 3, 'portrait', page);

    if (!images.length) {
      return res.status(502).json({
        message: 'No cover images found. Make sure at least one API key is set in .env.',
      });
    }

    const sources = [...new Set(images.map(img => img.source))];
    res.json({ images, query: coverQuery, keywords, sources });

  } catch (err) {
    console.error('Cover images error:', err.message);
    res.status(500).json({ message: 'Failed to fetch cover images.' });
  }
};
