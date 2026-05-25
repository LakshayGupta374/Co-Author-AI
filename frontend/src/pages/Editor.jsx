import { useEffect, useState, useRef, useCallback } from "react";
import api from "../api/axiosInstance";
import { useParams } from "react-router-dom";
import { getSocket } from "../sockets/socket";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { ALL_GENRES } from "../constants/genres";

const MAX_GENRES = 3;

const TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ["bold", "italic", "underline", "strike"],
  [{ list: "ordered" }, { list: "bullet" }],
  ["blockquote"],
  ["clean"],
];

// Strip HTML tags to get plain text for AI prompt
const toPlain = (html) => (html || "").replace(/<[^>]*>/g, "").trim();

// Sanitise AI response: strip any HTML tags so it renders as clean readable text
const stripHtml = (str) => (str || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

// Card style shared across all panels
const card = {
  background: "var(--bg-card)",
  border: "1.5px solid var(--border-color)",
  borderRadius: "14px",
  boxShadow: "var(--shadow)",
};

export default function Editor() {
  const { id } = useParams();
  const [content, setContent]       = useState("");
  const [title, setTitle]           = useState("");
  const [genres, setGenres]         = useState([]);
  const [suggestion, setSuggestion] = useState("");
  const [suggestionType, setSuggestionType] = useState(""); // "continue" | "grammar"
  const [saveStatus, setSaveStatus] = useState("idle");
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiMode, setAiMode]         = useState("");

  const autoSaveTimer       = useRef(null);
  const socketDebounceTimer = useRef(null);
  const contentRef          = useRef("");
  const genresRef           = useRef([]);
  const titleRef            = useRef("");

  // ── Fetch story ───────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchStory = async () => {
      const res = await api.get(`/stories/${id}`);
      const d = res.data;
      setContent(d.content || "");
      setTitle(d.title || "");
      setGenres(d.genres || []);
      contentRef.current = d.content || "";
      genresRef.current  = d.genres  || [];
      titleRef.current   = d.title   || "";
    };
    fetchStory();
  }, [id]);

  useEffect(() => { titleRef.current = title; }, [title]);

  // ── Socket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    const onConnect    = () => socket.emit("story:join", { storyId: id });
    const onSuggestion = ({ suggestion: s }) => {
      setSuggestion(stripHtml(s));
      setSuggestionType("continue");
      setAiLoading(false);
      setAiMode("");
    };
    const onError = () => { setAiLoading(false); setAiMode(""); };

    socket.on("connect", onConnect);
    socket.on("story:suggestion", onSuggestion);
    socket.on("story:error", onError);
    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("story:suggestion", onSuggestion);
      socket.off("story:error", onError);
    };
  }, [id]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const saveStory = useCallback(async (
    text      = contentRef.current,
    genreList = genresRef.current
  ) => {
    try {
      setSaveStatus("saving");
      await api.put(`/stories/${id}`, {
        title:   titleRef.current,
        content: text,
        genres:  genreList,
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [id]);

  // ── Content change ────────────────────────────────────────────────────────
  const handleChange = (value) => {
    setContent(value);
    contentRef.current = value;
    setSaveStatus("idle");

    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveStory(value, genresRef.current), 3000);

    clearTimeout(socketDebounceTimer.current);
    socketDebounceTimer.current = setTimeout(() => {
      const socket = getSocket();
      if (socket.connected) socket.emit("story:update", { storyId: id, content: value });
    }, 2000);
  };

  // ── Genre toggle (max 3) ──────────────────────────────────────────────────
  const toggleGenre = (genre) => {
    setGenres((prev) => {
      if (prev.includes(genre)) {
        const updated = prev.filter((g) => g !== genre);
        genresRef.current = updated;
        clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(() => saveStory(contentRef.current, updated), 1000);
        return updated;
      }
      if (prev.length >= MAX_GENRES) return prev;
      const updated = [...prev, genre];
      genresRef.current = updated;
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => saveStory(contentRef.current, updated), 1000);
      return updated;
    });
  };

  // ── Generate continuation ─────────────────────────────────────────────────
  const generateSuggestion = async () => {
    const plainText = toPlain(contentRef.current);
    if (!plainText) {
      setSuggestion("Write something first, then click Generate!");
      setSuggestionType("info");
      return;
    }
    try {
      setAiLoading(true); setAiMode("continue");
      setSuggestion(""); setSuggestionType("");
      const res = await api.post("/ai/suggest", {
        prompt: plainText,
        genres: genresRef.current,
        mode: "continue",
      });
      setSuggestion(stripHtml(res.data.suggestion));
      setSuggestionType("continue");
    } catch {
      setSuggestion("AI failed to generate a suggestion. Try again.");
      setSuggestionType("error");
    } finally {
      setAiLoading(false); setAiMode("");
    }
  };

  // ── Improve writing ───────────────────────────────────────────────────────
  const improveWriting = async () => {
    const plainText = toPlain(contentRef.current);
    if (!plainText) {
      setSuggestion("Write something first before improving!");
      setSuggestionType("info");
      return;
    }
    try {
      setAiLoading(true); setAiMode("grammar");
      setSuggestion(""); setSuggestionType("");
      const res = await api.post("/ai/suggest", {
        prompt: plainText,
        genres: genresRef.current,
        mode: "grammar",
      });
      setSuggestion(stripHtml(res.data.suggestion));
      setSuggestionType("grammar");
    } catch {
      setSuggestion("AI failed to improve writing. Try again.");
      setSuggestionType("error");
    } finally {
      setAiLoading(false); setAiMode("");
    }
  };

  // ── Accept suggestion → append ────────────────────────────────────────────
  const acceptSuggestion = () => {
    if (!suggestion || suggestionType !== "continue") return;
    const appended = contentRef.current + "<p>" + suggestion + "</p>";
    setContent(appended);
    contentRef.current = appended;
    setSuggestion(""); setSuggestionType("");
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveStory(appended, genresRef.current), 1500);
  };

  // ── Apply grammar improvement → replace ──────────────────────────────────
  const applyImprovement = () => {
    if (!suggestion || suggestionType !== "grammar") return;
    const improved = "<p>" + suggestion + "</p>";
    setContent(improved);
    contentRef.current = improved;
    setSuggestion(""); setSuggestionType("");
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveStory(improved, genresRef.current), 1500);
  };

  useEffect(() => () => {
    clearTimeout(autoSaveTimer.current);
    clearTimeout(socketDebounceTimer.current);
  }, []);

  const wordCount    = toPlain(contentRef.current).split(/\s+/).filter(Boolean).length;
  const saveLabel    = { idle: "Save", saving: "Saving…", saved: "✅ Saved!", error: "❌ Failed" }[saveStatus];
  const saveBgColor  = { idle: "#198754", saving: "#6c757d", saved: "#198754", error: "#dc3545" }[saveStatus];
  const hasSuggestion = suggestion && !["error", "info", ""].includes(suggestionType) && suggestion !== "";

  const Spinner = () => (
    <span style={{
      width: "13px", height: "13px",
      border: "2px solid rgba(255,255,255,0.35)",
      borderTopColor: "#fff",
      borderRadius: "50%",
      display: "inline-block",
      animation: "editorSpin 0.65s linear infinite",
      flexShrink: 0,
    }} />
  );

  const aiBtn = (active, bg) => ({
    padding: "9px 20px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: (aiLoading && aiMode !== active) ? "not-allowed" : "pointer",
    border: "none",
    background: bg,
    color: "#fff",
    opacity: (aiLoading && aiMode !== active) ? 0.4 : aiLoading && aiMode === active ? 0.75 : 1,
    transition: "opacity 0.2s",
    display: "flex",
    alignItems: "center",
    gap: "7px",
    whiteSpace: "nowrap",
  });

  return (
    <div style={{ background: "var(--bg-primary)", minHeight: "100vh", padding: "0 0 60px" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "28px 20px 0" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
          <div>
            <h4 style={{ margin: "0 0 4px", color: "var(--text-primary)", fontWeight: 700, lineHeight: 1.3 }}>
              {title || "Untitled Story"}
            </h4>
            <small style={{ color: "var(--text-muted)", fontSize: "12px" }}>
              {wordCount} {wordCount === 1 ? "word" : "words"}
              {saveStatus === "idle" && content !== "" && " · Autosaves after 3s"}
            </small>
          </div>
          <button
            onClick={() => saveStory()}
            disabled={saveStatus === "saving"}
            style={{
              background: saveBgColor,
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "8px 22px",
              fontWeight: 600,
              fontSize: "14px",
              cursor: saveStatus === "saving" ? "not-allowed" : "pointer",
              flexShrink: 0,
              marginLeft: "16px",
            }}
          >
            {saveLabel}
          </button>
        </div>

        {/* ── Genre Selector ── */}
        <div style={{ ...card, padding: "16px 18px", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
            <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>
              🎭 Story Genres
            </span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              {genres.length}/{MAX_GENRES} selected
              {genres.length >= MAX_GENRES && (
                <span style={{ color: "#e67e22", fontWeight: 500 }}> · Max reached</span>
              )}
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
            {ALL_GENRES.map((genre) => {
              const selected = genres.includes(genre);
              const locked   = !selected && genres.length >= MAX_GENRES;
              return (
                <button
                  key={genre}
                  onClick={() => toggleGenre(genre)}
                  disabled={locked}
                  style={{
                    padding: "5px 13px",
                    borderRadius: "18px",
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: locked ? "not-allowed" : "pointer",
                    border: `1.5px solid ${selected ? "transparent" : "var(--genre-unselected-border)"}`,
                    background: selected ? "var(--genre-selected-bg)" : "transparent",
                    color: selected ? "var(--genre-selected-text)" : locked ? "var(--text-muted)" : "var(--genre-unselected-text)",
                    opacity: locked ? 0.35 : 1,
                    transition: "all 0.12s",
                  }}
                >
                  {selected ? `✓ ${genre}` : genre}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Rich Text Editor ── */}
        <div style={{ ...card, overflow: "hidden", marginBottom: "14px" }}>
          <ReactQuill
            theme="snow"
            value={content}
            onChange={handleChange}
            modules={{ toolbar: TOOLBAR }}
            placeholder="Start writing your story…"
            style={{ minHeight: "380px", fontSize: "15px" }}
          />
        </div>

        {/* ── AI Action buttons ── */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
          <button onClick={improveWriting} disabled={aiLoading} style={aiBtn("grammar", "#0f9960")}>
            {aiLoading && aiMode === "grammar" ? <><Spinner /> Improving…</> : "✏️ Improve Writing"}
          </button>
          <button onClick={generateSuggestion} disabled={aiLoading} style={aiBtn("continue", "#6c63ff")}>
            {aiLoading && aiMode === "continue" ? <><Spinner /> Generating…</> : "✨ Generate Suggestion"}
          </button>
        </div>

        {/* ── Suggestion / Improvement box ── */}
        {(suggestion || aiLoading) && (
          <div
            style={{
              ...card,
              borderLeft: `4px solid ${suggestionType === "grammar" ? "#0f9960" : "#6c63ff"}`,
              padding: "18px 20px",
              // Remove left border-radius so it meets the accent line cleanly
              borderTopLeftRadius: "4px",
              borderBottomLeftRadius: "4px",
            }}
          >
            {/* Header row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {suggestionType === "grammar" ? "✏️ Improved Writing" : "✨ AI Suggestion"}
              </span>
              {genres.length > 0 && (
                <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {genres.map((g) => (
                    <span
                      key={g}
                      style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "10px",
                        background: "var(--genre-selected-bg)",
                        color: "var(--genre-selected-text)",
                        fontWeight: 500,
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Content — plain text only, word-wrapped, no HTML leak */}
            <div
              style={{
                background: "var(--suggestion-bg)",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
                padding: "14px 16px",
                fontSize: "15px",
                lineHeight: "1.8",
                color: "var(--text-primary)",
                minHeight: "56px",
                // KEY FIX: allow text to wrap and never overflow
                wordBreak: "break-word",
                overflowWrap: "break-word",
                whiteSpace: "pre-wrap",
                fontStyle: suggestionType === "continue" ? "italic" : "normal",
              }}
            >
              {aiLoading && !suggestion
                ? <span style={{ color: "var(--text-muted)" }}>Thinking…</span>
                : suggestion
              }
            </div>

            {/* Grammar note */}
            {suggestionType === "grammar" && hasSuggestion && (
              <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "8px 0 0" }}>
                ℹ️ Grammar and punctuation fixed. Your voice and story are preserved.
              </p>
            )}

            {/* Action buttons */}
            {hasSuggestion && (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "14px" }}>
                <button
                  onClick={() => { setSuggestion(""); setSuggestionType(""); }}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "7px",
                    fontSize: "13px",
                    fontWeight: 500,
                    border: "1.5px solid var(--border-color)",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  Dismiss
                </button>

                {suggestionType === "continue" && (
                  <button
                    onClick={acceptSuggestion}
                    style={{
                      padding: "6px 16px",
                      borderRadius: "7px",
                      fontSize: "13px",
                      fontWeight: 600,
                      border: "2px solid #6c63ff",
                      background: "transparent",
                      color: "#6c63ff",
                      cursor: "pointer",
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.background = "#6c63ff"; e.currentTarget.style.color = "#fff"; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#6c63ff"; }}
                  >
                    ✅ Accept & Append
                  </button>
                )}

                {suggestionType === "grammar" && (
                  <button
                    onClick={applyImprovement}
                    style={{
                      padding: "6px 16px",
                      borderRadius: "7px",
                      fontSize: "13px",
                      fontWeight: 600,
                      border: "2px solid #0f9960",
                      background: "transparent",
                      color: "#0f9960",
                      cursor: "pointer",
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.background = "#0f9960"; e.currentTarget.style.color = "#fff"; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#0f9960"; }}
                  >
                    ✅ Apply Improvement
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes editorSpin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
