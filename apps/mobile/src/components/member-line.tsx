import type { MemberSummary } from '@platform/contracts';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Avatar, Icon } from '@/components/ui';
import { colors, space } from '@/theme/tokens';

/** A member's avatar, name, verified tick and college; opens their profile. */
export function MemberLine({ member, size = 44 }: { member: MemberSummary; size?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/member/[id]', params: { id: member.id } })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <Avatar name={member.displayName} imageUrl={member.avatarUrl} size={size} verified={member.verifiedStudent} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {member.displayName}
        </AppText>
        <AppText variant="small" numberOfLines={1}>
          {member.verifiedStudent ? 'Verified student' : 'Member'}
          {member.college ? ` · ${member.college.name}` : ''}
        </AppText>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.placeholder} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
});
