# Northstar Cyber website

Static front end with a small Node.js built-in HTTP server for editable site copy, protected admin access, and aggregate traffic counts. No npm packages are required.

## Run locally

Use Node.js 18 or newer. Set an admin password of at least 16 characters before starting the server. If `node` is not on your PATH, use the Node.js executable supplied by your environment:

```sh
ADMIN_PASSWORD='use-a-unique-password-of-at-least-16-characters' node server.js
```

Then open `http://127.0.0.1:4173` for the website or `http://127.0.0.1:4173/admin` for the admin panel. The password is read from the environment and is not written to the project. Do not commit a real password.

For Windows PowerShell:

```powershell
$env:ADMIN_PASSWORD = 'use-a-unique-password-of-at-least-16-characters'
node server.js
```

## Admin features

- Traffic overview for page views and CTA clicks, grouped by UTC day and page. Only aggregate counters are persisted; the tracker does not save IP addresses, cookies, referrers, or visitor profiles. Data older than 90 days is removed.
- Content editor for company name, hero copy, SOC summary and service items, training introduction, and contact email. Updates are stored in `data/content.json`.
- Analytics aggregates are stored in `data/analytics.json`. Both data files are excluded from Git by `.gitignore`.
- Admin sessions are memory-only, expire after eight hours, use an HttpOnly SameSite=Strict cookie, and require same-origin admin writes. The admin password must be provided through `ADMIN_PASSWORD`.

## Deployment notes

This server binds to localhost by default. For deployment, run it behind a maintained HTTPS reverse proxy or hosting platform, set `NODE_ENV=production`, provide `ADMIN_PASSWORD` through the host's secret manager, and set `HOST` and `PORT` as required by the host. Use a persistent private volume for `data/`; protect backups and restrict filesystem access. This minimal file-based setup is intended for one server instance. For multiple instances or a larger team, move sessions and content/analytics storage to a managed database and add named accounts, role permissions, audit history, and backups.

The website displays an analytics notice in its footer. Update the full privacy notice for the actual deployment and any additional analytics tools before launch.
