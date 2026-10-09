import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND } from '@/constants/brand';
import { CONTACT_EMAIL, LEGAL, OPERATOR } from '@/constants/legal';
import { ROUTES } from '@/constants/routes';
import { Detail, LegalPage, type LegalSection } from '@/features/legal/components/legal-page';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `How ${BRAND.name} collects, uses, shares and protects your personal data.`,
};

const mail = CONTACT_EMAIL ? (
  <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
) : (
  <Link href={ROUTES.grievance}>our Grievance Officer</Link>
);

const SECTIONS: LegalSection[] = [
  {
    id: 'who-we-are',
    title: 'Who we are',
    body: (
      <>
        <p>
          {BRAND.name} (the website and the mobile app) is run by <strong>{OPERATOR}</strong>
          {LEGAL.entity ? null : (
            <>
              {' '}
              (registered name: <Detail value={null} />)
            </>
          )}
          , address: <Detail value={LEGAL.address} />. In this policy, &ldquo;we&rdquo; and
          &ldquo;us&rdquo; mean {OPERATOR}, and &ldquo;you&rdquo; means anyone who uses {BRAND.name}
          : students, business owners and visitors.
        </p>
        <p>
          For your personal data we are the <strong>Data Fiduciary</strong> under India&rsquo;s
          Digital Personal Data Protection Act, 2023. This policy also follows the Information
          Technology Act, 2000 and the rules made under it.
        </p>
      </>
    ),
  },
  {
    id: 'what-we-collect',
    title: 'What we collect',
    body: (
      <>
        <p>
          <strong>When you create an account:</strong> your name, email address, a password (we
          store only a scrambled form of it, never the password itself), and, if you choose to add
          them, your phone number, college, course, year and a profile photo.
        </p>
        <p>
          <strong>When you verify that you are a student:</strong> either a link sent to your
          college email address, or a photo of your student ID card. The ID photo is kept privately,
          seen only by our review staff, and{' '}
          <strong>deleted as soon as it has been reviewed</strong>, whether it is approved or not.
        </p>
        <p>
          <strong>What you post or send:</strong> reviews and ratings, community posts, comments and
          reactions, marketplace listings and the messages you exchange, places you suggest,
          enquiries, bookings, service requests and orders. A file you send to a print shop (a PDF,
          say) or a photo you attach to a request is stored privately, shared only with that
          business, and <strong>deleted once the job is finished</strong>.
        </p>
        <p>
          <strong>If you run a business on {BRAND.name}:</strong> your business details, listings,
          photos, menus, opening hours, offers, the orders you receive and the invoices you issue.
        </p>
        <p>
          <strong>Location:</strong> only when you ask for it, for example to pin a place you are
          adding on the map or to see what is near you. We do not track your location in the
          background.
        </p>
        <p>
          <strong>Camera and photos (app):</strong> only when you tap to scan a {BRAND.name} QR code
          or to add a photo. Nothing is recorded otherwise; we never use the microphone.
        </p>
        <p>
          <strong>Technical data:</strong> the IP address and browser or device type of your sign-in
          sessions (to keep your account safe), a random visitor number saved in your browser so we
          can count daily visits, and records of actions our staff take, for accountability.
        </p>
      </>
    ),
  },
  {
    id: 'why',
    title: 'Why we use it',
    body: (
      <>
        <ul>
          <li>To run your account and show you colleges and places around you.</li>
          <li>
            To confirm you are a student of your college, which unlocks the community and the
            marketplace.
          </li>
          <li>
            To pass your orders, enquiries, bookings and requests to the business you chose, and to
            show you their status and invoices.
          </li>
          <li>To send emails you need: verification links, password resets and order updates.</li>
          <li>
            To keep {BRAND.name} safe: to stop spam, fake reviews and abuse, and to act on reports.
          </li>
          <li>To understand, in total numbers, how {BRAND.name} is used, so we can improve it.</li>
          <li>To meet our obligations under Indian law.</li>
        </ul>
        <p>
          We process your data because you gave your consent by using {BRAND.name} for these
          purposes, or for a legitimate use the law allows (such as keeping the service secure or
          complying with the law). You can withdraw your consent at any time (see{' '}
          <a href="#your-rights">Your rights</a>).
        </p>
      </>
    ),
  },
  {
    id: 'who-sees-it',
    title: 'Who can see your data',
    body: (
      <>
        <ul>
          <li>
            <strong>Other users</strong> see what you choose to make visible: your name and photo
            with your reviews, posts and listings. Community posts are visible only to verified
            students of your college unless you choose to make a post public. Marketplace listings
            and messages are open only to verified students.
          </li>
          <li>
            <strong>Businesses</strong> see what you send them: your name and the details of your
            order, enquiry, booking or request, and any file you attach to it.
          </li>
          <li>
            <strong>Our staff</strong> see what they need to verify students, review suggestions,
            and handle reports and complaints.
          </li>
          <li>
            <strong>Service providers</strong> who host our servers and deliver our emails, only to
            provide that service to us and bound to protect the data.
          </li>
          <li>
            <strong>Authorities</strong>, when Indian law requires it, for example a lawful order
            from a court or government agency.
          </li>
        </ul>
        <p>
          <strong>
            We do not sell your personal data, and we do not show you third-party advertising.
          </strong>
        </p>
      </>
    ),
  },
  {
    id: 'how-long',
    title: 'How long we keep it',
    body: (
      <ul>
        <li>Your account data: for as long as you have an account.</li>
        <li>Student ID photos: deleted as soon as they are reviewed.</li>
        <li>Files sent to a business for an order or request: deleted once the job is finished.</li>
        <li>A student verification stays valid for one year, then you can renew it.</li>
        <li>
          Invoices and order records: for as long as tax and accounting laws require, even after an
          account is closed.
        </li>
        <li>Security and staff-action records: for as long as needed to keep the service safe.</li>
      </ul>
    ),
  },
  {
    id: 'security',
    title: 'How we protect it',
    body: (
      <p>
        Passwords are stored only in a scrambled (hashed) form. Student ID photos and private files
        never have a public web address: they are sent only to the people allowed to see them.
        Connections to {BRAND.name} are encrypted when served over HTTPS, and access to personal
        data is limited to the staff who need it. No system is perfectly secure; if a breach affects
        your data, we will tell you and the Data Protection Board of India as the law requires.
      </p>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your rights',
    body: (
      <>
        <p>Under the Digital Personal Data Protection Act, 2023 you can:</p>
        <ul>
          <li>ask what personal data we hold about you and how we use it;</li>
          <li>correct or update it (most of it you can edit yourself in your profile);</li>
          <li>
            have your data erased and your account closed, except records the law makes us keep;
          </li>
          <li>withdraw your consent at any time;</li>
          <li>nominate someone to exercise these rights if you die or become unable to;</li>
          <li>
            complain to our Grievance Officer, and then to the Data Protection Board of India.
          </li>
        </ul>
        <p>
          To use any of these rights, including deleting your account, write to {mail} from the
          email address on your account. We reply within the time the law allows.
        </p>
      </>
    ),
  },
  {
    id: 'children',
    title: 'Age',
    body: (
      <p>
        {BRAND.name} is meant for people aged 18 and over. If you are under 18, you may use it only
        with the consent of a parent or guardian, who is responsible for your use. If we learn that
        we hold the data of someone under 18 without that consent, we will delete it.
      </p>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and browser storage',
    body: (
      <p>
        We use your browser&rsquo;s storage only for things {BRAND.name} needs to work: keeping you
        signed in, a random visitor number for counting visits, your cart while you order, and small
        preferences such as a collapsed menu. We do not use advertising or cross-site tracking
        cookies. Clearing your browser data removes them.
      </p>
    ),
  },
  {
    id: 'third-party',
    title: 'Information from others',
    body: (
      <p>
        Some college and place details come from public sources: government college lists and
        OpenStreetMap (© OpenStreetMap contributors, ODbL). These are about places, not about you.
        If something about you or your business appears that you want corrected or removed, write to{' '}
        {mail}.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        We may update this policy as {BRAND.name} changes. The date at the top always shows the
        latest version, and we will let you know of important changes by email or in the app before
        they take effect.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      current={ROUTES.privacy}
      title="Privacy Policy"
      intro={
        <p>
          This policy explains what personal data {BRAND.name} collects, why, who can see it, how
          long we keep it, and the choices you have. We have written it in plain language and kept
          it true to how {BRAND.name} actually works.
        </p>
      }
      summary={[
        'We collect what you give us to run your account, plus a little technical data to keep it safe.',
        'Student ID photos are deleted as soon as they are reviewed; files sent to a print shop once the job is done.',
        'We never sell your data and show no third-party ads.',
        'Community posts stay inside your college unless you choose to make them public.',
        'You can ask to see, correct or delete your data at any time.',
      ]}
      sections={SECTIONS}
    />
  );
}
