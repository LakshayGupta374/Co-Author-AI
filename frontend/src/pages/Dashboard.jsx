import { useEffect, useState, useMemo } from "react";
import api from "../api/axiosInstance";
import StoryCard from "../components/StoryCard";

export default function Dashboard() {
  const [stories, setStories] = useState([]);
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const fetchStories = async () => {
    try {
      setLoading(true);
      const res = await api.get("/stories");
      setStories(res.data);
    } catch {
      setError("Failed to load stories. Please refresh.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStories(); }, []);

  const createStory = async () => {
    if (!title.trim()) return setError("Please enter a story title.");
    try {
      setCreating(true);
      setError("");
      const res = await api.post("/stories", { title: title.trim() });
      setStories((prev) => [res.data, ...prev]);
      setTitle("");
    } catch {
      setError("Failed to create story. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const deleteStory = async (id) => {
    if (!window.confirm("Delete this story? This cannot be undone.")) return;
    try {
      await api.delete(`/stories/${id}`);
      setStories((prev) => prev.filter((s) => s._id !== id));
    } catch {
      setError("Failed to delete story.");
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return stories;
    const q = search.toLowerCase();
    return stories.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.genres || []).some((g) => g.toLowerCase().includes(q))
    );
  }, [stories, search]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-primary)",
        padding: "0 0 60px",
      }}
    >
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "32px 20px 0" }}>

        {/* Create box */}
        <div
          style={{
            background: "var(--bg-card)",
            border: "1.5px solid var(--border-color)",
            borderRadius: "16px",
            padding: "24px",
            boxShadow: "var(--shadow)",
            marginBottom: "28px",
          }}
        >
          <h4 style={{ margin: "0 0 16px", color: "var(--text-primary)", fontWeight: 700 }}>
            ✨ New Story
          </h4>
          <div style={{ display: "flex", gap: "10px" }}>
            <input
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1.5px solid var(--input-border)",
                background: "var(--input-bg)",
                color: "var(--text-primary)",
                fontSize: "15px",
                outline: "none",
              }}
              placeholder="Enter a story title…"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && createStory()}
              disabled={creating}
            />
            <button
              onClick={createStory}
              disabled={creating}
              style={{
                background: "#6c63ff",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                padding: "10px 22px",
                fontWeight: 600,
                fontSize: "15px",
                cursor: creating ? "not-allowed" : "pointer",
                opacity: creating ? 0.7 : 1,
                display: "flex",
                alignItems: "center",
                gap: "6px",
                whiteSpace: "nowrap",
              }}
            >
              {creating && (
                <span
                  style={{
                    width: "14px", height: "14px",
                    border: "2px solid rgba(255,255,255,0.4)",
                    borderTopColor: "#fff",
                    borderRadius: "50%",
                    display: "inline-block",
                    animation: "spin 0.7s linear infinite",
                  }}
                />
              )}
              {creating ? "Creating…" : "+ Create"}
            </button>
          </div>
          {error && (
            <p style={{ color: "#dc3545", fontSize: "13px", margin: "8px 0 0" }}>{error}</p>
          )}
        </div>

        {/* Header + search */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <h4 style={{ margin: 0, color: "var(--text-primary)", fontWeight: 700 }}>
            Your Stories
            {!loading && (
              <span
                style={{
                  marginLeft: "10px",
                  fontSize: "14px",
                  fontWeight: 400,
                  color: "var(--text-muted)",
                }}
              >
                {filtered.length} {filtered.length === 1 ? "story" : "stories"}
              </span>
            )}
          </h4>

          {/* Search bar */}
          <div style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
                fontSize: "15px",
                pointerEvents: "none",
              }}
            >
              🔍
            </span>
            <input
              style={{
                paddingLeft: "36px",
                paddingRight: "12px",
                paddingTop: "8px",
                paddingBottom: "8px",
                borderRadius: "10px",
                border: "1.5px solid var(--input-border)",
                background: "var(--input-bg)",
                color: "var(--text-primary)",
                fontSize: "14px",
                outline: "none",
                width: "220px",
              }}
              placeholder="Search stories or genres…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Story grid */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <div
              style={{
                width: "36px", height: "36px",
                border: "3px solid var(--border-color)",
                borderTopColor: "#6c63ff",
                borderRadius: "50%",
                animation: "spin 0.7s linear infinite",
              }}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "var(--text-muted)",
            }}
          >
            {search ? (
              <>
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>🔍</div>
                <p style={{ margin: 0 }}>No stories match "{search}"</p>
              </>
            ) : (
              <>
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>📖</div>
                <p style={{ margin: 0 }}>No stories yet. Create your first one above!</p>
              </>
            )}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "16px",
            }}
          >
            {filtered.map((story, i) => (
              <div
                key={story._id}
                style={{ animation: `fadeInUp 0.35s ease ${i * 0.06}s both` }}
              >
                <StoryCard story={story} onDelete={deleteStory} />
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .story-card-hover:hover {
          transform: translateY(-4px) !important;
          box-shadow: var(--shadow-hover) !important;
        }
      `}</style>
    </div>
  );
}
