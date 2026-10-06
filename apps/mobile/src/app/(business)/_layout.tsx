import { Tabs } from 'expo-router';
import { SplashAd } from '@/components/splash-ad';
import { makeTabBar, type TabSpec } from '@/components/tab-bar';

const TABS: readonly TabSpec[] = [
  { name: 'dashboard', title: 'Dashboard', icon: 'grid-outline', iconActive: 'grid' },
  { name: 'board', title: 'Orders', icon: 'receipt-outline', iconActive: 'receipt' },
  { name: 'enquiries', title: 'Enquiries', icon: 'mail-outline', iconActive: 'mail' },
  { name: 'account', title: 'Account', icon: 'person-circle-outline', iconActive: 'person-circle' },
];

const BusinessTabBar = makeTabBar(TABS);

/** The business app: dashboard, live orders, enquiries and the account. Reviews open from the dashboard. */
export default function BusinessLayout() {
  return (
    <>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <BusinessTabBar {...props} />}
      >
        {TABS.map((tab) => (
          <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
        ))}
        <Tabs.Screen name="reviews" options={{ title: 'Reviews' }} />
      </Tabs>
      <SplashAd />
    </>
  );
}
