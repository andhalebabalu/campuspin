import { ApiClientError } from '@platform/api-client';
import {
  createSubmissionRequestSchema,
  duplicateCandidateSchema,
  MAX_SUBMISSION_IMAGES,
  PRICE_UNITS,
  type CategoryGroup,
  type CategorySummary,
  type DuplicateCandidate,
  type PlaceSubmission,
  type PriceUnit,
} from '@platform/contracts';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Marker, type LatLng, type Region } from 'react-native-maps';
import { z } from 'zod';
import { FormAlert } from '@/components/form-alert';
import { PhotoPicker } from '@/components/photo-picker';
import {
  AppText,
  Button,
  Chip,
  Icon,
  Screen,
  Sheet,
  SheetOption,
  TextField,
  useToast,
} from '@/components/ui';
import { errorMessage, flattenZodErrors, serverFieldErrors } from '@/lib/errors';
import { categoriesService } from '@/services/categories.service';
import { colors, radius, space } from '@/theme/tokens';
import { iconFor, UNIT_LABELS } from './meta';

/** Ahilyanagar: where CampusPin starts. Only the first view of the map; the user moves the pin. */
const DEFAULT_REGION: Region = { latitude: 19.0948, longitude: 74.748, latitudeDelta: 0.05, longitudeDelta: 0.05 };

function candidatesFrom(details: Record<string, unknown> | undefined): DuplicateCandidate[] {
  const parsed = z.array(duplicateCandidateSchema).safeParse(details?.candidates);
  return parsed.success ? parsed.data : [];
}

/**
 * Add a place: a student suggesting one ("student"), or a business listing its own ("business").
 * Both go to the moderation queue. The pin is set with the phone's location or by tapping the map.
 */
export function PlaceForm({
  variant,
  onSubmit,
}: {
  variant: 'student' | 'business';
  onSubmit: (dto: z.output<typeof createSubmissionRequestSchema>) => Promise<{ data: PlaceSubmission }>;
}) {
  const toast = useToast();
  const mapRef = useRef<MapView>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CategorySummary | null>(null);
  const [pickingCategory, setPickingCategory] = useState(false);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [priceAmount, setPriceAmount] = useState('');
  const [priceUnit, setPriceUnit] = useState<PriceUnit | null>(null);
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DuplicateCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<PlaceSubmission | null>(null);

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: ({ signal }) => categoriesService.list(signal).then((r) => r.data),
    staleTime: 10 * 60_000,
  });

  async function placePin(coordinate: LatLng) {
    setPin(coordinate);
    setCandidates(null);
    try {
      const [found] = await Location.reverseGeocodeAsync(coordinate);
      if (found) {
        const line = [found.name, found.street, found.district].filter(Boolean).join(', ');
        if (!address && line) setAddress(line);
        if (!city && (found.city ?? found.subregion)) setCity(found.city ?? found.subregion ?? '');
      }
    } catch {
      // Address lookup is only a convenience.
    }
  }

  async function locateMe() {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        toast('Allow location access, or tap the map to drop the pin.', 'info');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coordinate = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      mapRef.current?.animateToRegion({ ...coordinate, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 400);
      await placePin(coordinate);
    } catch {
      toast('Could not get your location. Tap the map instead.', 'error');
    } finally {
      setLocating(false);
    }
  }

  async function submit(confirmDifferent: boolean) {
    setFormError(null);
    const parsed = createSubmissionRequestSchema.safeParse({
      name,
      categoryId: category?.id ?? '',
      address,
      city: city.trim() || undefined,
      latitude: pin?.latitude ?? Number.NaN,
      longitude: pin?.longitude ?? Number.NaN,
      phone: phone.trim() || undefined,
      priceAmount: priceAmount ? Number(priceAmount) : undefined,
      priceUnit: priceAmount ? (priceUnit ?? undefined) : undefined,
      description: description.trim() || undefined,
      images: images.map((imageUrl) => ({ imageUrl })),
      confirmDifferent,
    });
    if (!parsed.success) {
      const fields = flattenZodErrors(parsed.error);
      if (!pin) fields.latitude = 'Drop the pin on the map.';
      if (!category) fields.categoryId = 'Pick a category.';
      setErrors(fields);
      setFormError('Please fix the highlighted fields.');
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const result = await onSubmit(parsed.data);
      setDone(result.data);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.code === 'DUPLICATE_PLACE_SUSPECTED') {
        setCandidates(candidatesFrom(caught.details));
        setFormError(caught.message);
      } else {
        const fields = serverFieldErrors(caught);
        if (Object.keys(fields).length > 0) setErrors(fields);
        setFormError(errorMessage(caught));
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Screen>
        <View style={styles.success}>
          <View style={styles.successIcon}>
            <Icon name="checkmark-done" size={36} color={colors.accent} />
          </View>
          <AppText variant="title" align="center">
            {variant === 'business' ? 'Listing sent for review' : 'Thanks for the suggestion!'}
          </AppText>
          <AppText align="center">
            {variant === 'business'
              ? `Our team is checking ${done.name}. It goes live for students once approved; you can follow it on your dashboard.`
              : `Our team will check ${done.name} and add it for everyone. We’ll let you know.`}
          </AppText>
          <Button title="Done" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const blocked = candidates?.some((candidate) => candidate.level === 'block') ?? false;

  return (
    <Screen
      keyboard
      footer={
        candidates && candidates.length > 0 && !blocked ? (
          <Button title="It’s a different place, submit" size="lg" loading={busy} onPress={() => void submit(true)} />
        ) : (
          <Button
            title={variant === 'business' ? 'Submit listing' : 'Submit suggestion'}
            size="lg"
            icon="send"
            loading={busy}
            onPress={() => void submit(false)}
          />
        )
      }
    >
      <View style={styles.form}>
        {formError ? <FormAlert message={formError} /> : null}
        {candidates && candidates.length > 0 ? (
          <View style={styles.dupes}>
            <AppText variant="subheading">Is it one of these?</AppText>
            {candidates.map((candidate) => (
              <Pressable
                key={candidate.placeId}
                style={styles.dupe}
                onPress={() => router.push({ pathname: '/place/[slug]', params: { slug: candidate.slug } })}
              >
                <Icon name="location" size={18} color={colors.warning} />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{candidate.name}</AppText>
                  <AppText variant="small">
                    {candidate.distanceMeters} m away{candidate.level === 'block' ? ' · already listed' : ''}
                  </AppText>
                </View>
                <Icon name="open-outline" size={16} color={colors.muted} />
              </Pressable>
            ))}
            {blocked ? (
              <AppText variant="small" color={colors.danger}>
                This place is already on CampusPin, so it can’t be added again.
              </AppText>
            ) : null}
          </View>
        ) : null}

        <Block title="The place">
          <TextField label="Name" placeholder="e.g. Sai Krupa Mess" value={name} onChangeText={(t) => { setName(t); setCandidates(null); }} error={errors.name} maxLength={200} />
          <View style={styles.fieldGap}>
            <AppText variant="smallStrong" color={colors.ink}>
              Category
            </AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPickingCategory(true)}
              style={[styles.select, errors.categoryId ? { borderColor: colors.danger } : null]}
            >
              {category ? <Icon name={iconFor(category.icon, 'pricetag')} size={18} color={colors.action} /> : null}
              <AppText color={category ? colors.ink : colors.placeholder} style={styles.flex}>
                {category?.name ?? (categories.isPending ? 'Loading categories…' : 'Select a category')}
              </AppText>
              <Icon name="chevron-down" size={18} color={colors.muted} />
            </Pressable>
            {errors.categoryId ? (
              <AppText variant="small" color={colors.danger}>
                {errors.categoryId}
              </AppText>
            ) : null}
          </View>
          <TextField label="Description (optional)" placeholder="What students should know" value={description} onChangeText={setDescription} multiline maxLength={2000} error={errors.description} />
        </Block>

        <Block title="Where is it?" hint="Stand at the place and use your location, or tap the map.">
          <View style={[styles.mapWrap, errors.latitude ? { borderColor: colors.danger } : null]}>
            <MapView
              ref={mapRef}
              style={styles.map}
              initialRegion={DEFAULT_REGION}
              onPress={(event) => void placePin(event.nativeEvent.coordinate)}
            >
              {pin ? (
                <Marker
                  coordinate={pin}
                  draggable
                  onDragEnd={(event) => void placePin(event.nativeEvent.coordinate)}
                />
              ) : null}
            </MapView>
            {!pin ? (
              <View style={styles.mapHint} pointerEvents="none">
                <AppText variant="caption" color={colors.surface}>
                  Tap the map to drop the pin
                </AppText>
              </View>
            ) : null}
          </View>
          <Button
            title={locating ? 'Finding you…' : 'Use my current location'}
            variant="secondary"
            icon="locate"
            loading={locating}
            onPress={() => void locateMe()}
          />
          {errors.latitude ? (
            <AppText variant="small" color={colors.danger}>
              {errors.latitude}
            </AppText>
          ) : null}
          <TextField label="Address" placeholder="Street, landmark" value={address} onChangeText={setAddress} error={errors.address} maxLength={500} />
          <TextField label="City (optional)" placeholder="Ahilyanagar" value={city} onChangeText={setCity} error={errors.city} maxLength={100} />
        </Block>

        <Block title="Contact and price (optional)">
          <TextField label="Phone" placeholder="+91 98xxxxxxxx" value={phone} onChangeText={setPhone} keyboardType="phone-pad" icon="call-outline" error={errors.phone} />
          <TextField
            label="Starting price (₹)"
            placeholder="e.g. 3000"
            value={priceAmount}
            onChangeText={(text) => setPriceAmount(text.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            icon="cash-outline"
            error={errors.priceAmount}
          />
          {priceAmount ? (
            <View style={styles.fieldGap}>
              <AppText variant="smallStrong" color={colors.ink}>
                Per
              </AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.units}>
                {PRICE_UNITS.map((unit) => (
                  <Chip key={unit} label={UNIT_LABELS[unit]} selected={priceUnit === unit} onPress={() => setPriceUnit(unit)} />
                ))}
              </ScrollView>
              {errors.priceUnit ? (
                <AppText variant="small" color={colors.danger}>
                  Choose what the price is per.
                </AppText>
              ) : null}
            </View>
          ) : null}
        </Block>

        <Block title="Photos (optional)" hint="A photo of the front helps our team verify it faster.">
          <PhotoPicker value={images} onChange={setImages} max={MAX_SUBMISSION_IMAGES} error={errors.images} />
        </Block>
      </View>

      <CategorySheet
        visible={pickingCategory}
        groups={categories.data ?? []}
        loading={categories.isPending}
        selectedId={category?.id ?? null}
        onClose={() => setPickingCategory(false)}
        onPick={(picked) => {
          setCategory(picked);
          setCandidates(null);
          if (picked.defaultPriceUnit) setPriceUnit(picked.defaultPriceUnit);
          setPickingCategory(false);
        }}
      />
    </Screen>
  );
}

function CategorySheet({
  visible,
  groups,
  loading,
  selectedId,
  onClose,
  onPick,
}: {
  visible: boolean;
  groups: CategoryGroup[];
  loading: boolean;
  selectedId: string | null;
  onClose: () => void;
  onPick: (category: CategorySummary) => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Category">
      {loading ? (
        <ActivityIndicator color={colors.action} style={{ margin: space.xl }} />
      ) : (
        <ScrollView style={{ maxHeight: 520 }}>
          {groups.map((group) => (
            <View key={group.id}>
              <AppText variant="caption" style={styles.groupLabel}>
                {group.name.toUpperCase()}
              </AppText>
              {group.children.map((leaf) => (
                <SheetOption
                  key={leaf.id}
                  icon={iconFor(leaf.icon, 'pricetag-outline')}
                  label={leaf.name}
                  selected={leaf.id === selectedId}
                  onPress={() => onPick(leaf)}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <View>
        <AppText variant="subheading">{title}</AppText>
        {hint ? <AppText variant="small">{hint}</AppText> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.lg },
  flex: { flex: 1 },
  fieldGap: { gap: space.xs + 2 },
  block: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  select: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  mapWrap: { height: 220, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1.5, borderColor: colors.line },
  map: { flex: 1 },
  mapHint: {
    position: 'absolute',
    bottom: space.sm,
    alignSelf: 'center',
    paddingHorizontal: space.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(11,18,32,0.7)',
  },
  units: { gap: space.sm },
  groupLabel: { paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.xs },
  dupes: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.warningSoft },
  dupe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  success: { alignItems: 'center', gap: space.md, paddingTop: space.xxxl },
  successIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
