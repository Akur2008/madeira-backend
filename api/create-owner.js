const { createClient } = require('@vercel/kv');
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const { email, propertyId, commissionPercent } = req.body;
    if (!email || !propertyId) {
      return res.status(400).send('Укажите email и ID объекта Smoobu');
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPropId = propertyId.trim();
    const parsedCommission = commissionPercent !== undefined ? Number(commissionPercent) : 0;

    const ownerKey = `owner:${cleanEmail}`;
    let ownerData = await kv.get(ownerKey);
    let stripeAccountId;

    if (ownerData && ownerData.stripeAccountId) {
      stripeAccountId = ownerData.stripeAccountId;
    } else {
      const account = await stripe.accounts.create({
        type: 'express',
        email: cleanEmail,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      stripeAccountId = account.id;
    }

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['host'];
    const baseUrl = `${protocol}://${host}`;

    await kv.set(`property:${cleanPropId}`, { 
      stripeAccountId, 
      ownerEmail: cleanEmail, 
      chargesEnabled: false,
      commissionPercent: parsedCommission 
    });

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${baseUrl}/api/reauth?account_id=${stripeAccountId}&property_id=${encodeURIComponent(cleanPropId)}&email=${encodeURIComponent(cleanEmail)}&commission=${parsedCommission}`,
      return_url: `${baseUrl}/api/success?account_id=${stripeAccountId}&property_id=${encodeURIComponent(cleanPropId)}&email=${encodeURIComponent(cleanEmail)}&commission=${parsedCommission}`,
      type: 'account_onboarding',
    });

    res.redirect(303, `/api/admin?link=${encodeURIComponent(accountLink.url)}&email=${encodeURIComponent(cleanEmail)}&prop=${encodeURIComponent(cleanPropId)}`);
  } catch (e) {
    res.status(400).send(`Ошибка создания аккаунта: ${e.message}`);
  }
};
