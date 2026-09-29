import { ImageResponse } from 'next/og';
import { BRAND } from '@/constants/brand';
import { businessPagesService } from '@/services/business.service';

export const alt = 'A business on CampusPin';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Only JPEG and PNG can be drawn into the card (WebP cannot), and a photo that fails to load must
 * never break the preview: then the card simply has no photo.
 */
async function photoDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    // eslint-disable-next-line no-restricted-globals -- downloads image bytes, not an API call.
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !/^image\/(jpeg|png)/.test(type)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 4 * 1024 * 1024) return null;
    return `data:${type.split(';')[0]};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

/** The link preview for WhatsApp, Instagram, Facebook...: name, category, rating, cover photo. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await businessPagesService
    .get(slug.toLowerCase())
    .then((result) => result.data)
    .catch(() => null);
  const photo = await photoDataUrl(
    business?.coverUrl ?? business?.branches[0]?.coverImageUrl ?? business?.logoUrl ?? null,
  );
  const subtitle = business
    ? [business.category?.name, business.city].filter(Boolean).join(' · ')
    : BRAND.tagline;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: 'linear-gradient(135deg, #052f63 0%, #0b63cf 100%)',
        color: 'white',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px',
          width: photo ? '58%' : '100%',
        }}
      >
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, opacity: 0.85 }}>
          {BRAND.name}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, lineHeight: 1.08 }}>
            {business?.name ?? BRAND.name}
          </div>
          {subtitle && (
            <div style={{ display: 'flex', fontSize: 32, opacity: 0.85 }}>{subtitle}</div>
          )}
          {business && business.ratingCount > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 30,
                color: '#ffd27a',
              }}
            >
              {/* The built-in font has no ★ glyph, so the star is drawn. */}
              <svg width="30" height="30" viewBox="0 0 20 20" fill="#ffd27a">
                <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.8l-5.2 2.8 1-5.8L1.5 7.7l5.9-.9z" />
              </svg>
              {`${business.ratingAverage.toFixed(1)} · ${business.ratingCount} ${business.ratingCount === 1 ? 'review' : 'reviews'}`}
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            background: 'white',
            color: '#052f63',
            borderRadius: 999,
            padding: '14px 30px',
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          {`View on ${BRAND.name}`}
        </div>
      </div>
      {photo && (
        <div style={{ display: 'flex', width: '42%', height: '100%' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse, not the browser. */}
          <img src={photo} alt="" width={504} height={630} style={{ objectFit: 'cover' }} />
        </div>
      )}
    </div>,
    size,
  );
}
