import {
  LISTING_CATEGORIES,
  LISTING_CATEGORY_LABELS,
  LISTING_CONDITIONS,
  LISTING_CONDITION_LABELS,
  LISTING_DESCRIPTION_MAX,
  LISTING_IMAGES_MAX,
  LISTING_TITLE_MAX,
  LISTING_VISIBILITIES,
  LISTING_VISIBILITY_LABELS,
  type Listing,
  type ListingCategory,
  type ListingCondition,
  type ListingVisibility,
} from '@platform/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { FormAlert } from '@/components/form-alert';
import { PhotoPicker } from '@/components/photo-picker';
import { AppText, Button, ChipRow, Screen, Segmented, TextField, useToast } from '@/components/ui';
import { CATEGORY_ICONS } from '@/features/marketplace/listing-card';
import { QuotaBanner, useListingQuota } from '@/features/marketplace/listing-quota';
import { errorMessage, serverFieldErrors } from '@/lib/errors';
import { useUser } from '@/lib/session';
import { marketplaceService } from '@/services/marketplace.service';
import { colors, radius, space } from '@/theme/tokens';

const CATEGORY_OPTIONS = LISTING_CATEGORIES.map((value) => ({
  value,
  label: LISTING_CATEGORY_LABELS[value],
  icon: CATEGORY_ICONS[value],
}));
const CONDITION_OPTIONS = LISTING_CONDITIONS.map((value) => ({ value, label: LISTING_CONDITION_LABELS[value] }));
const VISIBILITY_OPTIONS = LISTING_VISIBILITIES.map((value) => ({
  value,
  label: LISTING_VISIBILITY_LABELS[value].replace(' only', ''),
}));

/** Sell something, or edit one of my listings (`existing`). */
export function ListingForm({ existing }: { existing?: Listing }) {
  const user = useUser();
  const toast = useToast();
  const queryClient = useQueryClient();
  // Only a new listing uses a free slot or credits; editing is always free.
  const quota = useListingQuota();
  const blocked = !existing && quota.data?.next === 'BLOCKED';
  const [images, setImages] = useState<string[]>(existing?.images ?? []);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [category, setCategory] = useState<ListingCategory>(existing?.category ?? 'BOOKS');
  const [condition, setCondition] = useState<ListingCondition>(existing?.condition ?? 'GOOD');
  const [priceText, setPriceText] = useState(existing ? String(existing.price) : '');
  const [negotiable, setNegotiable] = useState(existing?.negotiable ?? false);
  const [quantity, setQuantity] = useState(existing ? String(existing.quantity) : '1');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [visibility, setVisibility] = useState<ListingVisibility>(existing?.visibility ?? 'NEARBY_COLLEGES');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const price = Number(priceText);
    if (priceText.trim() === '' || !Number.isInteger(price) || price < 0) {
      setErrors({ price: 'Enter a price in whole rupees (0 for free).' });
      return;
    }
    setBusy(true);
    setErrors({});
    setFormError(null);
    const dto = {
      title: title.trim(),
      description: description.trim(),
      category,
      condition,
      price,
      negotiable,
      quantity: Number(quantity) || 1,
      location: location.trim() || null,
      visibility,
      images,
    };
    try {
      const result = existing
        ? await marketplaceService.update(existing.id, dto)
        : await marketplaceService.create(dto);
      void queryClient.invalidateQueries({ queryKey: ['marketplace'] });
      toast(existing ? 'Listing updated' : 'Your listing is live!');
      router.replace({ pathname: '/listing/[id]', params: { id: result.data.id } });
    } catch (caught) {
      const fields = serverFieldErrors(caught);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setFormError(errorMessage(caught, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      keyboard
      footer={
        <Button
          title={existing ? 'Save changes' : 'Publish listing'}
          size="lg"
          icon={existing ? 'checkmark' : 'rocket-outline'}
          loading={busy}
          disabled={blocked}
          onPress={() => void submit()}
        />
      }
    >
      <View style={styles.form}>
        <AppText variant="small">
          Listed under {user.student.college?.name ?? 'your verified college'}. Buyers message you in
          the app; your phone number and email are never shown.
        </AppText>
        {!existing ? <QuotaBanner quota={quota.data} /> : null}
        {formError ? <FormAlert message={formError} /> : null}
        {Object.keys(errors).length > 0 && !errors.price && !formError ? (
          <FormAlert message="Please fix the highlighted fields." />
        ) : null}

        <Section title="Photos" hint={`Up to ${LISTING_IMAGES_MAX}. The first one is the cover. Real photos sell faster.`}>
          <PhotoPicker value={images} onChange={setImages} max={LISTING_IMAGES_MAX} error={errors.images} />
        </Section>

        <Section title="What are you selling?">
          <TextField
            label="Title"
            placeholder="e.g. Engineering Maths (Kreyszig), 10th ed."
            value={title}
            onChangeText={setTitle}
            maxLength={LISTING_TITLE_MAX}
            error={errors.title}
          />
          <TextField
            label="Description"
            placeholder="Condition, what’s included, why you’re selling…"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={LISTING_DESCRIPTION_MAX}
            error={errors.description}
          />
        </Section>

        <Section title="Category">
          <View style={styles.bleed}>
            <ChipRow options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
          </View>
        </Section>

        <Section title="Condition">
          <Segmented options={CONDITION_OPTIONS} value={condition} onChange={setCondition} />
        </Section>

        <Section title="Price">
          <View style={styles.row}>
            <View style={styles.flex}>
              <TextField
                label="Price (₹)"
                placeholder="0 for free"
                value={priceText}
                onChangeText={(text) => setPriceText(text.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                icon="cash-outline"
                error={errors.price}
              />
            </View>
            <View style={styles.qty}>
              <TextField
                label="Quantity"
                value={quantity}
                onChangeText={(text) => setQuantity(text.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                error={errors.quantity}
              />
            </View>
          </View>
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">Price is negotiable</AppText>
              <AppText variant="small">Buyers can make you an offer.</AppText>
            </View>
            <Switch
              value={negotiable}
              onValueChange={setNegotiable}
              trackColor={{ true: colors.action, false: colors.lineStrong }}
              thumbColor={colors.surface}
            />
          </View>
        </Section>

        <Section title="Pickup and who can see it">
          <TextField
            label="Pickup point (optional)"
            placeholder="e.g. Main gate, library"
            value={location}
            onChangeText={setLocation}
            icon="location-outline"
            maxLength={120}
            error={errors.location}
          />
          <Segmented options={VISIBILITY_OPTIONS} value={visibility} onChange={setVisibility} />
        </Section>
      </View>
    </Screen>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
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
  section: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  bleed: { marginHorizontal: -space.lg },
  row: { flexDirection: 'row', gap: space.md },
  qty: { width: 100 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
