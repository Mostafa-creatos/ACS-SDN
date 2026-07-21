import React, { createContext, useContext, useState, useEffect } from 'react';

export type UserRole = 'Platform Admin' | 'Tenant Admin' | 'Operator' | 'Read-only' | 'platform_admin' | 'tenant_admin';

export interface User {
  email: string;
  role: UserRole;
  tenants: string[];
  must_change_password?: boolean;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  selectedTenant: string;
  setSelectedTenant: (tenant: string) => void;
  login: (token: string, refreshToken?: string) => void;
  logout: () => void;
  refreshToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to decode JWT payload safely without extra libraries
const decodeToken = (token: string): any => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
};

const isTokenExpired = (token: string): boolean => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window.atob(base64).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    const decoded = JSON.parse(jsonPayload);
    return !decoded.exp || Date.now() >= decoded.exp * 1000;
  } catch {
    return true;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('atlas_jwt'));
  const [user, setUser] = useState<User | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<string>(
    localStorage.getItem('atlas_tenant') || 'AtlasWave Maroc Demo'
  );

  useEffect(() => {
    if (token) {
      const decoded = decodeToken(token);
      if (!decoded) {
        localStorage.removeItem('atlas_jwt');
        localStorage.removeItem('atlas_refresh');
        setToken(null);
        setUser(null);
        return;
      }
      localStorage.setItem('atlas_jwt', token);
      let mappedRole = (decoded.role || 'Operator') as UserRole;
      if (decoded.role === 'Tenant Operator') mappedRole = 'Operator';
      if (decoded.role === 'Tenant Auditor') mappedRole = 'Read-only';
      setUser({
        email: decoded.sub || decoded.email || '',
        role: mappedRole,
        tenants: decoded.tenants || [],
        must_change_password: decoded.must_change_password || false,
      });
    } else {
      localStorage.removeItem('atlas_jwt');
      setUser(null);
    }
  }, [token]);

  useEffect(() => {
    const storedToken = localStorage.getItem('atlas_jwt');
    if (storedToken && isTokenExpired(storedToken)) {
      const storedRefresh = localStorage.getItem('atlas_refresh');
      if (storedRefresh) {
        fetch('/api/v5/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: storedRefresh })
        })
          .then(r => r.json())
          .then(data => {
            if (data.access_token) {
              setToken(data.access_token);
              if (data.refresh_token) localStorage.setItem('atlas_refresh', data.refresh_token);
            } else {
              logout();
            }
          })
          .catch(() => logout());
      } else {
        logout();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = (newToken: string, refreshToken?: string) => {
    if (refreshToken) localStorage.setItem('atlas_refresh', refreshToken);
    setToken(newToken);
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem('atlas_jwt');
    localStorage.removeItem('atlas_refresh');
  };

  const refreshTokenFn = async (): Promise<boolean> => {
    const storedRefresh = localStorage.getItem('atlas_refresh');
    if (!storedRefresh) return false;
    try {
      const res = await fetch('/api/v5/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: storedRefresh })
      });
      if (!res.ok) return false;
      const data = await res.json();
      setToken(data.access_token);
      if (data.refresh_token) localStorage.setItem('atlas_refresh', data.refresh_token);
      return true;
    } catch {
      return false;
    }
  };

  const handleSetTenant = (tenant: string) => {
    setSelectedTenant(tenant);
    localStorage.setItem('atlas_tenant', tenant);
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        selectedTenant,
        setSelectedTenant: handleSetTenant,
        login,
        logout,
        refreshToken: refreshTokenFn,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
