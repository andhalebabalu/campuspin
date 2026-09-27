import { Tabs } from 'expo-router';
import { makeTabBar, type TabSpec } from '@/components/tab-bar';
import { useUnreadMessages } from '@/hooks/use-unread';

const TABS: readonly TabSpec[] = [
  { name: 'home', title: 'Home', icon: 'home-outline', iconActive: 'home' },
  { name: 'community', title: 'Community', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
  { name: 'market', title: 'Market', icon: 'pricetags-outline', iconActive: 'pricetags' },
  { name: 'explore', title: 'Explore', icon: 'compass-outline', iconActive: 'compass' },
  { name: 'me', title: 'Profile', icon: 'person-circle-outline', iconActive: 'person-circle' },
];

const StudentTabBar = makeTabBar(TABS, () => ({ market: useUnreadMessages() }));

/** The student app: five tabs. Detail screens live in (shared) and push over the tabs. */
export default function StudentLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <StudentTabBar {...props} />}>
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
      ))}
    </Tabs>
  );
}
