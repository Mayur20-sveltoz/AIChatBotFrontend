import React, { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import API_BASE_URL from "../apiroute/apiConfig";
import Select from "react-select";

const Users = () => {
  const [users, setUsers] = useState([]);
  const [passwords, setPasswords] = useState({});
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "" });
  const [addLoading, setAddLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalText, setModalText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const addPanelRef = useRef(null);
  const [showPassword, setShowPassword] = useState(false);

  const USERS_PER_PAGE = 8;
  const API = `${API_BASE_URL}/api/AdminAPI`;
  // ADD THIS HERE
  const roleOptions = [
    { value: "Admin", label: "Admin" },
    { value: "Technician", label: "Technician" }
  ];
  const loadUsers = useCallback(async () => {
    try {
      const token = sessionStorage.getItem("token");
      const res = await axios.get(`${API}/Users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(res.data);
    } catch (err) {
      console.error("Failed to load users", err.response || err);
    }
  }, [API]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const notify = (msg) => { setModalText(msg); setShowModal(true); };
  const resetUserForm = () => {
    setNewUser({
      username: "",
      password: "",
      role: ""
    });

    setIsEditMode(false);
    setEditingUserId(null);
    setShowAddPanel(false);
    setAddLoading(false);
  };
  const activateUser = async (id) => {
    try {
      await axios.post(`${API}/activate/${id}`, {}, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` }
      });
      notify("User activated successfully");
      loadUsers();
    } catch { notify("Failed to activate user"); }
  };
  const editUser = (user) => {

    setShowAddPanel(true);

    setIsEditMode(true);

    setEditingUserId(user.id);

    setNewUser({
      username: user.username || "",
      password: user.password || "",
      role: user.role || ""
    });
    // AUTO SCROLL
    setTimeout(() => {
      addPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 100);
  };
  const deleteUser = async (id) => {

    try {

      await axios.post(
        `${API}/delete/${id}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem("token")}`
          }
        }
      );

      notify("User deleted successfully");

      loadUsers();

    } catch {

      notify("Failed to delete user");

    }
  };
  const deactivateUser = async (id) => {
    try {
      await axios.post(`${API}/deactivate/${id}`, {}, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` }
      });
      notify("User deactivated successfully");
      loadUsers();
    } catch { notify("Failed to deactivate user"); }
  };

  const handlePasswordChange = (id, value) =>
    setPasswords({ ...passwords, [id]: value });

  // const resetPassword = async (id) => {
  //   const password = passwords[id];
  //   if (!password) { notify("Enter a new password first"); return; }
  //   try {
  //     await axios.post(`${API}/reset-password`, { id, password }, {
  //       headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` }
  //     });
  //     notify("Password reset successfully");
  //     setPasswords({ ...passwords, [id]: "" });
  //   } catch { notify("Failed to reset password"); }
  // };
  const resetPassword = async (id) => {

    // FIND USER
    const selectedUser = users.find(u => u.id === id);

    // CHECK ACTIVE STATUS
    if (!selectedUser?.isActive) {
      notify(
        "User is deactivated. Please activate the user first before resetting the password."
      );
      return;
    }

    const password = passwords[id];

    // EMPTY CHECK
    if (!password) {
      notify("Enter a new password first");
      return;
    }

    // NO SPACES ALLOWED
    if (/\s/.test(password)) {
      notify("Password should not contain spaces");
      return;
    }

    // PASSWORD VALIDATION
    // Minimum 8 chars
    // At least 1 number
    // At least 1 special character
    const passwordRegex =
      /^(?=.*[0-9])(?=.*[!@#$%^&*])[A-Za-z0-9!@#$%^&*]{8,}$/;

    if (!passwordRegex.test(password)) {
      notify(
        "Password must be at least 8 characters and include at least 1 number and 1 special character"
      );
      return;
    }

    try {

      await axios.post(
        `${API}/reset-password`,
        { id, password },
        {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem("token")}`
          }
        }
      );

      notify("Password reset successfully");

      setPasswords({
        ...passwords,
        [id]: ""
      });

    } catch {

      notify("Failed to reset password");

    }
  };

  // const addUser = async (e) => {
  //   e.preventDefault();
  //   setAddLoading(true);
  //   try {
  //     await axios.post(`${API}/add-user`,
  //       { Username: newUser.username, Password: newUser.password, Role: newUser.role },
  //       {
  //         headers: {
  //           "Content-Type": "application/json",
  //           Authorization: `Bearer ${sessionStorage.getItem("token")}`
  //         }
  //       }
  //     );
  //     notify("User added successfully");
  //     setNewUser({ username: "", password: "", role: "User" });
  //     setShowAddPanel(false);
  //     await loadUsers();
  //   } catch (err) {
  //     notify(err.response?.data?.message || "Failed to add user");
  //   } finally {
  //     setAddLoading(false);
  //   }
  // };
  const addUser = async (e) => {

    e.preventDefault();

    // TRIM VALUES
    const username = newUser.username.trim();
    const password = newUser.password.trim();
    const role = newUser.role;

    // USERNAME CHECK
    if (!/[a-zA-Z]/.test(username)) {
      notify("Username must contain at least one alphabet character");
      return;
    }

    // PASSWORD CHECK
    // ONLY ALLOW LETTERS + NUMBERS + UNDERSCORE
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      notify(
        "Username can only contain letters, numbers, and underscore"
      );
      return;
    }

    // ROLE CHECK
    if (!role) {
      notify("Please select a role");
      return;
    }

    // NO SPACES ALLOWED
    if (/\s/.test(username)) {
      notify("Username should not contain spaces");
      return;
    }

    if (/\s/.test(password)) {
      notify("Password should not contain spaces");
      return;
    }

    // PASSWORD VALIDATION
    const passwordRegex =
      /^(?=.*[0-9])(?=.*[!@#$%^&*])[A-Za-z0-9!@#$%^&*]{8,}$/;

    if (!passwordRegex.test(password)) {
      notify(
        "Password must be at least 8 characters and include at least 1 number and 1 special character"
      );
      return;
    }

    setAddLoading(true);

    try {

      await axios.post(
        `${API}/add-user`,
        {
          Username: username,
          Password: password,
          Role: role
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionStorage.getItem("token")}`
          }
        }
      );

      notify("User added successfully");

      // RESET FORM
      // setNewUser({
      //   username: "",
      //   password: "",
      //   role: ""
      // });
      resetUserForm();

      setShowAddPanel(false);

      await loadUsers();

    } catch (err) {

      notify(
        err.response?.data?.message || "Failed to add user"
      );

    } finally {

      setAddLoading(false);

    }
  };
  const updateUser = async (e) => {

    e.preventDefault();

    const username = newUser.username.trim();
    const password = newUser.password.trim();
    const role = newUser.role;

    if (!username) {
      notify("Username is required");
      return;
    }

    if (!role) {
      notify("Please select a role");
      return;
    }

    if (/\s/.test(username)) {
      notify("Username should not contain spaces");
      return;
    }

    // PASSWORD VALIDATION ONLY IF ENTERED
    if (password) {

      if (/\s/.test(password)) {
        notify("Password should not contain spaces");
        return;
      }

      const passwordRegex =
        /^(?=.*[0-9])(?=.*[!@#$%^&*])[A-Za-z0-9!@#$%^&*]{8,}$/;

      if (!passwordRegex.test(password)) {
        notify(
          "Password must be at least 8 characters and include at least 1 number and 1 special character"
        );
        return;
      }
    }

    setAddLoading(true);

    try {

      await axios.put(
        `${API}/update-user`,
        {
          id: editingUserId,
          username,
          password,
          role
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionStorage.getItem("token")}`
          }
        }
      );

      notify("User updated successfully");

      setNewUser({
        username: "",
        password: "",
        role: ""
      });

      setIsEditMode(false);

      setEditingUserId(null);

      setShowAddPanel(false);

      loadUsers();

    } catch (err) {

      notify(
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Failed to update user"
      );

    } finally {

      setAddLoading(false);

    }
  };

  // Derived data
  const filtered = users.filter(u =>
    u.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalPages = Math.ceil(filtered.length / USERS_PER_PAGE);
  const safeCurrentPage = Math.min(currentPage, totalPages || 1);
  const pageStart = (safeCurrentPage - 1) * USERS_PER_PAGE;
  const pageUsers = filtered.slice(pageStart, pageStart + USERS_PER_PAGE);
  const activeCount = users.filter(u => u.isActive).length;
  const inactiveCount = users.length - activeCount;

  return (
    <div className="um-page">

      {/* ── Header ── */}
      {/* <div className="um-header">
        <div className="um-header-text">
          <h1>User Management</h1>
          <p>Manage all users, roles, and access permissions</p>
        </div>
        <button
          className="um-add-btn"
          onClick={() => {
            if (showAddPanel) {
              resetUserForm();
            } else {
              setNewUser({ username: "", password: "", role: "" });
              setIsEditMode(false);
              setEditingUserId(null);
              setShowAddPanel(true);
            }
          }}
        >
          {showAddPanel ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Cancel
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add User
            </>
          )}
        </button>
      </div> */}
      {/* ── Header ── */}
      <div className="um-header">
        <div className="um-header-text">
          <h1>User Management</h1>
          <p>Manage all users, roles, and access permissions</p>
        </div>

        {!showAddPanel && (
          <button
            className="um-add-btn"
            onClick={() => {
              setNewUser({ username: "", password: "", role: "" });
              setIsEditMode(false);
              setEditingUserId(null);
              setShowAddPanel(true);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add User
          </button>
        )}
      </div>

      {/* ── Stats Row ── */}
      <div className="um-stats">
        <div className="um-stat um-stat-total">
          <span className="um-stat-value">{users.length}</span>
          <span className="um-stat-label">Total</span>
        </div>
        <div className="um-stat um-stat-active">
          <span className="um-stat-value">{activeCount}</span>
          <span className="um-stat-label">Active</span>
        </div>
        <div className="um-stat um-stat-inactive">
          <span className="um-stat-value">{inactiveCount}</span>
          <span className="um-stat-label">Inactive</span>
        </div>
      </div>

      {/* ── Add User Panel ── */}
      <div className={`um-add-panel ${showAddPanel ? "um-add-panel-open" : ""}`}>
        <div className="um-add-panel-inner">
          <div className="um-add-panel-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
            {isEditMode ? "Update User" : "Create New User"}
          </div>
          <form className="um-add-form" onSubmit={isEditMode ? updateUser : addUser}>
            <div className="um-add-grid">
              <div className="um-field">
                <label>Username</label>
                <input type="text" placeholder="Enter username"
                  value={newUser.username}
                  onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                  required />
              </div>
              <div className="um-field">
                <label>Password</label>

                <div className="um-password-wrap">

                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder={
                      isEditMode
                        ? "Leave blank to keep old password"
                        : "Enter password"
                    }
                    value={newUser.password}
                    onChange={e =>
                      setNewUser({
                        ...newUser,
                        password: e.target.value
                      })
                    }
                    required={!isEditMode}
                  />

                  <button
                    type="button"
                    className="um-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      // EYE OFF
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.11 1 12c.92-2.19 2.36-4.08 4.18-5.5" />
                        <path d="M10.58 10.58a2 2 0 0 0 2.83 2.83" />
                        <path d="M9.88 5.09A10.94 10.94 0 0 1 12 4c5 0 9.27 3.89 11 8a11.64 11.64 0 0 1-1.67 2.68" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      // EYE
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>

                </div>
              </div>
              <div className="um-field um-role-field">
                <label>Role</label>
                <Select
                  key={newUser.role || "empty-role"}
                  className="um-react-select"
                  classNamePrefix="um-react"
                  options={roleOptions}
                  isSearchable={false}
                  value={roleOptions.find(
                    (role) => role.value === newUser.role
                  )}
                  onChange={(selectedOption) =>
                    setNewUser({
                      ...newUser,
                      role: selectedOption.value
                    })
                  }
                  menuPortalTarget={document.body}
                />
              </div>
            </div>
            <div className="um-add-actions">
              <button
                type="button"
                className="um-btn-ghost"
                onClick={resetUserForm}
              >
                Cancel
              </button>
              <button type="submit" className="um-btn-primary" disabled={addLoading}>
                {addLoading
                  ? <><span className="btn-spinner" /> Adding...</>
                  : <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {isEditMode ? "Update User" : "Create User"}
                  </>
                }
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── Search Bar ── */}
      <div className="um-search-row">
        <div className="um-search-wrap">
          <svg className="um-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="um-search"
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          />
          {searchTerm && (
            <button className="um-search-clear" onClick={() => { setSearchTerm(""); setCurrentPage(1); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        {/* <span className="um-results-count">
          {filtered.length} user{filtered.length !== 1 ? "s" : ""}
        </span> */}
      </div>

      {/* ── Table ── */}
      <div className="um-table-wrap">
        <div className="um-table-scroll">
          <table className="um-table">
            <thead>
              <tr>
                <th>#</th>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Access</th>
                <th>Reset Password</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="um-empty">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                    </svg>
                    <span>{searchTerm ? "No users match your search" : "No users found"}</span>
                  </td>
                </tr>
              ) : (
                pageUsers.map((u, i) => (
                  <tr key={u.id || i}>
                    <td className="um-td-num">{pageStart + i + 1}</td>
                    <td>
                      <div className="um-user-cell">
                        <div className="um-avatar">{(u.username || "?")[0].toUpperCase()}</div>
                        <span className="um-username">{u.username}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`um-badge um-badge-${(u.role || "user").toLowerCase()}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`um-status ${u.isActive ? "um-status-active" : "um-status-inactive"}`}>
                        <span className="um-status-dot" />
                        {u.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      {u.isActive ? (
                        <button className="um-action-btn um-action-deactivate"
                          onClick={() => deactivateUser(u.id)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                          </svg>
                          Deactivate
                        </button>
                      ) : (
                        <button className="um-action-btn um-action-activate"
                          onClick={() => activateUser(u.id)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                          Activate
                        </button>
                      )}
                    </td>
                    <td>
                      <div className="um-reset-row">
                        <input
                          type="password"
                          placeholder="New password"
                          value={passwords[u.id] || ""}
                          onChange={e => handlePasswordChange(u.id, e.target.value)}
                        />
                        <button className="um-action-btn um-action-reset"
                          onClick={() => resetPassword(u.id)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                          Reset
                        </button>
                      </div>
                    </td>
                    <td>
                      <div className="um-action-group">

                        {/* EDIT */}
                        <button
                          className="um-action-btn um-action-edit"
                          onClick={() => editUser(u)}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                          Edit
                        </button>

                        {/* DELETE */}
                        <button
                          className="um-action-btn um-action-delete"
                          onClick={() => deleteUser(u.id)}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                            <path d="M9 6V4h6v2" />
                          </svg>
                          Delete
                        </button>

                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="um-pagination">
            <button disabled={safeCurrentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Previous
            </button>
            <span>Page {safeCurrentPage} of {totalPages}</span>
            <button disabled={safeCurrentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}>
              Next
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* ── Notification Modal ── */}
      {showModal && (
        <div className="um-modal-overlay">
          <div className="um-modal">
            <div className="um-modal-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h3>Notification</h3>
            <p>{modalText}</p>
            <button className="um-modal-close" onClick={() => setShowModal(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
