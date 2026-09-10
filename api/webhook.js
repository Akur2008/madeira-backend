const { createClient } = require('@vercel/kv');
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// Vercel требует отключать стандартный bodyParser для работы с вебхуками Stripe
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // В продакшене рекомендуется проверять подпись через webhook secret
    event = req.body;
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Обработка событий от Stripe Connect
  if (event.type === 'account.updated') {
    const account = event.data.object;
    const chargesEnabled = account.charges_enabled;

    // Ищем объект по stripeAccountId в базе и обновляем статус
    const keys = await kv.keys('property:*');
    for (const key of keys) {
      const propData = await kv.get(key);
      if (propData && propData.stripeAccountId === account.id) {
        propData.chargesEnabled = chargesEnabled;
        await kv.set(key, propData);
        break;
      }
    }
  }

  res.json({ received: true });
};
