const { kv } = require('@vercel/kv');
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'my-super-secret-key-123';

module.exports = async (req, res) => {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const pathname = url.pathname;
  const secret = url.searchParams.get('secret');

  // Проверка секретного ключа администратора для всех эндпоинтов
  if (secret !== ADMIN_SECRET) {
    res.statusCode = 401;
    return res.end('Unauthorized: Invalid secret key');
  }

  // Главная страница админки со списком и формой привязки
  if (pathname === '/admin' || pathname === '/') {
    try {
      const keys = await kv.keys('prop:*');
      const mappings = [];
      for (const key of keys) {
        const smoobuId = key.replace('prop:', '');
        const stripeId = await kv.get(key);
        mappings.push({ smoobuId, stripeId });
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>ApartMadeira Admin</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #333; background: #f9f9fb; }
            h2 { border-bottom: 2px solid #eee; padding-bottom: 10px; }
            .card { background: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); margin-bottom: 20px; }
            input, button { width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; font-size: 14px; }
            button { background: #635bff; color: white; border: none; font-weight: bold; cursor: pointer; }
            button:hover { background: #5147e5; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { text-align: left; padding: 12px; border-bottom: 1px solid #eee; }
            th { color: #666; font-size: 12px; text-transform: uppercase; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Привязать объект Smoobu к Stripe</h2>
            <form method="POST" action="/api/link?secret=${ADMIN_SECRET}">
              <label>ID объекта в Smoobu:</label>
              <input type="text" name="smoobuId" placeholder="Например: 123456" required />
              <label>ID Stripe Connect Account (acct_...):</label>
              <input type="text" name="stripeAccountId" placeholder="Например: acct_1Nx..." required />
              <button type="submit">Сохранить привязку</button>
            </form>
          </div>

          <div class="card">
            <h2>Активные привязки объектов</h2>
            <table>
              <tr><th>Smoobu ID</th><th>Stripe Account ID</th></tr>
              ${mappings.length === 0 ? '<tr><td colspan="2" style="color:#888;">Пока нет привязанных объектов</td></tr>' : mappings.map(m => `<tr><td>${m.smoobuId}</td><td><code>${m.stripeId}</code></td></tr>`).join('')}
            </table>
          </div>
        </body>
        </html>
      `);
    } catch (err) {
      res.statusCode = 500;
      return res.end('Database Error: ' + err.message);
    }
  }

  // Обработка сохранения привязки из формы
  if (pathname === '/api/link' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const params = new URLSearchParams(body);
    const smoobuId = params.get('smoobuId');
    const stripeAccountId = params.get('stripeAccountId');

    if (smoobuId && stripeAccountId) {
      await kv.set(`prop:${smoobuId}`, stripeAccountId);
      res.statusCode = 302;
      res.setHeader('Location', `/admin?secret=${ADMIN_SECRET}`);
      return res.end();
    }
    res.statusCode = 400;
    return res.end('Missing parameters');
  }

  res.statusCode = 404;
  res.end('Not found');
};
module.exports = app;
