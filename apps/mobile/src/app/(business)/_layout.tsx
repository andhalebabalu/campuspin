import { Tabs } from 'expo-router';
import { makeTabBar, type TabSpec } from '@/components/tab-bar';

const TABS: readonly TabSpec[] = [
  { name: 'dashboard', title: 'Dashboard', icon: 'grid-outline', iconActive: 'grid' },
  { name: 'enquiries', title: 'Enquiries', icon: 'mail-outline', iconActive: 'mail' },
  { name: 'reviews', title: 'Reviews', icon: 'star-outline', iconActive: 'star' },
  { name: 'account', title: 'Account', icon: 'person-circle-outline', iconActive: 'person-circle' },
];

const BusinessTabBar = makeTabBar(TABS);

/** The business app: dashboard, enquiries, reviews and the account. */
export default function BusinessLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <BusinessTabBar {...props} />}>
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
      ))}
    </Tabs>
  );
}
