import type { Href } from 'expo-router';

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
  if (first === 'marketplace') return '/market';
  if (first === 'members' && second) return { pathname: '/member/[id]', params: { id: second } };
  if (first === 'me' && second === 'verification') return '/verification';
  if (first === 'places' && second) return { pathname: '/place/[slug]', params: { slug: second } };
  if (first === 'colleges' && second) return { pathname: '/college/[slug]', params: { slug: second } };
  return null;
}
