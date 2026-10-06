import {
  PAPER_SIZES,
  PRINT_MAX_BYTES,
  PRINT_MAX_COPIES,
  pricePrintJob,
  type PaperSize,
  type PrintOrderConfig,
  type PrivateDocument,
} from '@platform/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  LoadingView,
  Screen,
  TextField,
  useToast,
} from '@/components/ui';
import { newIdempotencyKey, rupees } from '@/features/orders/cart';
import { errorMessage, serverFieldErrors } from '@/lib/errors';
import { ordersService } from '@/services/orders.service';
import { servicesService } from '@/services/services.service';
import { uploadsService } from '@/services/uploads.service';
import { colors, radius, space } from '@/theme/tokens';

/** Send a PDF to a print shop: pick it, choose options, see the price, pick it up and pay there. */
export default function PrintOrderScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const toast = useToast();
  const [document, setDocument] = useState<PrivateDocument | null>(null);
  const [copies, setCopies] = useState('1');
  const [color, setColor] = useState(false);
  const [doubleSided, setDoubleSided] = useState(false);
  const [paperSize, setPaperSize] = useState<PaperSize>('A4');
  const [binding, setBinding] = useState(false);
  const [lamination, setLamination] = useState(false);
  const [note, setNote] = useState('');
  const key = useRef<string | null>(null);

  const services = useQuery({
    queryKey: ['place-services', slug],
    queryFn: ({ signal }) => servicesService.placeServices(slug, signal).then((r) => r.data),
  });
  const upload = useMutation({
    mutationFn: async () => {
      const picked = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      const asset = picked.canceled ? null : picked.assets[0];
      if (!asset) return null;
      if ((asset.size ?? 0) > PRINT_MAX_BYTES) throw new Error('The PDF is larger than 20 MB.');
      return uploadsService
        .uploadDocument({ uri: asset.uri, name: asset.name || 'document.pdf', type: 'application/pdf' })
        .then((r) => r.data);
    },
    onSuccess: (doc) => {
      if (!doc) return;
      if (doc.kind !== 'PRINT') toast('Choose a PDF file', 'error');
      else {
        setDocument(doc);
        key.current = null;
      }
    },
    onError: (error) => toast(error instanceof Error && !('status' in error) ? error.message : errorMessage(error), 'error'),
  });
  const count = Math.min(PRINT_MAX_COPIES, Math.max(1, Number(copies) || 1));
  const options = { copies: count, color, doubleSided, paperSize, binding, lamination };
  const place = useMutation({
    mutationFn: () => {
      key.current ??= newIdempotencyKey();
      return ordersService
        .placePrintOrder({
          placeId: services.data!.placeId,
          documentId: document!.id,
          ...options,
          ...(note.trim() ? { note: note.trim() } : {}),
          idempotencyKey: key.current,
        })
        .then((r) => r.data);
    },
    onSuccess: (order) => {
      toast(`Print order ${order.code} sent`);
      router.replace({ pathname: '/order/[id]', params: { id: order.id } });
    },
    onError: (error) => {
      key.current = null;
      toast(Object.values(serverFieldErrors(error)).join(' ') || errorMessage(error), 'error');
    },
  });

  if (services.isPending) return <LoadingView />;
  if (services.isError) return <ErrorState error={services.error} onRetry={() => void services.refetch()} />;
  const print = services.data.services.find((service) => service.kind === 'PRINT_ORDER');
  if (!print) return <EmptyState icon="print-outline" title="No print orders here" message="This shop does not take print orders on CampusPin." />;
  const config = print.config as PrintOrderConfig;
  const priced = document?.pageCount ? pricePrintJob(config, document.pageCount, options) : null;

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: `Print at ${services.data.name}` }} />
      <View style={styles.gap}>
        <Card style={styles.gap}>
          <AppText variant="subheading">1. Your PDF</AppText>
          {document ? (
            <View style={styles.row}>
              <Icon name="document-text-outline" size={22} color={colors.brand} />
              <AppText color={colors.ink} style={styles.flex} numberOfLines={1}>
                {document.fileName} · {document.pageCount} pages
              </AppText>
              <Button title="Change" size="sm" variant="ghost" fullWidth={false} onPress={() => upload.mutate()} />
            </View>
          ) : (
            <Button title={upload.isPending ? 'Uploading…' : 'Choose a PDF'} icon="document-attach-outline" loading={upload.isPending} onPress={() => upload.mutate()} />
          )}
          <AppText variant="caption">Only you and the shop can see it. It is deleted when the job is done.</AppText>
        </Card>

        <Card style={styles.gap}>
          <AppText variant="subheading">2. Options</AppText>
          <TextField label="Copies" keyboardType="number-pad" value={copies} onChangeText={(value) => setCopies(value.replace(/\D/g, ''))} />
          <View style={styles.wrap}>
            <Chip label={`B/W ${rupees(config.bwPricePerPage)}/page`} selected={!color} onPress={() => setColor(false)} />
            {config.colorPricePerPage !== null ? (
              <Chip label={`Colour ${rupees(config.colorPricePerPage)}/page`} selected={color} onPress={() => setColor(true)} />
            ) : null}
          </View>
          <View style={styles.wrap}>
            <Chip label="Single-sided" selected={!doubleSided} onPress={() => setDoubleSided(false)} />
            {config.doubleSided ? <Chip label="Double-sided" selected={doubleSided} onPress={() => setDoubleSided(true)} /> : null}
          </View>
          <View style={styles.wrap}>
            {PAPER_SIZES.filter((size) => config.paperSizes.includes(size)).map((size) => (
              <Chip key={size} label={size} selected={paperSize === size} onPress={() => setPaperSize(size)} />
            ))}
          </View>
          <View style={styles.wrap}>
            {config.bindingPrice !== null ? (
              <Chip label={`Binding ${rupees(config.bindingPrice)}`} selected={binding} onPress={() => setBinding(!binding)} />
            ) : null}
            {config.laminationPricePerPage !== null ? (
              <Chip label={`Lamination ${rupees(config.laminationPricePerPage)}/page`} selected={lamination} onPress={() => setLamination(!lamination)} />
            ) : null}
          </View>
          <TextField label="Note for the shop (optional)" value={note} maxLength={300} onChangeText={setNote} />
        </Card>

        <Card style={styles.gap}>
          <AppText variant="subheading">3. Price</AppText>
          {!document ? (
            <AppText variant="small">Choose your PDF to see the price.</AppText>
          ) : priced && 'problem' in priced ? (
            <AppText color={colors.danger}>{priced.problem}</AppText>
          ) : priced ? (
            <>
              {priced.lines.map((line) => (
                <View key={line.name} style={styles.row}>
                  <AppText variant="small" style={styles.flex}>
                    {line.name} × {line.quantity}
                  </AppText>
                  <AppText>{rupees(line.unitPrice * line.quantity)}</AppText>
                </View>
              ))}
              <View style={[styles.row, styles.total]}>
                <AppText variant="heading" style={styles.flex}>
                  Total
                </AppText>
                <AppText variant="heading">{rupees(priced.subtotal)}</AppText>
              </View>
              <AppText variant="caption">Pay at pickup. The shop sees the same price.</AppText>
            </>
          ) : null}
        </Card>

        <Button
          title={`Send to ${services.data.name}`}
          variant="success"
          icon="send"
          loading={place.isPending}
          disabled={!document || !priced || 'problem' in priced || !config.acceptingOrders}
          onPress={() => place.mutate()}
        />
        {!config.acceptingOrders ? <AppText color={colors.warning}>Not taking print orders right now.</AppText> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  total: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: space.sm, borderRadius: radius.sm },
});
