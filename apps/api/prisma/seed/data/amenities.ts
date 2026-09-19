/** Master list of place facilities. `key` is the stable identifier; `icon` is a UI icon-set key. */
export interface AmenitySeed {
  key: string;
  name: string;
  icon: string;
}

export const AMENITIES: readonly AmenitySeed[] = [
  { key: 'wifi', name: 'WiFi', icon: 'wifi' },
  { key: 'ac', name: 'Air conditioning', icon: 'snowflake' },
  { key: 'parking', name: 'Parking', icon: 'square-parking' },
  { key: 'charging', name: 'Charging points', icon: 'plug' },
  { key: 'food', name: 'Food included', icon: 'utensils' },
  { key: 'attached_bathroom', name: 'Attached bathroom', icon: 'bath' },
  { key: 'cctv', name: 'CCTV', icon: 'cctv' },
  { key: 'washing_machine', name: 'Washing machine', icon: 'washing-machine' },
  { key: 'power_backup', name: 'Power backup', icon: 'zap' },
  { key: 'drinking_water', name: 'Drinking water', icon: 'droplets' },
  { key: 'hot_water', name: 'Hot water', icon: 'flame' },
  { key: 'refrigerator', name: 'Refrigerator', icon: 'refrigerator' },
  { key: 'lockers', name: 'Lockers', icon: 'lock' },
  { key: 'security_guard', name: 'Security guard', icon: 'shield-check' },
  { key: 'housekeeping', name: 'Housekeeping', icon: 'sparkles' },
  { key: 'lift', name: 'Lift', icon: 'arrow-up-down' },
  { key: 'upi_payments', name: 'UPI payments', icon: 'smartphone' },
  { key: 'card_payments', name: 'Card payments', icon: 'credit-card' },
];
