import { Link } from 'react-router-dom';

const SECTIONS = [
  {
    id: 'acceptance',
    title: '1. Acceptance of terms',
    body: [
      'By accessing, browsing or purchasing from HUWA TABLE CHARM, you agree to these Terms & Conditions. If you do not agree, please do not use the store.',
    ],
  },
  {
    id: 'orders',
    title: '2. Orders & acceptance',
    body: [
      'Placing an item in your cart does not guarantee it. Your order is accepted only when we confirm it (shown on the checkout confirmation screen and sent to you by WhatsApp or SMS).',
      'We may decline an order if a product is out of stock, if we suspect fraud, or if an error was made in pricing or product information.',
    ],
  },
  {
    id: 'prices',
    title: '3. Pricing & payment',
    body: [
      'All prices are displayed in US dollars and include any applicable taxes unless stated otherwise. We reserve the right to correct pricing errors.',
      'Payment is taken when you complete checkout. If a payment fails, we will not dispatch the order and will contact you.',
      'For orders placed through Charm (our AI assistant), the same checkout and payment flow applies — every order is confirmed before any payment is captured.',
    ],
  },
  {
    id: 'shipping',
    title: '4. Shipping & delivery',
    body: [
      'We offer free standard shipping on orders over $75. Delivery times depend on your location and are shown at checkout.',
      'Risk and title of goods pass to you upon delivery. Please inspect your delivery on arrival and report any damage within 48 hours.',
    ],
  },
  {
    id: 'returns',
    title: '5. Returns & refunds',
    body: [
      'We offer 14-day easy returns from the date of delivery for items in their original condition and packaging.',
      'To start a return, contact us or message in the chat widget. Return shipping costs are outlined when we approve the return.',
      'Refunds are issued to the original payment method within 5–7 business days of receiving the returned item.',
    ],
  },
  {
    id: 'warranty',
    title: '6. Warranty for made-to-order pieces',
    body: [
      'Some pieces are made to order and may carry a specific lead time shown on the product page. These items are covered for manufacturing defects for 12 months from delivery.',
      'Normal wear, chips or cracks from misuse are not covered by the warranty.',
    ],
  },
  {
    id: 'charm',
    title: '7. Charm AI assistant',
    body: [
      'Charm is an AI-powered shopping assistant. Its recommendations are informational and based on the product range — they are not a substitute for professional advice where one is normally required.',
      'Where Charm triggers an assisted checkout, a human-visible confirmation is always sent before the order is finalised.',
    ],
  },
  {
    id: 'intellectual',
    title: '8. Intellectual property',
    body: [
      'All content on this store — product names, descriptions, images, and the HUWA TABLE CHARM brand — is our property or properly licensed. You may not reproduce it for commercial purposes without our written consent.',
    ],
  },
  {
    id: 'liability',
    title: '9. Limitation of liability',
    body: [
      'We take care to describe products accurately, but to the maximum extent permitted by law our liability is limited to the amount you paid for the affected order.',
      'We are not liable for indirect losses, loss of profit, or data loss beyond our reasonable control.',
    ],
  },
  {
    id: 'law',
    title: '10. Governing law',
    body: [
      'These terms are governed by the laws of Zimbabwe. Any disputes will be handled in the courts of Harare, Zimbabwe, unless mandatory consumer law says otherwise.',
    ],
  },
  {
    id: 'changes',
    title: '11. Changes to terms',
    body: [
      'We may update these terms from time to time. The latest version will always be posted here, and material changes will be highlighted. Continued use of the store after changes means you accept the updated terms.',
    ],
  },
  {
    id: 'contact',
    title: '12. Contact',
    body: [
      'For any question about an order or these terms — hello@huwa-table-charm.com, or ask Charm in the chat widget.',
    ],
  },
];

export default function Terms() {
  return (
    <div className="container-page py-12 md:py-20">
      <div className="max-w-3xl">
        <div className="eyebrow">Legal</div>
        <h1 className="mt-3 font-display text-4xl font-semibold text-stone-900">Terms & Conditions</h1>
        <p className="mt-2 text-sm text-stone-500">Last updated: September 2026 · HUWA TABLE CHARM</p>

        <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-soft md:p-8">
          <p className="leading-relaxed text-stone-600">
            These Terms & Conditions govern your use of the HUWA TABLE CHARM store and the purchase of our products.
            Please read them carefully before placing an order.
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
          For details on how we handle your data, see our{' '}
          <Link to="/privacy" className="font-medium text-teal-700 underline hover:text-teal-800">Privacy Policy</Link>.
        </div>
      </div>
    </div>
  );
}