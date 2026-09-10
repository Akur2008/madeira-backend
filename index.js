const express = require('express');
const { createClient } = require('@vercel/kv');
const Stripe = require('stripe');
const axios = require('axios');
 
const app = express();
 
app.use('/webhook', express.raw({ type: 'application/json' }));
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
      const propData = await kv.get(key);
      
      let stripeStatus = 'Не проверен';
      let badgeColor = '#ffc107';
 
      if (propData && propData.stripeAccountId) {
        try {
          const account = await stripe.accounts.retrieve(propData.stripeAccountId);
          if (account.charges_enabled) {
            stripeStatus = 'Активен (принимает оплаты)';
            badgeColor = '#28a745';
          } else {
            stripeStatus = 'Ожидает верификации (KYC)';
            badgeColor = '#dc3545';
          }
        } catch (err) {
          stripeStatus = 'Ошибка проверки аккаунта';
        }
      }
 
      const currentCommission = propData.commissionPercent !== undefined ? propData.commissionPercent : 0;
 
      propertiesList += `
        <div style="background: #fff; padding: 15px; margin-bottom: 12px; border-radius: 8px; border: 1px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
          <strong>Объект Smoobu ID:</strong> <span style="font-size: 16px; color: #0070f3;">${propId}</span><br>
          <strong>Email владельца:</strong> ${propData.ownerEmail || '—'}<br>
          <strong>Stripe Account:</strong> <code>${propData.stripeAccountId || '—'}</code><br>
          <strong>Статус Stripe:</strong> <span style="background: ${badgeColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${stripeStatus}</span><br>
          
          <form action="/admin/update-commission" method="POST" style="margin-top: 12px; display: flex; align-items: center; gap: 10px; background: #f9fafb; padding: 10px; border-radius: 6px; border: 1px solid #eee;">
            <input type="hidden" name="propertyId" value="${propId}">
            <label style="font-size: 14px; color: #555; font-weight: bold;">Комиссия платформы (%):</label>
            <input type="number" name="commissionPercent" value="${currentCommission}" min="0" max="100" step="1" style="width: 70px; padding: 6px; border: 1px solid #ccc; border-radius: 4px;" required>
            <button type="submit" style="padding: 6px 14px; background: #0070f3; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px;">Изменить</button>
          </form>
        </div>
      `;
    }
 
    const newLink = req.query.link;
    const newEmail = req.query.email;
    const newProp = req.query.prop;
 
    let linkBox = '';
    if (newLink) {
      linkBox = `
        <div style="background: #e6f4ea; border: 1px solid #34a853; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
          <h3 style="margin-top: 0; color: #137333;">Ссылка для владельца успешно создана!</h3>
          <p>Объект: <strong>${newProp}</strong> | Владелец: <strong>${newEmail}</strong></p>
          <p>Отправьте эту ссылку владельцу для прохождения верификации в Stripe:</p>
          <input type="text" id="copyInput" value="${newLink}" readonly style="width: 100%; padding: 10px; font-size: 14px; border: 1px solid #ccc; border-radius: 4px; background: #fff; margin-bottom: 10px;">
          <button onclick="navigator.clipboard.writeText(document.getElementById('copyInput').value); alert('Ссылка скопирована в буфер обмена!');" style="padding: 10px 15px; background: #34a853; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Скопировать ссылку</button>
        </div>
      `;
    }
 
    res.send(`
      <html>
        <head><title>Madeirabook Admin Dashboard</title><meta charset="utf-8"></head>
        <body style="font-family: Arial, sans-serif; padding: 20px; max-width: 850px; margin: auto; background: #f4f6f8;">
          <h2 style="color: #333;">Панель управления Madeirabook</h2>
          
          ${linkBox}
 
          <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 25px;">
            <h3 style="margin-top: 0;">Привязать объект Smoobu к Stripe аккаунту владельца</h3>
            <form action="/admin/create-owner" method="POST">
              <div style="margin-bottom: 10px;">
                <input type="text" name="propertyId" placeholder="ID объекта Smoobu (например, 37726)" required style="padding: 10px; width: 100%; max-width: 400px; border: 1px solid #ccc; border-radius: 4px; display: block;">
              </div>
              <div style="margin-bottom: 10px;">
                <input type="email" name="email" placeholder="Email владельца" required style="padding: 10px; width: 100%; max-width: 400px; border: 1px solid #ccc; border-radius: 4px; display: block;">
              </div>
              <div style="margin-bottom: 10px;">
                <label style="font-size: 14px; color: #555; display: block; margin-bottom: 5px;">Комиссия платформы (%): для своих 0, для партнеров 10-15</label>
                <input type="number" name="commissionPercent" value="0" min="0" max="100" step="1" required style="padding: 10px; width: 100%; max-width: 400px; border: 1px solid #ccc; border-radius: 4px; display: block;">
              </div>
              <button type="submit" style="padding: 10px 20px; background: #635bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Сгенерировать ссылку</button>
            </form>
          </div>
 
          <h3 style="color: #333;">Список объектов в базе</h3>
          ${propertiesList || '<p style="color: #666;">Нет сохраненных объектов.</p>'}
        </body>
      </html>
    `);
  } catch (e) {
    res.status(500).send(`Ошибка: ${e.message}`);
  }
});
 
// 2. Обработка подключения и выдача ссылки в админку
app.post('/admin/create-owner', async (req, res) => {
  try {
    const { email, propertyId, commissionPercent } = req.body;
    if (!email || !propertyId) return res.status(400).send('Укажите email и ID объекта Smoobu');
 
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
      refresh_url: `${baseUrl}/admin/reauth?account_id=${stripeAccountId}&property_id=${encodeURIComponent(cleanPropId)}&email=${encodeURIComponent(cleanEmail)}&commission=${parsedCommission}`,
      return_url: `${baseUrl}/admin/success?account_id=${stripeAccountId}&property_id=${encodeURIComponent(cleanPropId)}&email=${encodeURIComponent(cleanEmail)}&commission=${parsedCommission}`,
      type: 'account_onboarding',
    });
 
    res.redirect(303, `/admin?link=${encodeURIComponent(accountLink.url)}&email=${encodeURIComponent(cleanEmail)}&prop=${encodeURIComponent(cleanPropId)}`);
  } catch (e) {
    res.status(400).send(`Ошибка создания аккаунта: ${e.message}`);
  }
});
 
// 3. Сохранение связей в Vercel KV при успешном возврате владельца
app.get('/admin/success', async (req, res) => {
  try {
    const { account_id, property_id, email, commission } = req.query;
    
    if (property_id && account_id && email) {
      const account = await stripe.accounts.retrieve(account_id);
      
      const existingPropData = await kv.get(`property:${property_id}`) || {};
      const finalCommission = commission !== undefined ? Number(commission) : (existingPropData.commissionPercent ?? 0);
 
      await kv.set(`property:${property_id}`, { 
        stripeAccountId: account_id, 
        ownerEmail: email,
        chargesEnabled: account.charges_enabled,
        commissionPercent: finalCommission
      });
 
      const ownerKey = `owner:${email}`;
      let ownerData = await kv.get(ownerKey) || { stripeAccountId: account_id, properties: [] };
      
      if (!ownerData.properties.includes(property_id)) {
        ownerData.properties.push(property_id);
      }
      await kv.set(ownerKey, ownerData);
    }
 
    res.send(`
      <div style="font-family: Arial; padding: 40px; text-align: center;">
        <h2 style="color: #28a745;">Владелец успешно завершил настройку!</h2>
        <p>Аккаунт привязан. Вы можете закрыть эту вкладку или вернуться в админку.</p>
        <a href="/admin" style="display: inline-block; padding: 10px 20px; background: #635bff; color: white; text-decoration: none; border-radius: 4px;">Вернуться в админку</a>
      </div>
    `);
  } catch (e) {
    res.send(`Аккаунт подключен, но произошла ошибка сохранения: ${e.message}. <a href="/admin">В админку</a>`);
  }
});
 
// 4. Автоматическое обновление просроченной ссылки
app.get('/admin/reauth', async (req, res) => {
  try {
    const { account_id, property_id, email, commission } = req.query;
    if (!account_id) {
      return res.send('Ссылка устарела. <a href="/admin">Вернитесь в админку</a> для создания новой.');
    }
 
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['host'];
    const baseUrl = `${protocol}://${host}`;
 
    const accountLink = await stripe.accountLinks.create({
      account: account_id,
      refresh_url: `${baseUrl}/admin/reauth?account_id=${account_id}&property_id=${property_id || ''}&email=${email || ''}&commission=${commission || 0}`,
      return_url: `${baseUrl}/admin/success?account_id=${account_id}&property_id=${property_id || ''}&email=${email || ''}&commission=${commission || 0}`,
      type: 'account_onboarding',
    });
 
    res.redirect(303, accountLink.url);
  } catch (e) {
    res.status(400).send(`Ошибка обновления ссылки: ${e.message}`);
  }
});
 
// 5. Быстрое изменение процента комиссии для существующего объекта
app.post('/admin/update-commission', async (req, res) => {
  try {
    const { propertyId, commissionPercent } = req.body;
    if (!propertyId || commissionPercent === undefined) {
      return res.status(400).send('Укажите propertyId и новый commissionPercent');
    }
 
    const cleanPropId = propertyId.trim();
    const propKey = `property:${cleanPropId}`;
    
    const propData = await kv.get(propKey);
    if (!propData) {
      return res.status(404).send('Объект не найден в базе');
    }
 
    propData.commissionPercent = Number(commissionPercent);
    await kv.set(propKey, propData);
 
    res.redirect(303, '/admin');
  } catch (e) {
    res.status(500).send(`Ошибка обновления комиссии: ${e.message}`);
  }
});
 
// 6. Создание бронирования в Smoobu + запуск Stripe Checkout (для виджета на сайте)
app.post('/create-booking-and-pay', async (req, res) => {
  try {
    const { propertyId, arrivalDate, departureDate, guestEmail, guestName, price } = req.body;
    if (!propertyId || !arrivalDate || !departureDate) {
      return res.status(400).json({ error: 'Не указаны обязательные параметры (propertyId, arrivalDate, departureDate)' });
    }
 
    let finalPrice = price;
    let finalEmail = guestEmail || 'guest@madeirabook.com';
    let finalName = guestName || 'Guest';
 
    if (!finalPrice) {
      const ratesRes = await axios.get(`https://login.smoobu.com/api/rates?apartmentId=${propertyId}&arrivalDate=${arrivalDate}&departureDate=${departureDate}`, {
        headers: { 'Api-Key': process.env.SMOOBU_API_KEY, 'Content-Type': 'application/json' }
      });
      finalPrice = ratesRes.data.totalPrice || ratesRes.data.price || 100;
    }
 
    const smoobuRes = await axios.post('https://login.smoobu.com/api/reservations', {
      propertyId: Number(propertyId),
      arrivalDate,
      departureDate,
      type: '1',
      price: Number(finalPrice),
      firstName: finalName,
      lastName: '',
      email: finalEmail
    }, {
      headers: { 'Api-Key': process.env.SMOOBU_API_KEY, 'Content-Type': 'application/json' }
    });
 
    const smoobuBookingId = smoobuRes.data.id;
 
    const propData = await kv.get(`property:${propertyId}`);
    const commissionPercent = propData?.commissionPercent !== undefined ? Number(propData.commissionPercent) : 0;
    const stripeAccountId = propData?.stripeAccountId;
 
    const totalAmountInCents = Math.round(Number(finalPrice) * 100);
    const platformFee = Math.round(totalAmountInCents * (commissionPercent / 100));
 
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['host'];
    const baseUrl = `${protocol}://${host}`;
 
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Бронирование апартаментов #${propertyId} (${arrivalDate} — ${departureDate})`,
          },
          unit_amount: totalAmountInCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      customer_email: finalEmail,
      payment_intent_data: {
        application_fee_amount: platformFee > 0 ? platformFee : undefined,
        transfer_data: { destination: stripeAccountId },
        metadata: { smoobuBookingId: String(smoobuBookingId) }
      },
      success_url: `${baseUrl}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/booking-cancel`,
    });
 
    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
 
// 7. Создание платежной сессии (старый эндпоинт, если нужен отдельно)
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { propertyId, amount, smoobuBookingId } = req.body; 
    if (!propertyId || !amount) {
      return res.status(400).json({ error: 'Укажите propertyId и amount' });
    }
 
    const propData = await kv.get(`property:${propertyId}`);
    if (!propData || !propData.stripeAccountId) {
      return res.status(404).json({ error: 'Для этого объекта не найден подключенный Stripe аккаунт владельца' });
    }
 
    const stripeAccountId = propData.stripeAccountId;
    
    const account = await stripe.accounts.retrieve(stripeAccountId);
    if (!account.charges_enabled) {
      return res.status(400).json({ error: 'Владелец объекта еще не завершил верификацию в Stripe' });
    }
 
    const commissionPercent = propData.commissionPercent !== undefined ? Number(propData.commissionPercent) : 0;
    
    const totalAmountInCents = Number(amount);
    const platformFee = Math.round(totalAmountInCents * (commissionPercent / 100));
 
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['host'];
    const baseUrl = `${protocol}://${host}`;
 
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Бронирование объекта ${propertyId}`,
          },
          unit_amount: totalAmountInCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      payment_intent_data: {
        application_fee_amount: platformFee > 0 ? platformFee : undefined,
        transfer_data: {
          destination: stripeAccountId,
        },
        metadata: {
          smoobuBookingId: smoobuBookingId || ''
        }
      },
      success_url: `${baseUrl}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/booking-cancel`,
    });
 
    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
 
// 8. Вебхук от Stripe
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
 
  try {
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
 
  if (event.type === 'account.updated') {
    const account = event.data.object;
    const keys = await kv.keys('property:*');
    for (const key of keys) {
      const propData = await kv.get(key);
      if (propData && propData.stripeAccountId === account.id) {
        propData.chargesEnabled = account.charges_enabled;
        await kv.set(key, propData);
      }
    }
  }
 
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    if (session.payment_intent) {
      const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
      const smoobuBookingId = paymentIntent.metadata?.smoobuBookingId;
 
      if (smoobuBookingId && process.env.SMOOBU_API_KEY) {
        try {
          await axios.put(
            `https://login.smoobu.com/api/reservations/${smoobuBookingId}`, 
            { paid: true },
            {
              headers: {
                'Api-Key': process.env.SMOOBU_API_KEY,
                'Content-Type': 'application/json'
              }
            }
          );
          console.log(`Бронирование Smoobu ID ${smoobuBookingId} успешно обновлено на оплачено.`);
        } catch (smoobuErr) {
          console.error('Ошибка при обновлении бронирования в Smoobu:', smoobuErr.message);
        }
      }
    }
  }
 
  res.json({ received: true });
});
 
module.exports = app;
