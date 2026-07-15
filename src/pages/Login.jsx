import React, { useState, useEffect } from "react";
import axios from "axios";
import API_BASE_URL from "../apiroute/apiConfig";
import BBLogo from "../assets/BBizLogo1.png";
import { useNavigate } from "react-router-dom";

const Login = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const token =
      sessionStorage.getItem("token");

    const role =
      sessionStorage.getItem("role");

    /*
     * User already logged in असेल आणि browser Back
     * करून login page वर आला, तर login page दाखवू नका.
     */
    if (token) {
      navigate(
        role === "Admin"
          ? "/dashboard"
          : "/chatbot",
        {
          replace: true,
        }
      );
    }
  }, [navigate]);

  const login = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/AuthAPI/Login`,
        {
          Username: username,
          Password: password
        },
        {
          headers: {
            "Content-Type": "application/json"
          },
          withCredentials: true
        }
      );
      sessionStorage.setItem("username", res.data.username);
      sessionStorage.setItem("role", res.data.role);
      if (res.data.token) {
        sessionStorage.setItem("token", res.data.token);
      }

      navigate(
        res.data.role === "Admin"
          ? "/dashboard"
          : "/chatbot",
        {
          replace: true,
        }
      );
      
    } catch (err) {
      console.log(err);
      setError(
        err.response?.data?.message || "Login failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Animated background orbs */}
      <div className="login-orb login-orb-1"></div>
      <div className="login-orb login-orb-2"></div>
      <div className="login-orb login-orb-3"></div>

      <form className="login-card" onSubmit={login}>
        {/* Brand */}
        <div className="login-brand">
          <div className="login-logo">
            {/* <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg> */}
            <img src={BBLogo} alt="SmartAI Logo" className="logo-img" />
          </div>
          <h1>SmartAI</h1>
          <p>Sign in to your account</p>
        </div>

        {/* Error message */}
        {error && <div className="login-error">{error}</div>}

        {/* Username */}
        <div className="login-field">
          <label htmlFor="login-username">Username</label>
          <div className="login-input-wrap">
            <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <input
              id="login-username"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onBlur={() => setUsername(username.trim())}
              required
            />
          </div>
        </div>

        {/* Password */}
        {/* <div className="login-field">
          <label htmlFor="login-password">Password</label>
          <div className="login-input-wrap">
            <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <input
              id="login-password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value.replace(/\s/g, ""))}
              required
            />
          </div>
        </div> */}
        {/* Password */}
        <div className="login-field">
          <label htmlFor="login-password">Password</label>

          <div className="login-input-wrap">

            {/* Lock Icon */}
            <svg
              className="login-input-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>

            {/* Password Input */}
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setPassword(password.trim())}
              required
            />

            {/* Eye Icon */}
            <button
              type="button"
              className="login-eye-btn"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (

                // Eye OFF
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.11 1 12c.73-1.61 1.79-3.03 3.06-4.18" />
                  <path d="M10.58 10.58a2 2 0 1 0 2.83 2.83" />
                  <path d="M1 1l22 22" />
                  <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.89 11 8a10.97 10.97 0 0 1-4.12 5.76" />
                </svg>

              ) : (

                // Eye ON
                <svg
                  width="20"
                  height="20"
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

        {/* Submit */}
        <button
          type="submit"
          className="login-btn"
          disabled={loading}
        >
          {loading ? (
            <span className="login-spinner"></span>
          ) : (
            "Sign In"
          )}
        </button>
        {/* Copyright */}
        <div className="login-copyright">
          © {new Date().getFullYear()} BeyondeBiz Consulting Pvt. Ltd. All rights reserved.
        </div>
      </form>
    </div>
  );
};

export default Login;