import { MAX_REVIEW_COMMENT_LENGTH, type Review } from '@platform/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { FormAlert } from '@/components/form-alert';
import { StarInput } from '@/components/stars';
import { AppText, Button, Card, ErrorState, LoadingView, Screen, TextField, useToast } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { placesService } from '@/services/places.service';
import { reviewsService } from '@/services/reviews.service';
import { colors, space } from '@/theme/tokens';

const RATING_WORDS = ['', 'Poor', 'Below average', 'Okay', 'Good', 'Excellent'];

/** Write, edit or withdraw my review of a place. Students only. */
export default function ReviewScreen() {
  const params = useLocalSearchParams<{ slug: string; rating?: string }>();
  const slug = params.slug;
  const place = useQuery({
    queryKey: ['place', slug],
    queryFn: ({ signal }) => placesService.getBySlug(slug, signal).then((r) => r.data),
  });
  const summary = useQuery({
    queryKey: ['reviews', slug, 'summary'],
    queryFn: ({ signal }) => reviewsService.summary(slug, signal).then((r) => r.data),
  });
  const mine = useQuery({
    queryKey: ['reviews', 'mine', place.data?.id],
    enabled: Boolean(place.data),
    queryFn: ({ signal }) => reviewsService.mineForPlace(place.data!.id, signal).then((r) => r.data[0] ?? null),
  });

  if (place.isPending || summary.isPending || (place.data && mine.isPending)) {
    return (
      <>
        <Stack.Screen options={{ title: 'Your review' }} />
        <LoadingView />
      </>
    );
  }
  if (place.isError || summary.isError || mine.isError) {
    return (
      <>
        <Stack.Screen options={{ title: 'Your review' }} />
        <ErrorState error={place.error ?? summary.error ?? mine.error} onRetry={() => void place.refetch()} />
      </>
    );
  }
  return (
    <ReviewForm
      slug={slug}
      placeName={place.data.name}
      dimensions={summary.data.dimensions}
      existing={mine.data ?? null}
      initialRating={Number(params.rating) || 0}
    />
  );
}

function ReviewForm({
  slug,
  placeName,
  dimensions,
  existing,
  initialRating,
}: {
  slug: string;
  placeName: string;
  dimensions: { id: string; label: string }[];
  existing: Review | null;
  initialRating: number;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(existing?.rating ?? initialRating);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [dims, setDims] = useState<Record<string, number>>(() =>
    Object.fromEntries((existing?.dimensionRatings ?? []).map((d) => [d.dimensionId, d.rating])),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function done(message: string) {
    void queryClient.invalidateQueries({ queryKey: ['reviews'] });
    void queryClient.invalidateQueries({ queryKey: ['place', slug] });
    toast(message);
    router.back();
  }

  async function submit() {
    if (!rating) {
      setError('Tap the stars to choose a rating.');
      return;
    }
    setBusy(true);
    setError(null);
    const dimensionRatings = Object.entries(dims).map(([dimensionId, value]) => ({ dimensionId, rating: value }));
    try {
      if (existing) {
        await reviewsService.update(existing.id, {
          rating,
          comment: comment.trim() ? comment.trim() : null,
          dimensionRatings,
        });
        done('Review updated');
      } else {
        await reviewsService.create(slug, {
          rating,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
          dimensionRatings,
        });
        done('Thanks for your review!');
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  function withdraw() {
    if (!existing) return;
    Alert.alert('Withdraw your review?', 'It will be removed from this place.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: () => {
          reviewsService
            .withdraw(existing.id)
            .then(() => done('Review withdrawn'))
            .catch((caught: unknown) => toast(errorMessage(caught), 'error'));
        },
      },
    ]);
  }

  const editable = !existing || existing.status === 'PUBLISHED';

  return (
    <>
      <Stack.Screen options={{ title: existing ? 'Edit your review' : 'Write a review' }} />
      <Screen
        keyboard
        footer={
          editable ? (
            <Button title={existing ? 'Save review' : 'Post review'} size="lg" loading={busy} onPress={() => void submit()} />
          ) : undefined
        }
      >
        <View style={styles.form}>
          <AppText variant="small">Reviewing</AppText>
          <AppText variant="title">{placeName}</AppText>
          {existing && existing.status !== 'PUBLISHED' ? (
            <FormAlert
              tone="info"
              message={
                existing.status === 'REMOVED'
                  ? `A moderator removed your review${existing.moderationNote ? `: ${existing.moderationNote}` : '.'}`
                  : 'Your review is being checked by a moderator.'
              }
            />
          ) : null}
          {error ? <FormAlert message={error} /> : null}

          <Card style={styles.center}>
            <StarInput value={rating} onChange={setRating} size={42} label="Overall rating" />
            <AppText variant="subheading" color={rating ? colors.ink : colors.muted}>
              {rating ? RATING_WORDS[rating] : 'Tap to rate'}
            </AppText>
          </Card>

          {dimensions.length > 0 ? (
            <Card style={styles.dims}>
              <AppText variant="subheading">Rate the details (optional)</AppText>
              {dimensions.map((dimension) => (
                <View key={dimension.id} style={styles.dim}>
                  <AppText color={colors.ink} style={styles.flex}>
                    {dimension.label}
                  </AppText>
                  <StarInput
                    value={dims[dimension.id] ?? 0}
                    size={22}
                    onChange={(value) => setDims((current) => ({ ...current, [dimension.id]: value }))}
                  />
                </View>
              ))}
            </Card>
          ) : null}

          <TextField
            label="Your review (optional)"
            placeholder="What was good? What could be better? Tips for other students?"
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={MAX_REVIEW_COMMENT_LENGTH}
            editable={editable}
          />
          {existing ? <Button title="Withdraw review" variant="ghost" icon="trash-outline" onPress={withdraw} /> : null}
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.lg },
  flex: { flex: 1 },
  center: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  dims: { gap: space.md },
  dim: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
