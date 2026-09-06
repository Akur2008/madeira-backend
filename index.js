const express = require('express');
const { createClient } = require('@vercel/kv');
const Stripe = require('stripe');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// 1. WEB ADMIN UI (GET /admin)
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
          h2, h3 { color: #1a1a1a; }
          input { width: 100%; padding: 10px; margin: 8px 0 20px 0; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; }
          button { background: #0070f3; color: white; border: none; padding: 12px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; width: 100%; }
          button:hover { background: #005bb5; }
          .section { margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid #eee; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { text-align: left; padding: 10px; border-bottom: 2px solid #ddd; background: #f9f9f9; }
          .link-box { background: #e6f4ea; padding: 15px; border-radius: 6px; margin-top: 15px; word-break: break-all; }
        </style>
      </head>
      <body>
        <div class="container">
          
          <!-- РАЗДЕЛ 1: СОЗДАНИЕ ССЫЛКИ ПОДКЛЮЧЕНИЯ ДЛЯ ВЛАДЕЛЬЦА -->
          <div class="section">
            <h2>1. Подключение нового владельца Stripe Connect</h2>
            <form action="/admin/create-owner" method="POST">
              <label>Email владельца (или ваш второй тестовый email):</label>
              <input type="email" name="email" required placeholder="owner@example.com" />
              <button type="submit">Создать ссылку подключения</button>
            </form>
          </div>

          <!-- РАЗДЕЛ 2: ПРИВЯЗКА ОБЪЕКТА -->
          <div class="section">
            <h2>2. Привязка объекта Smoobu к Владельцу</h2>
            <form action="/admin/save" method="POST">
              <label>ID объекта в Smoobu (например, 37726):</label>
              <input type="text" name="propertyId" required placeholder="37726" />
              
              <label>Stripe Connect ID владельца (полученный по ссылке выше, acct_...):</label>
              <input type="text" name="ownerAccountId" required placeholder="acct_1XXXXXXXXXXXXXXXX" />
              
              <button type="submit">Сохранить привязку</button>
            </form>
          </div>

          <h3>Активные привязки объектов</h3>
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

// Генерация аккаунта и ссылки для онбординга владельца
app.post('/admin/create-owner', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).send('Укажите email');

    const account = await stripe.accounts.create({
      type: 'express',
      email: email.trim(),
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${req.protocol}://${req.get('host')}/admin`,
      return_url: `${req.protocol}://${req.get('host')}/admin`,
      type: 'account_onboarding',
    });

    res.send(`
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <title>Ссылка создана</title>
        <style>
          body { font-family: -apple-system, sans-serif; background: #faf8f5; padding: 40px; }
          .container { max-width: 600px; margin: auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          a.btn { display: inline-block; background: #0070f3; color: white; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 15px; }
          code { background: #f1f1f1; padding: 4px 8px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Ссылка для владельца успешно создана!</h2>
          <p>ID созданного аккаунта владельца: <code>${account.id}</code></p>
          <p>Скопируйте этот ID — он понадобится для привязки к объекту Smoobu.</p>
          <p>Чтобы пройти процесс подключения банка (онбординг), перейдите по ссылке ниже:</p>
          <a class="btn" href="${accountLink.url}" target="_blank">Пройти онбординг Stripe</a>
          <br><br>
          <a href="/admin">&larr Вернуться в админку</a>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Ошибка создания аккаунта: ' + err.message);
  }
});

app.post('/admin/save', async (req, res) => {
  const { propertyId, ownerAccountId } = req.body;
  if (!propertyId || !ownerAccountId) {
    return res.status(400).send('Заполните все поля');
  }
  await kv.set(`property:${propertyId.trim()}`, ownerAccountId.trim());
  res.redirect('/admin');
});

app.post('/admin/delete', async (req, res) => {
  const { propertyId } = req.body;
  if (propertyId) {
    await kv.del(`property:${propertyId.trim()}`);
  }
  res.redirect('/admin');
});

// Эндпоинт для создания платежной сессии (для будущих броней из Smoobu)
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { propertyId, amount, currency = 'eur', bookingId } = req.body;

    if (!propertyId || !amount) {
      return res.status(400).json({ error: 'Missing propertyId or amount' });
    }

    const ownerAccountId = await kv.get(`property:${propertyId}`);
    
    if (!ownerAccountId) {
      return res.status(400).json({ error: `Owner account not found for property ID: ${propertyId}.` });
    }

    const unitAmountInCents = Math.round(parseFloat(amount) * 100);

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
