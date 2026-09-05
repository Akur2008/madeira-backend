const express = require('express');
const app = express();

// ВАЖНО для Вебхуков: Stripe требует "сырые" данные (Buffer),
// поэтому для маршрута вебхука мы используем express.raw, а для остального сайта — express.json
app.use('/api/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Тестовый эндпоинт
app.get('/', (req, res) => {
  res.send('Smoobu Backend is running!');
});

// 1. Создание подключенного аккаунта владельца недвижимости (Express)
app.post('/api/create-connected-account', async (req, res) => {
  try {
    const { email, returnDomain } = req.body;

    const account = await stripe.accounts.create({
      type: 'express',
      country: 'PT',
      email: email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    // Динамический выбор домена (по умолчанию apartmadeira.com)
    const domain = returnDomain || 'apartmadeira.com';

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `https://${domain}/account/refresh?account=${account.id}`,
      return_url: `https://${domain}/account/success?account=${account.id}`,
      type: 'account_onboarding',
    });

    res.json({
      success: true,
      accountId: account.id,
      onboardingUrl: accountLink.url,
    });
  } catch (error) {
    console.error('Error creating connected account:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 2. Создание платежа со сплитом (10% комиссия платформы, 90% владельцу)
app.post('/api/create-booking-payment', async (req, res) => {
  try {
    const { amountTotal, ownerAccountId, propertyTitle } = req.body;

    const platformFee = Math.round(amountTotal * 0.10);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountTotal,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      description: `Бронирование: ${propertyTitle}`,
      transfer_data: {
        destination: ownerAccountId,
        amount: amountTotal - platformFee,
      },
      application_fee_amount: platformFee,
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error('Error creating payment intent:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Экспорт для Vercel
module.exports = app;

