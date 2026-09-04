const express = require('express');
const app = express();
app.get('/', (req, res) => {
  res.send('Smoobu Backend is running!');
});

// ВАЖНО для Вебхуков (Код №2): Stripe требует "сырые" данные (Buffer), 
// поэтому для маршрута вебхука мы используем express.raw, а для остального сайта — express.json
app.use('/api/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ==========================================
// ДВЕРЬ №1: Создание ссылки на оплату (Сплит 10/90)
// ==========================================
app.post('/create-checkout-session', async (req, res) => {
    try {
        const { amountTotal, propertyName, ownerStripeId, bookingId } = req.body;
        
        if (!amountTotal || !ownerStripeId) {
            return res.status(400).json({ error: 'Missing required parameters: amountTotal or ownerStripeId' });
        }

       const platformFee = Math.round(amountTotal * 0.10);
    const ownerAmount = amountTotal - platformFee;

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
            price_data: {
                currency: 'eur',
                product_data: {
                    name: `Бронирование: ${propertyName || 'Апартаменты'}`,
                },
                unit_amount: amountTotal,
            },
            quantity: 1,
        }],
        mode: 'payment',
        success_url: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}` : 'https://example.com/success',
        cancel_url: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/cancel` : 'https://example.com/cancel',
        metadata: {
            bookingId: bookingId || 'N/A',
            platformShare: platformFee,
            ownerShare: ownerAmount
        },
        payment_intent_data: {
            application_fee_amount: platformFee,
            transfer_data: {
                destination: ownerStripeId,
            },
        }
    });

    res.json({ id: session.id, url: session.url });
} catch (error) {
    console.error('Ошибка создания платежа:', error.message);
    res.status(500).json({ error: error.message });
}
});

// ==========================================
// ДВЕРЬ №2: Вебхук (Сигнал от банка, что всё оплачено)
// ==========================================
app.post('/api/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Проверяем, что сигнал действительно пришел от Stripe, а не от мошенников
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`Ошибка подписи вебхука: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Если банк прислал подтверждение: "Деньги успешно списаны!"
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const bookingId = paymentIntent.metadata.bookingId; // Достаем ID брони, который мы туда спрятали

    console.нах(`Деньги получены! Бронирование №${bookingId} оплачено.`);

    // ЗДЕСЬ В БУДУЩЕМ МЕСТЕ ПОСТАВИМ ЗАПРОС К ZEEVOU ИЛИ SMOOBU
    // await updatePmsBookingStatus(bookingId, 'confirmed');
  }

  // Обязательно говорим Stripe: "Спасибо, сигнал принят, всё ок"
  res.json({ received: true });
});
app.all('/api/webhooks/smoobu', (req, res) => {
  console.log('Данные от Smoobu:', req.body);
  res.status(200).json({ status: 'ok' });
});


module.exports = app;
