import { Link } from "react-router-dom";

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function wordCount(html) {
  return (html || "").replace(/<[^>]*>/g, "").trim().split(/\s+/).filter(Boolean).length;
}

export default function StoryCard({ story, onDelete }) {
  const wc = wordCount(story.content);

  return (
    <div
      className="story-card-hover"
      style={{
        background: "var(--bg-card)",
        border: "1.5px solid var(--border-color)",
        borderRadius: "14px",
        padding: "18px",
        marginBottom: "4px",
        boxShadow: "var(--shadow)",
        transition: "transform 0.2s, box-shadow 0.2s",
      }}
    >
      {/* Title */}
      <h5
        style={{
          margin: "0 0 8px",
          fontWeight: 600,
          fontSize: "15px",
          color: "var(--text-primary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {story.title}
      </h5>

      {/* Genre chips — black/white only */}
      {story.genres && story.genres.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", margin: "6px 0" }}>
          {story.genres.map((g) => (
            <span
              key={g}
              style={{
                fontSize: "11px",
                padding: "2px 9px",
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

      {/* Meta row */}
      <div
        style={{
          display: "flex",
          gap: "14px",
          marginTop: "10px",
          fontSize: "12px",
          color: "var(--text-muted)",
        }}
      >
        <span>📝 {wc} {wc === 1 ? "word" : "words"}</span>
        <span>🕐 {timeAgo(story.updatedAt)}</span>
      </div>

      {/* Divider */}
      <div style={{ borderTop: "1px solid var(--border-color)", margin: "12px 0" }} />

      {/* Action row */}
      <div style={{ display: "flex", gap: "8px" }}>
        <Link
          to={`/editor/${story._id}`}
          style={{
            flex: 1,
            textAlign: "center",
            padding: "8px 0",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            textDecoration: "none",
            background: "#6c63ff",
            color: "#fff",
            transition: "opacity 0.15s",
          }}
          onMouseOver={(e) => e.currentTarget.style.opacity = "0.85"}
          onMouseOut={(e) => e.currentTarget.style.opacity = "1"}
        >
          Open Editor
        </Link>
        <button
          title="Delete story"
          onClick={() => onDelete(story._id)}
          style={{
            background: "transparent",
            border: "1.5px solid var(--border-color)",
            borderRadius: "8px",
            color: "#dc3545",
            padding: "8px 13px",
            fontSize: "14px",
            cursor: "pointer",
            transition: "background 0.15s, border-color 0.15s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = "rgba(220,53,69,0.08)";
            e.currentTarget.style.borderColor = "#dc3545";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "var(--border-color)";
          }}
        >
          🗑
        </button>
      </div>
    </div>
  );
}
