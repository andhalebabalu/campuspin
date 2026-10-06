import { Tabs } from 'expo-router';
import { SplashAd } from '@/components/splash-ad';
import { makeTabBar, type TabSpec } from '@/components/tab-bar';
import { useUnreadMessages } from '@/hooks/use-unread';

const TABS: readonly TabSpec[] = [
  { name: 'home', title: 'Home', icon: 'home-outline', iconActive: 'home' },
  { name: 'explore', title: 'Explore', icon: 'compass-outline', iconActive: 'compass' },
  { name: 'orders', title: 'Orders', icon: 'receipt-outline', iconActive: 'receipt' },
  { name: 'community', title: 'Community', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
  { name: 'me', title: 'Profile', icon: 'person-circle-outline', iconActive: 'person-circle' },
];

const StudentTabBar = makeTabBar(TABS, () => ({ me: useUnreadMessages() }));

/**
 * The student app: five tabs. The marketplace is no longer a tab (it opens from Home and Profile) but
 * keeps its screen here. Detail screens live in (shared) and push over the tabs.
 */
export default function StudentLayout() {
  return (
    <>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <StudentTabBar {...props} />}>
        {TABS.map((tab) => (
          <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
        ))}
        <Tabs.Screen name="market" options={{ title: 'Market' }} />
      </Tabs>
      <SplashAd />
    </>
  );
}
