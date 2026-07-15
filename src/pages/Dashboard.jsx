import React, { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import axios from "axios";
import API_BASE_URL from "../apiroute/apiConfig";


const Dashboard = () => {
  const username = sessionStorage.getItem("username");
  const role = sessionStorage.getItem("role");
  const navigate = useNavigate();

  const [userCount, setUserCount] = useState(null);
  const [pdfCount, setPdfCount] = useState(null);

  useEffect(() => {
    const token = sessionStorage.getItem("token");

    if (!token) {
      navigate("/", {
        replace: true,
      });

      return;
    }

    const currentUrl =
      window.location.pathname +
      window.location.search +
      window.location.hash;

    window.history.pushState(
      { navigationBlocked: true },
      "",
      currentUrl
    );

    const handlePopState = () => {
      window.history.pushState(
        { navigationBlocked: true },
        "",
        currentUrl
      );
    };

    window.addEventListener(
      "popstate",
      handlePopState
    );

    return () => {
      window.removeEventListener(
        "popstate",
        handlePopState
      );
    };
  }, [navigate]);

 

  useEffect(() => {
    const token = sessionStorage.getItem("token");
    if (!token) {
      navigate("/", {
        replace: true,
      });

      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    axios.get(`${API_BASE_URL}/api/AdminAPI/Users`, { headers })
      .then(res => setUserCount(Array.isArray(res.data) ? res.data.length : res.data?.users?.length ?? "—"))
      .catch(() => setUserCount("—"));

    axios.get(`${API_BASE_URL}/api/Document/all-pdfs`, { headers })
      .then(res => {
        const data = res.data;
        const count = Array.isArray(data) ? data.length : (data?.files ?? data?.pdfs ?? []).length;
        setPdfCount(count);
      })
      .catch(() => setPdfCount("—"));
  }, [navigate]);
   if (role !== "Admin") {
    return <Navigate to="/chatbot" />;
  }
  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  const quickActions = [
    {
      label: "Manage Users",
      description: "Add, activate or reset user passwords",
      route: "/users",
      color: "#8b5cf6",
      bg: "rgba(139,92,246,0.1)",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ),
    },
    {
      label: "PDF Library",
      description: "Browse, upload and preview documents",
      route: "/uploaded-pdfs",
      color: "#E06580",
      bg: "rgba(224,101,128,0.1)",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
      ),
    },
    {
      label: "SmartAI Chatbot",
      description: "Ask questions across all uploaded PDFs",
      route: "/chatbot",
      color: "#10b981",
      bg: "rgba(16,185,129,0.1)",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="dashboard">

      {/* ── Hero Banner ── */}
      <div className="db-hero">
        <div className="db-hero-avatar">{username?.charAt(0)?.toUpperCase()}</div>
        <div className="db-hero-text">
          <h1>{greeting()}, {username}!</h1>
          <p>Here's an overview of your SmartAI administration panel.</p>
        </div>
        {/* <div className="db-hero-badge">
          <span className="db-status-dot" />
          System Online
        </div> */}
      </div>

      {/* ── Stat Cards ── */}
      <div className="db-stats-row">
        <div className="db-stat-card db-stat-purple">
          <div className="db-stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div className="db-stat-info">
            <span className="db-stat-label">Total Users</span>
            <span className="db-stat-value">{userCount === null ? "…" : userCount}</span>
            <span className="db-stat-sub">Registered accounts</span>
          </div>
        </div>

        <div className="db-stat-card db-stat-pink">
          <div className="db-stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div className="db-stat-info">
            <span className="db-stat-label">Uploaded PDFs</span>
            <span className="db-stat-value">{pdfCount === null ? "…" : pdfCount}</span>
            <span className="db-stat-sub">Documents in library</span>
          </div>
        </div>

        <div className="db-stat-card db-stat-green">
          <div className="db-stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <div className="db-stat-info">
            <span className="db-stat-label">System Status</span>
            <span className="db-stat-value db-stat-online">Online</span>
            <span className="db-stat-sub">All services running</span>
          </div>
        </div>

        <div className="db-stat-card db-stat-blue">
          <div className="db-stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div className="db-stat-info">
            <span className="db-stat-label">Role</span>
            <span className="db-stat-value">{role}</span>
            <span className="db-stat-sub">Access level</span>
          </div>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="db-section-title">Quick Actions</div>
      <div className="db-actions-row">
        {quickActions.map((action) => (
          <button
            key={action.route}
            className="db-action-card"
            onClick={() => navigate(action.route)}
            style={{ "--action-color": action.color, "--action-bg": action.bg }}
          >
            <div className="db-action-icon">{action.icon}</div>
            <div className="db-action-info">
              <span className="db-action-label">{action.label}</span>
              <span className="db-action-desc">{action.description}</span>
            </div>
            <svg className="db-action-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14"/><path d="M13 5l7 7-7 7"/>
            </svg>
          </button>
        ))}
      </div>

    </div>
  );
};

export default Dashboard;
