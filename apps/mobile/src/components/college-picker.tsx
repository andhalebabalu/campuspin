import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, FlatList, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Icon } from '@/components/ui';
import { collegesService } from '@/services/colleges.service';
import { colors, fonts, radius, space } from '@/theme/tokens';

export interface PickedCollege {
  id: string;
  name: string;
  slug: string;
}

/** A field that opens a searchable full-screen list of colleges. */
export function CollegePicker({
  value,
  onPick,
  error,
  label = 'Your college',
}: {
  value: PickedCollege | null;
  onPick: (college: PickedCollege) => void;
  error?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.field}>
      <AppText variant="smallStrong" color={colors.ink}>
        {label}
      </AppText>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={[styles.select, error ? { borderColor: colors.danger } : null]}
      >
        <Icon name="school-outline" size={19} color={value ? colors.action : colors.muted} />
        <AppText color={value ? colors.ink : colors.placeholder} style={styles.flex} numberOfLines={1}>
          {value?.name ?? 'Search for your college'}
        </AppText>
        <Icon name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      {error ? (
        <AppText variant="small" color={colors.danger}>
          {error}
        </AppText>
      ) : null}
      <CollegeSearch
        visible={open}
        onClose={() => setOpen(false)}
        onPick={(college) => {
          onPick(college);
          setOpen(false);
        }}
      />
    </View>
  );
}

function CollegeSearch({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (college: PickedCollege) => void;
}) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const results = useQuery({
    queryKey: ['colleges', 'search', q],
    enabled: visible,
    queryFn: ({ signal }) => collegesService.list({ q: q || undefined, sort: q ? undefined : 'popular', limit: 30 }, signal).then((r) => r.data),
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={[styles.modal, { paddingTop: insets.top > 30 ? space.lg : insets.top + space.lg }]}>
        <View style={styles.modalHead}>
          <AppText variant="heading" style={styles.flex}>
            Choose your college
          </AppText>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Icon name="close" size={24} />
          </Pressable>
        </View>
        <View style={styles.search}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput
            autoFocus
            value={search}
            onChangeText={setSearch}
            placeholder="College name or city"
            placeholderTextColor={colors.placeholder}
            style={styles.searchInput}
          />
        </View>
        {results.isPending ? (
          <ActivityIndicator color={colors.action} style={{ margin: space.xl }} />
        ) : (
          <FlatList
            data={results.data ?? []}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
            ListEmptyComponent={
              <AppText align="center" style={{ margin: space.xl }}>
                No college matches “{q}”.
              </AppText>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onPick({ id: item.id, name: item.name, slug: item.slug })}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.subtle }]}
              >
                <View style={styles.rowIcon}>
                  <Icon name="school" size={18} color={colors.action} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" numberOfLines={2}>
                    {item.name}
                  </AppText>
                  <AppText variant="small">{item.city}</AppText>
                </View>
                {item.verified ? <Icon name="checkmark-circle" size={18} color={colors.action} /> : null}
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs + 2 },
  flex: { flex: 1 },
  select: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  modal: { flex: 1, backgroundColor: colors.surface },
  modalHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, marginBottom: space.md },
  search: {
    height: 48,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.subtle,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.actionSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
