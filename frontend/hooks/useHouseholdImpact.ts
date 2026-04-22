import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { HouseholdRequest, HouseholdImpactResponse } from '@/lib/types';

export function useHouseholdImpact(
  request: HouseholdRequest | null,
  enabled: boolean,
  reform: Record<string, Record<string, number | boolean>> = {},
) {
  return useQuery<HouseholdImpactResponse>({
    queryKey: ['householdImpact', request, reform],
    queryFn: () => api.calculateHouseholdImpact(request!, reform),
    enabled: enabled && request !== null,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
