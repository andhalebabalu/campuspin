import type { ServiceKind } from '@platform/contracts';

export interface ServiceTypeSeed {
  key: string;
  name: string;
  description: string;
  /** A key from the app icon set. */
  icon: string;
  kind: ServiceKind;
  showOnHome: boolean;
  categorySlug?: string;
}

/**
 * The service catalogue. Created once; staff manage names, order and visibility afterwards (the seed
 * never overwrites their edits). The key and kind are what the apps rely on.
 */
export const SERVICE_TYPES: readonly ServiceTypeSeed[] = [
  {
    key: 'ORDER_FOOD',
    name: 'Order Food',
    description: 'Order from the menu at your table or for pickup',
    icon: 'food',
    kind: 'FOOD_ORDER',
    showOnHome: true,
  },
  {
    key: 'PRINT',
    name: 'Print',
    description: 'Send a PDF to print, xerox, bind or laminate, and pick it up',
    icon: 'printer',
    kind: 'PRINT_ORDER',
    showOnHome: true,
  },
  {
    key: 'LAUNDRY',
    name: 'Laundry',
    description: 'Request a laundry pickup or drop',
    icon: 'laundry',
    kind: 'SERVICE_REQUEST',
    showOnHome: true,
  },
  {
    key: 'APPOINTMENT',
    name: 'Book Appointment',
    description: 'Book a time slot at a salon, clinic or service centre',
    icon: 'appointment',
    kind: 'BOOKING',
    showOnHome: true,
  },
  {
    key: 'ROOM',
    name: 'Find Room',
    description: 'Rooms, PGs and hostels near your college',
    icon: 'room',
    kind: 'LISTING',
    showOnHome: true,
    categorySlug: 'accommodation',
  },
  {
    key: 'STUDY_SPACE',
    name: 'Study Space',
    description: 'Libraries and reading rooms: seats, timings and booking',
    icon: 'study',
    kind: 'BOOKING',
    showOnHome: true,
  },
  {
    key: 'REPAIR',
    name: 'Repair',
    description: 'Mobile, laptop and bike repairs: describe the problem, get an estimate',
    icon: 'repair',
    kind: 'SERVICE_REQUEST',
    showOnHome: true,
  },
  {
    key: 'OFFERS',
    name: 'Offers',
    description: 'Student offers from places near you',
    icon: 'offer',
    kind: 'OFFERS',
    showOnHome: true,
  },
  {
    key: 'DAILY_MENU',
    name: 'Daily Menu',
    description: "Publish today's mess menu for students",
    icon: 'menu',
    kind: 'DAILY_MENU',
    showOnHome: false,
  },
  {
    key: 'TABLE_SERVICE',
    name: 'Table Service',
    description: 'Students ask for water, cutlery or the bill from their table',
    icon: 'bell',
    kind: 'TABLE_SERVICE',
    showOnHome: false,
  },
];
