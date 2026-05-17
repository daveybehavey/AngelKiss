/**
 * Prints dashboard steps we cannot run from code (run: node scripts/print-domain-go-live.mjs).
 */
const site = process.env.CANONICAL_SITE_URL?.trim() || "https://anglkisscreations.ca";
const origin = site.replace(/\/$/, "");

console.log(`
Domain go-live (manual steps — copy/paste where needed)
=======================================================

1) Three domains → one site (${origin})
   - anglkisscreations.ca          — canonical (shop here)
   - www.anglkisscreations.ca      — 301 → .ca
   - anglkisscreations.com         — 301 → .ca (after DNS propagates)
   - www.anglkisscreations.com     — 301 → .ca
   - angelkisscreations.com        — 301 → .ca (typo domain you also own)
   - www.angelkisscreations.com    — 301 → .ca
   Deploy: npm run deploy:ca (registers all six on the Worker).
   Verify: npm run verify:domains
   If anglkisscreations.com shows NXDOMAIN: Cloudflare → Domains → anglkisscreations.com → wait for
   registration “Active” and confirm DNS records exist (Worker custom domain usually adds them).

2) Deploy from this repo (bakes ${site} into the build):
   npm run deploy:ca

3) PayPal Developer / Business dashboard
   - App return / cancel URLs: use ${origin}/checkout (and any paths PayPal requires).
   - Webhook URL: ${origin}/api/webhooks/paypal
   (Update both sandbox and live when you switch.)

4) Supabase Dashboard → Authentication → URL configuration
   - Site URL: ${origin}
   - Redirect URLs: add ${origin}/** patterns you use (and keep localhost for dev).

5) Cloudflare Web Analytics (optional)
   - Site token env: NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN on the Worker if you use it.
`);
