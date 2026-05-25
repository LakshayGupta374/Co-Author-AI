const axios = require('axios');

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

const groq = (messages, maxTokens, temperature) => {
  if (!process.env.GROQ_API_KEY) {
    const err = new Error('GROQ_API_KEY is not configured');
    err.statusCode = 500;
    throw err;
  }

  return axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    { model: GROQ_MODEL, messages, max_tokens: maxTokens, temperature },
    {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    }
  );
};

const aiErrorMessage = (err, fallback = 'AI service error') => {
  if (err.statusCode) return err.message;
  if (err.code === 'ECONNABORTED') return 'AI request timed out. Try again.';
  return err.response?.data?.error?.message || err.response?.data?.message || fallback;
};

const getMessageContent = (response) => response.data?.choices?.[0]?.message?.content?.trim();

// ── POST /api/ai/suggest  (full-story continuation / grammar) ────────────────
exports.getSuggestions = async (req, res) => {
  try {
    const { prompt, genres, mode } = req.body;
    if (!prompt) return res.status(400).json({ message: 'Prompt is required' });

    let systemPrompt, userPrompt;

    if (mode === 'grammar') {
      systemPrompt =
        'You are a professional copy-editor. Fix only grammar, punctuation, spelling, and ' +
        'sentence clarity. Do NOT add content, change the author\'s voice, or rephrase creative ' +
        'choices. Return ONLY the corrected text with no explanation.';
      userPrompt =
        'Fix only the grammar, punctuation, and spelling in this text. ' +
        'Preserve the author\'s style and voice exactly. Do not add or remove sentences:\n\n' + prompt;
    } else {
      const genreCtx = genres?.length
        ? `You are a creative writing assistant specialising in ${genres.join(', ')} stories.`
        : 'You are a creative writing assistant.';
      systemPrompt =
        genreCtx +
        ' CRITICAL: Never rewrite, rephrase or summarise the author\'s text. ' +
        'Output ONLY new content that continues from the very last word. ' +
        'Write 2-4 new sentences. Do not repeat any part of the author\'s text.';
      userPrompt =
        (genres?.length ? `This is a ${genres.join(' / ')} story.\n\n` : '') +
        `Here is what the author has written so far:\n\n"${prompt}"\n\n` +
        'Continue the story from where the author stopped. ' +
        'Do NOT repeat or rephrase anything the author wrote.';
    }

    const r = await groq(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      mode === 'grammar' ? 1000 : 220,
      mode === 'grammar' ? 0.1  : 0.85
    );
    const suggestion = getMessageContent(r);
    if (!suggestion) {
      return res.status(502).json({ message: 'AI returned an empty suggestion. Try again.' });
    }
    res.json({ suggestion });
  } catch (err) {
    console.error('AI suggest error:', err.response?.data || err.message);
    res.status(err.statusCode || 500).json({ message: aiErrorMessage(err) });
  }
};

// ── POST /api/ai/transform  (sidebar panel: selected-text transformations) ───
const TRANSFORM_CONFIGS = {
  improve: {
    system:
      'You are an expert creative writing editor. Improve the following passage — ' +
      'fix grammar, sharpen word choice, improve flow and clarity — while ' +
      'preserving the author\'s original voice and story intent. ' +
      'Return ONLY the improved passage, no commentary.',
    user: (text) => `Improve this passage:\n\n"${text}"`,
    maxTokens: 600,
    temperature: 0.4,
  },
  dialogue: {
    system:
      'You are a skilled fiction writer. Convert the given passage into a natural, ' +
      'engaging dialogue between two or more characters. Keep the same events and ' +
      'information but express them through spoken conversation and brief action beats. ' +
      'Return ONLY the dialogue, no explanation.',
    user: (text) => `Convert this into dialogue:\n\n"${text}"`,
    maxTokens: 700,
    temperature: 0.75,
  },
  dramatic: {
    system:
      'You are a dramatic fiction writer. Rewrite the given passage to be more tense, ' +
      'emotionally charged, and vivid. Heighten sensory details, internal conflict, and ' +
      'stakes. Keep the same events but make them feel urgent and gripping. ' +
      'Return ONLY the rewritten passage, no explanation.',
    user: (text) => `Make this more dramatic:\n\n"${text}"`,
    maxTokens: 700,
    temperature: 0.8,
  },
};

exports.transformText = async (req, res) => {
  try {
    const { text, type } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ message: 'Text is required' });

    const cfg = TRANSFORM_CONFIGS[type];
    if (!cfg) return res.status(400).json({ message: `Unknown type: ${type}. Use improve, dialogue, or dramatic.` });

    const r = await groq(
      [{ role: 'system', content: cfg.system }, { role: 'user', content: cfg.user(text.trim()) }],
      cfg.maxTokens,
      cfg.temperature
    );
    const result = getMessageContent(r);
    if (!result) {
      return res.status(502).json({ message: 'AI returned an empty result. Try again.' });
    }
    res.json({ result });
  } catch (err) {
    console.error('AI transform error:', err.response?.data || err.message);
    res.status(err.statusCode || 500).json({ message: aiErrorMessage(err) });
  }
};

exports.checkPlotConsistency = async (req, res) => {
  try {
    const { text } = req.body;

    const r = await groq(
      [
        {
          role: 'system',
          content:
            'You are a meticulous fiction continuity editor. Find plot continuity issues only. ' +
            'Check for inconsistent names, timeline issues, character contradictions, impossible events, ' +
            'relationship/status contradictions, and repeated facts that conflict. ' +
            'Return concise JSON only with this shape: ' +
            '{"issues":[{"type":"Name inconsistency|Timeline issue|Character contradiction|Plot contradiction|Other","severity":"low|medium|high","evidence":"short quote or paraphrase","explanation":"why it conflicts","suggestion":"how to fix it"}],"summary":"one sentence summary"} ' +
            'If there are no issues, return {"issues":[],"summary":"No clear plot inconsistencies found."}.'
        },
        {
          role: 'user',
          content: `Analyze this story for continuity and plot contradictions:\n\n${text}`
        }
      ],
      1200,
      0.15
    );

    const raw = r.data.choices[0].message.content.trim();
    const cleaned = raw
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.json({
        issues: [],
        summary: cleaned || 'No clear plot inconsistencies found.'
      });
    }

    try {
      const parsed = JSON.parse(match[0]);
      res.json({
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        summary: parsed.summary || 'Plot check complete.'
      });
    } catch {
      res.json({
        issues: [],
        summary: cleaned || 'Plot check complete, but the response could not be structured.'
      });
    }
  } catch (err) {
    console.error('Plot check error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Plot check service error' });
  }
};

exports.transcribeAudio = async (req, res) => {
  try {
    if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ message: 'Audio is required' });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ message: 'GROQ_API_KEY is not configured' });
    }

    const mimeType = req.headers['content-type'] || 'audio/webm';
    const form = new FormData();
    form.append('model', 'whisper-large-v3-turbo');
    form.append('file', new Blob([req.body], { type: mimeType }), 'narration.webm');

    const r = await axios.post(
      'https://api.groq.com/openai/v1/audio/transcriptions',
      form,
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
      }
    );

    res.json({ text: (r.data.text || '').trim() });
  } catch (err) {
    console.error('AI transcribe error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Transcription service error' });
  }
};
