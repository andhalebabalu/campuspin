import type { CategoryGroup, CategorySummary } from '@platform/contracts';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Sheet, SheetOption } from '@/components/ui';
import { colors, space } from '@/theme/tokens';
import { iconFor } from './meta';

/** Pick one leaf category from the two-level tree, grouped under its parent. */
export function CategorySheet({
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

const styles = StyleSheet.create({
  groupLabel: { paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.xs },
});
