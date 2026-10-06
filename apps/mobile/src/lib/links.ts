import { router, type Href } from 'expo-router';
import { Linking } from 'react-native';

/**
 * Maps a web path the API puts in a notification (`/community/posts/:id`, `/messages/:id`…) to the
 * matching screen in this app, or null when the app has no such screen.
 */
export function appRouteFor(link: string | null): Href | null {
  if (!link) return null;
  const path = link.split(/[?#]/)[0] ?? '';
  const [first, second, third] = path.split('/').filter(Boolean);
  if (first === 'community' && second === 'posts' && third) return { pathname: '/post/[id]', params: { id: third } };
  if (first === 'community') return '/community';
  if (first === 'messages' && second) return { pathname: '/messages/[id]', params: { id: second } };
  if (first === 'messages') return '/messages';
  if (first === 'marketplace' && second && second !== 'mine' && second !== 'new') {
    return { pathname: '/listing/[id]', params: { id: second } };
  }
  if (first === 'marketplace' && second === 'new') return '/listing/new';
  if (first === 'marketplace' && second === 'mine') return '/listings/mine';
  if (first === 'marketplace') return '/market';
  if (first === 'members' && second) return { pathname: '/member/[id]', params: { id: second } };
  if (first === 'me' && second === 'verification') return '/verification';
  if (first === 'places' && second) return { pathname: '/place/[slug]', params: { slug: second } };
  if (first === 'colleges' && second) return { pathname: '/college/[slug]', params: { slug: second } };
  if (first === 'places' || first === 'colleges' || first === 'search' || first === 'explore') return '/explore';
  if (first === 'feed' || first === 'home') return '/home';
  if (first === 'orders' && second) return { pathname: '/order/[id]', params: { id: second } };
  if (first === 'orders') return '/orders';
  if (first === 'requests' && second) return { pathname: '/request/[id]', params: { id: second } };
  if (first === 'offers') return '/offers';
  if (first === 'q' && second) return { pathname: '/use/[token]', params: { token: second } };
  if (first === 'menus') return '/menus';
  if (first === 'saved') return '/saved';
  if (first === 'dashboard' && /[?&]tab=(orders|requests)/.test(link)) return '/board';
  if (first === 'dashboard') return '/dashboard';
  if (first === 'suggest-a-place') return '/suggest-place';
  return null;
}

/**
 * Opens a link set by staff (an ad's button): an app path goes to its screen, an https link opens
 * in the browser. Returns false when there is nowhere to go.
 */
export async function openLink(link: string | null): Promise<boolean> {
  if (!link) return false;
  if (/^https:\/\//i.test(link)) {
    await Linking.openURL(link);
    return true;
  }
  const route = appRouteFor(link);
  if (!route) return false;
  router.push(route);
  return true;
}
