import { useQuery } from '@tanstack/react-query';
import { fetchDashboard } from '../lib/api';
import type { DashboardData } from '../types/dashboard-types';

export const DASHBOARD_QUERY_KEY = 'dashboard';

export const useDashboard = (tenantId?: string | null) => {
  return useQuery<DashboardData, Error>({
    queryKey: [DASHBOARD_QUERY_KEY, tenantId],
    queryFn: () => fetchDashboard(tenantId),
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 2,
  });
};
