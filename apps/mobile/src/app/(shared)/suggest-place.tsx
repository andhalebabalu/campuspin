import { Stack } from 'expo-router';
import { PlaceForm } from '@/features/places/place-form';
import { submissionsService } from '@/services/submissions.service';

/** A student suggests a place that is missing; staff review it before it goes live. */
export default function SuggestPlace() {
  return (
    <>
      <Stack.Screen options={{ title: 'Suggest a place' }} />
      <PlaceForm variant="student" onSubmit={(dto) => submissionsService.create(dto)} />
    </>
  );
}
