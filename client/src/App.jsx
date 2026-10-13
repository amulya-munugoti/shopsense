import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const VendorLayout = lazy(() => import("./pages/vendor/VendorLayout"));
const VendorDashboard = lazy(() => import("./pages/vendor/VendorDashboard"));
const VendorCatalog = lazy(() => import("./pages/vendor/VendorCatalog"));
const VendorProductForm = lazy(() => import("./pages/vendor/VendorProductForm"));
const VendorInsights = lazy(() => import("./pages/vendor/VendorInsights"));
const VendorAssistant = lazy(() => import("./pages/vendor/VendorAssistant"));
const VendorProfile = lazy(() => import("./pages/vendor/VendorProfile"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminVendors = lazy(() => import("./pages/admin/AdminVendors"));

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<div className="min-h-screen" style={{ background: "var(--bg)" }} />}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin/login" element={<Login initialRole="admin" />} />
          <Route path="/register" element={<Register />} />

          <Route
            path="/vendor"
            element={
              <ProtectedRoute role="vendor">
                <VendorLayout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<VendorDashboard />} />
            <Route path="catalog" element={<VendorCatalog />} />
            <Route path="add-product" element={<VendorProductForm />} />
            <Route path="edit-product/:id" element={<VendorProductForm />} />
            <Route path="insights" element={<VendorInsights />} />
            <Route path="assistant" element={<VendorAssistant />} />
            <Route path="profile" element={<VendorProfile />} />
          </Route>

          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="vendors" element={<AdminVendors />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
