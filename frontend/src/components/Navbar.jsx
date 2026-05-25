import { useContext } from "react";
import { AuthContext } from "../auth/AuthContext";
import { Link, useNavigate } from "react-router-dom";

export default function Navbar() {
  const { user, logout, darkMode, toggleDarkMode } = useContext(AuthContext);
  const navigate = useNavigate();

  return (
    <nav
      style={{
        background: "var(--navbar-bg)",
        padding: "0 1.5rem",
        height: "60px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
        position: "sticky",
        top: 0,
        zIndex: 100,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Brand — always white because navbar is always dark */}
      <Link
        to="/"
        style={{
          color: "#ffffff",
          fontWeight: 700,
          fontSize: "1.15rem",
          textDecoration: "none",
          letterSpacing: "-0.2px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          background: "rgba(108,99,255,0.25)",
          border: "1px solid rgba(108,99,255,0.5)",
          borderRadius: "8px",
          padding: "5px 12px",
        }}
      >
        ✍️ Co-Author AI
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>

        {/* Dark mode toggle */}
        <button
          onClick={toggleDarkMode}
          title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: "8px",
            color: "#fff",
            padding: "6px 13px",
            fontSize: "13px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "5px",
            transition: "background 0.2s",
            fontWeight: 500,
          }}
          onMouseOver={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.22)"}
          onMouseOut={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
        >
          {darkMode ? "☀️ Light" : "🌙 Dark"}
        </button>

        {user ? (
          <>
            <Link
              to="/"
              style={{
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: "8px",
                padding: "6px 16px",
                fontSize: "13px",
                fontWeight: 500,
                textDecoration: "none",
                transition: "background 0.2s",
              }}
              onMouseOver={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
              onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
            >
              Dashboard
            </Link>
            <button
              onClick={() => { logout(); navigate("/login"); }}
              style={{
                background: "#dc3545",
                border: "none",
                borderRadius: "8px",
                color: "#fff",
                padding: "6px 16px",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <Link
              to="/login"
              style={{
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: "8px",
                padding: "6px 16px",
                fontSize: "13px",
                textDecoration: "none",
              }}
            >
              Login
            </Link>
            <Link
              to="/register"
              style={{
                background: "#6c63ff",
                border: "none",
                borderRadius: "8px",
                color: "#fff",
                padding: "6px 16px",
                fontSize: "13px",
                textDecoration: "none",
              }}
            >
              Register
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
