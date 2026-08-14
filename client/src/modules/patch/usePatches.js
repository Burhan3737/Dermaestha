// @ts-check
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient/apiClient.js';

/** Patches module data + run mutation. Polls (v5 signature: receives the query) while any patch runs. */
export function usePatches() {
  const qc = useQueryClient();

  const patches = useQuery({
    queryKey: ['patches'],
    queryFn: () => api.get('/patches'),
    refetchInterval: (query) =>
      query.state.data?.patches?.some((p) => p.status === 'running') ? 2000 : false,
  });

  const runPatch = useMutation({
    mutationFn: (id) => api.post(`/patches/${id}/run`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patches'] }),
  });

  return { patches, runPatch };
}
