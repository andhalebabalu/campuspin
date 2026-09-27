import { Redirect } from 'expo-router';
import { useSession } from '@/lib/session';

/** The entry point and the anchor every guard falls back to: sends each account to its own app. */
export default function Index() {
  const { status, app } = useSession();
  if (status !== 'authenticated') return <Redirect href="/welcome" />;
  if (app === 'business') return <Redirect href="/dashboard" />;
  if (app === 'staff') return <Redirect href="/staff" />;
  return <Redirect href="/home" />;
}
