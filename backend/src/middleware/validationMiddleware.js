// Lightweight validation helpers — no external library needed

const MAX_TITLE_LEN = 200;
const MAX_CONTENT_LEN = 100_000;
const MAX_PASSWORD_LEN = 128;
const ALLOWED_GENRES = [
  "Fantasy", "Science Fiction", "Mystery", "Romance", "Horror",
  "Thriller", "Adventure", "Historical", "Comedy", "Drama",
  "Dystopian", "Mythology", "Crime", "Supernatural", "Western",
];

const sendError = (res, msg, status = 400) => res.status(status).json({ message: msg });

exports.validateRegister = (req, res, next) => {
  const { name, email, password } = req.body;

  if (!name || typeof name !== "string" || !name.trim())
    return sendError(res, "Name is required.");
  if (name.trim().length > 100)
    return sendError(res, "Name must be under 100 characters.");

  if (!email || typeof email !== "string")
    return sendError(res, "Email is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return sendError(res, "Invalid email address.");

  if (!password || typeof password !== "string")
    return sendError(res, "Password is required.");
  if (password.length < 6)
    return sendError(res, "Password must be at least 6 characters.");
  if (password.length > MAX_PASSWORD_LEN)
    return sendError(res, "Password is too long.");

  // Sanitise
  req.body.name = name.trim();
  req.body.email = email.trim().toLowerCase();
  next();
};

exports.validateLogin = (req, res, next) => {
  const { email, password } = req.body;

  if (!email || typeof email !== "string")
    return sendError(res, "Email is required.");
  if (!password || typeof password !== "string")
    return sendError(res, "Password is required.");

  req.body.email = email.trim().toLowerCase();
  next();
};

exports.validateCreateStory = (req, res, next) => {
  const { title, content, genres } = req.body;

  if (!title || typeof title !== "string" || !title.trim())
    return sendError(res, "Title is required.");
  if (title.trim().length > MAX_TITLE_LEN)
    return sendError(res, `Title must be under ${MAX_TITLE_LEN} characters.`);

  if (content !== undefined && typeof content !== "string")
    return sendError(res, "Content must be a string.");
  if (content && content.length > MAX_CONTENT_LEN)
    return sendError(res, "Content is too long.");

  if (genres !== undefined) {
    if (!Array.isArray(genres))
      return sendError(res, "Genres must be an array.");
    if (genres.some((g) => !ALLOWED_GENRES.includes(g)))
      return sendError(res, "One or more genres are invalid.");
  }

  req.body.title = title.trim();
  next();
};

exports.validateUpdateStory = (req, res, next) => {
  const { title, content, genres } = req.body;

  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim())
      return sendError(res, "Title must be a non-empty string.");
    if (title.trim().length > MAX_TITLE_LEN)
      return sendError(res, `Title must be under ${MAX_TITLE_LEN} characters.`);
    req.body.title = title.trim();
  }

  if (content !== undefined) {
    if (typeof content !== "string")
      return sendError(res, "Content must be a string.");
    if (content.length > MAX_CONTENT_LEN)
      return sendError(res, "Content is too long.");
  }

  if (genres !== undefined) {
    if (!Array.isArray(genres))
      return sendError(res, "Genres must be an array.");
    if (genres.some((g) => !ALLOWED_GENRES.includes(g)))
      return sendError(res, "One or more genres are invalid.");
  }

  next();
};

exports.validateAISuggest = (req, res, next) => {
  const { prompt, genres } = req.body;

  if (!prompt || typeof prompt !== "string" || !prompt.trim())
    return sendError(res, "Prompt is required.");
  if (prompt.trim().length > 5000)
    return sendError(res, "Prompt is too long (max 5000 chars).");

  if (genres !== undefined && !Array.isArray(genres))
    return sendError(res, "Genres must be an array.");

  req.body.prompt = prompt.trim();
  next();
};

exports.validateAITransform = (req, res, next) => {
  const { text, type } = req.body;
  const ALLOWED_TYPES = ['improve', 'dialogue', 'dramatic'];

  if (!text || typeof text !== 'string' || !text.trim())
    return res.status(400).json({ message: 'text is required.' });
  if (text.trim().length > 5000)
    return res.status(400).json({ message: 'text is too long (max 5000 chars).' });

  if (!type || !ALLOWED_TYPES.includes(type))
    return res.status(400).json({ message: `type must be one of: ${ALLOWED_TYPES.join(', ')}.` });

  req.body.text = text.trim();
  next();
};

exports.validatePlotCheck = (req, res, next) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string' || !text.trim())
    return res.status(400).json({ message: 'Story text is required.' });
  if (text.trim().length > 20000)
    return res.status(400).json({ message: 'Story text is too long for one plot check (max 20000 chars).' });

  req.body.text = text.trim();
  next();
};

// Shared validator for image endpoints (scenes + cover)
exports.validateImageRequest = (req, res, next) => {
  const { text, genres } = req.body;

  if (!text || typeof text !== 'string' || !text.trim())
    return res.status(400).json({ message: 'Story text is required.' });
  if (text.trim().length > 8000)
    return res.status(400).json({ message: 'Text is too long (max 8000 chars).' });

  if (genres !== undefined) {
    if (!Array.isArray(genres))
      return res.status(400).json({ message: 'Genres must be an array.' });
  }

  req.body.text = text.trim();
  next();
};
