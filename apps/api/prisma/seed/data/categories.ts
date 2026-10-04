import type { AttributeDataType, PriceUnit } from '../../../src/generated/prisma/client.js';

/**
 * The initial category tree, attributes and rating dimensions. This is DATA: staff can add or
 * change categories and attributes later without touching the schema or the frontend.
 *
 * Where the brief's example fields live:
 *   - monthly_price / daily_price / monthly_rent  -> PlacePriceOption rows (a place can have several
 *     price points, e.g. PG single/double/triple), summarised in Place.priceMin/priceMax/priceUnit
 *   - timing / open_24_hours                      -> PlaceHour rows (structured, multiple slots per day)
 *   - ac / wifi / charging / attached_bathroom / food -> the normalised Amenity list (see amenities.ts)
 *   - everything else (veg_nonveg, seating_capacity, gender, deposit, ...) -> CategoryAttribute below
 */
export interface AttributeSeed {
  key: string;
  name: string;
  dataType: AttributeDataType;
  required?: boolean;
  filterable?: boolean;
  searchable?: boolean;
  unit?: string;
  options?: ReadonlyArray<{ value: string; label: string }>;
  helpText?: string;
}

export interface CategorySeed {
  slug: string;
  name: string;
  icon: string;
  description: string;
  defaultPriceUnit?: PriceUnit;
  attributes: readonly AttributeSeed[];
  ratingDimensions: ReadonlyArray<{ key: string; label: string }>;
}

export interface CategoryGroupSeed {
  slug: string;
  name: string;
  icon: string;
  description: string;
  children: readonly CategorySeed[];
}

const yesNo = (key: string, name: string, filterable = true): AttributeSeed => ({
  key,
  name,
  dataType: 'BOOLEAN',
  filterable,
});

// ── shared attribute sets ─────────────────────────────────────────────────────────────────────

const accommodationAttributes = (genderRequired: boolean): readonly AttributeSeed[] => [
  {
    key: 'gender',
    name: 'Suitable for',
    dataType: 'ENUM',
    required: genderRequired,
    filterable: true,
    options: [
      { value: 'boys', label: 'Boys' },
      { value: 'girls', label: 'Girls' },
      { value: 'co_ed', label: 'Co-ed' },
    ],
  },
  {
    key: 'occupancy_type',
    name: 'Occupancy',
    dataType: 'MULTI_ENUM',
    filterable: true,
    options: [
      { value: 'single', label: 'Single' },
      { value: 'double', label: 'Double sharing' },
      { value: 'triple', label: 'Triple sharing' },
      { value: 'dormitory', label: 'Dormitory' },
    ],
  },
  { key: 'deposit', name: 'Security deposit', dataType: 'INTEGER', unit: 'INR' },
  {
    key: 'furniture',
    name: 'Furnishing',
    dataType: 'ENUM',
    filterable: true,
    options: [
      { value: 'unfurnished', label: 'Unfurnished' },
      { value: 'semi_furnished', label: 'Semi-furnished' },
      { value: 'fully_furnished', label: 'Fully furnished' },
    ],
  },
  { key: 'available_from', name: 'Available from', dataType: 'DATE' },
];

const dietAttribute = (required: boolean): AttributeSeed => ({
  key: 'veg_nonveg',
  name: 'Veg / Non-veg',
  dataType: 'ENUM',
  required,
  filterable: true,
  options: [
    { value: 'veg', label: 'Veg' },
    { value: 'non_veg', label: 'Non-veg' },
    { value: 'both', label: 'Veg and non-veg' },
  ],
});

const dims = (...pairs: Array<[string, string]>) => pairs.map(([key, label]) => ({ key, label }));

const accommodationDims = dims(
  ['cleanliness', 'Cleanliness'],
  ['safety', 'Safety'],
  ['value', 'Value for money'],
  ['owner_behaviour', 'Owner behaviour'],
);
const mealDims = dims(['food', 'Food'], ['price', 'Price'], ['hygiene', 'Hygiene']);
const studyDims = dims(['ambience', 'Ambience'], ['facilities', 'Facilities'], ['value', 'Value']);
const serviceDims = dims(['quality', 'Quality'], ['price', 'Price'], ['service', 'Service']);
const rentalDims = dims(['condition', 'Condition'], ['price', 'Price'], ['service', 'Service']);

// ── the tree ─────────────────────────────────────────────────────────────────────────────────

export const CATEGORY_GROUPS: readonly CategoryGroupSeed[] = [
  {
    slug: 'accommodation',
    name: 'Accommodation',
    icon: 'building-2',
    description: 'Rooms, PGs and hostels near your college.',
    children: [
      {
        slug: 'rooms',
        name: 'Room',
        icon: 'house',
        description: 'Rooms and flats for rent.',
        defaultPriceUnit: 'MONTH',
        attributes: accommodationAttributes(false),
        ratingDimensions: accommodationDims,
      },
      {
        slug: 'pg',
        name: 'PG',
        icon: 'bed-double',
        description: 'Paying-guest accommodation.',
        defaultPriceUnit: 'MONTH',
        attributes: accommodationAttributes(true),
        ratingDimensions: accommodationDims,
      },
      {
        slug: 'hostels',
        name: 'Hostel',
        icon: 'building-2',
        description: 'Student hostels.',
        defaultPriceUnit: 'MONTH',
        attributes: accommodationAttributes(true),
        ratingDimensions: accommodationDims,
      },
    ],
  },
  {
    slug: 'food',
    name: 'Food',
    icon: 'utensils',
    description: 'Messes, tiffin services, restaurants and cafes.',
    children: [
      {
        slug: 'mess',
        name: 'Mess',
        icon: 'utensils',
        description: 'Monthly meal plans.',
        defaultPriceUnit: 'MONTH',
        attributes: [
          dietAttribute(true),
          yesNo('breakfast', 'Breakfast'),
          yesNo('lunch', 'Lunch'),
          yesNo('dinner', 'Dinner'),
        ],
        ratingDimensions: mealDims,
      },
      {
        slug: 'tiffin',
        name: 'Tiffin',
        icon: 'cooking-pot',
        description: 'Tiffin and home-style meal delivery.',
        defaultPriceUnit: 'MONTH',
        attributes: [
          dietAttribute(true),
          yesNo('breakfast', 'Breakfast'),
          yesNo('lunch', 'Lunch'),
          yesNo('dinner', 'Dinner'),
          yesNo('home_delivery', 'Home delivery'),
        ],
        ratingDimensions: mealDims,
      },
      {
        slug: 'restaurants',
        name: 'Restaurant',
        icon: 'store',
        description: 'Restaurants and eateries.',
        defaultPriceUnit: 'MEAL',
        attributes: [
          dietAttribute(false),
          yesNo('dine_in', 'Dine-in'),
          yesNo('home_delivery', 'Home delivery'),
        ],
        ratingDimensions: [...mealDims, { key: 'service', label: 'Service' }],
      },
      {
        slug: 'cafes',
        name: 'Cafe',
        icon: 'coffee',
        description: 'Cafes and snack spots.',
        defaultPriceUnit: 'MEAL',
        attributes: [
          dietAttribute(false),
          yesNo('dine_in', 'Dine-in'),
          yesNo('home_delivery', 'Home delivery'),
        ],
        ratingDimensions: [...mealDims, { key: 'service', label: 'Service' }],
      },
    ],
  },
  {
    slug: 'study',
    name: 'Study',
    icon: 'book-open',
    description: 'Libraries, reading rooms, xerox, printing and stationery.',
    children: [
      {
        slug: 'libraries',
        name: 'Library',
        icon: 'library',
        description: 'Study libraries.',
        defaultPriceUnit: 'MONTH',
        attributes: [
          {
            key: 'seating_capacity',
            name: 'Seating capacity',
            dataType: 'INTEGER',
            unit: 'seats',
            filterable: true,
          },
        ],
        ratingDimensions: studyDims,
      },
      {
        slug: 'reading-rooms',
        name: 'Reading Room',
        icon: 'book-open',
        description: 'Quiet reading rooms.',
        defaultPriceUnit: 'MONTH',
        attributes: [
          {
            key: 'seating_capacity',
            name: 'Seating capacity',
            dataType: 'INTEGER',
            unit: 'seats',
            filterable: true,
          },
        ],
        ratingDimensions: studyDims,
      },
      {
        slug: 'xerox',
        name: 'Xerox',
        icon: 'copy',
        description: 'Photocopy shops.',
        defaultPriceUnit: 'PAGE',
        attributes: [
          {
            key: 'services',
            name: 'Services',
            dataType: 'MULTI_ENUM',
            filterable: true,
            options: [
              { value: 'photocopy', label: 'Photocopy' },
              { value: 'scanning', label: 'Scanning' },
              { value: 'binding', label: 'Binding' },
              { value: 'lamination', label: 'Lamination' },
            ],
          },
        ],
        ratingDimensions: serviceDims,
      },
      {
        slug: 'printing',
        name: 'Printing',
        icon: 'printer',
        description: 'Printing and project work.',
        defaultPriceUnit: 'PAGE',
        attributes: [
          {
            key: 'services',
            name: 'Services',
            dataType: 'MULTI_ENUM',
            filterable: true,
            options: [
              { value: 'black_white', label: 'Black and white printing' },
              { value: 'color', label: 'Colour printing' },
              { value: 'project_printing', label: 'Project printing' },
              { value: 'binding', label: 'Binding' },
            ],
          },
        ],
        ratingDimensions: serviceDims,
      },
      {
        slug: 'stationery',
        name: 'Stationery',
        icon: 'pencil',
        description: 'Stationery and book shops.',
        attributes: [
          yesNo('sells_books', 'Sells books'),
          yesNo('engineering_supplies', 'Engineering and drawing supplies'),
        ],
        ratingDimensions: serviceDims,
      },
    ],
  },
  {
    slug: 'daily-needs',
    name: 'Daily Needs',
    icon: 'shopping-basket',
    description: 'Laundry, gyms, grocery, medical stores and CSC centres.',
    children: [
      {
        slug: 'laundry',
        name: 'Laundry',
        icon: 'shirt',
        description: 'Laundry and ironing.',
        defaultPriceUnit: 'KG',
        attributes: [
          {
            key: 'services',
            name: 'Services',
            dataType: 'MULTI_ENUM',
            filterable: true,
            options: [
              { value: 'wash_fold', label: 'Wash and fold' },
              { value: 'wash_iron', label: 'Wash and iron' },
              { value: 'iron', label: 'Ironing only' },
              { value: 'dry_clean', label: 'Dry cleaning' },
            ],
          },
          yesNo('pickup_delivery', 'Pickup and delivery'),
        ],
        ratingDimensions: serviceDims,
      },
      {
        slug: 'gyms',
        name: 'Gym',
        icon: 'dumbbell',
        description: 'Gyms and fitness studios.',
        defaultPriceUnit: 'MONTH',
        attributes: [
          yesNo('trainer_available', 'Trainer available'),
          {
            key: 'gender_access',
            name: 'Open to',
            dataType: 'ENUM',
            filterable: true,
            options: [
              { value: 'unisex', label: 'Everyone' },
              { value: 'men', label: 'Men only' },
              { value: 'women', label: 'Women only' },
            ],
          },
        ],
        ratingDimensions: dims(
          ['equipment', 'Equipment'],
          ['cleanliness', 'Cleanliness'],
          ['value', 'Value'],
        ),
      },
      {
        slug: 'grocery',
        name: 'Grocery',
        icon: 'shopping-basket',
        description: 'Grocery and general stores.',
        attributes: [yesNo('home_delivery', 'Home delivery')],
        ratingDimensions: dims(
          ['price', 'Price'],
          ['freshness', 'Freshness'],
          ['service', 'Service'],
        ),
      },
      {
        slug: 'medical',
        name: 'Medical',
        icon: 'pill',
        description: 'Medical stores and pharmacies.',
        attributes: [yesNo('home_delivery', 'Home delivery')],
        ratingDimensions: dims(
          ['availability', 'Availability'],
          ['price', 'Price'],
          ['service', 'Service'],
        ),
      },
      {
        slug: 'csc',
        name: 'CSC / Online Services',
        icon: 'landmark',
        description:
          'Common Service Centres, Aaple Sarkar Seva Kendras and online form, certificate and Aadhaar services.',
        attributes: [
          {
            key: 'services',
            name: 'Services',
            dataType: 'MULTI_ENUM',
            filterable: true,
            options: [
              { value: 'online_forms', label: 'Online forms and admissions' },
              { value: 'certificates', label: 'Certificates (income, caste, domicile)' },
              { value: 'aadhaar_pan', label: 'Aadhaar and PAN' },
              { value: 'scholarship', label: 'Scholarship applications' },
              { value: 'bill_payment', label: 'Bill payments and recharge' },
            ],
          },
        ],
        ratingDimensions: serviceDims,
      },
    ],
  },
  {
    slug: 'transport',
    name: 'Transport',
    icon: 'bus',
    description: 'Bike and car rentals, autos and buses.',
    children: [
      {
        slug: 'bike-rentals',
        name: 'Bike Rental',
        icon: 'bike',
        description: 'Scooter and bike rentals.',
        defaultPriceUnit: 'DAY',
        attributes: [
          {
            key: 'vehicle_types',
            name: 'Vehicle types',
            dataType: 'MULTI_ENUM',
            filterable: true,
            options: [
              { value: 'scooter', label: 'Scooter' },
              { value: 'motorcycle', label: 'Motorcycle' },
              { value: 'electric', label: 'Electric' },
              { value: 'bicycle', label: 'Bicycle' },
            ],
          },
          { key: 'deposit', name: 'Security deposit', dataType: 'INTEGER', unit: 'INR' },
          {
            key: 'fuel_policy',
            name: 'Fuel policy',
            dataType: 'ENUM',
            options: [
              { value: 'fuel_included', label: 'Fuel included' },
              { value: 'return_full', label: 'Return with full tank' },
              { value: 'extra_charge', label: 'Charged separately' },
            ],
          },
        ],
        ratingDimensions: rentalDims,
      },
      {
        slug: 'car-rentals',
        name: 'Car Rental',
        icon: 'car',
        description: 'Car rentals.',
        defaultPriceUnit: 'DAY',
        attributes: [
          {
            key: 'vehicle_types',
            name: 'Vehicle types',
            dataType: 'MULTI_ENUM',
            filterable: true,
            options: [
              { value: 'hatchback', label: 'Hatchback' },
              { value: 'sedan', label: 'Sedan' },
              { value: 'suv', label: 'SUV' },
              { value: 'van', label: 'Van' },
            ],
          },
          { key: 'deposit', name: 'Security deposit', dataType: 'INTEGER', unit: 'INR' },
          yesNo('with_driver', 'Driver available'),
        ],
        ratingDimensions: rentalDims,
      },
      {
        slug: 'auto',
        name: 'Auto',
        icon: 'car-taxi-front',
        description: 'Auto-rickshaw stands and services.',
        defaultPriceUnit: 'TRIP',
        attributes: [
          {
            key: 'fare_type',
            name: 'Fare',
            dataType: 'ENUM',
            filterable: true,
            options: [
              { value: 'meter', label: 'By meter' },
              { value: 'fixed', label: 'Fixed fare' },
              { value: 'negotiable', label: 'Negotiable' },
            ],
          },
        ],
        ratingDimensions: dims(
          ['reliability', 'Reliability'],
          ['price', 'Price'],
          ['safety', 'Safety'],
        ),
      },
      {
        slug: 'bus',
        name: 'Bus',
        icon: 'bus',
        description: 'Bus routes and stops.',
        defaultPriceUnit: 'TRIP',
        attributes: [
          { key: 'route_info', name: 'Route / operator', dataType: 'TEXT', searchable: true },
        ],
        ratingDimensions: dims(
          ['reliability', 'Reliability'],
          ['price', 'Price'],
          ['safety', 'Safety'],
        ),
      },
    ],
  },
];
