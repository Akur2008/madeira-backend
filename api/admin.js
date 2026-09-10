const { createClient } = require('@vercel/kv');
const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

module.exports = async (req, res) => {
  try {
    const keys = await kv.keys('property:*');
    let properties = [];
    
    for (const key of keys) {
      const data = await kv.get(key);
      properties.push({
        propertyId: key.replace('property:', ''),
        ...data
      });
    }

    const notice = req.query.link ? `<div style="background:#e6ffed;padding:15px;margin-bottom:20px;border:1px solid #b7eb8f;border-radius:4px;">
      <b>Ссылка для онбординга владельца:</b><br><a href="${req.query.link}" target="_blank">${req.query.link}</a>
    </div>` : '';

    const html = `<!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <title>MadeiraBook Admin</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #333; background: #f9f9f9; }
            .card { background: #fff; padding: 25px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); margin-bottom: 25px; }
            input, button { padding: 10px; margin: 5px 0 15px 0; width: 100%; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
            button { background: #0070f3; color: white; border: none; font-weight: bold; cursor: pointer; }
            button:hover { background: #0051a2; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
            th { background: #f1f1f1; }
        </style>
    </head>
    <body>
        <h1>Панель управления MadeiraBook</h1>
        ${notice}
        <div class="card">
            <h2>Подключить объект и владельца</h2>
            <form action="/api/create-owner" method="POST">
                <label>Email владельца:</label>
                <input type="email" name="email" required placeholder="owner@example.com">
                <label>ID объекта в Smoobu:</label>
                <input type="text" name="propertyId" required placeholder="Например: 123456">
                <label>Комиссия системы (%):</label>
                <input type="number" name="commissionPercent" value="10" min="0" max="100" step="1">
                <button type="submit">Создать аккаунт Stripe и привязать объект</button>
            </form>
        </div>

        <div class="card">
            <h2>Подключенные объекты (${properties.length})</h2>
            <table>
                <tr>
                    <th>Объект (ID)</th>
                    <th>Email владельца</th>
                    <th>Комиссия</th>
                    <th>Stripe Account ID</th>
                </tr>
                ${properties.map(p => `
                    <tr>
                        <td><b>${p.propertyId}</b></td>
                        <td>${p.ownerEmail || '—'}</td>
                        <td>${p.commissionPercent !== undefined ? p.commissionPercent + '%' : '10%'}</td>
                        <td><code>${p.stripeAccountId || '—'}</code></td>
                    </tr>
                `).join('')}
            </table>
        </div>
    </body>
    </html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (e) {
    res.status(500).send(`Ошибка загрузки админки: ${e.message}`);
  }
};
