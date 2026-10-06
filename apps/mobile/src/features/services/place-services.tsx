import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Icon } from '@/components/ui';
import { servicesService } from '@/services/services.service';
import { colors, space } from '@/theme/tokens';
import { OfferCard } from '@/features/offers/offer-card';
import { BookingPanel } from '@/features/bookings/booking-panel';
import { MealLines } from './menu-card';

/**
 * What a student can use at this place through CampusPin. For a mess: today's and tomorrow's menu.
 * Renders nothing when the place offers no services (or they could not be loaded).
 */
export function PlaceServicesSection({ slug }: { slug: string }) {
  const services = useQuery({
    queryKey: ['place-services', slug],
    queryFn: ({ signal }) => servicesService.placeServices(slug, signal).then((r) => r.data),
  });
  const data = services.data;
  if (!data || data.services.length === 0) return null;
  const hasMenu = data.services.some((service) => service.kind === 'DAILY_MENU');
  const food = data.services.some((service) => service.kind === 'FOOD_ORDER');
  const print = data.services.some((service) => service.kind === 'PRINT_ORDER');
  const jobs = data.services.filter((service) => service.kind === 'SERVICE_REQUEST');
  const bookable = data.services.filter((service) => service.kind === 'BOOKING');
  if (!hasMenu && !food && !print && jobs.length === 0 && bookable.length === 0 && data.offers.length === 0) return null;

  return (
    <View style={styles.gap}>
      {print ? (
        <Button title="Print a document" icon="print-outline" onPress={() => router.push({ pathname: '/place/print/[slug]', params: { slug } })} />
      ) : null}
      {jobs.map((job) => (
        <Button
          key={job.key}
          title={`Request ${job.name.toLowerCase()}`}
          icon="construct-outline"
          variant="outline"
          onPress={() => router.push({ pathname: '/place/request/[slug]', params: { slug, key: job.key.toLowerCase() } })}
        />
      ))}
      {bookable.map((service) => (
        <BookingPanel
          key={service.key}
          slug={slug}
          service={service}
          items={(data.catalog[service.key] ?? []).flatMap((section) => section.items)}
        />
      ))}
      {data.offers.map((offer) => (
        <OfferCard key={offer.id} offer={offer} showPlace={false} />
      ))}
      {food ? (
        <Card style={styles.gap}>
          <View style={styles.title}>
            <Icon name="fast-food-outline" size={20} color={colors.warning} />
            <AppText variant="subheading">Order food</AppText>
          </View>
          <AppText variant="small">Order for pickup, or scan the code on your table to order from your seat.</AppText>
          <Button
            title="See the menu"
            icon="restaurant-outline"
            onPress={() => router.push({ pathname: '/place/order/[slug]', params: { slug } })}
          />
        </Card>
      ) : null}
      {hasMenu ? (
        <Card style={styles.gap}>
          <View style={styles.title}>
            <Icon name="restaurant-outline" size={20} color={colors.accent} />
            <AppText variant="subheading">Today’s menu</AppText>
          </View>
          {data.menus.today ? (
            <MealLines menu={data.menus.today} />
          ) : (
            <AppText variant="small">
              Today’s menu isn’t out yet. Save this mess to hear when it is.
            </AppText>
          )}
        </Card>
      ) : null}
      {data.menus.tomorrow ? (
        <Card style={styles.gap}>
          <View style={styles.title}>
            <Icon name="calendar-outline" size={20} color={colors.brand} />
            <AppText variant="subheading">Tomorrow’s menu</AppText>
          </View>
          <MealLines menu={data.menus.tomorrow} />
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md },
  title: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
