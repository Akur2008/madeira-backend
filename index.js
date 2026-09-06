const { kv } = require('@vercel/kv');
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const ADMIN_SECRET = process.env.ADMIN_SECRET || '19701975';

module.exports = async (req, res) => {
    try {
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const fullUrl = `${protocol}://${req.headers.host || 'localhost'}${req.url}`;
        const urlObj = new URL(fullUrl);
        const pathname = urlObj.pathname;
        const secret = urlObj.searchParams.get('secret');
        const action = urlObj.searchParams.get('action');
        const smoobuId = urlObj.searchParams.get('smoobuId');
        const stripeId = urlObj.searchParams.get('stripeId');

        if (secret !== ADMIN_SECRET) {
            res.statusCode = 401;
            return res.end('Unauthorized');
        }

        // Добавление связи
        if (action === 'add' && smoobuId && stripeId) {
            await kv.set(`prop:${smoobuId}`, stripeId);
            res.statusCode = 302;
            res.setHeader('Location', `/?secret=${ADMIN_SECRET}`);
            return res.end();
        }

        // Удаление связи
        if (action === 'delete' && smoobuId) {
            await kv.del(`prop:${smoobuId}`);
            res.statusCode = 302;
            res.setHeader('Location', `/?secret=${ADMIN_SECRET}`);
            return res.end();
        }

        // Тест оплаты (обработка прямо в корневом скрипте)
        if (action === 'checkout' && smoobuId) {
            const email = urlObj.searchParams.get('email') || 'guest@madeira.local';
            const stripePriceId = await kv.get(`prop:${smoobuId}`);
            
            if (!stripePriceId) {
                res.statusCode = 404;
                return res.end(`Property ${smoobuId} not linked to Stripe price`);
            }

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price: stripePriceId,
                    quantity: 1,
                }],
                mode: 'payment',
                customer_email: email,
                success_url: `${protocol}://${req.headers.host}/?secret=${ADMIN_SECRET}&status=success`,
                cancel_url: `${protocol}://${req.headers.host}/?secret=${ADMIN_SECRET}&status=cancel`,
            });

            res.statusCode = 302;
            res.setHeader('Location', session.url);
            return res.end();
        }

        // Главная панель администратора
        if (pathname === '/' || pathname === '') {
            const keys = await kv.keys('prop:*');
            const mappings = [];
            for (const key of keys) {
                const sId = key.replace('prop:', '');
                const stId = await kv.get(key);
                mappings.push({ smoobuId: sId, stripeId: stId });
            }

            const status = urlObj.searchParams.get('status');
            let banner = '';
            if (status === 'success') banner = '<div style="background: #d4edda; color: #155724; padding: 10px; margin-bottom: 15px; border-radius: 4px;">Оплата прошла успешно!</div>';
            if (status === 'cancel') banner = '<div style="background: #f8d7da; color: #721c24; padding: 10px; margin-bottom: 15px; border-radius: 4px;">Оплата была отменена.</div>';

            const rows = mappings.map(m => `
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">${m.smoobuId}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${m.stripeId}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">
                        <a href="/?secret=${ADMIN_SECRET}&action=checkout&smoobuId=${m.smoobuId}" target="_blank" style="color: green; text-decoration: none; margin-right: 10px;">Тест оплаты</a>
                        <a href="/?secret=${ADMIN_SECRET}&action=delete&smoobuId=${m.smoobuId}" style="color: red; text-decoration: none;">Удалить</a>
                    </td>
                </tr>
            `).join('');

            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.end(`
                <html>
                    <head><title>Madeira Admin</title></head>
                    <body style="font-family: sans-serif; padding: 20px; max-width: 800px; margin: auto;">
                        <h2>Управление объектами Мадейры</h2>
                        ${banner}
                        <form action="/" method="GET" style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                            <input type="hidden" name="secret" value="${ADMIN_SECRET}">
                            <input type="hidden" name="action" value="add">
                            <div style="margin-bottom: 10px;">
                                <label>Smoobu Property ID:</label><br>
                                <input type="text" name="smoobuId" required style="width: 100%; padding: 8px; margin-top: 5px;">
                            </div>
                            <div style="margin-bottom: 10px;">
                                <label>Stripe Price ID:</label><br>
                                <input type="text" name="stripeId" required style="width: 100%; padding: 8px; margin-top: 5px;">
                            </div>
                            <button type="submit" style="background: #0070f3; color: white; border: none; padding: 10px 15px; cursor: pointer; border-radius: 4px;">Добавить связь</button>
                        </form>
                        <h3>Привязанные объекты (${mappings.length})</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: #eee;">
                                    <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Smoobu ID</th>
                                    <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Stripe ID</th>
                                    <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows.length ? rows : '<tr><td colspan="3" style="padding: 10px; text-align: center;">Пока нет привязок</td></tr>'}
                            </tbody>
                        </table>
                    </body>
                </html>
            `);
        }

        res.statusCode = 404;
        return res.end('Not Found');

    } catch (err) {
        res.statusCode = 500;
        return res.end('Server Error: ' + err.message);
    }
};
