<div align="center">

# ✦ HUWA TABLE CHARM

**A full-stack tableware e-commerce storefront with a guided-selling AI assistant.**

Beautiful tables, built to last. React + TypeScript + Tailwind storefront, Express + Knex API,
and **Charm** — an AI co-pilot that matches customers to the perfect table and kitchen pieces.

[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://reactjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind](https://img.shields.io/badge/Tailwind-CSS-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)](https://expressjs.com)
[![Knex](https://img.shields.io/badge/Knex-SQL-0A73B7?logo=knex&logoColor=white)](https://knexjs.org)
[![SQLite](https://img.shields.io/badge/SQLite-Dev-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prod-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)

</div>

---

## 📦 What is this?

A complete, production-minded **e-commerce application** for selling tableware and serveware.
It's not a static webpage — it's a **full stack** with a relational database, a REST API,
an admin panel, order tracking, payment + WhatsApp order notifications, and an AI shopping
assistant.

> **"Charm"** is the brand's AI table & kitchen assistant. Tell it you're cooking for six on
> an induction hob and it recommends the right pieces, checks compatibility, and can even
> add them to the cart.

---

## 🏗️ Monorepo layout

| Path         | Layer          | What it does                                                              |
|--------------|----------------|---------------------------------------------------------------------------|
| `shared/`    | `@huwa/shared` | TypeScript domain types + Zod schemas — **single source of truth**        |
| `backend/`   | API            | Express + TypeScript + Knex ORM (SQLite dev / Postgres prod)              |
| `frontend/`  | Web app        | React + Vite + Tailwind (storefront, admin, Charm chat widget)            |
| `agent/`     | AI agent       | Prompts + scaffold for the Charm Agent (logic in `backend/src/services`)  |
| `infra/`     | Ops            | Docker, nginx reverse proxy, deployment config                            |

---

## ✨ Feature overview

### Customer storefront
- Public catalog with categories, products, variants, filters, search & sorting
- Modern responsive product cards with **pricing, sale badges, and quick-add to cart**
- Product detail with compatibility badges, variant picker, quantity, and bundle offers
- Cart with free-shipping progress bar (guest **and** authenticated)
- Checkout → order number → **order tracking** timeline
- Order confirmations via **WhatsApp**, with SMS (Twilio) fallback

### Charm Agent (AI assistant)
- Rule-based guided selling out of the box (no API key needed)
- Optional OpenAI tool-calling when `LLM_API_KEY` is set
- Tools: product search, compatibility check, bundles, cart, order tracking

### Admin panel
- Overview stats, order management, product table, low-stock alerts
- Order state machine: `OPEN → PAID → READY / IN_PRODUCTION → SHIPPED → DELIVERED`

### Inventory
- Hybrid model: `stocked` (reserve / restock / reorder warnings) and `make_to_order` (engraving)

---

## 🚀 Quick start (local dev)

> **Requires:** Node 18+ and npm.

```bash
# 1. Build the shared package first (runtime uses its compiled JS)
cd shared
npm install
npm run build

# 2. Backend API
cd ../backend
npm install
npm run db:reset     # rollback + migrate + seed (SQLite dev DB)
npm test             # vitest suite
npm run dev          # API on http://localhost:4000

# 3. Frontend (new terminal)
cd ../frontend
npm install
npm run dev          # app on http://localhost:5173 (proxies /api -> :4000)
```

Open **http://localhost:5173** 🎉

### 🧑 Demo accounts

| Role     | Email             | Password    |
|----------|-------------------|-------------|
| Customer | `demo@huwa.com`   | `Pass1234!` |
| Admin    | `admin@huwa.com`  | `Pass1234!` |

---

## 🐳 Run production-like with Docker

```bash
docker compose up --build
```

- Frontend (nginx): http://localhost:8080 — proxies `/api` → backend
- API: http://localhost:4000
- PostgreSQL: localhost:5432 (`huwa` / `huwa_secret` / `huwa_table_charm`)
- Migrations run automatically on backend startup

---

## ⚙️ Configuration

Copy `backend/.env.example` to `backend/.env` and set what you need:

| Variable                  | Purpose                                   |
|---------------------------|-------------------------------------------|
| `LLM_API_KEY`             | Enable Charm's OpenAI tool-calling        |
| `WHATSAPP_PHONE_NUMBER_ID`| Meta WhatsApp Business sender ID           |
| `WHATSAPP_ACCESS_TOKEN`   | Meta WhatsApp Business access token        |
| `TWILIO_*`                | SMS fallback if Twilio is preferred        |
| `STRIPE_SECRET_KEY`       | Real card payments (mock in dev)          |

---

## 🔌 API reference (summary)

| Module    | Endpoints                                                                 |
|-----------|---------------------------------------------------------------------------|
| Catalog   | `GET /api/products`, `/api/products/:slug`, `/api/categories`, `/api/bundles` |
| Auth      | `POST /api/register`, `/login`, `/refresh`, `/logout`, `GET /api/me`       |
| Cart      | `GET/PUT/DELETE /api/cart`, `POST/PATCH/DELETE /api/cart/items/:id`        |
| Checkout  | `POST /api/checkout`, `/api/checkout/:orderId/confirm`, `GET /api/orders/:orderNumber`, `GET /api/orders/mine` |
| Admin     | `/api/admin/*` (auth + role required)                                     |
| Agent     | `POST /api/agent/chat`, `GET /api/agent/search`, `/compatibility/:variantId`, `POST /api/agent/bundles`, `/cart`, `GET /api/agent/track/:orderNumber` |

---

## 🧪 Tests

```bash
cd backend && npm test
```

The suite uses an in-memory SQLite database (`@huwa/shared` + vitest) and covers the core
auth → cart → checkout → payment → order flow and the agent chat guard.

---

## 📝 License

Private / proprietary. All rights reserved.
