'use client';

import { MyOrders } from '@/features/orders/components/my-orders';
import { MyRedemptionsList, MyRequestsList } from './request-views';

/** The orders hub: food and print orders, requests and offer codes. */
export function OrdersHubTabs() {
  return (
    <MyOrders
      extraTabs={[
        { id: 'requests', label: 'Requests', render: () => <MyRequestsList /> },
        { id: 'offers', label: 'Offer codes', render: () => <MyRedemptionsList /> },
      ]}
    />
  );
}
