import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND } from '@/constants/brand';
import { CONTACT_EMAIL, LEGAL, OPERATOR } from '@/constants/legal';
import { ROUTES } from '@/constants/routes';
import { Detail, LegalPage, type LegalSection } from '@/features/legal/components/legal-page';

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: `The terms for using ${BRAND.name}: accounts, content, orders, the marketplace and more.`,
};

const SECTIONS: LegalSection[] = [
  {
    id: 'agreement',
    title: 'Agreement',
    body: (
      <>
        <p>
          These terms are an agreement between you and <strong>{OPERATOR}</strong>
          {LEGAL.entity ? null : (
            <>
              {' '}
              (registered name: <Detail value={null} />)
            </>
          )}{' '}
          (&ldquo;we&rdquo;, &ldquo;us&rdquo;), which runs {BRAND.name}, the website and the mobile
          app. By creating an account or using {BRAND.name} you accept these terms and our{' '}
          <Link href={ROUTES.privacy}>Privacy Policy</Link>. If you do not agree, please do not use{' '}
          {BRAND.name}.
        </p>
        <p>
          {BRAND.name} is an intermediary under the Information Technology Act, 2000: it helps
          students find and contact places, businesses and each other. It does not itself sell the
          rooms, meals, prints or other things listed on it.
        </p>
      </>
    ),
  },
  {
    id: 'accounts',
    title: 'Your account',
    body: (
      <ul>
        <li>
          You must be 18 or older, or have the consent of a parent or guardian who accepts these
          terms for you.
        </li>
        <li>Give true details, keep them up to date, and use one personal account.</li>
        <li>
          Keep your password to yourself. You are responsible for what happens under your account;
          tell us at once if you think someone else is using it.
        </li>
        <li>
          Student features (the community and the marketplace) need you to verify that you study at
          your college. Verifying falsely, or with someone else&rsquo;s ID, ends your account.
        </li>
      </ul>
    ),
  },
  {
    id: 'businesses',
    title: 'Business accounts',
    body: (
      <ul>
        <li>
          If you list a business you confirm that you own it or may act for it, and that its
          details, prices, menus, photos and offers are accurate and lawful.
        </li>
        <li>
          You are responsible for the goods and services you provide, for your prices, taxes,
          licences (such as FSSAI for food) and for the invoices you issue through {BRAND.name}.
        </li>
        <li>
          We may review, edit for accuracy, hide or remove a listing that is misleading, unsafe or
          breaks these terms. A verified badge means our staff checked the listing at that time; it
          is not a guarantee of quality.
        </li>
      </ul>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'What you must not do',
    body: (
      <>
        <p>
          Under the Information Technology (Intermediary Guidelines and Digital Media Ethics Code)
          Rules, 2021, and for everyone&rsquo;s safety, you must not post, send or share anything
          that:
        </p>
        <ul>
          <li>belongs to someone else and you have no right to share;</li>
          <li>
            is obscene, pornographic, invasive of someone&rsquo;s privacy (including their personal
            details or photos), or harmful to children;
          </li>
          <li>
            harasses, threatens, defames or insults anyone, or promotes hatred based on religion,
            caste, gender, region or any other ground;
          </li>
          <li>is false or misleading, including fake reviews, fake listings or impersonation;</li>
          <li>infringes a patent, trademark, copyright or other right;</li>
          <li>contains viruses or code meant to damage or disrupt any system;</li>
          <li>
            threatens the unity, integrity, security or sovereignty of India, public order, or
            relations with other countries;
          </li>
          <li>offers anything illegal to sell or buy, or breaks any law in force in India.</li>
        </ul>
        <p>
          Also do not scrape or copy {BRAND.name} in bulk, try to get around its security or limits,
          or use it to send spam.
        </p>
      </>
    ),
  },
  {
    id: 'your-content',
    title: 'Your content',
    body: (
      <>
        <p>
          You keep ownership of what you post: reviews, posts, comments, photos, listings and
          messages. You allow us to store, show and share it within {BRAND.name} (for example,
          showing your review on a place&rsquo;s page) for as long as it is on {BRAND.name}. You are
          responsible for it and confirm you have the right to post it.
        </p>
        <p>
          Anyone can report content they think breaks these terms. We may remove content, and act on
          the account that posted it, when we find it breaks these terms or when a court or the
          government lawfully directs us to.
        </p>
      </>
    ),
  },
  {
    id: 'place-information',
    title: 'Place information',
    body: (
      <p>
        Place details come from businesses, from students and from public sources such as
        OpenStreetMap. Places that are not verified are marked so. Distances are calculated in a
        straight line from a college&rsquo;s map point, and some college locations are approximate
        (their page says so). Prices, opening hours and availability can change: please confirm with
        the place before you rely on them.
      </p>
    ),
  },
  {
    id: 'orders',
    title: 'Orders, bookings and payments',
    body: (
      <ul>
        <li>
          When you order, book, enquire or send a request, your agreement is with the business. It
          decides whether to accept, prepares and delivers what you asked for, and issues the
          invoice.
        </li>
        <li>
          Payment is made to the business directly (for example in cash or by UPI) unless{' '}
          {BRAND.name} clearly offers online payment for that order. An order shown as completed is
          not the same as paid; the business records payment.
        </li>
        <li>
          Problems with an order are first for the business to solve. If that does not work, contact
          our Grievance Officer and we will help where we can.
        </li>
      </ul>
    ),
  },
  {
    id: 'marketplace',
    title: 'The student marketplace',
    body: (
      <ul>
        <li>
          The marketplace lets verified students buy, sell and give away things to each other. Every
          deal is between the two students; we are not a party to it and do not hold payments.
        </li>
        <li>
          Only list things you own and may lawfully sell. Weapons, drugs, alcohol, tobacco,
          medicines, stolen or counterfeit goods, exam papers or answers, and anything else illegal
          are not allowed.
        </li>
        <li>
          Meet in a safe, public place (on campus is best), check the item before paying, and never
          share passwords or OTPs.
        </li>
      </ul>
    ),
  },
  {
    id: 'suspension',
    title: 'Suspending or closing accounts',
    body: (
      <p>
        We may suspend or close an account that breaks these terms or the law, or that puts other
        users at risk, and we will tell you why unless the law or safety prevents it. You can close
        your account at any time by writing to our Grievance Officer (see the{' '}
        <Link href={ROUTES.privacy}>Privacy Policy</Link> for what happens to your data).
      </p>
    ),
  },
  {
    id: 'ip',
    title: 'Our name and design',
    body: (
      <p>
        The {BRAND.name} name, logo, design and software belong to {OPERATOR}. Map and place data
        from OpenStreetMap is © OpenStreetMap contributors under the Open Database License. You may
        not copy or reuse our name, logo or design without written permission.
      </p>
    ),
  },
  {
    id: 'liability',
    title: 'Disclaimers and liability',
    body: (
      <>
        <p>
          {BRAND.name} is provided &ldquo;as is&rdquo;. We work to keep it accurate and available,
          but we do not promise it will always be error-free or uninterrupted, and we are not
          responsible for the goods, services, prices or conduct of businesses or other users.
        </p>
        <p>
          As far as the law allows, we are not liable for indirect or consequential losses, and our
          total liability to you for any claim is limited to the amount, if any, you paid us in the
          three months before it. Nothing here limits rights you have under the Consumer Protection
          Act, 2019 or any other law that cannot be excluded.
        </p>
        <p>You agree to compensate us for losses caused by your breaking these terms or the law.</p>
      </>
    ),
  },
  {
    id: 'law',
    title: 'Governing law and disputes',
    body: (
      <p>
        These terms are governed by the laws of India. Before going to court, please raise any
        complaint with our Grievance Officer so we can try to resolve it. Any dispute is subject to
        the courts at{' '}
        <strong>
          <Detail value={LEGAL.jurisdiction} />
        </strong>
        , India.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these terms',
    body: (
      <p>
        We may update these terms as {BRAND.name} changes. The date at the top shows the latest
        version; we will tell you of important changes before they take effect, and continuing to
        use {BRAND.name} after that means you accept them.
        {CONTACT_EMAIL ? (
          <>
            {' '}
            Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </>
        ) : null}
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      current={ROUTES.terms}
      title="Terms & Conditions"
      intro={
        <p>
          The rules for using {BRAND.name}, written to be read. They cover your account, what you
          can post, orders with businesses, the student marketplace, and what happens if something
          goes wrong.
        </p>
      }
      summary={[
        `${BRAND.name} connects you with places, businesses and other students; it does not sell what is listed.`,
        'Be truthful, respectful and lawful; fake reviews, harassment and illegal items are not allowed.',
        'Orders and marketplace deals are between you and the business or the other student.',
        'Unverified place details may be incomplete: confirm with the place before relying on them.',
        'Complaints go to our Grievance Officer first.',
      ]}
      sections={SECTIONS}
    />
  );
}
