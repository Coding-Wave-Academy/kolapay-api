# KolaPay API

Practice mobile-money API for the iTek Labs JavaScript course. One shared backend for all intern teams: log in with a PIN, check a balance, send money, read history, manage contacts.

Node + Express + Postgres. Hosted free on Render.

## Deploy to Render (about 10 minutes)

1. Push this folder to a new GitHub repo, e.g. `kolapay-api`.
2. In Render: **New → Blueprint**, pick the repo, click **Apply**. `render.yaml` creates the web service and the Postgres database in Frankfurt (closest to Cameroon), both on the free plan.
3. Wait for the first deploy. On start the server creates its tables and loads the seed data by itself. No shell or extra command is needed.
4. Open `https://<your-service>.onrender.com/v1/health`. You should see `{"status":"ok"}`.
5. In the service's **Environment** tab, copy the generated `ADMIN_SECRET`. Keep it private.
6. Create one key per team (each key is shown once, so save it):

```bash
curl -X POST https://<your-service>.onrender.com/v1/admin/teams \
  -H "x-admin-secret: <ADMIN_SECRET>" -H "Content-Type: application/json" \
  -d '{"name":"Team 1"}'
```

7. Get the intern account list with their starting PINs, to print on paper slips:

```bash
curl https://<your-service>.onrender.com/v1/admin/accounts -H "x-admin-secret: <ADMIN_SECRET>"
```

8. Put the URL and each team's key in a copy of `client/api.js` and hand it to that team.

### Free-tier limits

- The service sleeps after 15 minutes with no traffic and takes about a minute to wake. Open `/v1/health` before class. `api.js` fires an `api-waking` event when a request takes over 5 seconds, so the app can show "Waking up the server…".
- The free database expires 30 days after creation. Fine for the course.

## API docs (Swagger)

The server hosts interactive docs at **`/docs`** (e.g. `https://<your-service>.onrender.com/docs`), built from `docs/openapi.yaml`. Click **Authorize**, paste a team key, log in with **Try it out**, paste the token, and every endpoint can be tried from the page. The raw spec is at `/openapi.json`; import it into any OpenAPI tool.

Edit `docs/openapi.yaml` when you change an endpoint; the page updates on the next deploy.

## Postman

In `postman/`:

- `KolaPay.postman_collection.json`: 29 requests in folders (Admin, Auth, Wallet, Transfers, Contacts, Errors, Danger zone), each with tests
- `KolaPay-Local.postman_environment.json` and `KolaPay-Render.postman_environment.json`

1. Postman → **Import** → drop in all three files. Pick the environment top right.
2. Teams: paste the team key into `apiKey`. Organiser: fill `adminSecret` and run **1. Admin → Create team key**, which saves `apiKey` for you.
3. Run **2. Auth → Log in**. It saves `token`, so every other request just works.
4. To test everything at once: right-click the collection → **Run**. Skip **9. Danger zone** unless you mean to reset the data.

Command line: `npx newman run postman/KolaPay.postman_collection.json -e postman/KolaPay-Local.postman_environment.json --env-var adminSecret=<secret>`

## Run locally

```bash
npm install
cp .env.example .env      # set DATABASE_URL to a local Postgres
npm run dev               # http://localhost:4000/v1/health
```

## Test

```bash
BASE_URL=http://localhost:4000 ADMIN_SECRET=<secret> npm test
```

53 checks: every endpoint, every error code, the PIN lock, and 20 transfers fired at the same moment (exactly the ones that fit go through, the balance never goes below 0). **It ends with `POST /admin/reset`**, so don't run it against the live API during class.

## Accounts in the seed

| Accounts | PIN | Notes |
| --- | --- | --- |
| `KP-0042` Nkeng Ashu | `1234` | Demo account with the history from the designs, 25,000 FCFA |
| `KP-0088`, `KP-0107`, `KP-0031`, `KP-0190`, `KP-0154`, `KP-0213` | `1234` | The people from the designs, 100,000 FCFA each |
| `KP-1001` to `KP-1020` | from `GET /v1/admin/accounts` | One per intern, 25,000 FCFA, the six design people as contacts |

Intern PINs are derived from `ADMIN_SECRET`, so they are never stored in the repo. Rename an intern with `PATCH /v1/admin/accounts/KP-1001 {"name":"Brenda Achu"}`.

## Endpoints

All under `/v1`. **K** = `x-api-key` header, **T** = `Authorization: Bearer <token>`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | none | Is the server up? |
| POST | `/auth/login` | K | `{ accountId, pin }` → token + account |
| GET | `/me` | K + T | Name and balance |
| GET | `/transactions?type=&search=&limit=` | K + T | History + 7-day summary |
| GET | `/fees?amount=` | K + T | Fee, total, `canAfford` |
| GET | `/accounts/:id` | K + T | Name behind an account ID |
| POST | `/transfers` | K + T | `{ to, amount, note }` → transaction + new balance |
| GET | `/contacts?search=` | K + T | Contacts, favourites first |
| POST | `/contacts` | K + T | `{ accountId, name? }` |
| PATCH | `/contacts/:id` | K + T | `{ favourite?, name? }` |
| DELETE | `/contacts/:id` | K + T | Remove a contact |

Admin (`x-admin-secret` header): `POST /admin/teams`, `GET /admin/teams`, `POST /admin/teams/:id/revoke`, `GET /admin/accounts`, `PATCH /admin/accounts/:id` (`name`, `pin`, `balance`, `unlock`), `POST /admin/reset`, `GET /admin/stats`.

Every error is `{ "error": { "code", "message", "details" } }`, with `message` written for the end user.

## Rules

- Fees: up to 5,000 → 50 FCFA · 5,001–50,000 → 250 · above 50,000 → 500. The sender pays.
- Transfers: 100 to 500,000 FCFA, whole numbers only. `"5000"` as text is refused on purpose.
- 3 wrong PINs lock the account for 5 minutes. Sessions last 8 hours.
- 300 requests per minute per team key.
