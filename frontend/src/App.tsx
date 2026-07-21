import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppShell } from './components/AppShell';
import { Login } from './pages/Login';
import { Styleguide } from './pages/Styleguide';
import { Dashboard } from './pages/Dashboard';
import { SwitchesNew } from './pages/SwitchesNew';
import { Topology } from './pages/Topology';
import { IPAM } from './pages/IPAM';
import { Compliance } from './pages/Compliance';
import { PendingApprovals } from './pages/PendingApprovals';
import { ZtpConsolePage } from './pages/ZtpConsolePage';
import { UsersPage } from './pages/UsersPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { TenantsPage } from './pages/TenantsPage';
import { TenantFabricMapping } from './pages/TenantFabricMapping';
import { STPPage } from './pages/STPPage';
import { ReportsPage } from './pages/ReportsPage';
import { ConfigPushPage } from './pages/ConfigPushPage';
import { AuditLogsPage } from './pages/AuditLogsPage';

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
  const { token, user } = useAuth();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (user?.must_change_password) {
    return <Navigate to="/change-password" replace />;
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
              <Route path="switches" element={<SwitchesNew />} />
              <Route path="stp" element={<STPPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="topology" element={<Topology />} />
              <Route path="ipam" element={<IPAM />} />
              <Route path="compliance" element={<Compliance />} />
              <Route path="pending-approvals" element={<PendingApprovals />} />
              <Route path="ztp" element={<ZtpConsolePage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="tenants" element={<TenantsPage />} />
              <Route path="tenants/:tenantId/mapping" element={<TenantFabricMapping />} />
              <Route path="config-push" element={<ConfigPushPage />} />
              <Route path="audit-logs" element={<AuditLogsPage />} />
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
