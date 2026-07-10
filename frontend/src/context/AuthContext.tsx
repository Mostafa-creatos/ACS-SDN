import React, { createContext, useContext, useState, useEffect } from 'react';

export type UserRole = 'Platform Admin' | 'Tenant Admin' | 'Operator' | 'Read-only' | 'platform_admin' | 'tenant_admin';

export interface User {
  email: string;
  role: UserRole;
  tenants: string[];
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  selectedTenant: string;
  setSelectedTenant: (tenant: string) => void;
  login: (token: string) => void;
  logout: () => void;
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
    // If it's not a real JWT (e.g. mock token), return mock data based on token value
    if (token.includes('admin')) {
      return { sub: 'admin@atlascloud.com', role: 'Platform Admin', tenants: ['AtlasWave Maroc Demo', 'Acme-Enterprise', 'Nokia-Lab'] };
    }
    if (token.includes('operator')) {
      return { sub: 'operator@atlascloud.com', role: 'Operator', tenants: ['AtlasWave Maroc Demo'] };
    }
    if (token.includes('auditor') || token.includes('read')) {
      return { sub: 'auditor@atlascloud.com', role: 'Read-only', tenants: ['AtlasWave Maroc Demo'] };
    }
    return { sub: 'user@atlascloud.com', role: 'Tenant Admin', tenants: ['AtlasWave Maroc Demo'] };
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
      localStorage.setItem('atlas_jwt', token);
      const decoded = decodeToken(token);
      let mappedRole = (decoded.role || 'Operator') as UserRole;
      if (decoded.role === 'Tenant Operator') mappedRole = 'Operator';
      if (decoded.role === 'Tenant Auditor') mappedRole = 'Read-only';
      setUser({
        email: decoded.sub || decoded.email || 'user@atlascloud.com',
        role: mappedRole,
        tenants: decoded.tenants || ['AtlasWave Maroc Demo'],
      });
    } else {
      localStorage.removeItem('atlas_jwt');
      setUser(null);
    }
  }, [token]);

  const login = (newToken: string) => {
    setToken(newToken);
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem('atlas_jwt');
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
