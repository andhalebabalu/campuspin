import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/icon';
import { BRAND } from '@/constants/brand';
import { CONTACT_EMAIL, LEGAL, OPERATOR } from '@/constants/legal';
import { ROUTES } from '@/constants/routes';
import { Detail, LegalPage, type LegalSection } from '@/features/legal/components/legal-page';

export const metadata: Metadata = {
  title: 'Grievance Officer',
  description: `How to raise a complaint with ${BRAND.name} and how quickly it is handled.`,
};

function ContactRow({
  icon,
  label,
  value,
  href,
}: {
  icon: IconName;
  label: string;
  value: string | null;
  href?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
        <Icon name={icon} className="size-4" />
      </span>
      <span className="flex flex-col">
        <span className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</span>
        <span className="text-sm font-medium text-ink">
          <Detail value={value}>
            {href && value ? (
              <a href={href} className="text-action underline underline-offset-2">
                {value}
              </a>
            ) : (
              value
            )}
          </Detail>
        </span>
      </span>
    </div>
  );
}

const officer = (
  <div className="grid gap-4 rounded-xl border border-line bg-surface p-5 shadow-sm sm:grid-cols-2">
    <ContactRow icon="user" label="Grievance Officer" value={LEGAL.grievance.name} />
    <ContactRow
      icon="mail"
      label="Email"
      value={LEGAL.grievance.email}
      href={LEGAL.grievance.email ? `mailto:${LEGAL.grievance.email}` : undefined}
    />
    {LEGAL.grievance.phone && (
      <ContactRow
        icon="phone"
        label="Phone"
        value={LEGAL.grievance.phone}
        href={`tel:${LEGAL.grievance.phone.replace(/\s+/g, '')}`}
      />
    )}
    <ContactRow icon="pin" label="Address" value={LEGAL.address} />
    <ContactRow icon="store" label="Operated by" value={LEGAL.entity ?? OPERATOR} />
  </div>
);

const SECTIONS: LegalSection[] = [
  {
    id: 'officer',
    title: 'Contact the Grievance Officer',
    body: (
      <>
        <p>
          As required by the Information Technology (Intermediary Guidelines and Digital Media
          Ethics Code) Rules, 2021, the Consumer Protection (E-Commerce) Rules, 2020 and the Digital
          Personal Data Protection Act, 2023, {OPERATOR} has appointed a Grievance Officer for{' '}
          {BRAND.name}:
        </p>
        {officer}
      </>
    ),
  },
  {
    id: 'what-to-raise',
    title: 'What you can raise',
    body: (
      <ul>
        <li>
          Content on {BRAND.name} that breaks our <Link href={ROUTES.terms}>Terms</Link> or the law:
          a review, post, comment, listing, message or photo.
        </li>
        <li>Wrong or misleading information about a place, a college or a business.</li>
        <li>
          A problem with an order, booking, enquiry or invoice that the business did not solve.
        </li>
        <li>
          Your personal data: seeing it, correcting it, deleting it or closing your account (see the{' '}
          <Link href={ROUTES.privacy}>Privacy Policy</Link>).
        </li>
        <li>An action we took on your account or content that you think was wrong.</li>
      </ul>
    ),
  },
  {
    id: 'how',
    title: 'How to raise a complaint',
    body: (
      <>
        <p>
          The quickest way to flag a single post, review or listing is the <strong>Report</strong>{' '}
          button next to it in {BRAND.name}. For anything else, email the Grievance Officer
          {CONTACT_EMAIL ? (
            <>
              {' '}
              at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </>
          ) : null}{' '}
          with:
        </p>
        <ul>
          <li>your name and the email address of your {BRAND.name} account, if you have one;</li>
          <li>the link to the content, place, order or account concerned;</li>
          <li>what is wrong, and what you would like us to do;</li>
          <li>any screenshots or documents that help.</li>
        </ul>
        <p>Writing on behalf of someone else? Please say so and how you are connected to them.</p>
      </>
    ),
  },
  {
    id: 'timelines',
    title: 'How quickly we respond',
    body: (
      <>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { when: '24 hours', what: 'We acknowledge your complaint.' },
            { when: '15 days', what: 'We resolve it and tell you what we did.' },
            {
              when: '24 hours',
              what: 'We remove intimate or sexual images of you shared without consent.',
            },
          ].map((item) => (
            <div key={item.what} className="rounded-xl border border-line bg-surface p-4 shadow-xs">
              <p className="font-display text-2xl font-extrabold text-primary-800">{item.when}</p>
              <p className="mt-1 text-sm text-body">{item.what}</p>
            </div>
          ))}
        </div>
        <p>
          For a complaint about an order or another consumer matter, we acknowledge it within 48
          hours and resolve it within one month of receiving it. These are the times the law sets;
          we aim to be quicker.
        </p>
      </>
    ),
  },
  {
    id: 'appeal',
    title: 'If you are not satisfied',
    body: (
      <ul>
        <li>
          About content on {BRAND.name}: you can appeal the Grievance Officer&rsquo;s decision to
          the Government&rsquo;s Grievance Appellate Committee within 30 days, at{' '}
          <a href="https://gac.gov.in" target="_blank" rel="noopener noreferrer">
            gac.gov.in
          </a>
          .
        </li>
        <li>About your personal data: you can complain to the Data Protection Board of India.</li>
        <li>
          About an order or a purchase: you can approach the National Consumer Helpline (1915 or{' '}
          <a href="https://consumerhelpline.gov.in" target="_blank" rel="noopener noreferrer">
            consumerhelpline.gov.in
          </a>
          ) or a consumer commission.
        </li>
      </ul>
    ),
  },
];

export default function GrievancePage() {
  return (
    <LegalPage
      current={ROUTES.grievance}
      title="Grievance Officer"
      intro={
        <p>
          Something on {BRAND.name} is wrong, harmful or about you? Tell us. Here is who handles
          complaints, how to reach them, and how quickly you will hear back.
        </p>
      }
      summary={[
        'Use the Report button for a single post, review or listing.',
        'Email the Grievance Officer for anything else, including your personal data.',
        'We acknowledge within 24 hours and resolve within 15 days.',
        'Not satisfied? You can appeal to the Grievance Appellate Committee.',
      ]}
      sections={SECTIONS}
    />
  );
}
