import {
  PAPER_SIZES,
  SERVICE_CONFIG_FIELDS,
  isConfigurableKind,
  type PlaceService,
  type ServiceConfigField,
} from '@platform/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  ListSkeleton,
  Screen,
  useToast,
} from '@/components/ui';
import { PlaceSwitcher, usePlaceSelection } from '@/features/business/place-switcher';
import { serviceIcon } from '@/features/services/meta';
import { errorMessage } from '@/lib/errors';
import { servicesService } from '@/services/services.service';
import { colors, radius, space } from '@/theme/tokens';

type Config = Record<string, unknown>;

function ConfigInput({ field, value, onChange }: { field: ServiceConfigField; value: unknown; onChange: (value: unknown) => void }) {
  if (field.type === 'boolean') {
    return (
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppText color={colors.ink}>{field.label}</AppText>
          {field.help ? <AppText variant="small">{field.help}</AppText> : null}
        </View>
        <Switch value={value === true} onValueChange={onChange} trackColor={{ true: colors.go }} accessibilityLabel={field.label} />
      </View>
    );
  }
  if (field.type === 'paperSizes') {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <View style={styles.gapSm}>
        <AppText color={colors.ink}>{field.label}</AppText>
        <View style={styles.wrap}>
          {PAPER_SIZES.map((size) => (
            <Chip
              key={size}
              label={size}
              selected={selected.includes(size)}
              onPress={() => onChange(selected.includes(size) ? selected.filter((item) => item !== size) : [...selected, size])}
            />
          ))}
        </View>
      </View>
    );
  }
  if (field.type === 'tags') {
    return (
      <View style={styles.gapSm}>
        <AppText color={colors.ink}>{field.label}</AppText>
        <TextInput
          defaultValue={Array.isArray(value) ? (value as string[]).join(', ') : ''}
          onEndEditing={(event) =>
            onChange(
              event.nativeEvent.text
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
            )
          }
          placeholder={field.help}
          placeholderTextColor={colors.placeholder}
          style={styles.input}
        />
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <AppText color={colors.ink}>{field.label}</AppText>
        {field.help ? <AppText variant="small">{field.help}</AppText> : null}
      </View>
      <TextInput
        value={typeof value === 'number' ? String(value) : ''}
        keyboardType="number-pad"
        placeholder={field.optional ? 'Not offered' : '0'}
        placeholderTextColor={colors.placeholder}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, '');
          onChange(digits === '' ? (field.optional ? null : 0) : Number(digits));
        }}
        style={[styles.input, styles.number]}
        accessibilityLabel={field.label}
      />
    </View>
  );
}

function ServiceCard({ placeId, service }: { placeId: string; service: PlaceService }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<Config>(service.config);
  const kind = service.serviceType.kind;
  const fields = isConfigurableKind(kind) ? SERVICE_CONFIG_FIELDS[kind] : [];
  const dirty = JSON.stringify(config) !== JSON.stringify(service.config);

  const save = useMutation({
    mutationFn: (dto: { enabled?: boolean; config?: Config }) =>
      servicesService.updateOwnerService(placeId, service.serviceType.key, dto).then((r) => r.data),
    onSuccess: (next, dto) => {
      queryClient.setQueryData<PlaceService[]>(['business', 'services', placeId], (list) =>
        list?.map((item) => (item.serviceType.key === next.serviceType.key ? next : item)),
      );
      setConfig(next.config);
      toast(dto.enabled === undefined ? 'Settings saved' : `${service.serviceType.name} ${dto.enabled ? 'on' : 'off'}`);
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  return (
    <Card style={styles.gap}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Icon name={serviceIcon(service.serviceType.icon)} size={22} color={colors.brand} />
        </View>
        <View style={styles.flex}>
          <AppText variant="subheading">{service.serviceType.name}</AppText>
          {service.serviceType.description ? <AppText variant="small">{service.serviceType.description}</AppText> : null}
        </View>
        <Switch
          value={service.enabled}
          disabled={save.isPending}
          onValueChange={(enabled) => save.mutate({ enabled })}
          trackColor={{ true: colors.go }}
          accessibilityLabel={`${service.serviceType.name} on CampusPin`}
        />
      </View>
      {service.disabledByAdmin ? (
        <AppText variant="small" color={colors.danger}>
          Switched off by the CampusPin team{service.adminNote ? `: ${service.adminNote}` : '.'}
        </AppText>
      ) : null}
      {service.enabled && fields.length > 0 ? (
        <View style={[styles.gap, styles.settings]}>
          {fields.map((field) => (
            <ConfigInput
              key={field.key}
              field={field}
              value={config[field.key]}
              onChange={(value) => setConfig((current) => ({ ...current, [field.key]: value }))}
            />
          ))}
          <Button title="Save settings" size="sm" disabled={!dirty} loading={save.isPending} onPress={() => save.mutate({ config })} />
        </View>
      ) : null}
    </Card>
  );
}

/** Which services a listing offers through CampusPin, switched on or off with their settings. */
export default function BusinessServicesScreen() {
  const selection = usePlaceSelection();
  const placeId = selection.place?.id;
  const services = useQuery({
    queryKey: ['business', 'services', placeId],
    enabled: !!placeId,
    queryFn: ({ signal }) => servicesService.ownerServices(placeId!, signal).then((r) => r.data),
  });

  return (
    <Screen keyboard refreshing={services.isRefetching} onRefresh={() => void services.refetch()}>
      <Stack.Screen options={{ title: 'Services' }} />
      <View style={styles.gap}>
        <AppText>Choose what students can do with your business through CampusPin. Only switched-on services appear on your page.</AppText>
        <PlaceSwitcher {...selection} />
        {selection.listings.isPending || (placeId && services.isPending) ? (
          <ListSkeleton height={120} />
        ) : !placeId ? (
          <EmptyState icon="storefront-outline" title="Add a listing first" message="Services belong to one of your listings." />
        ) : services.isError ? (
          <ErrorState error={services.error} onRetry={() => void services.refetch()} />
        ) : (
          services.data?.map((service) => (
            <ServiceCard key={`${placeId}-${service.serviceType.key}-${service.updatedAt ?? ''}`} placeId={placeId} service={service} />
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  settings: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: space.md },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.actionSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    height: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  number: { width: 110, textAlign: 'right' },
});
