const express = require('express');
const { kv } = require('@vercel/kv');
const Stripe = require('stripe');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'my-super-secret-key-123';

// 1. Создание Connected Account для владельца апартаментов
app.post('/api/create-connected-account', async (req, res) => {
  try {
    const { email, returnDomain, propertyId } = req.body;
    
    // Создаем Express аккаунт для владельца
    const account = await stripe.accounts.create({
      type: 'express',
      email: email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    // Если передан propertyId, сохраняем связь в Vercel KV
    if (propertyId) {
      await kv.set(`prop:${propertyId}`, account.id);
    }

    // Определяем домен возврата (apartmadeira.com или madeirabook.com)
    const domain = returnDomain || 'apartmadeira.com';

    // Ссылка для онбординга владельца в Stripe
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `https://${domain}/stripe/refresh?account=${account.id}`,
      return_url: `https://${domain}/stripe/success?account=${account.id}`,
      type: 'account_onboarding',
    });

    res.json({
      success: true,
      accountId: account.id,
      onboardingUrl: accountLink.url
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Ручное сохранение связи через API
app.post('/api/link-property', async (req, res) => {
  const { secret, propertyId, stripeAccountId } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).send('Access denied');

  await kv.set(`prop:${propertyId}`, stripeAccountId);
  res.send('Связь успешно сохранена в Vercel KV!');
});

// 3. Админ-панель для управления объектами и привязками
app.get('/admin', async (req, res) => {
  const { secret } = req.query;
  if (secret !== ADMIN_SECRET) {
    return res.status(403).send('<h1>Доступ запрещен</h1><p>Неверный секретный ключ.</p>');
  }

  // Получаем все привязки объектов из Vercel KV
  const keys = await kv.keys('prop:*');
  let mappingsHtml = '';
  for (const key of keys) {
    const propId = key.replace('prop:', '');
    const accountId = await kv.get(key);
    mappingsHtml += `<li><b>Объект Smoobu ID:</b> ${propId} ➔ <b>Stripe Account:</b> ${accountId}</li>`;
  }

  res.send(`
    <html>
      <head>
        <title>ApartMadeira Admin</title>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; padding: 30px; background: #f4f5f7; color: #333; }
          .card { background: white; padding: 25px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
          input, select { padding: 10px; margin: 8px 0 16px 0; width: 100%; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
          button { background: #0070f3; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; }
          button:hover { background: #0051a2; }
          ul { padding-left: 20px; }
          li { margin-bottom: 8px; }
        </style>
      </head>
      <body>
        <h1>Панель управления сплит-платежами ApartMadeira</h1>
        
        <div class="card">
          <h3>Создать Stripe-аккаунт для нового владельца</h3>
          <form action="/api/create-connected-account" method="POST">
            <input type="hidden" name="returnDomain" value="apartmadeira.com">
            <label>Email владельца:</label>
            <input type="email" name="email" required placeholder="owner@example.com">
            
            <label>ID объекта в Smoobu:</label>
            <input type="text" name="propertyId" required placeholder="123456">
            
            <button type="submit">Создать аккаунт и привязать</button>
          </form>
        </div>

        <div class="card">
          <h3>Уже привязанные объекты (${keys.length})</h3>
          <ul>${mappingsHtml || '<li>Пока нет привязанных объектов</li>'}</ul>
        </div>
      </body>
    </html>
  `);
});

module.exports = app;
