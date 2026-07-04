import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Login from "@/pages/Login";
import Batches from "@/pages/Batches";
import BatchDetail from "@/pages/BatchDetail";
import MarksEntry from "@/pages/MarksEntry";
import StudentProfile from "@/pages/StudentProfile";
import Settings from "@/pages/Settings";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-[#71717A]">
        Loading LYRO...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                borderRadius: 0,
                border: "1px solid #E4E4E7",
                fontFamily: "Manrope",
              },
            }}
          />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <Protected>
                  <Batches />
                </Protected>
              }
            />
            <Route
              path="/batches/:batchId"
              element={
                <Protected>
                  <BatchDetail />
                </Protected>
              }
            />
            <Route
              path="/tests/:testId/marks"
              element={
                <Protected>
                  <MarksEntry />
                </Protected>
              }
            />
            <Route
              path="/students/:studentId"
              element={
                <Protected>
                  <StudentProfile />
                </Protected>
              }
            />
            <Route
              path="/settings"
              element={
                <Protected>
                  <Settings />
                </Protected>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
