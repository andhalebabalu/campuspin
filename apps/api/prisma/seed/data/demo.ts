import type { PriceUnit } from '../../../src/generated/prisma/client.js';

/**
 * DEMO / SAMPLE DATA: development only. Every name says "Sample" and "(Demo)", contact details
 * are empty, and every row is flagged `isDemo`, so none of it can be mistaken for a real business
 * or shipped to production (the seed refuses to run demo data when NODE_ENV=production).
 * The locations are made-up points around a generic Ahilyanagar centre, not real addresses.
 */
export const DEMO_NOTE = 'Demo data for development only. Not a real business.';

export interface DemoCollegeSeed {
  slug: string;
  name: string;
  shortName: string;
  latitude: number;
  longitude: number;
  verified: boolean;
}

export const DEMO_COLLEGES: readonly DemoCollegeSeed[] = [
  {
    slug: 'demo-sample-arts-science-college',
    name: 'Sample Arts & Science College (Demo)',
    shortName: 'Sample ASC',
    latitude: 19.096,
    longitude: 74.748,
    verified: true,
  },
  {
    slug: 'demo-sample-commerce-college',
    name: 'Sample Commerce College (Demo)',
    shortName: 'Sample CC',
    latitude: 19.087,
    longitude: 74.742,
    verified: false,
  },
  {
    slug: 'demo-sample-engineering-institute',
    name: 'Sample Engineering Institute (Demo)',
    shortName: 'Sample EI',
    latitude: 19.11,
    longitude: 74.761,
    verified: true,
  },
];

export type HoursSpec =
  | { kind: 'none' }
  | { kind: '24h' }
  | { kind: 'daily'; open: string; close: string; closedDays?: readonly number[] }
  | {
      kind: 'slots';
      slots: ReadonlyArray<{ label: string; open: string; close: string }>;
    };

export type AttributeValue = string | number | boolean | readonly string[];

export interface DemoPlaceSeed {
  slug: string;
  name: string;
  blurb: string;
  latitude: number;
  longitude: number;
  /** Category slugs; the first one is the primary category. */
  categories: readonly string[];
  verified: boolean;
  /** Draft/pending listings exercise the status filters. Defaults to ACTIVE. */
  status?: 'ACTIVE' | 'PENDING';
  amenities: readonly string[];
  prices: ReadonlyArray<{ label: string; amount: number; unit: PriceUnit }>;
  attributes: Readonly<Record<string, AttributeValue>>;
  hours: HoursSpec;
  /** Adds a Google Maps navigation URL built from the coordinates (a link, not scraped data). */
  withMapsLink?: boolean;
}

export const DEMO_PLACES: readonly DemoPlaceSeed[] = [
  {
    slug: 'demo-mess-a',
    name: 'Sample Mess A (Demo)',
    blurb: 'A sample monthly mess.',
    latitude: 19.0975,
    longitude: 74.7495,
    categories: ['mess'],
    verified: true,
    amenities: ['drinking_water', 'upi_payments'],
    prices: [
      { label: 'Lunch and dinner', amount: 2800, unit: 'MONTH' },
      { label: 'Breakfast, lunch and dinner', amount: 3600, unit: 'MONTH' },
    ],
    attributes: { veg_nonveg: 'both', breakfast: false, lunch: true, dinner: true },
    hours: {
      kind: 'slots',
      slots: [
        { label: 'Lunch', open: '12:00', close: '15:00' },
        { label: 'Dinner', open: '19:00', close: '22:00' },
      ],
    },
    withMapsLink: true,
  },
  {
    slug: 'demo-tiffin-b',
    name: 'Sample Tiffin Service B (Demo)',
    blurb: 'A sample tiffin delivery service.',
    latitude: 19.094,
    longitude: 74.746,
    categories: ['tiffin'],
    verified: false,
    amenities: ['upi_payments'],
    prices: [{ label: 'Monthly tiffin (lunch and dinner)', amount: 3000, unit: 'MONTH' }],
    attributes: {
      veg_nonveg: 'veg',
      breakfast: false,
      lunch: true,
      dinner: true,
      home_delivery: true,
    },
    hours: {
      kind: 'slots',
      slots: [
        { label: 'Lunch delivery', open: '11:00', close: '14:00' },
        { label: 'Dinner delivery', open: '18:30', close: '21:00' },
      ],
    },
  },
  {
    slug: 'demo-study-point-c',
    name: 'Sample Study Point C (Demo)',
    blurb: 'A sample study point listed as both a library and a reading room.',
    latitude: 19.0968,
    longitude: 74.7502,
    categories: ['libraries', 'reading-rooms'],
    verified: true,
    amenities: ['wifi', 'ac', 'charging', 'power_backup', 'drinking_water', 'cctv'],
    prices: [
      { label: 'Monthly seat', amount: 700, unit: 'MONTH' },
      { label: 'Daily pass', amount: 40, unit: 'DAY' },
    ],
    attributes: { seating_capacity: 60 },
    hours: { kind: 'daily', open: '06:00', close: '23:00' },
    withMapsLink: true,
  },
  {
    slug: 'demo-library-d',
    name: 'Sample 24x7 Library D (Demo)',
    blurb: 'A sample library that never closes.',
    latitude: 19.0885,
    longitude: 74.7435,
    categories: ['libraries'],
    verified: false,
    amenities: ['wifi', 'charging', 'power_backup', 'cctv', 'lockers'],
    prices: [
      { label: 'Monthly seat', amount: 500, unit: 'MONTH' },
      { label: 'Daily pass', amount: 30, unit: 'DAY' },
    ],
    attributes: { seating_capacity: 120 },
    hours: { kind: '24h' },
  },
  {
    slug: 'demo-boys-pg-e',
    name: 'Sample Boys PG E (Demo)',
    blurb: 'A sample PG with three sharing options.',
    latitude: 19.093,
    longitude: 74.747,
    categories: ['pg'],
    verified: true,
    amenities: [
      'wifi',
      'food',
      'attached_bathroom',
      'cctv',
      'washing_machine',
      'hot_water',
      'power_backup',
    ],
    prices: [
      { label: 'Single sharing', amount: 6500, unit: 'MONTH' },
      { label: 'Double sharing', amount: 4500, unit: 'MONTH' },
      { label: 'Triple sharing', amount: 3500, unit: 'MONTH' },
    ],
    attributes: {
      gender: 'boys',
      occupancy_type: ['single', 'double', 'triple'],
      deposit: 5000,
      furniture: 'semi_furnished',
      available_from: '2027-06-01',
    },
    hours: { kind: 'none' },
  },
  {
    slug: 'demo-girls-hostel-f',
    name: 'Sample Girls Hostel F (Demo)',
    blurb: 'A sample girls hostel.',
    latitude: 19.099,
    longitude: 74.753,
    categories: ['hostels'],
    verified: true,
    amenities: [
      'wifi',
      'food',
      'cctv',
      'security_guard',
      'hot_water',
      'washing_machine',
      'housekeeping',
    ],
    prices: [
      { label: 'Double sharing', amount: 4200, unit: 'MONTH' },
      { label: 'Triple sharing', amount: 3600, unit: 'MONTH' },
    ],
    attributes: {
      gender: 'girls',
      occupancy_type: ['double', 'triple', 'dormitory'],
      deposit: 3000,
      furniture: 'fully_furnished',
    },
    hours: { kind: 'none' },
  },
  {
    slug: 'demo-room-rental-g',
    name: 'Sample Room Rental G (Demo)',
    blurb: 'A sample single-room rental.',
    latitude: 19.085,
    longitude: 74.74,
    categories: ['rooms'],
    verified: false,
    amenities: ['attached_bathroom', 'parking', 'power_backup'],
    prices: [{ label: 'One room', amount: 5500, unit: 'MONTH' }],
    attributes: { occupancy_type: ['single'], deposit: 10000, furniture: 'unfurnished' },
    hours: { kind: 'none' },
  },
  {
    slug: 'demo-gym-h',
    name: 'Sample Gym H (Demo)',
    blurb: 'A sample gym.',
    latitude: 19.101,
    longitude: 74.755,
    categories: ['gyms'],
    verified: true,
    amenities: ['ac', 'lockers', 'drinking_water', 'parking', 'card_payments', 'upi_payments'],
    prices: [
      { label: 'Monthly plan', amount: 900, unit: 'MONTH' },
      { label: 'Yearly plan', amount: 8000, unit: 'YEAR' },
    ],
    attributes: { trainer_available: true, gender_access: 'unisex' },
    hours: { kind: 'daily', open: '05:30', close: '22:30', closedDays: [7] },
  },
  {
    slug: 'demo-laundry-i',
    name: 'Sample Laundry I (Demo)',
    blurb: 'A sample laundry with pickup.',
    latitude: 19.0955,
    longitude: 74.7465,
    categories: ['laundry'],
    verified: false,
    amenities: ['upi_payments'],
    prices: [{ label: 'Wash and fold', amount: 60, unit: 'KG' }],
    attributes: { services: ['wash_fold', 'wash_iron'], pickup_delivery: true },
    hours: { kind: 'daily', open: '08:00', close: '20:00', closedDays: [7] },
  },
  {
    slug: 'demo-medical-j',
    name: 'Sample Medical Store J (Demo)',
    blurb: 'A sample medical store.',
    latitude: 19.0905,
    longitude: 74.744,
    categories: ['medical'],
    verified: true,
    amenities: ['ac', 'upi_payments', 'card_payments'],
    prices: [],
    attributes: { home_delivery: false },
    hours: { kind: 'daily', open: '08:00', close: '23:00' },
  },
  {
    slug: 'demo-xerox-k',
    name: 'Sample Xerox & Print Shop K (Demo)',
    blurb: 'A sample shop listed as both xerox and printing.',
    latitude: 19.0972,
    longitude: 74.7488,
    categories: ['xerox', 'printing'],
    verified: false,
    amenities: ['ac', 'upi_payments'],
    prices: [
      { label: 'Photocopy (per page)', amount: 1, unit: 'PAGE' },
      { label: 'Colour print (per page)', amount: 8, unit: 'PAGE' },
    ],
    attributes: { services: ['photocopy', 'scanning'] },
    hours: { kind: 'daily', open: '09:00', close: '21:00', closedDays: [7] },
  },
  {
    slug: 'demo-cafe-l',
    name: 'Sample Cafe L (Demo)',
    blurb: 'A sample cafe still waiting for review (status PENDING).',
    latitude: 19.109,
    longitude: 74.76,
    categories: ['cafes', 'restaurants'],
    verified: false,
    status: 'PENDING',
    amenities: ['wifi', 'ac', 'charging', 'upi_payments', 'card_payments'],
    prices: [{ label: 'Average meal', amount: 150, unit: 'MEAL' }],
    attributes: { veg_nonveg: 'both', dine_in: true, home_delivery: false },
    hours: { kind: 'daily', open: '10:00', close: '23:30' },
  },
  {
    slug: 'demo-bike-rental-m',
    name: 'Sample Bike Rental M (Demo)',
    blurb: 'A sample scooter and bike rental.',
    latitude: 19.112,
    longitude: 74.7625,
    categories: ['bike-rentals'],
    verified: true,
    amenities: ['parking', 'upi_payments'],
    prices: [
      { label: 'Scooter per day', amount: 400, unit: 'DAY' },
      { label: 'Motorcycle per day', amount: 600, unit: 'DAY' },
    ],
    attributes: {
      vehicle_types: ['scooter', 'motorcycle'],
      deposit: 2000,
      fuel_policy: 'return_full',
    },
    hours: { kind: 'daily', open: '08:00', close: '20:00' },
  },
  {
    // Deliberately far enough that only some colleges reach it: shows that a place is linked to
    // the colleges whose service radius covers it, not to "its" single college.
    slug: 'demo-grocery-n',
    name: 'Sample Grocery N (Demo)',
    blurb: 'A sample grocery store on the edge of the service area.',
    latitude: 19.125,
    longitude: 74.77,
    categories: ['grocery'],
    verified: false,
    amenities: ['upi_payments'],
    prices: [],
    attributes: { home_delivery: true },
    hours: { kind: 'daily', open: '07:00', close: '22:00' },
  },
];
