import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import Chatbot from "./pages/Chatbot";
import Login from "./pages/Login";
import UploadedPdfs from "./pages/UploadedPdfs";
import useBlockBrowserNavigation from "./hooks/useBlockBrowserNavigation";


function App() {
  const token =
    sessionStorage.getItem("token");

  useBlockBrowserNavigation(
    Boolean(token)
  );

  return (
    <BrowserRouter>
      <Routes>

        {/* Login page — no layout */}
        <Route path="/login" element={<Login />} />

        {/* Redirect root to dashboard */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Dashboard */}
        <Route
          path="/dashboard"
          element={
            <Layout>
              <Dashboard />
            </Layout>
          }
        />

        {/* Users */}
        <Route
          path="/users"
          element={
            <Layout>
              <Users />
            </Layout>
          }
        />

        {/* Chatbot */}
        <Route
          path="/chatbot"
          element={
            <Layout>
              <Chatbot />
            </Layout>
          }
        />

        {/* Uploaded PDFs */}
        <Route
          path="/uploaded-pdfs"
          element={
            <Layout>
              <UploadedPdfs />
            </Layout>
          }
        />

      </Routes>
    </BrowserRouter>
  );
}

export default App;