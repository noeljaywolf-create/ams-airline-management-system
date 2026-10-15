# HUWA on Render

One Docker web service serves the React app, product photos, 3D previews and Express API on the same hostname. A separate managed Render PostgreSQL database stores accounts, orders and enquiries. Browser dream-board favourites stay on the customer's device.

## Proposed resources — review before provisioning

- huwa web service: 0.5c-512mb (currently $7/month)
- huwa-db PostgreSQL: 0.1c-256mb (currently $6/month), plus 1 GB storage, bandwidth and any workspace charges.
- Approximate compute baseline: $13/month, before additional charges. No resources are created by these local files.

Sources: https://render.com/pricing and https://render.com/docs/compute-plans. Blueprint syntax: https://render.com/docs/blueprint-spec.

## Deploy

1. Push this app's standalone repository to GitHub as HUWA. Do not push the surrounding airline or fire-design repositories.
2. Connect the GitHub repository to a Render Blueprint using render.yaml.
3. Review and approve the resources and displayed prices. Render generates separate JWT secrets and wires in the internal database URL.
4. The container builds both applications, runs migrations, imports the catalog idempotently and starts the app on 0.0.0.0:10000. Existing prices and merchant edits are retained. The old destructive full seed is never used.
5. Confirm /api/health, /shop, /dream-kitchen, a real product image and a saved enquiry through the public URL. Refresh a deep link to verify SPA routing.
6. In Render's environment settings, temporarily set HUWA_ADMIN_EMAIL and a unique HUWA_ADMIN_PASSWORD of at least 14 characters. Run npm run admin:create in the backend shell, then remove the password variable. There is no default admin password.
7. Add a custom domain when desired and add its HTTPS origin to ALLOWED_ORIGINS if the API is called from a different hostname. Same-origin requests do not need a CORS override.

This release opens as an enquiry storefront: local prices and inventory still require merchant confirmation. No happiness/refund guarantee is advertised. The app offers hopeful branding, personal collections and a functioning saved wish board. Checkout cannot accept unconfirmed products. Card-provider configuration and an approved commercial returns policy remain separate launch work.

The public app will receive a Render-assigned hostname. No public URL is claimed until Render reports a successful deploy and the public endpoints pass validation.
