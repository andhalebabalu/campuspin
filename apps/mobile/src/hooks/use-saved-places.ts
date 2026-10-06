import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { placesService } from '@/services/places.service';

const KEY = ['places', 'saved', 'ids'] as const;

/**
 * My bookmarked places: whether a place is saved, and a toggle that updates the icon at once and
 * rolls back if the server refuses.
 */
export function useSavedPlaces() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const ids = useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => placesService.savedIds(signal).then((r) => new Set(r.data)),
    staleTime: 5 * 60_000,
  });

  const toggle = useMutation({
    mutationFn: ({ placeId, save }: { placeId: string; save: boolean }) =>
      save ? placesService.save(placeId) : placesService.unsave(placeId),
    onMutate: async ({ placeId, save }) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      await queryClient.cancelQueries({ queryKey: KEY });
      const previous = queryClient.getQueryData<Set<string>>(KEY);
      const next = new Set(previous);
      if (save) next.add(placeId);
      else next.delete(placeId);
      queryClient.setQueryData(KEY, next);
      return { previous };
    },
    onError: (error, _vars, context) => {
      queryClient.setQueryData(KEY, context?.previous);
      toast(errorMessage(error), 'error');
    },
    onSuccess: (_data, { save }) => {
      toast(save ? 'Saved' : 'Removed from saved');
      void queryClient.invalidateQueries({ queryKey: ['places', 'saved', 'list'] });
    },
  });

  return {
    isSaved: (placeId: string) => ids.data?.has(placeId) ?? false,
    toggle: (placeId: string) =>
      toggle.mutate({ placeId, save: !(ids.data?.has(placeId) ?? false) }),
  };
}
