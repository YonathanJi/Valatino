# Despliegue — Web en Vercel + API en Render

El proyecto son dos piezas: la **web** (Next.js, `apps/web`) va en **Vercel** y la
**API** (NestJS, `apps/api`) va en **Render**. Se conectan por la variable
`NEXT_PUBLIC_API_URL` de la web, que apunta a la URL pública de la API.

> Orden recomendado: **primero la API (Render)** para obtener su URL, y **luego la
> web (Vercel)** usando esa URL.

---

## 1) API en Render

1. Entra en [render.com](https://render.com) → **New → Blueprint**.
2. Conecta tu GitHub y elige el repo **Valatino**. Render detecta el archivo
   `render.yaml` y propone el servicio `valatino-api`.
3. Antes de crear, rellena las variables marcadas (son las del `apps/api/.env`):

   | Variable | De dónde sale |
   |---|---|
   | `CORS_ORIGIN` | Déjala en `http://localhost:3000` de momento; la actualizas en el paso 3 con la URL de Vercel. (Los `*.vercel.app` ya se permiten solos.) |
   | `SUPABASE_URL` | `apps/api/.env` |
   | `SUPABASE_SERVICE_ROLE_KEY` | `apps/api/.env` |
   | `SUPABASE_JWT_SECRET` | `apps/api/.env` |
   | `STRIPE_SECRET_KEY` | `apps/api/.env` |
   | `STRIPE_WEBHOOK_SECRET` | `apps/api/.env` (ver nota de webhooks abajo) |
   | `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `EMAIL_FROM` | `apps/api/.env` |

   > PayPal es opcional: sin sus variables la API arranca igual y sus endpoints
   > devuelven 503. No hace falta configurarlo ahora.

4. Crea el servicio. Cuando termine, Render te da una URL tipo
   **`https://valatino-api.onrender.com`**. Compruébala abriendo
   `https://valatino-api.onrender.com/health` → debe responder `{"status":"ok"}`.

> Nota plan free: la API "se duerme" tras ~15 min sin uso; la primera petición
> tras dormir tarda unos segundos en despertar. Normal para pruebas.

---

## 2) Web en Vercel

1. En [vercel.com](https://vercel.com) → **Add New → Project** → importa el repo.
2. **Settings → Root Directory → `apps/web`** (importante: así Vercel compila solo
   la web, no la API).
3. **Environment Variables** — añade:

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | el de `apps/web/.env.local` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | el de `apps/web/.env.local` |
   | `NEXT_PUBLIC_API_URL` | **la URL de Render del paso 1** (ej. `https://valatino-api.onrender.com`) |
   | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | el de `apps/web/.env.local` |
   | `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | opcional (déjala vacía si no usas PayPal) |

   > Las `NEXT_PUBLIC_*` se incrustan al compilar: si cambias alguna, hay que
   > **volver a desplegar** la web.

4. Deploy. Vercel te da una URL tipo **`https://valatino.vercel.app`**.

---

## 3) Conectar los cabos

1. **CORS**: en Render, edita `CORS_ORIGIN` y pon la URL de Vercel
   (ej. `https://valatino.vercel.app`). Guarda → la API se redespliega sola.
   (Las preview URLs `*.vercel.app` ya están permitidas.)
2. **Supabase → Auth → URL Configuration**: añade tu dominio de Vercel a
   *Site URL* y *Redirect URLs* (`https://valatino.vercel.app/auth/callback`).
3. **Webhooks de pago** (cuando pruebes pagos): en el dashboard de Stripe crea un
   endpoint que apunte a `https://valatino-api.onrender.com/pagos/stripe/webhook`
   y copia su signing secret a `STRIPE_WEBHOOK_SECRET` en Render.

---

## Resumen visual

```
Cliente ─▶ https://valatino.vercel.app        (Vercel · apps/web)
                     │  NEXT_PUBLIC_API_URL
                     ▼
           https://valatino-api.onrender.com   (Render · apps/api)
                     │
                     ▼
              Supabase (BD + Auth + Storage)
```
