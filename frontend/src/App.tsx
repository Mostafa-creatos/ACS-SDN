import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppShell } from './components/AppShell';
import { Login } from './pages/Login';
import { Styleguide } from './pages/Styleguide';
import { Dashboard } from './pages/Dashboard';
import { Switches } from './pages/Switches';
import { Topology } from './pages/Topology';
import { IPAM } from './pages/IPAM';
import { Compliance } from './pages/Compliance';
import { PendingApprovals } from './pages/PendingApprovals';
import { ZtpConsolePage } from './pages/ZtpConsolePage';
import { UsersPage } from './pages/UsersPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { TenantsPage } from './pages/TenantsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

// Protected Route Wrapper (Auth Guard)
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/styleguide" element={<Styleguide />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />

            {/* Protected dashboard shell routes */}
            <Route 
              path="/" 
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="switches" element={<Switches />} />
              <Route path="topology" element={<Topology />} />
              <Route path="ipam" element={<IPAM />} />
              <Route path="compliance" element={<Compliance />} />
              <Route path="pending-approvals" element={<PendingApprovals />} />
              <Route path="ztp" element={<ZtpConsolePage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="tenants" element={<TenantsPage />} />
            </Route>

            {/* Catch-all fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};
export default App;
