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
      propertiesList += `
        <div style="background: #f9f9f9; padding: 15px; margin-bottom: 10px; border-radius: 8px; border: 1px solid #ddd;">
          <strong>ID:</strong> ${propId}<br>
          <strong>Данные:</strong> <pre style="display:inline;">${JSON.stringify(propData)}</pre>
        </div>
      `;
    }

    res.send(`
      <html>
        <head><title>Madeirabook Admin</title><meta charset="utf-8"></head>
        <body style="font-family: Arial; padding: 20px; max-width: 800px; margin: auto;">
          <h2>Панель управления Madeirabook</h2>
          
          <h3>Создать Stripe Connect аккаунт для владельца</h3>
          <form id="ownerForm" style="margin-bottom: 30px;">
            <input type="email" id="emailInput" placeholder="Email владельца" required style="padding: 8px; width: 250px; margin-right: 10px;">
            <button type="submit" style="padding: 9px 15px; background: #635bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Создать ссылку</button>
          </form>

          <script>
            document.getElementById('ownerForm').addEventListener('submit', async (e) => {
              e.preventDefault();
              const email = document.getElementById('emailInput').value;
              const response = await fetch('/admin/create-owner', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
              });
              const data = await response.json();
              if (data.url) {
                window.location.href = data.url;
              } else {
                alert('Ошибка создания: ' + (data.error || 'неизвестная ошибка'));
              }
            });
          </script>

          <h3>Список объектов</h3>
          ${propertiesList || '<p>Нет сохраненных объектов.</p>'}
        </body>
      </html>
    `);
  } catch (e) {
    res.status(500).send(`Ошибка: ${e.message}`);
  }
});

// 2. Генерация аккаунта и ссылки для онбординга владельца
app.post('/admin/create-owner', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Укажите email' });

    const account = await stripe.accounts.create({
      type: 'express',
      email: email.trim(),
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['host'];
    const baseUrl = `${protocol}://${host}`;

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${baseUrl}/admin/reauth`,
      return_url: `${baseUrl}/admin/success`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/admin/reauth', (req, res) => {
  res.send('Сессия онбординга истекла. <a href="/admin">Вернуться в админку</a>');
});

app.get('/admin/success', (req, res) => {
  res.send('Аккаунт успешно подключен! <a href="/admin">Вернуться в админку</a>');
});

module.exports = app;
