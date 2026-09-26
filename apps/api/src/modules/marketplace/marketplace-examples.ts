/** Swagger examples shared by the marketplace controllers. */

const COLLEGE = {
  id: '01a0babd-b2d2-725f-9c0f-ddbc81685942',
  slug: 'abc-college',
  name: 'ABC College',
};

const SELLER = {
  id: '01a0c44b-14bb-724c-98a4-00a05625e026',
  displayName: 'Rahul A.',
  verifiedStudent: true,
  college: COLLEGE,
};

export const EXAMPLE_CARD = {
  id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0fa01',
  title: 'Engineering Maths (Kreyszig)',
  category: 'BOOKS',
  condition: 'GOOD',
  price: 350,
  negotiable: true,
  status: 'ACTIVE',
  coverImageUrl: 'http://localhost:4000/uploads/0f0c7a52-3a4c-4c4f-9a50-8a2f0b0d8e11.jpg',
  college: COLLEGE,
  city: 'Ahmednagar',
  distanceKm: 2.4,
  createdAt: '2026-09-26T10:00:00.000Z',
};

export const EXAMPLE_LISTING = {
  ...EXAMPLE_CARD,
  description: 'Clean copy, a few pencil notes in chapter 2.',
  quantity: 1,
  location: 'Main gate',
  visibility: 'NEARBY_COLLEGES',
  images: [EXAMPLE_CARD.coverImageUrl],
  seller: SELLER,
  mine: false,
  canMessage: true,
  conversationId: null,
  moderationNote: null,
  expiresAt: '2026-10-26T10:00:00.000Z',
  updatedAt: '2026-09-26T10:00:00.000Z',
};

export const EXAMPLE_CONVERSATION = {
  id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0fb01',
  listing: {
    id: EXAMPLE_CARD.id,
    title: EXAMPLE_CARD.title,
    price: EXAMPLE_CARD.price,
    status: 'ACTIVE',
    coverImageUrl: EXAMPLE_CARD.coverImageUrl,
  },
  other: SELLER,
  role: 'BUYER',
  lastMessage: 'Is this still available?',
  lastMessageAt: '2026-09-26T10:05:00.000Z',
  unread: false,
  blocked: false,
};

export const EXAMPLE_MESSAGE = {
  id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0fc01',
  conversationId: EXAMPLE_CONVERSATION.id,
  body: 'Is this still available?',
  mine: true,
  createdAt: '2026-09-26T10:05:00.000Z',
};
