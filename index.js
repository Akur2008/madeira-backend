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

        // Проверка секретного ключа
        if (secret !== ADMIN_SECRET) {
            res.statusCode = 401;
            return res.end('Unauthorized: Invalid secret key');
        }

        // Главная страница админки
        if (pathname === '/admin' || pathname === '/') {
            try {
                const keys = await kv.keys('prop:*');
                const mappings = [];
                for (const key of keys) {
                    const smoobuId = key.replace('prop:', '');
                    const stripeId = await kv.get(key);
                    mappings.push({ smoobuId, stripeId });
                }

                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.end(`
                    <html>
                        <head><title>Madeira Property Admin</title></head>
                        <body style="font-family: sans-serif; padding: 20px;">
                            <h2>Madeira Property Management Admin</h2>
                            <p>Connected to Upstash KV and Stripe successfully.</p>
                            <h3>Mappings count: ${mappings.length}</h3>
                        </body>
                    </html>
                `);
            } catch (dbError) {
                res.statusCode = 500;
                return res.end('Database Error: ' + dbError.message);
            }
        }

        res.statusCode = 404;
        return res.end('Not Found');

    } catch (err) {
        res.statusCode = 500;
        return res.end('Server Error: ' + err.message);
    }
};
