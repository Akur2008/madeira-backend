module.exports = async (req, res) => {
  const { account_id, property_id, email, commission } = req.query;

  const html = `<!DOCTYPE html>
  <html lang="ru">
  <head>
      <meta charset="UTF-8">
      <title>Успешная привязка | MadeiraBook</title>
      <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 600px; margin: 80px auto; padding: 0 20px; text-align: center; color: #333; background: #f9f9f9; }
          .card { background: #fff; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
          h1 { color: #28a745; }
          a.btn { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #0070f3; color: white; text-decoration: none; border-radius: 4px; font-weight: bold; }
          a.btn:hover { background: #0051a2; }
      </style>
  </head>
  <body>
      <div class="card">
          <h1>Онбординг успешно пройден!</h1>
          <p>Аккаунт Stripe <code>${account_id || ''}</code> успешно привязан к объекту <b>${property_id || ''}</b> (${email || ''}).</p>
          <p>Комиссия системы зафиксирована на уровне: <b>${commission || '10'}%</b>.</p>
          <a class="btn" href="/api/admin">Вернуться в админку</a>
      </div>
  </body>
  </html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
};
