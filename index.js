const express = require('express');
const { createClient } = require('@vercel/kv');
const Stripe = require('stripe');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Stripe with live/test secret key from environment
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialize Vercel KV
const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// 1. WEB ADMIN UI (GET /admin)
// A simple dashboard to link Smoobu property ID to Stripe Connect owner account ID (acct_...)
app.get('/admin', async (req, res) => {
  try {
    const keys = await kv.keys('property:*');
    let propertiesList = '';
    
    for (const key of keys) {
      const propId = key.replace('property:', '');
      const ownerId = await kv.get(key);
      propertiesList += `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #ddd;">${propId}</td>
          <td style="padding: 10px; border-bottom: 1px solid #ddd;">${ownerId}</td>
          <td style="padding: 10px; border-bottom: 1px solid #ddd;">
            <form action="/admin/delete" method="POST" style="margin:0;">
              <input type="hidden" name="propertyId" value="${propId}" />
              <button type="submit" style="background: #ff4d4f; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Удалить</button>
            </form>
          </td>
        </tr>`;
    }

    res.send(`
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <title>Madeirabook - Управление объектами и владельцами</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #faf8f5; color: #333; padding: 40px; margin: 0; }
          .container { max-width: 700px; margin: auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          h2 { margin-top: 0; color: #1a1a1a; }
          input { width: 100%; padding: 10px; margin: 8px 0 20px 0; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; }
          button { background: #0070f3; color: white; border: none; padding: 12px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; width: 100%; }
          button:hover { background: #005bb5; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { text-align: left; padding: 10px; border-bottom: 2px solid #ddd; background: #f9f9f9; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Привязка объекта Smoobu к Владельцу Stripe</h2>
          <form action="/admin/save" method="POST">
            <label>ID объекта в Smoobu (например, 37726):</label>
            <input type="text" name="propertyId" required placeholder="37726" />
            
            <label>Stripe Connect ID владельца (начинается с acct_...):</label>
            <input type="text" name="ownerAccountId" required placeholder="acct_1XXXXXXXXXXXXXXXX" />
            
            <button type="submit">Сохранить привязку</button>
          </form>

          <h3 style="margin-top: 40px;">Активные привязки объектов</h3>
          <table>
            <thead>
              <tr>
                <th>ID Объекта Smoobu</th>
                <th>Stripe Connect Account (Владелец)</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              ${propertiesList || '<tr><td colspan="3" style="padding: 15px; text-align: center; color: #888;">Пока нет добавленных объектов</td></tr>'}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Ошибка загрузки админки: ' + err.message);
  }
});

// Save or update mapping
app.post('/admin/save', async (req, res) => {
  const { propertyId, ownerAccountId } = req.body;
  if (!propertyId || !ownerAccountId) {
    return res.status(400).send('Заполните все поля');
  }
  await kv.set(`property:${propertyId.trim()}`, ownerAccountId.trim());
  res.redirect('/admin');
});

// Delete mapping
app.post('/admin/delete', async (req, res) => {
  const { propertyId } = req.body;
  if (propertyId) {
    await kv.del(`property:${propertyId.trim()}`);
  }
  res.redirect('/admin');
});

// 2. CHECKOUT SESSION CREATION (POST /create-checkout-session)
// Dynamic amount from Smoobu/request, automatic transfer to owner account stored in Vercel KV
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { propertyId, amount, currency = 'eur', bookingId } = req.body;

    if (!propertyId || !amount) {
      return res.status(400).json({ error: 'Missing propertyId or amount' });
    }

    // Lookup owner Stripe Connect ID from Vercel KV
    const ownerAccountId = await kv.get(`property:${propertyId}`);
    
    if (!ownerAccountId) {
      return res.status(400).json({ error: `Owner account not found for property ID: ${propertyId}. Please configure it in /admin` });
    }

    // Convert amount to cents (Stripe requirement)
    const unitAmountInCents = Math.round(parseFloat(amount) * 100);

    // Create Stripe Checkout Session with dynamic pricing & split payment (transfer_data)
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `Бронирование объекта #${propertyId}${bookingId ? ' (Бронь: ' + bookingId + ')' : ''}`,
            },
            unit_amount: unitAmountInCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      payment_intent_data: {
        transfer_data: {
          destination: ownerAccountId,
        },
        // Optional: platform fee calculation if needed (e.g. 10% platform commission)
        // application_fee_amount: Math.round(unitAmountInCents * 0.10),
      },
      success_url: `${req.headers.origin || 'https://madeirabook.com'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'https://madeirabook.com'}/cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe Checkout Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('Madeirabook Stripe Gateway is running. Go to <a href="/admin">/admin</a> to manage properties.');
});

module.exports = app;
