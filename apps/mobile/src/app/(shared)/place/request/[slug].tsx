import type { PrivateDocument, ServiceRequestConfig } from '@platform/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Chip, EmptyState, ErrorState, LoadingView, Screen, TextField, useToast } from '@/components/ui';
import { pickPhoto, toLocalFile } from '@/components/photo-picker';
import { newIdempotencyKey, rupees } from '@/features/orders/cart';
import { errorMessage, serverFieldErrors } from '@/lib/errors';
import { engagementService } from '@/services/engagement.service';
import { servicesService } from '@/services/services.service';
import { uploadsService } from '@/services/uploads.service';
import { colors, space } from '@/theme/tokens';

/**
 * Ask a business to take a job (repair, laundry): what it is, what's wrong, a photo if useful.
 * The business answers with an estimate; nothing starts until the student approves it.
 */
export default function ServiceRequestScreen() {
  const { slug, key: serviceKey } = useLocalSearchParams<{ slug: string; key: string }>();
  const toast = useToast();
  const [itemId, setItemId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<PrivateDocument | null>(null);
  const idempotency = useRef<string | null>(null);

  const services = useQuery({
    queryKey: ['place-services', slug],
    queryFn: ({ signal }) => servicesService.placeServices(slug, signal).then((r) => r.data),
  });
  const attach = useMutation({
    mutationFn: async () => {
      const asset = await pickPhoto();
      if (!asset) return null;
      return uploadsService.uploadDocument(await toLocalFile(asset)).then((r) => r.data);
    },
    onSuccess: (doc) => {
      if (doc) setPhoto(doc);
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const send = useMutation({
    mutationFn: () => {
      idempotency.current ??= newIdempotencyKey();
      return engagementService
        .sendRequest({
          kind: 'GENERAL',
          placeId: services.data!.placeId,
          serviceKey: String(serviceKey).toUpperCase(),
          ...(itemId ? { itemId } : {}),
          description: description.trim(),
          ...(photo ? { imageId: photo.id } : {}),
          idempotencyKey: idempotency.current,
        })
        .then((r) => r.data);
    },
    onSuccess: (request) => {
      toast(`Request ${request.code} sent`);
      router.replace({ pathname: '/request/[id]', params: { id: request.id } });
    },
    onError: (error) => {
      idempotency.current = null;
      toast(Object.values(serverFieldErrors(error)).join(' ') || errorMessage(error), 'error');
    },
  });

  if (services.isPending) return <LoadingView />;
  if (services.isError) return <ErrorState error={services.error} onRetry={() => void services.refetch()} />;
  const service = services.data.services.find(
    (item) => item.kind === 'SERVICE_REQUEST' && item.key === String(serviceKey).toUpperCase(),
  );
  if (!service) return <EmptyState icon="construct-outline" title="Not offered here" message="This place does not take this request on CampusPin." />;
  const config = service.config as ServiceRequestConfig;
  const items = (services.data.catalog[service.key] ?? []).flatMap((section) => section.items);

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: service.name }} />
      <View style={styles.gap}>
        <AppText variant="title" color={colors.brand}>
          {services.data.name}
        </AppText>
        {items.length > 0 ? (
          <Card style={styles.gap}>
            <AppText variant="subheading">What do you need?</AppText>
            <View style={styles.wrap}>
              {items.map((item) => (
                <Chip key={item.id} label={`${item.name} · ${rupees(item.price)}+`} selected={itemId === item.id} onPress={() => setItemId(itemId === item.id ? null : item.id)} />
              ))}
            </View>
          </Card>
        ) : null}
        <TextField
          label="Describe it"
          value={description}
          multiline
          maxLength={2000}
          placeholder="e.g. Screen cracked after a fall; touch still works."
          onChangeText={setDescription}
        />
        {config.photosAllowed ? (
          <Button
            title={photo ? 'Photo attached · change' : 'Add a photo (optional)'}
            icon="camera-outline"
            variant="outline"
            loading={attach.isPending}
            onPress={() => attach.mutate()}
          />
        ) : null}
        <AppText variant="caption">The business replies with an estimate if needed. Photos are private to you and the business.</AppText>
        <Button
          title="Send request"
          variant="success"
          icon="send"
          loading={send.isPending}
          disabled={description.trim().length < 10 || !config.acceptingRequests}
          onPress={() => send.mutate()}
        />
        {!config.acceptingRequests ? <AppText color={colors.warning}>Not taking new requests right now.</AppText> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
