import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import BBLogo from "../assets/BBizLogo1.png";
import axios from "axios";
import API_BASE_URL from "../apiroute/apiConfig";

const Navbar = ({ user }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Sync Multiple PDF states
  const [syncQueue, setSyncQueue] = useState([]);
  const [currentSyncIndex, setCurrentSyncIndex] = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedTocPages, setSelectedTocPages] = useState([]);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [showSyncConfirmModal, setShowSyncConfirmModal] = useState(false);
  const [messageText, setMessageText] = useState("");

  useEffect(() => {
    let url = null;
    const currentItem = syncQueue[currentSyncIndex];
    if (showConfirmModal && currentItem && currentItem.sessionId) {
      const fetchPreview = async () => {
        try {
          const token = sessionStorage.getItem("token");
          const res = await axios.get(`${API_BASE_URL}/api/Document/preview/${currentItem.sessionId}`, {
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'blob'
          });
          url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
          setPreviewUrl(url);
        } catch (err) {
          console.error("Failed to load PDF preview", err);
        }
      };
      fetchPreview();
    } else {
      setPreviewUrl(null);
    }

    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [showConfirmModal, currentSyncIndex, syncQueue]);

  const togglePageSelection = (pageNumber) => {
    if (selectedTocPages.includes(pageNumber)) {
      setSelectedTocPages(selectedTocPages.filter(p => p !== pageNumber));
    } else {
      setSelectedTocPages([...selectedTocPages, pageNumber]);
    }
  };

  const executeConfirmApi = async () => {
    const currentItem = syncQueue[currentSyncIndex];
    if (!currentItem) return;

    setConfirmLoading(true);
    try {
      const token = sessionStorage.getItem("token");
      await axios.post(`${API_BASE_URL}/api/document/confirm-sync`,
        { SessionId: currentItem.sessionId, SelectedPages: selectedTocPages },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (currentSyncIndex < syncQueue.length - 1) {
        setCurrentSyncIndex(currentSyncIndex + 1);
        setSelectedTocPages([]);
      } else {
        setShowConfirmModal(false);
        setSyncQueue([]);
        setCurrentSyncIndex(0);
        setSelectedTocPages([]);
        setMessageText("All pending PDFs have been synced successfully!");
        setShowMessageModal(true);
      }
    } catch (err) {
      console.error("Confirm error:", err.response?.data || err);
      let errMsg = "Failed to confirm PDF handling";

      if (err.response?.data?.errors) {
        const firstKey = Object.keys(err.response.data.errors)[0];
        errMsg = err.response.data.errors[firstKey][0];
      } else if (typeof err.response?.data === 'string') {
        errMsg = err.response.data;
      } else if (err.response?.data?.message) {
        errMsg = err.response.data.message;
      }

      setMessageText(`Processing failed for ${currentItem.fileName}: ` + errMsg);
      setShowMessageModal(true);
      setShowConfirmModal(false);
      setSyncQueue([]);
      setCurrentSyncIndex(0);
      setSelectedTocPages([]);
    } finally {
      setConfirmLoading(false);
    }
  };

  const isActive = (path) => location.pathname === path;

  const logout = () => {
  sessionStorage.clear();

    navigate("/login", {
      replace: true,
    });
  };

  const handleUploadPdfClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Reset input so the same file can be selected again
    e.target.value = "";

    const formData = new FormData();
    formData.append("file", file);

    setIsUploading(true);
    try {
      const token = sessionStorage.getItem("token");
      const res = await axios.post(`${API_BASE_URL}/api/document/upload`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`
        }
      });
      alert(res.data?.message || "PDF uploaded successfully!");
    } catch (err) {
      console.error("Upload error:", err.response?.data || err);
      // Try to parse the error message if it exists
      const errMsg = typeof err.response?.data === 'string' ? err.response.data : err.response?.data?.message || err.message || "Failed to upload PDF";
      alert("Upload failed: " + errMsg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSyncJsonl = async () => {
    setShowSyncConfirmModal(false);
    setIsSyncing(true);
    try {
      const token = sessionStorage.getItem("token");
      const res = await axios.post(`${API_BASE_URL}/api/document/sync-jsonl`, {}, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const { requiresConfirmation, processed, skipped } = res.data;

      if (requiresConfirmation && requiresConfirmation.length > 0) {
        setSyncQueue(requiresConfirmation);
        setCurrentSyncIndex(0);
        setSelectedTocPages([]);
        setShowConfirmModal(true);
      } else {
        setMessageText(res.data?.message || "PDFs synced successfully!");
        setShowMessageModal(true);
      }
    } catch (err) {
      console.error("Sync error:", err.response?.data || err);
      const errMsg = typeof err.response?.data === 'string' ? err.response.data : err.response?.data?.message || err.message || "Failed to sync JSONL";
      setMessageText("Sync failed: " + errMsg);
      setShowMessageModal(true);
    } finally {
      setIsSyncing(false);
    }
  };

  const navItems = [
    ...(user?.role === "Admin"
      ? [
        {
          path: "/dashboard",
          label: "Dashboard",
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
          )
        },
        {
          path: "/users",
          label: "Users",
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
          )
        },
        {
          path: "/uploaded-pdfs",
          label: "Library",
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2z" />
              <path d="M14 2v6h6" />
            </svg>
          )
        }
      ]
      : []),

    {
      path: "/chatbot",
      label: "Chatbot",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )
    }

  ];

  return (
    <>
      {/* Mobile top bar */}
      <div className="mobile-topbar">
        <button className="sidebar-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="mobile-topbar-logo">
          <img src={BBLogo} alt="SmartAI Logo" className="logo-img" />
        </div>
      </div>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`app-sidebar${sidebarOpen ? " sidebar-open" : ""}`}>
        {/* Header: Logo + Close */}
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img src={BBLogo} alt="SmartAI Logo" className="logo-img" />
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Nav Links */}
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`sidebar-link${isActive(item.path) ? " sidebar-link-active" : ""}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="sidebar-link-icon">{item.icon}</span>
              <span className="sidebar-link-label">{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Admin Actions */}
        {user?.role === "Admin" && (
          <div className="sidebar-actions">
            <span className="sidebar-section-label">Admin Tools</span>
            <input
              type="file"
              accept=".pdf"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <button
              className="sidebar-action-btn"
              onClick={() => setShowSyncConfirmModal(true)}
              disabled={isUploading || isSyncing}
            >
              {isSyncing ? (
                <><span className="btn-spinner"></span> Syncing...</>
              ) : (
                <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" /></svg> Sync JSONL</>
              )}
            </button>
          </div>
        )}

        {/* Footer: User + Logout */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              {user?.username?.charAt(0)?.toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{user?.username}</span>
              <span className="sidebar-user-role">{user?.role}</span>
            </div>
          </div>
          <button className="sidebar-logout" onClick={logout}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Logout
          </button>
        </div>
      </aside>

      {/* Confirmation Modal Overlay */}
      {showConfirmModal && syncQueue[currentSyncIndex] && (() => {
        const currentItem = syncQueue[currentSyncIndex];
        const mediumPages = currentItem.mediumPages || [];
        return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
          <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '16px', width: '97%', maxWidth: '1400px', height: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', border: '1px solid var(--border-light)' }}>

            {/* Modal Header */}
            <div style={{ padding: '1.25rem 2rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface)' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.25rem' }}>Select Table of Contents Pages</h3>
                <p style={{
                  margin: '6px 0 0',
                  fontSize: '13px',
                  color: 'var(--text-secondary)'
                }}>
                  Document: <strong>{currentItem.fileName}</strong> ({currentSyncIndex + 1} of {syncQueue.length})<br/>
                  Note: If none of the pages are Table of Contents, simply click "Confirm Selection" without selecting any page.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setSyncQueue([]);
                  setCurrentSyncIndex(0);
                }}
                disabled={confirmLoading}
                style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: confirmLoading ? 'not-allowed' : 'pointer', color: 'var(--text-muted)', transition: 'all 0.2s' }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

              {/* Left Pane: Preview */}
              <div style={{ flex: 2.5, backgroundColor: 'var(--bg-dark)', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                <div style={{ width: '100%', height: '100%', backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                  {previewUrl ? (
                    <iframe
                      src={previewUrl}
                      style={{ width: '100%', height: '100%', border: 'none' }}
                      title="PDF Preview"
                    />
                  ) : (
                    <div style={{ color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                      <span className="btn-spinner" style={{ width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#E06580', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></span>
                      <span style={{ fontSize: '0.95rem', fontWeight: '500' }}>Loading preview securely...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Pane: Checkbox Controls */}
              <div style={{ flex: 1, padding: '2rem', overflowY: 'auto', borderLeft: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                  TOC Selection
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {mediumPages.map((pageNumber) => {
                    const isSelected = selectedTocPages.includes(pageNumber);
                    return (
                      <label key={pageNumber} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '1rem',
                        border: isSelected ? '1px solid #E06580' : '1px solid var(--border)',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        backgroundColor: isSelected ? 'rgba(224, 101, 128, 0.08)' : 'var(--bg-surface)',
                        boxShadow: isSelected ? '0 0 0 1px #E06580' : 'none'
                      }}>
                        <div style={{
                          width: '20px',
                          height: '20px',
                          border: isSelected ? 'none' : '2px solid var(--text-muted)',
                          borderRadius: '6px',
                          backgroundColor: isSelected ? '#E06580' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s'
                        }}>
                          {isSelected && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => togglePageSelection(pageNumber)}
                          style={{ display: 'none' }}
                        />
                        <span style={{ fontSize: '1rem', fontWeight: '500', color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>Page {pageNumber}</span>
                      </label>
                    );
                  })}
                  {mediumPages.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>
                      No pages flagged for confirmation.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '1.25rem 2rem', borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button
                onClick={() => executeConfirmApi()}
                disabled={confirmLoading}
                style={{
                  padding: '0.75rem 2rem',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#E06580',
                  color: '#fff',
                  fontWeight: '600',
                  fontSize: '0.95rem',
                  cursor: confirmLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  boxShadow: '0 4px 12px rgba(224, 101, 128, 0.3)',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => !confirmLoading && (e.currentTarget.style.transform = 'translateY(-1px)')}
                onMouseOut={(e) => !confirmLoading && (e.currentTarget.style.transform = 'translateY(0)')}
              >
                {confirmLoading ? (
                  <><span className="btn-spinner" style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderRadius: '50%', borderTopColor: '#fff', animation: 'spin 1s linear infinite' }}></span> Processing...</>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    {currentSyncIndex < syncQueue.length - 1 ? 'Confirm & Next' : 'Confirm Selection'}
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
        );
      })()}

      {/* Message Popup Overlay */}
      {showMessageModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(4px)'
        }}>
          <div
            style={{
              background: "var(--bg-card)",
              borderRadius: "16px",
              width: "90%",
              maxWidth: "400px",
              padding: "2rem",
              textAlign: "center",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              border: "1px solid var(--border-light)",
              animation: "fadeIn 0.2s ease-out"
            }}
          >
            <div style={{
              width: "48px",
              height: "48px",
              backgroundColor: "rgba(224, 101, 128, 0.1)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.5rem"
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E06580" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>

            <h3 style={{ margin: "0 0 0.5rem", color: "#fff", fontSize: "1.25rem", fontWeight: "600" }}>Notification</h3>

            <p style={{
              margin: "0 0 2rem",
              fontSize: "0.95rem",
              lineHeight: "1.5",
              color: "var(--text-secondary)"
            }}>
              {messageText}
            </p>

            <button
              onClick={() => setShowMessageModal(false)}
              style={{
                width: "100%",
                padding: "10px 24px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "#E06580",
                color: "#fff",
                fontWeight: "600",
                fontSize: "1rem",
                cursor: "pointer",
                transition: "transform 0.2s, background-color 0.2s",
                boxShadow: "0 4px 12px rgba(224, 101, 128, 0.3)"
              }}
              onMouseOver={(e) => e.target.style.transform = "translateY(-1px)"}
              onMouseOut={(e) => e.target.style.transform = "translateY(0)"}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Sync Confirmation Popup Overlay */}
      {showSyncConfirmModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(4px)'
        }}>
          <div
            style={{
              background: "var(--bg-card)",
              borderRadius: "16px",
              width: "90%",
              maxWidth: "400px",
              padding: "2rem",
              textAlign: "center",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              border: "1px solid var(--border-light)",
              animation: "fadeIn 0.2s ease-out"
            }}
          >
            <div style={{
              width: "48px",
              height: "48px",
              backgroundColor: "rgba(224, 101, 128, 0.1)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.5rem"
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E06580" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>

            <h3 style={{ margin: "0 0 0.5rem", color: "#fff", fontSize: "1.25rem", fontWeight: "600" }}>Confirm Sync</h3>

            <p style={{
              margin: "0 0 2rem",
              fontSize: "0.95rem",
              lineHeight: "1.5",
              color: "var(--text-secondary)"
            }}>
              Are you sure you want to sync PDFs right now? This may take some time.
            </p>

            <div style={{ display: "flex", gap: "1rem" }}>
              <button
                onClick={() => setShowSyncConfirmModal(false)}
                style={{
                  flex: 1,
                  padding: "10px 24px",
                  borderRadius: "8px",
                  border: "1px solid #E06580",
                  backgroundColor: "transparent",
                  color: "#E06580",
                  fontWeight: "600",
                  fontSize: "1rem",
                  cursor: "pointer",
                  transition: "transform 0.2s, background-color 0.2s"
                }}
                onMouseOver={(e) => { e.target.style.transform = "translateY(-1px)"; e.target.style.backgroundColor = "rgba(224, 101, 128, 0.1)"; }}
                onMouseOut={(e) => { e.target.style.transform = "translateY(0)"; e.target.style.backgroundColor = "transparent"; }}
              >
                Cancel
              </button>
              <button
                onClick={handleSyncJsonl}
                style={{
                  flex: 1,
                  padding: "10px 24px",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "#E06580",
                  color: "#fff",
                  fontWeight: "600",
                  fontSize: "1rem",
                  cursor: "pointer",
                  transition: "transform 0.2s, background-color 0.2s",
                  boxShadow: "0 4px 12px rgba(224, 101, 128, 0.3)"
                }}
                onMouseOver={(e) => e.target.style.transform = "translateY(-1px)"}
                onMouseOut={(e) => e.target.style.transform = "translateY(0)"}
              >
                Yes, Sync
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;

// import React, { useState, useRef } from "react";
// import { Link, useLocation, useNavigate } from "react-router-dom";
// import BBLogo from "../assets/BBizLogo1.png";
// import axios from "axios";
// import API_BASE_URL from "../apiroute/apiConfig";

// const Navbar = ({ user }) => {
//   const location = useLocation();
//   const navigate = useNavigate();
//   const fileInputRef = useRef(null);
//   const [isUploading, setIsUploading] = useState(false);
//   const [isSyncing, setIsSyncing] = useState(false);

//   const isActive = (path) => location.pathname === path;

//   const logout = () => {
//     sessionStorage.clear();
//     navigate("/login");
//   };

//   const handleUploadPdfClick = () => {
//     if (fileInputRef.current) {
//       fileInputRef.current.click();
//     }
//   };

//   const handleFileChange = async (e) => {
//     const file = e.target.files[0];
//     if (!file) return;

//     // Reset input so the same file can be selected again
//     e.target.value = "";

//     const formData = new FormData();
//     formData.append("file", file);

//     setIsUploading(true);
//     try {
//       const token = sessionStorage.getItem("token");
//       const res = await axios.post(`${API_BASE_URL}/api/document/upload`, formData, {
//         headers: {
//           "Content-Type": "multipart/form-data",
//           Authorization: `Bearer ${token}`
//         }
//       });
//       alert(res.data?.message || "PDF uploaded successfully!");
//     } catch (err) {
//       console.error("Upload error:", err.response?.data || err);
//       // Try to parse the error message if it exists
//       const errMsg = typeof err.response?.data === 'string' ? err.response.data : err.response?.data?.message || err.message || "Failed to upload PDF";
//       alert("Upload failed: " + errMsg);
//     } finally {
//       setIsUploading(false);
//     }
//   };

//   const handleSyncJsonl = async () => {
//     // Confirmation required as per instructions
//     if (!window.confirm("Are you sure you want to sync PDFs right now? This may take some time.")) return;

//     setIsSyncing(true);
//     try {
//       const token = sessionStorage.getItem("token");
//       const res = await axios.post(`${API_BASE_URL}/api/document/sync-jsonl`, {}, {
//         headers: {
//           Authorization: `Bearer ${token}`
//         }
//       });
//       alert(res.data?.message || "PDF synced successfully!");
//     } catch (err) {
//       console.error("Sync error:", err.response?.data || err);
//       const errMsg = typeof err.response?.data === 'string' ? err.response.data : err.response?.data?.message || err.message || "Failed to sync JSONL";
//       alert("Sync failed: " + errMsg);
//     } finally {
//       setIsSyncing(false);
//     }
//   };

//   const navItems = [
//     ...(user?.role === "Admin"
//       ? [
//         {
//           path: "/dashboard",
//           label: "Dashboard",
//           icon: (
//             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
//               <rect x="3" y="3" width="7" height="7" />
//               <rect x="14" y="3" width="7" height="7" />
//               <rect x="14" y="14" width="7" height="7" />
//               <rect x="3" y="14" width="7" height="7" />
//             </svg>
//           )
//         },
//         {
//           path: "/users",
//           label: "Users",
//           icon: (
//             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
//               <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
//               <circle cx="9" cy="7" r="4" />
//             </svg>
//           )
//         },
//         {
//           path: "/uploaded-pdfs",
//           label: "Library",
//           icon: (
//             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
//               <path d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2z" />
//               <path d="M14 2v6h6" />
//             </svg>
//           )
//         }
//       ]
//       : []),

//     {
//       path: "/chatbot",
//       label: "Chatbot",
//       icon: (
//         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
//           <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
//         </svg>
//       )
//     }

//   ];

//   return (
//     <nav className="app-navbar">
//       <div className="navbar-brand">
//         <div className="navbar-logo">
//           {/* <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
//             <path d="M12 2L2 7l10 5 10-5-10-5z" />
//             <path d="M2 17l10 5 10-5" />
//             <path d="M2 12l10 5 10-5" />
//           </svg> */}
//           <img src={BBLogo} alt="SmartAI Logo" className="logo-img" />
//         </div>
//       </div>

//       <div className="navbar-links">
//         {navItems.map((item) => (
//           <Link
//             key={item.path}
//             to={item.path}
//             className={`navbar-link ${isActive(item.path) ? "navbar-link-active" : ""}`}
//           >
//             <span className="navbar-link-icon">{item.icon}</span>
//             {item.label}
//           </Link>
//         ))}
//       </div>

//       <div className="navbar-right">
//         {user?.role === "Admin" && (
//           <div className="navbar-admin-actions desktop-admin-actions" style={{ display: "flex", gap: "1rem", marginRight: "1rem", alignItems: "center" }}>
//             <input
//               type="file"
//               accept=".pdf"
//               ref={fileInputRef}
//               style={{ display: "none" }}
//               onChange={handleFileChange}
//             />
//             {/* <button
//               className="navbar-action-btn"
//               onClick={handleUploadPdfClick}
//               disabled={isUploading || isSyncing}
//               style={{ backgroundColor: "#E06580", color: "#fff", borderColor: "#E06580", padding: "0.4rem 0.8rem", borderRadius: "5px", fontSize: "0.875rem", cursor: (isUploading || isSyncing) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "0.5rem", border: "none", fontWeight: "600", opacity: isUploading ? 0.7 : 1 }}
//             >
//               {isUploading ? (
//                 <><span className="btn-spinner" style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.3)", borderRadius: "50%", borderTopColor: "#fff", animation: "spin 1s ease-in-out infinite", display: "inline-block" }}></span> <span className="action-btn-text">Uploading...</span></>
//               ) : (
//                 <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg> <span className="action-btn-text">Upload PDF</span></>
//               )}
//             </button> */}
//             <button
//               className="navbar-action-btn"
//               onClick={handleSyncJsonl}
//               disabled={isUploading || isSyncing}
//               style={{ backgroundColor: "#E06580", color: "#fff", borderColor: "#E06580", padding: "0.4rem 0.8rem", borderRadius: "5px", fontSize: "0.875rem", cursor: (isUploading || isSyncing) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "0.5rem", border: "none", fontWeight: "600", opacity: isSyncing ? 0.7 : 1 }}
//             >
//               {isSyncing ? (
//                 <><span className="btn-spinner" style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.3)", borderRadius: "50%", borderTopColor: "#fff", animation: "spin 1s ease-in-out infinite", display: "inline-block" }}></span> <span className="action-btn-text">Syncing...</span></>
//               ) : (
//                 <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" /></svg> <span className="action-btn-text">Sync JSONL</span></>
//               )}
//             </button>
//             <style>{`
//               @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
//               @media (max-width: 768px) {
//                 /* Hide username and button labels on mobile */
//                 .navbar-user { display: none !important; }
//                 .action-btn-text { display: none; }
                
//                 /* Position desktop admin actions to top left */
//                 .desktop-admin-actions {
//                   position: absolute;
//                   left: 10px;
//                   top: 10px;
//                   margin-right: 0 !important;
//                 }
//                 .navbar-action-btn { padding: 0.5rem !important; margin: 0 !important; }

//                 /* Center the logo and keep logout right aligned */
//                 .app-navbar { position: relative; padding-top: 10px; }
//                 .navbar-brand { position: absolute; left: 50%; top: 15px; transform: translateX(-50%); pointer-events: none; }
//                 .navbar-right { width: 100%; justify-content: flex-end; }
//               }
//             `}</style>
//           </div>
//         )}
//         <div className="navbar-user">
//           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
//             <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
//           </svg>
//           <span>{user?.username}</span>
//         </div>
//         <button className="navbar-logout" onClick={logout}>
//           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
//             <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
//           </svg>
//           Logout
//         </button>
//       </div>
//     </nav>
//   );
// };

// export default Navbar;