import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

const API_BASE   = "http://localhost:5000/api";
const SOCKET_URL = "http://localhost:5000";
const MAX_GENRES = 3;

const ALL_GENRES = [
  "Fantasy","Science Fiction","Mystery","Romance","Horror",
  "Thriller","Adventure","Historical","Comedy","Drama",
  "Dystopian","Mythology","Crime","Supernatural","Western",
];

const TOOLBAR = [
  [{ header:[1,2,3,false] }],
  ["bold","italic","underline","strike"],
  [{ list:"ordered" },{ list:"bullet" }],
  ["blockquote"],["clean"],
];

const PANEL_ACTIONS = [
  { type:"improve",  label:"✏️ Improve Writing",      color:"#0f9960", desc:"Fix grammar & sharpen prose"      },
  { type:"dialogue", label:"💬 Add Dialogue",          color:"#6c63ff", desc:"Convert to character conversation" },
  { type:"dramatic", label:"🔥 Make it More Dramatic", color:"#e63946", desc:"Heighten tension and emotion"     },
];

const DL_FORMATS = [
  { fmt:"pdf",  icon:"📄", label:"Download as PDF"  },
  { fmt:"docx", icon:"📝", label:"Download as DOCX" },
  { fmt:"txt",  icon:"📋", label:"Download as TXT"  },
];

// ── Axios + Socket ──────────────────────────────────────────────────────────
const api = axios.create({ baseURL: API_BASE });
api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

let _socket = null;
const getSocket = () => {
  if (!_socket) _socket = io(SOCKET_URL, { auth:{ token: localStorage.getItem("token") }, transports:["websocket"] });
  return _socket;
};
const disconnectSocket = () => { if (_socket) { _socket.disconnect(); _socket = null; } };

// ── Helpers ─────────────────────────────────────────────────────────────────
const decodeEntities = (s) => (s||"")
  .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&")
  .replace(/&lt;/gi,"<").replace(/&gt;/gi,">")
  .replace(/&quot;/gi,'"').replace(/&#39;/gi,"'")
  .replace(/&[a-z\d]+;/gi," ");

const toPlain   = (html) => decodeEntities((html||"").replace(/<br\s*\/?>/gi," ").replace(/<[^>]*>/g,"")).replace(/\s+/g," ").trim();
const stripHtml = (s)    => decodeEntities((s||"").replace(/<[^>]*>/g,"")).trim();
const wordCount = (html) => { const t = toPlain(html); return t.length ? t.split(/\s+/).filter(Boolean).length : 0; };

function timeAgo(d) {
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h ago`;
  const dy = Math.floor(h/24);
  return dy < 7 ? `${dy}d ago` : new Date(d).toLocaleDateString();
}

// ── Auth Context ────────────────────────────────────────────────────────────
const AuthContext = createContext();

function AuthProvider({ children }) {
  const [user,     setUser]     = useState(() => { try { return JSON.parse(localStorage.getItem("user")); } catch { return null; } });
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("darkMode") === "true");

  useEffect(() => {
    document.documentElement[darkMode ? "setAttribute" : "removeAttribute"]("data-theme","dark");
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  const login      = (d) => { localStorage.setItem("token",d.token); localStorage.setItem("user",JSON.stringify(d)); setUser(d); };
  const logout     = ()  => { disconnectSocket(); localStorage.removeItem("token"); localStorage.removeItem("user"); setUser(null); };
  const toggleDark = useCallback(() => setDarkMode(x => !x), []);

  return <AuthContext.Provider value={{ user, login, logout, darkMode, toggleDark }}>{children}</AuthContext.Provider>;
}

function PrivateRoute({ children }) {
  const { user } = useContext(AuthContext);
  return (user && localStorage.getItem("token")) ? children : <Navigate to="/login" />;
}

// ── Global CSS ───────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:         #f0f2f5;
    --bg-card:    #ffffff;
    --text:       #1a1d23;
    --text-2:     #5a6270;
    --text-3:     #8a95a3;
    --border:     #d8dce4;
    --nav-bg:     #12122a;
    --input-bg:   #ffffff;
    --input-bd:   #c8cdd5;
    --suggest-bg: #f2f1ff;
    --panel-bg:   #f8f7ff;
    --accent:     #6c63ff;
    --accent2:    #0f9960;
    --danger:     #dc3545;
    --chip-bg:    #1a1a2e;
    --chip-text:  #ffffff;
    --shadow:     0 1px 3px rgba(0,0,0,.07), 0 4px 14px rgba(0,0,0,.06);
    --shadow-h:   0 6px 24px rgba(0,0,0,.13);
    --radius:     12px;
  }
  [data-theme="dark"] {
    --bg:         #0e0e1c;
    --bg-card:    #161630;
    --text:       #e2e8f0;
    --text-2:     #94a3b8;
    --text-3:     #64748b;
    --border:     #2a2d4a;
    --nav-bg:     #09091a;
    --input-bg:   #1c1c38;
    --input-bd:   #2a2d4a;
    --suggest-bg: #1a1a38;
    --panel-bg:   #1a1a38;
    --chip-bg:    #e2e8f0;
    --chip-text:  #0e0e1c;
  }

  html, body, #root { min-height:100vh; font-family:system-ui,-apple-system,"Segoe UI",sans-serif; background:var(--bg); color:var(--text); -webkit-font-smoothing:antialiased; transition:background .22s,color .22s; }
  a { text-decoration:none; color:inherit; }
  button { font-family:inherit; }

  /* ── Navbar ── */
  .ca-nav { position:sticky; top:0; z-index:200; height:56px; background:var(--nav-bg); display:flex; align-items:center; justify-content:space-between; padding:0 24px; border-bottom:1px solid rgba(255,255,255,.07); box-shadow:0 2px 12px rgba(0,0,0,.35); }
  .ca-brand { color:#fff !important; font-weight:700; font-size:15px; background:rgba(108,99,255,.3); border:1px solid rgba(108,99,255,.55); border-radius:8px; padding:5px 13px; display:flex; align-items:center; gap:6px; }
  .ca-nav-btn { color:#fff; font-size:13px; font-weight:500; background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.22); border-radius:7px; padding:5px 14px; cursor:pointer; transition:background .18s; display:inline-flex; align-items:center; gap:5px; }
  .ca-nav-btn:hover  { background:rgba(255,255,255,.2); }
  .ca-nav-btn.danger { background:#dc3545; border-color:#dc3545; }
  .ca-nav-btn.danger:hover { background:#bb2d3b; }

  /* ── Cards / Inputs ── */
  .ca-card { background:var(--bg-card); border:1.5px solid var(--border); border-radius:var(--radius); box-shadow:var(--shadow); }
  .ca-input { background:var(--input-bg); border:1.5px solid var(--input-bd); border-radius:9px; color:var(--text); font-size:14px; padding:9px 13px; outline:none; font-family:inherit; width:100%; transition:border-color .18s; }
  .ca-input:focus { border-color:var(--accent); }
  .ca-input::placeholder { color:var(--text-3); }

  /* ── Buttons ── */
  .ca-btn { border:none; border-radius:8px; font-weight:600; font-size:13px; cursor:pointer; padding:8px 18px; color:#fff; display:inline-flex; align-items:center; gap:6px; transition:opacity .18s,transform .1s; font-family:inherit; }
  .ca-btn:hover:not(:disabled) { opacity:.88; transform:translateY(-1px); }
  .ca-btn:disabled { cursor:not-allowed; opacity:.45; }
  .ca-btn.primary  { background:var(--accent); }
  .ca-btn.success  { background:#198754; }
  .ca-btn.green    { background:var(--accent2); }
  .ca-btn.danger   { background:var(--danger); }
  .ca-btn.ghost    { background:transparent; border:1.5px solid var(--border); color:var(--text-2); }
  .ca-btn.ghost:hover:not(:disabled) { border-color:var(--text-2); opacity:1; transform:none; }
  .ca-btn.outline-accent { background:transparent; border:2px solid var(--accent); color:var(--accent); }
  .ca-btn.outline-accent:hover:not(:disabled) { background:var(--accent); color:#fff; opacity:1; }
  .ca-btn.outline-green  { background:transparent; border:2px solid var(--accent2); color:var(--accent2); }
  .ca-btn.outline-green:hover:not(:disabled)  { background:var(--accent2); color:#fff; opacity:1; }

  /* ── Story card ── */
  .story-card { transition:transform .2s,box-shadow .2s; }
  .story-card:hover { transform:translateY(-4px); box-shadow:var(--shadow-h) !important; }

  /* ── Genre chips/buttons ── */
  .genre-chip { font-size:11px; font-weight:500; padding:3px 10px; border-radius:10px; background:var(--chip-bg); color:var(--chip-text); border:1px solid var(--border); display:inline-block; }
  .genre-btn  { padding:5px 13px; border-radius:18px; font-size:12px; font-weight:500; cursor:pointer; border:1.5px solid var(--border); background:transparent; color:var(--text); transition:all .12s; font-family:inherit; }
  .genre-btn.selected { background:var(--chip-bg); color:var(--chip-text); border-color:transparent; }
  .genre-btn:disabled { opacity:.3; cursor:not-allowed; }

  /* ── Auth ── */
  .auth-wrap  { min-height:100vh; display:flex; align-items:center; justify-content:center; background:var(--bg); }
  .auth-card  { width:100%; max-width:400px; background:var(--bg-card); border:1.5px solid var(--border); border-radius:16px; padding:32px; box-shadow:var(--shadow); }
  .auth-label { display:block; font-size:13px; font-weight:500; color:var(--text-2); margin-bottom:5px; }

  /* ── Editor layout ── */
  .editor-layout { display:grid; grid-template-columns:1fr 300px; gap:20px; align-items:start; max-width:1200px; margin:0 auto; padding:28px 20px 60px; }
  @media (max-width:900px) { .editor-layout { grid-template-columns:1fr; } .editor-sidebar { order:-1; } }

  /* ── Sidebar stack (wraps both panels) ── */
  .sidebar-stack {
    position:sticky; top:76px;
    display:flex; flex-direction:column; gap:14px;
    max-height:calc(100vh - 96px);
    overflow-y:auto;
    scrollbar-width:thin; scrollbar-color:var(--border) transparent;
  }
  .sidebar-stack::-webkit-scrollbar { width:4px; }
  .sidebar-stack::-webkit-scrollbar-track { background:transparent; }
  .sidebar-stack::-webkit-scrollbar-thumb { background:var(--border); border-radius:4px; }

  /* ── AI panel (no longer sticky — parent handles it) ── */
  .ai-panel { background:var(--bg-card); border:1.5px solid var(--border); border-radius:var(--radius); box-shadow:var(--shadow); overflow:hidden; }
  .ai-panel-header { background:linear-gradient(135deg,#6c63ff 0%,#48b1e8 100%); padding:14px 16px; display:flex; align-items:center; gap:8px; }
  .ai-panel-header h3 { color:#fff; font-size:14px; font-weight:700; margin:0; }
  .ai-panel-body { padding:14px 14px 16px; }
  .ai-suggestions-panel { display:flex; flex-direction:column; min-height:0; }
  .ai-suggestions-body {
    max-height:calc(100vh - 180px);
    overflow-y:auto;
    overflow-x:hidden;
    overscroll-behavior:contain;
    scrollbar-width:thin;
    scrollbar-color:var(--border) transparent;
  }
  .ai-suggestions-body::-webkit-scrollbar { width:4px; }
  .ai-suggestions-body::-webkit-scrollbar-track { background:transparent; }
  .ai-suggestions-body::-webkit-scrollbar-thumb { background:var(--border); border-radius:4px; }

  /* Selected text preview */
  .selection-preview { background:var(--panel-bg); border:1.5px solid var(--border); border-radius:8px; padding:10px 12px; font-size:12px; color:var(--text-2); min-height:52px; max-height:160px; overflow-y:auto; margin-bottom:12px; line-height:1.5; word-break:break-word; position:relative; scrollbar-width:thin; scrollbar-color:var(--border) transparent; }
  .selection-preview::-webkit-scrollbar { width:4px; }
  .selection-preview::-webkit-scrollbar-thumb { background:var(--border); border-radius:4px; }
  .selection-preview.has-text { color:var(--text); font-style:italic; }
  .selection-preview .sel-badge { position:absolute; top:-9px; left:10px; background:var(--accent); color:#fff; font-size:10px; font-weight:700; padding:1px 7px; border-radius:6px; letter-spacing:.03em; }

  /* Panel action buttons */
  .panel-action-btn { width:100%; text-align:left; padding:10px 12px; border-radius:9px; border:1.5px solid var(--border); background:var(--bg-card); cursor:pointer; display:flex; align-items:center; gap:10px; margin-bottom:7px; font-family:inherit; transition:border-color .15s,background .15s,transform .1s; color:var(--text); }
  .panel-action-btn:hover:not(:disabled) { border-color:var(--action-color,var(--accent)); background:var(--panel-bg); transform:translateX(2px); }
  .panel-action-btn:disabled { opacity:.4; cursor:not-allowed; }
  .panel-action-btn .btn-icon { font-size:17px; flex-shrink:0; }
  .panel-action-btn .btn-info  { flex:1; }
  .panel-action-btn .btn-label { font-size:13px; font-weight:600; display:block; }
  .panel-action-btn .btn-desc  { font-size:11px; color:var(--text-3); display:block; margin-top:1px; }
  .panel-action-btn.active     { border-color:var(--action-color,var(--accent)); background:var(--panel-bg); }

  .panel-result { background:var(--panel-bg); border:1.5px solid var(--border); border-radius:9px; padding:12px 13px; font-size:13px; line-height:1.7; color:var(--text); word-break:break-word; white-space:pre-wrap; margin-top:10px; max-height:340px; overflow-y:auto; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:var(--border) transparent; }
  .panel-result::-webkit-scrollbar { width:4px; }
  .panel-result::-webkit-scrollbar-thumb { background:var(--border); border-radius:4px; }

  /* ── Download dropdown ── */
  .dl-wrap { position:relative; }
  .dl-menu { position:absolute; top:calc(100% + 6px); right:0; background:var(--bg-card); border:1.5px solid var(--border); border-radius:10px; box-shadow:var(--shadow-h); min-width:172px; z-index:50; overflow:hidden; }
  .dl-item { display:flex; align-items:center; gap:10px; padding:10px 14px; font-size:13px; font-weight:500; color:var(--text); cursor:pointer; border:none; background:transparent; width:100%; text-align:left; font-family:inherit; transition:background .12s; }
  .dl-item:hover:not(:disabled) { background:var(--panel-bg); }
  .dl-item:disabled { opacity:.45; cursor:not-allowed; }
  .dl-item .dl-icon { font-size:15px; width:20px; text-align:center; flex-shrink:0; }
  .dl-divider { border:none; border-top:1px solid var(--border); margin:0; }

  /* ── Scene Inspirations Panel ── */
  .scene-panel { background:var(--bg-card); border:1.5px solid var(--border); border-radius:var(--radius); box-shadow:var(--shadow); }
  .scene-header { background:linear-gradient(135deg,#1a1a2e 0%,#0f3460 100%); padding:14px 16px; display:flex; align-items:center; justify-content:space-between; border-radius:var(--radius) var(--radius) 0 0; }
  .scene-header h3 { color:#fff; font-size:14px; font-weight:700; margin:0; }
  /* scene-body scrolls on its own — no reliance on parent overflow */
  .scene-body { padding:12px; max-height:520px; overflow-y:auto; overflow-x:hidden; scrollbar-width:thin; scrollbar-color:var(--border) transparent; }
  .scene-body::-webkit-scrollbar { width:4px; }
  .scene-body::-webkit-scrollbar-thumb { background:var(--border); border-radius:4px; }
  .scene-tabs { display:flex; gap:6px; margin-bottom:12px; }
  .scene-tab { flex:1; padding:6px 8px; border-radius:7px; font-size:11px; font-weight:600; border:1.5px solid var(--border); cursor:pointer; background:transparent; color:var(--text-2); font-family:inherit; transition:all .15s; text-align:center; }
  .scene-tab.active { background:var(--accent); color:#fff; border-color:var(--accent); }

  /* Image grid */
  .img-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:7px; margin-bottom:10px; }
  /* img-card is an <a> tag — full card is clickable to open image on Pexels */
  .img-card { position:relative; border-radius:8px; overflow:hidden; aspect-ratio:16/9; background:var(--panel-bg); border:1.5px solid var(--border); display:block; cursor:pointer; text-decoration:none; }
  .img-card img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .35s; }
  .img-card:hover img { transform:scale(1.06); }
  /* Overlay always slightly visible; fully opaque on hover */
  .img-overlay { position:absolute; inset:0; background:linear-gradient(to top,rgba(0,0,0,.72) 0%,transparent 55%); padding:5px 7px; display:flex; flex-direction:column; justify-content:flex-end; gap:1px; opacity:.55; transition:opacity .2s; pointer-events:none; }
  .img-card:hover .img-overlay { opacity:1; }
  .img-overlay .img-photo { font-size:9px; color:rgba(255,255,255,.9); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .img-overlay .img-hint  { font-size:8px; color:rgba(255,255,255,.6); }
  /* Source badge — top-right corner shows which API the image came from */
  .img-source-badge {
    position:absolute; top:5px; right:5px;
    font-size:8px; font-weight:700; letter-spacing:.03em;
    padding:2px 5px; border-radius:4px;
    pointer-events:none; z-index:2;
  }
  .img-source-badge.pexels   { background:rgba(5,166,97,.85);  color:#fff; }
  .img-source-badge.unsplash { background:rgba(0,0,0,.72);     color:#fff; border:1px solid rgba(255,255,255,.3); }

  /* Loading skeleton */
  .skeleton { background:var(--panel-bg); border-radius:8px; aspect-ratio:16/9; animation:shimmer 1.5s ease-in-out infinite; border:1.5px solid var(--border); }
  @keyframes shimmer { 0%,100%{opacity:.5} 50%{opacity:1} }

  /* Keyword chips */
  .kw-chips { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:10px; }
  .kw-chip { font-size:10px; padding:2px 8px; border-radius:8px; background:var(--suggest-bg); color:var(--accent); border:1px solid rgba(108,99,255,.2); font-weight:500; }

  /* ── Quill dark mode ── */
  [data-theme="dark"] .ql-toolbar.ql-snow      { background:#1c1c38 !important; border-color:var(--border) !important; }
  [data-theme="dark"] .ql-container.ql-snow    { background:var(--input-bg) !important; border-color:var(--border) !important; }
  [data-theme="dark"] .ql-editor               { color:var(--text) !important; }
  [data-theme="dark"] .ql-editor.ql-blank::before { color:var(--text-3) !important; }
  [data-theme="dark"] .ql-stroke               { stroke:var(--text-2) !important; }
  [data-theme="dark"] .ql-fill                 { fill:var(--text-2) !important; }
  [data-theme="dark"] .ql-picker-label         { color:var(--text-2) !important; }
  [data-theme="dark"] .ql-picker-options       { background:var(--bg-card) !important; border-color:var(--border) !important; }

  /* ── Utilities ── */
  .divider { border:none; border-top:1px solid var(--border); margin:12px 0; }
  .suggestion-text { word-break:break-word; overflow-wrap:break-word; white-space:pre-wrap; line-height:1.8; font-size:15px; color:var(--text); }
  .fade-up { animation:fadeUp .3s ease both; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin   { to{transform:rotate(360deg)} }
  @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:.5} }
  .pulsing { animation:pulse 1.4s ease-in-out infinite; }
`;

// ── Spinner ──────────────────────────────────────────────────────────────────
function Spinner({ size=14, color="rgba(255,255,255,.4)", top="#fff" }) {
  return <span style={{ width:size, height:size, flexShrink:0, border:`2px solid ${color}`, borderTopColor:top, borderRadius:"50%", display:"inline-block", animation:"spin .65s linear infinite" }} />;
}

// ── Download Button ──────────────────────────────────────────────────────────
// ── Download Button — fully client-side, no backend needed ──────────────────
// Uses dynamic import so jspdf/docx only load when user clicks download.
// Fixes: responseType:blob error, missing backend packages, route issues.
function DownloadButton({ title, content, genres, storyMeta }) {
  const [open,        setOpen]       = useState(false);
  const [downloading, setDownloading] = useState("");
  const [dlError,     setDlError]    = useState("");
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // Shared helpers
  const plain    = toPlain(content);
  const filename = (title || "story").replace(/[^\w\s-]/g, "").replace(/\s+/g, "_").slice(0, 80) || "story";
  const genreStr = genres?.length ? genres.join(", ") : "None";
  const dateStr  = storyMeta?.updatedAt
    ? new Date(storyMeta.updatedAt).toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" })
    : new Date().toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" });

  const triggerDownload = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement("a"), { href:url, download:name });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 200);
  };

  const download = async (fmt) => {
    setDownloading(fmt);
    setDlError("");
    try {

      // ── TXT — pure browser Blob, zero dependencies ──────────────────────
      if (fmt === "txt") {
        const text = [
          title || "Untitled Story",
          "═".repeat((title || "Untitled Story").length),
          "",
          `Genres:       ${genreStr}`,
          `Last Updated: ${dateStr}`,
          "",
          "─".repeat(60),
          "",
          plain,
        ].join("\n");
        triggerDownload(new Blob([text], { type:"text/plain;charset=utf-8" }), `${filename}.txt`);
      }

      // ── PDF — dynamic import of jspdf ────────────────────────────────────
      else if (fmt === "pdf") {
        const { jsPDF } = await import("jspdf");
        const doc   = new jsPDF({ unit:"mm", format:"a4" });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const mg    = 18;
        const maxW  = pageW - mg * 2;
        let y       = 24;

        // Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.setTextColor(26, 29, 35);
        const titleLines = doc.splitTextToSize(title || "Untitled Story", maxW);
        doc.text(titleLines, pageW / 2, y, { align:"center" });
        y += titleLines.length * 9 + 5;

        // Meta
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(138, 149, 163);
        doc.text(`Genres: ${genreStr}   ·   Updated: ${dateStr}`, pageW / 2, y, { align:"center" });
        y += 7;

        // Rule
        doc.setDrawColor(216, 220, 228);
        doc.setLineWidth(0.25);
        doc.line(mg, y, pageW - mg, y);
        y += 9;

        // Body
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(26, 29, 35);
        for (const para of plain.split(/\n\n+/).filter(Boolean)) {
          const lines  = doc.splitTextToSize(para.trim(), maxW);
          const blockH = lines.length * 5.6;
          if (y + blockH > pageH - mg) { doc.addPage(); y = mg; }
          doc.text(lines, mg, y);
          y += blockH + 4;
        }

        doc.save(`${filename}.pdf`);
      }

      // ── DOCX — dynamic import of docx package ────────────────────────────
      else if (fmt === "docx") {
        const { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } = await import("docx");
        const paras = plain.split(/\n\n+/).filter(Boolean).map(p =>
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing:   { before:120, after:120, line:300 },
            children:  [new TextRun({ text:p.trim(), size:24, font:"Calibri" })],
          })
        );
        const docx = new Document({
          sections: [{
            properties: { page:{ margin:{ top:1440, right:1134, bottom:1134, left:1134 } } },
            children: [
              new Paragraph({ alignment:AlignmentType.CENTER, spacing:{ after:160 },
                children:[new TextRun({ text:title||"Untitled Story", bold:true, size:52, font:"Calibri", color:"1a1d23" })] }),
              new Paragraph({ alignment:AlignmentType.CENTER, spacing:{ after:40 },
                children:[new TextRun({ text:`Genres: ${genreStr}`, size:20, font:"Calibri", color:"8a95a3" })] }),
              new Paragraph({ alignment:AlignmentType.CENTER, spacing:{ after:320 },
                border:{ bottom:{ style:BorderStyle.SINGLE, size:4, color:"d8dce4", space:12 } },
                children:[new TextRun({ text:`Updated: ${dateStr}`, size:18, font:"Calibri", color:"8a95a3" })] }),
              ...paras,
            ],
          }],
        });
        // Packer.toBlob works in the browser (unlike toBuffer which is Node-only)
        const blob = await Packer.toBlob(docx);
        triggerDownload(blob, `${filename}.docx`);
      }

      setOpen(false);
    } catch (err) {
      console.error("Download error:", err);
      setDlError(err?.message?.slice(0, 120) || "Download failed. Check console for details.");
    } finally {
      setDownloading("");
    }
  };

  return (
    <div className="dl-wrap" ref={wrapRef}>
      <button
        className="ca-btn ghost"
        style={{ fontSize:13, padding:"7px 14px" }}
        onClick={() => { setOpen(o => !o); setDlError(""); }}
        disabled={!!downloading}
        title="Download story"
      >
        {downloading ? <><Spinner size={12} color="var(--text-3)" top="var(--accent)" /> Downloading…</> : "⬇ Download ▾"}
      </button>

      {open && (
        <div className="dl-menu">
          {DL_FORMATS.map((f, i) => (
            <div key={f.fmt}>
              {i > 0 && <hr className="dl-divider" />}
              <button
                className="dl-item"
                disabled={!!downloading}
                onClick={() => download(f.fmt)}
              >
                {downloading === f.fmt
                  ? <><Spinner size={13} color="var(--border)" top="var(--accent)" /><span>Generating…</span></>
                  : <><span className="dl-icon">{f.icon}</span><span>{f.label}</span></>
                }
              </button>
            </div>
          ))}
          {dlError && (
            <p style={{ fontSize:11, color:"var(--danger)", padding:"6px 14px 10px", margin:0 }}>⚠ {dlError}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Navbar ───────────────────────────────────────────────────────────────────
function Navbar() {
  const { user, logout, darkMode, toggleDark } = useContext(AuthContext);
  const navigate = useNavigate();
  return (
    <nav className="ca-nav">
      <Link to="/" className="ca-brand">✍️ Co-Author AI</Link>
      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
        <button className="ca-nav-btn" onClick={toggleDark}>{darkMode ? "☀️ Light" : "🌙 Dark"}</button>
        {user ? (
          <><Link to="/" className="ca-nav-btn">Dashboard</Link><button className="ca-nav-btn danger" onClick={() => { logout(); navigate("/login"); }}>Logout</button></>
        ) : (
          <><Link to="/login" className="ca-nav-btn">Login</Link><Link to="/register" className="ca-nav-btn" style={{ background:"var(--accent)", borderColor:"var(--accent)" }}>Register</Link></>
        )}
      </div>
    </nav>
  );
}

// ── Story Card ────────────────────────────────────────────────────────────────
function StoryCard({ story, onDelete, onInvite }) {
  const wc = wordCount(story.content);
  const isOwner = story.role !== "collaborator";
  return (
    <div className="ca-card story-card" style={{ padding:18 }}>
      <div style={{ display:"flex", justifyContent:"space-between", gap:8, alignItems:"flex-start", marginBottom:6 }}>
        <p style={{ fontWeight:600, fontSize:15, color:"var(--text)", margin:0, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{story.title}</p>
        <span className="genre-chip" style={{ flexShrink:0, fontSize:10 }}>{isOwner ? "Owner" : "Shared"}</span>
      </div>
      {story.genres?.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:8 }}>
          {story.genres.map(g => <span key={g} className="genre-chip">{g}</span>)}
        </div>
      )}
      <div style={{ fontSize:12, color:"var(--text-3)", display:"flex", gap:12 }}>
        <span>📝 {wc} {wc===1?"word":"words"}</span>
        <span>🕐 {timeAgo(story.updatedAt)}</span>
      </div>
      <hr className="divider" />
      <div style={{ display:"flex", gap:8 }}>
        <Link to={`/editor/${story._id}`} className="ca-btn primary" style={{ flex:1, justifyContent:"center" }}>Open Editor</Link>
        {isOwner && <button className="ca-btn ghost" style={{ padding:"8px 13px" }} title="Invite collaborator" onClick={() => onInvite(story)}>Invite</button>}
        {isOwner && <button className="ca-btn danger" style={{ padding:"8px 13px" }} title="Delete" onClick={() => onDelete(story._id)}>🗑</button>}
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard() {
  const [stories, setStories]   = useState([]);
  const [invites, setInvites]   = useState([]);
  const [title,   setTitle]     = useState("");
  const [search,  setSearch]    = useState("");
  const [loading, setLoading]   = useState(true);
  const [creating,setCreating]  = useState(false);
  const [error,   setError]     = useState("");
  const [notice,  setNotice]    = useState("");

  const fetchStories = async () => {
    const r = await api.get("/stories");
    setStories(r.data);
  };

  const fetchInvites = async () => {
    const r = await api.get("/stories/invites/mine");
    setInvites(r.data);
  };

  useEffect(() => {
    Promise.all([fetchStories(), fetchInvites()])
      .catch(() => setError("Failed to load dashboard."))
      .finally(() => setLoading(false));
  }, []);

  const createStory = async () => {
    if (!title.trim()) return setError("Please enter a story title.");
    setCreating(true); setError("");
    try { const r = await api.post("/stories",{ title:title.trim() }); setStories(p => [r.data,...p]); setTitle(""); }
    catch { setError("Failed to create story."); }
    finally { setCreating(false); }
  };

  const inviteCollaborator = async (story) => {
    const email = window.prompt(`Invite a collaborator to "${story.title}" by email:`);
    if (!email) return;
    setError(""); setNotice("");
    try {
      await api.post(`/stories/${story._id}/invites`, { email });
      setNotice(`Invite sent to ${email.trim().toLowerCase()}.`);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to send invite.");
    }
  };

  const respondToInvite = async (storyId, action) => {
    setError(""); setNotice("");
    try {
      await api.post(`/stories/${storyId}/invites/respond`, { action });
      await Promise.all([fetchStories(), fetchInvites()]);
      setNotice(action === "accept" ? "Invite accepted." : "Invite declined.");
    } catch {
      setError("Failed to update invite.");
    }
  };

  const deleteStory = async (id) => {
    if (!window.confirm("Delete this story? This cannot be undone.")) return;
    try { await api.delete(`/stories/${id}`); setStories(p => p.filter(s => s._id !== id)); }
    catch { setError("Failed to delete story."); }
  };

  const filtered = stories.filter(s => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return s.title.toLowerCase().includes(q) || s.genres?.some(g => g.toLowerCase().includes(q));
  });

  return (
    <div style={{ maxWidth:960, margin:"0 auto", padding:"32px 20px 60px" }}>
      <div className="ca-card" style={{ padding:24, marginBottom:28 }}>
        <p style={{ fontWeight:700, fontSize:17, color:"var(--text)", marginBottom:14 }}>✨ New Story</p>
        <div style={{ display:"flex", gap:10 }}>
          <input className="ca-input" placeholder="Enter a story title…" value={title} disabled={creating} onChange={e => { setTitle(e.target.value); setError(""); }} onKeyDown={e => e.key==="Enter" && createStory()} />
          <button className="ca-btn primary" style={{ whiteSpace:"nowrap", padding:"8px 22px" }} onClick={createStory} disabled={creating}>
            {creating ? <><Spinner /> Creating…</> : "+ Create"}
          </button>
        </div>
        {error && <p style={{ color:"var(--danger)", fontSize:13, marginTop:8 }}>{error}</p>}
        {notice && <p style={{ color:"var(--accent2)", fontSize:13, marginTop:8 }}>{notice}</p>}
      </div>

      {invites.length > 0 && (
        <div className="ca-card" style={{ padding:20, marginBottom:24 }}>
          <p style={{ fontWeight:700, fontSize:15, color:"var(--text)", marginBottom:12 }}>Pending Invites</p>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {invites.map(invite => (
              <div key={invite._id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, border:"1px solid var(--border)", borderRadius:8, padding:"10px 12px", flexWrap:"wrap" }}>
                <div>
                  <p style={{ fontWeight:600, color:"var(--text)", marginBottom:3 }}>{invite.title}</p>
                  <p style={{ fontSize:12, color:"var(--text-3)" }}>Invited by {invite.owner?.name || invite.owner?.email || "the owner"}</p>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button className="ca-btn success" onClick={() => respondToInvite(invite.storyId, "accept")}>Accept</button>
                  <button className="ca-btn ghost" onClick={() => respondToInvite(invite.storyId, "decline")}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, flexWrap:"wrap", gap:10 }}>
        <p style={{ fontWeight:700, fontSize:17, color:"var(--text)" }}>
          Your Stories
          {!loading && <span style={{ fontWeight:400, fontSize:13, color:"var(--text-3)", marginLeft:8 }}>{filtered.length} {filtered.length===1?"story":"stories"}</span>}
        </p>
        <div style={{ position:"relative" }}>
          <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--text-3)", pointerEvents:"none" }}>🔍</span>
          <input className="ca-input" style={{ paddingLeft:32, width:220 }} placeholder="Search stories or genres…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div style={{ display:"flex", justifyContent:"center", padding:"60px 0" }}><Spinner size={36} color="var(--border)" top="var(--accent)" /></div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:"center", padding:"60px 0", color:"var(--text-3)" }}>
          <div style={{ fontSize:36, marginBottom:12 }}>{search ? "🔍" : "📖"}</div>
          <p>{search ? `No stories match "${search}"` : "No stories yet. Create your first one above!"}</p>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:16 }}>
          {filtered.map((s,i) => (
            <div key={s._id} className="fade-up" style={{ animationDelay:`${i*0.06}s` }}>
              <StoryCard story={s} onDelete={deleteStory} onInvite={inviteCollaborator} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── AI Suggestions Panel ──────────────────────────────────────────────────────
function AISuggestionsPanel({ selectedText, selectionRange, quillRef, contentRef, setContent, saveTimer, saveStory, genresRef }) {
  const [panelLoading, setPanelLoading] = useState(false);
  const [activeAction, setActiveAction] = useState("");
  const [result,       setResult]       = useState("");
  const [resultFor,    setResultFor]    = useState("");

  const runAction = async (type) => {
    const quill = quillRef.current?.getEditor();
    const selectedFromRange = quill && selectionRange?.length > 0
      ? quill.getText(selectionRange.index, selectionRange.length).trim()
      : "";
    const text = selectedText.trim() || selectedFromRange || toPlain(contentRef.current);
    if (!text) return;
    setPanelLoading(true); setActiveAction(type); setResult(""); setResultFor("");
    try {
      const r = await api.post("/ai/transform",{ text, type }, { timeout:45000 });
      const cleaned = stripHtml(r.data.result);
      setResult(cleaned || "AI returned an empty result. Try again.");
      setResultFor(cleaned ? type : "error");
    } catch (err) {
      const serverMsg = err?.response?.data?.message;
      const status    = err?.response?.status;
      const msg = err?.code === "ECONNABORTED"
        ? "AI request timed out. Check the backend terminal, then try again."
        : status === 404
          ? "Route not found — restart your backend."
          : serverMsg || "AI service error.";
      setResult(msg); setResultFor("error");
    } finally { setPanelLoading(false); setActiveAction(""); }
  };

  const applyReplace = () => {
    if (!result || resultFor === "error") return;
    const quill = quillRef.current?.getEditor();
    if (quill && selectionRange?.length > 0) {
      quill.deleteText(selectionRange.index, selectionRange.length);
      quill.insertText(selectionRange.index, result);
      const newHtml = quill.root.innerHTML;
      setContent(newHtml); contentRef.current = newHtml;
      clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => saveStory(newHtml, genresRef.current), 1500);
    }
    setResult(""); setResultFor("");
  };

  const applyAppend = () => {
    if (!result || resultFor === "error") return;
    const newHtml = contentRef.current + "<p>" + result + "</p>";
    setContent(newHtml); contentRef.current = newHtml;
    clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => saveStory(newHtml, genresRef.current), 1500);
    setResult(""); setResultFor("");
  };

  const hasResult = result && resultFor !== "error";
  const hasPanelInput = Boolean(selectedText.trim() || toPlain(contentRef.current));
  const usingSelection = Boolean(selectedText.trim());

  return (
    <div className="ai-panel ai-suggestions-panel">
      <div className="ai-panel-header"><span>🤖</span><h3>AI Suggestions</h3></div>
      <div className="ai-panel-body ai-suggestions-body">
        <p style={{ fontSize:11, color:"var(--text-3)", marginBottom:10, lineHeight:1.5 }}>Select text to transform a passage, or use the buttons on the full story.</p>

        <div className={`selection-preview${usingSelection ? " has-text" : ""}`}>
          {usingSelection && <span className="sel-badge">SELECTED</span>}
          {usingSelection ? (selectedText.length > 160 ? selectedText.slice(0,160)+"…" : selectedText) : <span style={{ color:"var(--text-3)" }}>No selection - actions will use the whole story.</span>}
        </div>

        {PANEL_ACTIONS.map(action => (
          <button key={action.type} className={`panel-action-btn${activeAction===action.type?" active":""}`}
            style={{ "--action-color":action.color }} disabled={!hasPanelInput || panelLoading}
            onMouseDown={(e) => e.preventDefault()} onClick={() => runAction(action.type)}>
            {panelLoading && activeAction===action.type ? <Spinner size={16} color="rgba(0,0,0,.15)" top={action.color} /> : <span className="btn-icon">{action.label.split(" ")[0]}</span>}
            <span className="btn-info">
              <span className="btn-label" style={{ color:action.color }}>{action.label.split(" ").slice(1).join(" ")}</span>
              <span className="btn-desc">{action.desc}</span>
            </span>
          </button>
        ))}

        {panelLoading && <p className="pulsing" style={{ fontSize:12, color:"var(--text-3)", textAlign:"center", marginTop:8 }}>Generating…</p>}

        {result && (
          <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:12, marginBottom:4 }}>
              <span style={{ fontSize:11, fontWeight:700, color:resultFor==="error"?"var(--danger)":"var(--text-3)", textTransform:"uppercase", letterSpacing:".06em" }}>
                {resultFor === "error" ? "⚠️ Error" : "Result"}
              </span>
              <button style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, color:"var(--text-3)", padding:0 }} onClick={() => { setResult(""); setResultFor(""); }}>✕</button>
            </div>
            <div className="panel-result" style={{ borderColor:resultFor==="error"?"var(--danger)":"var(--border)", color:resultFor==="error"?"var(--danger)":"var(--text)" }}>{result}</div>
            {resultFor === "error" && <p style={{ fontSize:11, color:"var(--text-3)", marginTop:6, lineHeight:1.5 }}>ℹ️ Make sure your backend is running and restarted.</p>}
            {hasResult && (
              <div style={{ display:"flex", flexDirection:"column", gap:7, marginTop:10 }}>
                {usingSelection && selectionRange?.length > 0 && <button className="ca-btn outline-accent" style={{ width:"100%", justifyContent:"center", fontSize:12, padding:"7px" }} onClick={applyReplace}>🔄 Replace Selection</button>}
                <button className="ca-btn outline-green" style={{ width:"100%", justifyContent:"center", fontSize:12, padding:"7px" }} onClick={applyAppend}>➕ Append to Story</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CollaboratorsPanel({ owner, collaborators = [], activeUsers = [] }) {
  const [open, setOpen] = useState(false);
  const activeIds = new Set(activeUsers.map(u => u._id));
  const people = [
    owner && { ...owner, role: "Owner" },
    ...collaborators.map(user => ({ ...user, role: "Collaborator" }))
  ].filter(Boolean);
  const activeCount = people.filter(person => activeIds.has(person._id?.toString())).length;

  return (
    <div className="ai-panel" style={{ overflow:"visible" }}>
      <button
        type="button"
        className="ai-panel-header"
        onClick={() => setOpen(x => !x)}
        style={{
          width:"100%",
          border:"none",
          cursor:"pointer",
          background:"linear-gradient(135deg,#0f9960 0%,#48b1e8 100%)",
          justifyContent:"space-between"
        }}
      >
        <h3>Collaborators</h3>
        <span style={{ color:"#fff", fontSize:12, fontWeight:700 }}>
          {activeCount}/{people.length} active {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div className="ai-panel-body" style={{ maxHeight:220, overflowY:"auto" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {people.length === 0 ? (
              <p style={{ fontSize:12, color:"var(--text-3)", margin:0 }}>No collaborators yet.</p>
            ) : people.map(person => {
              const id = person._id?.toString();
              const isActive = activeIds.has(id);
              return (
                <div key={`${person.role}-${id || person.email}`} style={{ display:"flex", alignItems:"center", gap:10, border:"1px solid var(--border)", borderRadius:8, padding:"9px 10px" }}>
                  <span style={{ width:9, height:9, borderRadius:"50%", background:isActive ? "var(--accent2)" : "var(--text-3)", flexShrink:0 }} />
                  <div style={{ minWidth:0, flex:1 }}>
                    <p style={{ color:"var(--text)", fontSize:13, fontWeight:600, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {person.name || person.email}
                    </p>
                    <p style={{ color:"var(--text-3)", fontSize:11, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {person.role} · {isActive ? "Active now" : "Offline"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Scene Inspirations Panel ──────────────────────────────────────────────────
function SceneInspirationsPanel({ content, genres }) {
  const [activeTab, setActiveTab] = useState("scenes");
  const [images,    setImages]    = useState([]);
  const [keywords,  setKeywords]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);

  // tabRef prevents stale closure — always holds the CURRENT tab value
  // so async callbacks after fetch always use the right endpoint
  const tabRef = useRef("scenes");
  const pageRef = useRef({ scenes:1, cover:1 });

  const plainText  = toPlain(content);
  const hasContent = plainText.length > 30;

  // fetchImages always reads tabRef.current — never stale
  const fetchImages = useCallback(async ({ more=false } = {}) => {
    const tab = tabRef.current;
    if (!hasContent) return;
    const nextPage = more ? pageRef.current[tab] + 1 : 1;
    pageRef.current[tab] = nextPage;
    setLoading(true); setError(""); setImages([]); setKeywords([]);
    try {
      const endpoint = tab === "cover" ? "/images/cover" : "/images/scenes";
      const r = await api.post(endpoint, {
        text: toPlain(content).slice(0, 3000),
        genres,
        page: nextPage,
      });
      // Guard: only apply if tab hasn't changed mid-flight
      if (tabRef.current === tab) {
        setImages(r.data.images || []);
        setKeywords(r.data.keywords || []);
        setHasLoaded(true);
      }
    } catch (err) {
      if (tabRef.current === tab) {
        const msg = err?.response?.data?.message
          || "Failed to fetch images. Check your PEXELS_API_KEY in .env.";
        setError(msg);
      }
    } finally {
      if (tabRef.current === tab) setLoading(false);
    }
  }, [content, genres, hasContent]);

  // switchTab: update ref FIRST (sync), then state, then fetch
  const switchTab = (tab) => {
    tabRef.current = tab;   // update ref synchronously before fetch
    setActiveTab(tab);      // update UI
    setImages([]);          // clear old images immediately
    setKeywords([]);
    setHasLoaded(false);
    pageRef.current[tab] = 1;
    // always fetch when switching, regardless of hasLoaded
    setTimeout(() => fetchImages(), 0);
  };

  return (
    <div className="scene-panel">
      {/* Header — ↻ More uses tabRef so it's never stale */}
      <div className="scene-header">
        <h3>🎬 Scene Inspirations</h3>
        {hasLoaded && !loading && (
          <button
            onClick={() => fetchImages({ more:true })}
            style={{ background:"rgba(255,255,255,.15)", border:"1px solid rgba(255,255,255,.25)", borderRadius:6, color:"#fff", fontSize:11, fontWeight:600, padding:"3px 9px", cursor:"pointer" }}
          >
            ↻ More
          </button>
        )}
      </div>

      {/* scene-body scrolls on its own (max-height + overflow-y in CSS) */}
      <div className="scene-body">

        {/* Tabs */}
        <div className="scene-tabs">
          <button className={`scene-tab${activeTab==="scenes"?" active":""}`} onClick={() => switchTab("scenes")}>🏞 Scenes</button>
          <button className={`scene-tab${activeTab==="cover" ?" active":""}`} onClick={() => switchTab("cover")}>🎨 Cover</button>
        </div>

        {/* Extracted keywords */}
        {keywords.length > 0 && (
          <div className="kw-chips" style={{ marginBottom:10 }}>
            {keywords.map((k,i) => <span key={i} className="kw-chip">#{k}</span>)}
          </div>
        )}

        {/* First-load prompt */}
        {!hasLoaded && !loading && !error && (
          <div style={{ textAlign:"center", padding:"14px 0" }}>
            <p style={{ fontSize:12, color:"var(--text-3)", marginBottom:10, lineHeight:1.5 }}>
              {hasContent
                ? "Analyze your story to find matching images."
                : "Write at least a sentence to get started."}
            </p>
            <button
              className="ca-btn primary"
              style={{ fontSize:12, padding:"8px 16px", width:"100%", justifyContent:"center" }}
              onClick={() => fetchImages()}
              disabled={!hasContent}
            >
              🔍 Analyze Story
            </button>
          </div>
        )}

        {/* Loading skeletons — 6 placeholder cards */}
        {loading && (
          <div className="img-grid">
            {[...Array(6)].map((_,i) => (
              <div key={i} className="skeleton" style={{ animationDelay:`${i*0.1}s` }} />
            ))}
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div style={{ background:"rgba(220,53,69,.08)", border:"1px solid rgba(220,53,69,.25)", borderRadius:8, padding:"10px 12px", marginBottom:8 }}>
            <p style={{ fontSize:12, color:"var(--danger)", lineHeight:1.5, margin:0 }}>⚠ {error}</p>
          </div>
        )}

        {/* Image grid — each card is an <a> that opens the photo on its source platform */}
        {!loading && images.length > 0 && (
          <div className="img-grid">
            {images.map(img => (
              <a
                key={img.id}
                className="img-card"
                href={img.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`View on ${img.source === 'unsplash' ? 'Unsplash' : 'Pexels'} — ${img.alt || "Photo"}`}
              >
                <img src={img.thumb} alt={img.alt} loading="lazy" />
                {/* Source badge — top-right corner */}
                <span className={`img-source-badge ${img.source || 'pexels'}`}>
                  {img.source === 'unsplash' ? 'Unsplash' : 'Pexels'}
                </span>
                <div className="img-overlay">
                  <span className="img-photo">📷 {img.photographer}</span>
                  <span className="img-hint">
                    View on {img.source === 'unsplash' ? 'Unsplash' : 'Pexels'} ↗
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}

        <p style={{ fontSize:9, color:"var(--text-3)", marginTop:10, textAlign:"center" }}>
          Photos from{" "}
          <a href="https://pexels.com" target="_blank" rel="noopener noreferrer" style={{ color:"#05a661" }}>Pexels</a>
          {" & "}
          <a href="https://unsplash.com" target="_blank" rel="noopener noreferrer" style={{ color:"var(--accent)" }}>Unsplash</a>
        </p>
      </div>
    </div>
  );
}

// ── Editor ────────────────────────────────────────────────────────────────────
function Editor() {
  const { id } = useParams();
  const { user } = useContext(AuthContext);
  const [content,    setContent]    = useState("");
  const [title,      setTitle]      = useState("");
  const [genres,     setGenres]     = useState([]);
  const [suggestion, setSuggestion] = useState("");
  const [suggType,   setSuggType]   = useState("");
  const [saveStatus, setSaveStatus] = useState("idle");
  const [aiLoading,  setAiLoading]  = useState(false);
  const [aiMode,     setAiMode]     = useState("");
  const [plotLoading,setPlotLoading]= useState(false);
  const [plotCheck,  setPlotCheck]  = useState(null);
  const [listening,  setListening]  = useState(false);
  const [transcribing,setTranscribing] = useState(false);
  const [speechMsg,  setSpeechMsg]  = useState("");

  const [selectedText,   setSelectedText]   = useState("");
  const [selectionRange, setSelectionRange] = useState(null);
  const [storyMeta,      setStoryMeta]      = useState({ createdAt:null, updatedAt:null, role:"owner", owner:null, collaborators:[] });
  const [activeUsers,    setActiveUsers]    = useState([]);
  const [inviteMsg,      setInviteMsg]      = useState("");

  const saveTimer  = useRef(null);
  const sockTimer  = useRef(null);
  const contentRef = useRef("");
  const genresRef  = useRef([]);
  const titleRef   = useRef("");
  const quillRef   = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    api.get(`/stories/${id}`).then(r => {
      setContent(r.data.content||""); setTitle(r.data.title||""); setGenres(r.data.genres||[]);
      contentRef.current = r.data.content||""; genresRef.current = r.data.genres||[]; titleRef.current = r.data.title||"";
      setStoryMeta({
        createdAt: r.data.createdAt,
        updatedAt: r.data.updatedAt,
        role: r.data.role || "owner",
        owner: r.data.owner || null,
        collaborators: r.data.collaborators || []
      });
    });
  }, [id]);

  useEffect(() => { titleRef.current = title; }, [title]);

  useEffect(() => {
    const sock = getSocket();
    const onConn = () => sock.emit("story:join",{ storyId:id });
    const onSugg = ({ suggestion:s }) => { setSuggestion(stripHtml(s)); setSuggType("continue"); setAiLoading(false); setAiMode(""); };
    const onRemoteUpdate = ({ content:remoteContent }) => {
      setContent(remoteContent || "");
      contentRef.current = remoteContent || "";
    };
    const onPresence = ({ storyId, users }) => {
      if (storyId === id) setActiveUsers(users || []);
    };
    const onErr  = () => { setAiLoading(false); setAiMode(""); };
    sock.on("connect",onConn);
    sock.on("story:suggestion",onSugg);
    sock.on("story:updatedFromServer",onRemoteUpdate);
    sock.on("story:presence",onPresence);
    sock.on("story:error",onErr);
    if (sock.connected) onConn();
    return () => {
      sock.off("connect",onConn);
      sock.off("story:suggestion",onSugg);
      sock.off("story:updatedFromServer",onRemoteUpdate);
      sock.off("story:presence",onPresence);
      sock.off("story:error",onErr);
    };
  }, [id]);

  const saveStory = useCallback(async (text=contentRef.current, gl=genresRef.current) => {
    setSaveStatus("saving");
    try { await api.put(`/stories/${id}`,{ title:titleRef.current, content:text, genres:gl }); setSaveStatus("saved"); setTimeout(() => setSaveStatus("idle"),2000); }
    catch { setSaveStatus("error"); setTimeout(() => setSaveStatus("idle"),3000); }
  }, [id]);

  const handleChange = useCallback((val) => {
    setContent(val); contentRef.current = val; setSaveStatus("idle");
    clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => saveStory(val, genresRef.current), 3000);
    clearTimeout(sockTimer.current); sockTimer.current = setTimeout(() => { const s=getSocket(); if(s.connected) s.emit("story:update",{storyId:id,content:val}); }, 2000);
  }, [id, saveStory]);

  const appendNarration = useCallback((text) => {
    const clean = text.trim();
    if (!clean) return;
    const next = `${contentRef.current || ""}<p>${clean}</p>`;
    handleChange(next);
  }, [handleChange]);

  const startNarration = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setSpeechMsg("Audio recording is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        setListening(false);
        setTranscribing(true);
        setSpeechMsg("Transcribing narration...");
        mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;

        try {
          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
          if (!blob.size) {
            setSpeechMsg("No audio was recorded. Check your microphone.");
            return;
          }

          const r = await api.post("/ai/transcribe", blob, {
            headers: { "Content-Type": blob.type || "audio/webm" },
          });

          const text = r.data.text || "";
          if (!text.trim()) {
            setSpeechMsg("No speech was detected. Try speaking closer to the microphone.");
            return;
          }

          appendNarration(text);
          setSpeechMsg("Narration transcribed and added to story.");
        } catch (err) {
          setSpeechMsg(err?.response?.data?.message || "Failed to transcribe narration.");
        } finally {
          setTranscribing(false);
          mediaRecorderRef.current = null;
          audioChunksRef.current = [];
        }
      };

      recorder.start();
      setListening(true);
      setSpeechMsg("Recording... click Stop Narration to transcribe.");
    } catch {
      setSpeechMsg("Microphone permission was denied or unavailable.");
    }
  };

  const stopNarration = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setListening(false);
  };

  const syncEditorSelection = useCallback((rangeOverride) => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    if (rangeOverride === null) return;

    const range = rangeOverride === undefined ? quill.getSelection() : rangeOverride;
    if (!range) return;

    if (range.length === 0) {
      setSelectedText("");
      setSelectionRange(null);
      return;
    }

    setSelectedText(quill.getText(range.index, range.length).trim());
    setSelectionRange(range);
  }, []);

  const handleSelectionChange = useCallback((range) => {
    syncEditorSelection(range);
  }, [syncEditorSelection]);

  useEffect(() => {
    const editorRoot = quillRef.current?.getEditor()?.root;
    if (!editorRoot) return;

    const refreshSoon = () => setTimeout(() => syncEditorSelection(), 0);
    editorRoot.addEventListener("mouseup", refreshSoon);
    editorRoot.addEventListener("keyup", refreshSoon);
    document.addEventListener("selectionchange", refreshSoon);

    return () => {
      editorRoot.removeEventListener("mouseup", refreshSoon);
      editorRoot.removeEventListener("keyup", refreshSoon);
      document.removeEventListener("selectionchange", refreshSoon);
    };
  }, [syncEditorSelection]);

  const toggleGenre = (g) => {
    setGenres(prev => {
      if (prev.includes(g)) { const u=prev.filter(x=>x!==g); genresRef.current=u; clearTimeout(saveTimer.current); saveTimer.current=setTimeout(()=>saveStory(contentRef.current,u),1000); return u; }
      if (prev.length >= MAX_GENRES) return prev;
      const u=[...prev,g]; genresRef.current=u; clearTimeout(saveTimer.current); saveTimer.current=setTimeout(()=>saveStory(contentRef.current,u),1000); return u;
    });
  };

  const callAI = async (mode) => {
    const plain = toPlain(contentRef.current);
    if (!plain) { setSuggestion(mode==="grammar"?"Write something first!":"Write something first, then click Generate!"); setSuggType("info"); return; }
    setAiLoading(true); setAiMode(mode); setSuggestion(""); setSuggType("");
    try { const r = await api.post("/ai/suggest",{ prompt:plain, genres:genresRef.current, mode }); setSuggestion(stripHtml(r.data.suggestion)); setSuggType(mode); }
    catch { setSuggestion("AI failed. Try again."); setSuggType("error"); }
    finally { setAiLoading(false); setAiMode(""); }
  };

  const runPlotCheck = async () => {
    const plain = toPlain(contentRef.current);
    if (plain.length < 30) {
      setPlotCheck({ issues:[], summary:"Write more story content before running plot detection." });
      return;
    }

    setPlotLoading(true);
    setPlotCheck(null);
    try {
      const r = await api.post("/ai/plot-check", { text: plain.slice(0, 20000) });
      setPlotCheck(r.data);
    } catch (err) {
      setPlotCheck({
        error: true,
        issues:[],
        summary: err?.response?.data?.message || "Plot check failed. Try again."
      });
    } finally {
      setPlotLoading(false);
    }
  };

  const acceptSuggestion = () => {
    const appended = contentRef.current + "<p>" + suggestion + "</p>";
    setContent(appended); contentRef.current = appended; setSuggestion(""); setSuggType("");
    clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => saveStory(appended, genresRef.current), 1500);
  };
  const applyImprovement = () => {
    const improved = "<p>" + suggestion + "</p>";
    setContent(improved); contentRef.current = improved; setSuggestion(""); setSuggType("");
    clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => saveStory(improved, genresRef.current), 1500);
  };

  const inviteCollaborator = async () => {
    const email = window.prompt(`Invite a collaborator to "${title || "this story"}" by email:`);
    if (!email) return;
    setInviteMsg("");
    try {
      await api.post(`/stories/${id}/invites`, { email });
      setInviteMsg(`Invite sent to ${email.trim().toLowerCase()}.`);
      const r = await api.get(`/stories/${id}`);
      setStoryMeta(prev => ({
        ...prev,
        owner: r.data.owner || prev.owner,
        collaborators: r.data.collaborators || prev.collaborators
      }));
    } catch (err) {
      setInviteMsg(err?.response?.data?.message || "Failed to send invite.");
    }
  };

  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    clearTimeout(sockTimer.current);
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  const wc        = wordCount(content);
  const hasSugg   = suggestion && !["error","info",""].includes(suggType);
  const saveBg    = { idle:"#198754", saving:"#6c757d", saved:"#198754", error:"var(--danger)" }[saveStatus];
  const saveLabel = { idle:"Save", saving:"Saving…", saved:"✅ Saved!", error:"❌ Failed" }[saveStatus];
  const accentLine = suggType==="grammar" ? "var(--accent2)" : "var(--accent)";
  const isOwner = storyMeta.role !== "collaborator";
  const visibleActiveUsers = activeUsers.some(activeUser => activeUser._id === user?._id)
    ? activeUsers
    : user
      ? [...activeUsers, { _id:user._id, name:user.name, email:user.email }]
      : activeUsers;

  return (
    <div className="editor-layout">

      {/* ── Left: main editor column ── */}
      <div>
        {/* Header row: title + word count + Download + Save */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
          <div>
            <p style={{ fontWeight:700, fontSize:18, color:"var(--text)", marginBottom:4, lineHeight:1.3 }}>{title||"Untitled Story"}</p>
            <small style={{ color:"var(--text-3)", fontSize:12 }}>
              {wc} {wc===1?"word":"words"}
              {saveStatus==="idle" && content && " · Autosaves after 3s"}
            </small>
          </div>
          {/* Download + Save buttons */}
          <div style={{ display:"flex", gap:8, alignItems:"center", flexShrink:0, marginLeft:12 }}>
            {isOwner && (
              <button className="ca-btn ghost" onClick={inviteCollaborator}>
                Invite
              </button>
            )}
            <DownloadButton title={title} content={content} genres={genres} storyMeta={storyMeta} />
            <button className="ca-btn" style={{ background:saveBg }} onClick={() => saveStory()} disabled={saveStatus==="saving"}>
              {saveLabel}
            </button>
          </div>
        </div>
        {inviteMsg && (
          <p style={{ color:inviteMsg.startsWith("Invite sent") ? "var(--accent2)" : "var(--danger)", fontSize:13, marginTop:-12, marginBottom:14 }}>
            {inviteMsg}
          </p>
        )}

        {/* Genre selector */}
        <div className="ca-card" style={{ padding:"15px 18px", marginBottom:14 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <span style={{ fontWeight:600, fontSize:14, color:"var(--text)" }}>🎭 Story Genres</span>
            <span style={{ fontSize:12, color:"var(--text-3)" }}>
              {genres.length}/{MAX_GENRES} selected
              {genres.length>=MAX_GENRES && <span style={{ color:"#e67e22", fontWeight:500 }}> · Max reached</span>}
            </span>
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
            {ALL_GENRES.map(g => {
              const sel = genres.includes(g); const locked = !sel && genres.length>=MAX_GENRES;
              return <button key={g} className={`genre-btn${sel?" selected":""}`} disabled={locked} onClick={() => toggleGenre(g)}>{sel?`✓ ${g}`:g}</button>;
            })}
          </div>
        </div>

        {/* Quill editor */}
        <div
          className="ca-card"
          style={{ overflow:"hidden", marginBottom:14 }}
          onMouseUp={() => syncEditorSelection()}
          onKeyUp={() => syncEditorSelection()}
        >
          <ReactQuill ref={quillRef} theme="snow" value={content} onChange={handleChange}
            onChangeSelection={handleSelectionChange} modules={{ toolbar:TOOLBAR }}
            placeholder="Start writing your story…" style={{ minHeight:380, fontSize:15 }} />
        </div>

        {/* AI action buttons */}
        <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginBottom:14, flexWrap:"wrap" }}>
          <button className="ca-btn" style={{ background:listening ? "var(--danger)" : "#0f3460" }} onClick={listening ? stopNarration : startNarration} disabled={transcribing}>
            {transcribing ? <><Spinner /> Transcribing…</> : listening ? "Stop Narration" : "Narrate Story"}
          </button>
          <button className="ca-btn green" onClick={() => callAI("grammar")} disabled={aiLoading}>
            {aiLoading && aiMode==="grammar" ? <><Spinner /> Improving…</> : "✏️ Improve Writing"}
          </button>
          <button className="ca-btn primary" onClick={() => callAI("continue")} disabled={aiLoading}>
            {aiLoading && aiMode==="continue" ? <><Spinner /> Generating…</> : "✨ Generate Suggestion"}
          </button>
          <button className="ca-btn" style={{ background:"#7c3aed" }} onClick={runPlotCheck} disabled={plotLoading}>
            {plotLoading ? <><Spinner /> Checking…</> : "Plot Check"}
          </button>
        </div>
        {speechMsg && (
          <p style={{ fontSize:12, color:listening ? "var(--accent2)" : "var(--text-3)", textAlign:"right", marginTop:-8, marginBottom:14 }}>
            {speechMsg}
          </p>
        )}
        {plotCheck && (
          <div className="ca-card" style={{ padding:"16px 18px", marginBottom:14, borderLeft:"4px solid #7c3aed" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, marginBottom:10 }}>
              <p style={{ fontWeight:700, fontSize:14, color:"var(--text)", margin:0 }}>Plot Detection</p>
              <button className="ca-btn ghost" style={{ fontSize:12, padding:"5px 10px" }} onClick={() => setPlotCheck(null)}>Dismiss</button>
            </div>
            <p style={{ fontSize:13, color:"var(--text-2)", lineHeight:1.6, marginBottom:12 }}>{plotCheck.summary}</p>
            {plotCheck.issues?.length > 0 ? (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {plotCheck.issues.map((issue, index) => (
                  <div key={index} style={{ background:"var(--panel-bg)", border:"1px solid var(--border)", borderRadius:8, padding:"11px 12px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", gap:8, marginBottom:6, flexWrap:"wrap" }}>
                      <span style={{ fontSize:12, fontWeight:700, color:"var(--text)" }}>{issue.type || "Plot issue"}</span>
                      <span className="genre-chip" style={{ fontSize:10 }}>{issue.severity || "medium"}</span>
                    </div>
                    {issue.evidence && <p style={{ fontSize:12, color:"var(--text-3)", marginBottom:5 }}><strong>Evidence:</strong> {issue.evidence}</p>}
                    {issue.explanation && <p style={{ fontSize:13, color:"var(--text)", lineHeight:1.6, marginBottom:5 }}>{issue.explanation}</p>}
                    {issue.suggestion && <p style={{ fontSize:12, color:"var(--accent2)", lineHeight:1.6, margin:0 }}><strong>Fix:</strong> {issue.suggestion}</p>}
                  </div>
                ))}
              </div>
            ) : plotCheck.error ? (
              <p style={{ fontSize:13, color:"var(--danger)", margin:0 }}>The plot checker could not complete. Make sure the backend is restarted and GROQ_API_KEY is configured.</p>
            ) : (
              <p style={{ fontSize:13, color:"var(--accent2)", margin:0 }}>No contradictions found.</p>
            )}
          </div>
        )}

        {/* Suggestion box */}
        {(suggestion || aiLoading) && (
          <div className="ca-card" style={{ padding:"18px 20px", borderLeft:`4px solid ${accentLine}`, borderTopLeftRadius:4, borderBottomLeftRadius:4 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <span style={{ fontSize:11, fontWeight:700, color:"var(--text-3)", textTransform:"uppercase", letterSpacing:"0.08em" }}>
                {suggType==="grammar" ? "✏️ Improved Writing" : "✨ AI Suggestion"}
              </span>
              {genres.length>0 && (
                <div style={{ display:"flex", gap:4, flexWrap:"wrap", justifyContent:"flex-end" }}>
                  {genres.map(g => <span key={g} className="genre-chip">{g}</span>)}
                </div>
              )}
            </div>
            <div style={{ background:"var(--suggest-bg)", border:"1px solid var(--border)", borderRadius:8, padding:"13px 15px", minHeight:56 }}>
              <p className="suggestion-text" style={{ fontStyle:suggType==="continue"?"italic":"normal" }}>
                {aiLoading && !suggestion ? <span style={{ color:"var(--text-3)" }}>Thinking…</span> : suggestion}
              </p>
            </div>
            {suggType==="grammar" && hasSugg && <p style={{ fontSize:12, color:"var(--text-3)", marginTop:8 }}>ℹ️ Grammar fixed. Your voice is preserved.</p>}
            {hasSugg && (
              <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:12 }}>
                <button className="ca-btn ghost" onClick={() => { setSuggestion(""); setSuggType(""); }}>Dismiss</button>
                {suggType==="continue" && <button className="ca-btn outline-accent" onClick={acceptSuggestion}>✅ Accept & Append</button>}
                {suggType==="grammar"  && <button className="ca-btn outline-green"  onClick={applyImprovement}>✅ Apply Improvement</button>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Right: sidebar stack (AI Suggestions + Scene Inspirations) ── */}
      <div className="editor-sidebar sidebar-stack">
        <CollaboratorsPanel
          owner={storyMeta.owner}
          collaborators={storyMeta.collaborators}
          activeUsers={visibleActiveUsers}
        />
        <AISuggestionsPanel
          selectedText={selectedText} selectionRange={selectionRange}
          quillRef={quillRef} contentRef={contentRef}
          setContent={setContent} saveTimer={saveTimer}
          saveStory={saveStory} genresRef={genresRef}
        />
        <SceneInspirationsPanel content={content} genres={genres} />
      </div>
    </div>
  );
}

// ── Login / Register ──────────────────────────────────────────────────────────
function Login() {
  const { login } = useContext(AuthContext);
  const navigate  = useNavigate();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);

  const handle = async () => {
    setError(""); setLoading(true);
    try { const r = await api.post("/auth/login",{email,password}); login(r.data); navigate("/"); }
    catch { setError("Invalid email or password."); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <p style={{ fontWeight:700, fontSize:22, color:"var(--text)", marginBottom:24, textAlign:"center" }}>Welcome back ✍️</p>
        <label className="auth-label">Email</label>
        <input className="ca-input" style={{ marginBottom:14 }} placeholder="your@email.com" type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} />
        <label className="auth-label">Password</label>
        <input className="ca-input" style={{ marginBottom:6 }} placeholder="••••••••" type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} />
        {error && <p style={{ color:"var(--danger)", fontSize:13, marginBottom:10 }}>{error}</p>}
        <button className="ca-btn primary" style={{ width:"100%", justifyContent:"center", padding:"10px", marginTop:10 }} onClick={handle} disabled={loading}>
          {loading ? <><Spinner /> Logging in…</> : "Login"}
        </button>
        <p style={{ textAlign:"center", fontSize:13, color:"var(--text-2)", marginTop:16 }}>
          Don't have an account? <Link to="/register" style={{ color:"var(--accent)", fontWeight:600 }}>Register</Link>
        </p>
      </div>
    </div>
  );
}

function Register() {
  const { login } = useContext(AuthContext);
  const navigate  = useNavigate();
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);

  const handle = async () => {
    setError(""); setLoading(true);
    try { const r = await api.post("/auth/register",{name,email,password}); login(r.data); navigate("/"); }
    catch (e) { setError(e?.response?.data?.message || "Registration failed."); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <p style={{ fontWeight:700, fontSize:22, color:"var(--text)", marginBottom:24, textAlign:"center" }}>Create account ✍️</p>
        <label className="auth-label">Name</label>
        <input className="ca-input" style={{ marginBottom:14 }} placeholder="Your name" value={name} onChange={e=>setName(e.target.value)} />
        <label className="auth-label">Email</label>
        <input className="ca-input" style={{ marginBottom:14 }} placeholder="your@email.com" type="email" value={email} onChange={e=>setEmail(e.target.value)} />
        <label className="auth-label">Password</label>
        <input className="ca-input" style={{ marginBottom:6 }} placeholder="••••••••" type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} />
        {error && <p style={{ color:"var(--danger)", fontSize:13, marginBottom:10 }}>{error}</p>}
        <button className="ca-btn primary" style={{ width:"100%", justifyContent:"center", padding:"10px", marginTop:10 }} onClick={handle} disabled={loading}>
          {loading ? <><Spinner /> Creating account…</> : "Create Account"}
        </button>
        <p style={{ textAlign:"center", fontSize:13, color:"var(--text-2)", marginTop:16 }}>
          Already have an account? <Link to="/login" style={{ color:"var(--accent)", fontWeight:600 }}>Login</Link>
        </p>
      </div>
    </div>
  );
}

// ── App Root ──────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <AuthProvider>
        <BrowserRouter>
          <Navbar />
          <Routes>
            <Route path="/login"      element={<Login />} />
            <Route path="/register"   element={<Register />} />
            <Route path="/"           element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/editor/:id" element={<PrivateRoute><Editor /></PrivateRoute>} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </>
  );
}
