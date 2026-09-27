import { redirect } from 'next/navigation';
import { ROUTES } from '@/constants/routes';

/** Posting now happens inside the college chats. */
export default function NewPostPage() {
  redirect(ROUTES.community);
}
