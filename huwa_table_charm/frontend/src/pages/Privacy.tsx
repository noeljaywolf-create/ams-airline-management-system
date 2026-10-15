import { Link } from 'react-router-dom';

const SECTIONS = [
  {
    id: 'information',
    title: '1. Information we collect',
    body: [
      'We collect the information you provide directly: your name, email address, phone number, delivery address and order details when you create an account, place an order, or chat with Charm.',
      'We also collect limited technical data — browser type, device, and pages visited — to keep the store fast, secure and easy to use.',
      'When you chat with Charm, we use your conversation to help you choose products and to improve the assistant. We do not sell your data to anyone, ever.',
    ],
  },
  {
    id: 'use',
    title: '2. How we use your information',
    body: [
      'Process and fulfil your orders, including payment processing and order updates via WhatsApp or SMS.',
      'Send service messages — order confirmations, delivery updates and support responses.',
      'Provide and improve Charm, our AI shopping assistant, and the overall store experience.',
      'Send marketing emails only if you choose to subscribe. Every email includes an unsubscribe link.',
    ],
  },
  {
    id: 'whatsapp',
    title: '3. WhatsApp & order updates',
    body: [
      'When you place an order, we may send you a confirmation and status updates to the phone number you provide. Message frequency depends on your order(s).',
      'These messages are service communications, not marketing — you will receive them because you placed an order.',
      'You can ask to stop receiving WhatsApp updates at any time by replying "STOP" or contacting support.',
    ],
  },
  {
    id: 'payment',
    title: '4. Payments',
    body: [
      'Payments are processed by our payment provider (Stripe). We never store your full card number.',
      'Card details are handled entirely within the provider\'s secure environment and are protected with bank-grade encryption.',
    ],
  },
  {
    id: 'cookies',
    title: '5. Cookies and local storage',
    body: [
      'We use browser storage to keep you signed in, remember your cart, and save your dream-kitchen favourites and style choices on this device. Dream-board preferences are not uploaded to your account.',
      'You can disable cookies in your browser settings, but some features — like cart persistence — may not work correctly.',
    ],
  },
  {
    id: 'sharing',
    title: '6. When we share data',
    body: [
      'We share data only with trusted service providers who help us run the business — delivery partners, the payment processor, and the messaging platform that sends your order updates. All of them agree to keep your data secure and use it only for the services they provide to us.',
      'We will disclose data if required by law or to protect the safety and rights of our customers and business.',
    ],
  },
  {
    id: 'rights',
    title: '7. Your rights',
    body: [
      'You may access, correct, or request deletion of your personal information at any time from your account page, or by contacting us.',
      'You may export the data we hold about you, and you may object to certain uses of your data. Where processing relies on consent, you can withdraw it at any time.',
    ],
  },
  {
    id: 'retention',
    title: '8. How long we keep data',
    body: [
      'We keep your data only as long as needed: order records are retained for accounting and warranty purposes (typically 2 years), and account data for as long as your account is active. Purely technical logs are kept for a short period.',
    ],
  },
  {
    id: 'security',
    title: '9. Security',
    body: [
      'We use encryption in transit, secure credential handling, and role-based access internally. No store is 100% immune to risk, but we apply industry-standard safeguards and review them regularly.',
    ],
  },
  {
    id: 'contact',
    title: '10. Contact us',
    body: [
      'Questions about this policy or your data? Email us at privacy@huwa-table-charm.com, or ask Charm in the chat widget and we\'ll route you to a human.',
    ],
  },
];

export default function Privacy() {
  return (
    <div className="container-page py-12 md:py-20">
      <div className="max-w-3xl">
        <div className="eyebrow">Legal</div>
        <h1 className="mt-3 font-display text-4xl font-semibold text-stone-900">Privacy Policy</h1>
        <p className="mt-2 text-sm text-stone-500">Last updated: September 2026 · HUWA TABLE CHARM</p>

        <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-soft md:p-8">
          <p className="leading-relaxed text-stone-600">
            This Privacy Policy explains what information HUWA TABLE CHARM collects when you browse or shop,
            how we use it, and the choices you have. By using this store you agree to the practices described here.
          </p>
        </div>

        <div className="mt-8 space-y-8">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="font-display text-xl font-semibold text-stone-900">{s.title}</h2>
              <div className="mt-3 space-y-3">
                {s.body.map((p) => (
                  <p key={p} className="leading-relaxed text-stone-600">{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-stone-200 bg-stone-50 p-6 text-sm text-stone-500">
          If you'd like to read how trading works — refunds, shipping, and more — see our{' '}
          <Link to="/terms" className="font-medium text-teal-700 underline hover:text-teal-800">Terms & Conditions</Link>.
        </div>
      </div>
    </div>
  );
}