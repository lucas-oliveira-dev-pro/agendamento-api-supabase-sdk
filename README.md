# API de Agendamentos — Supabase SDK

Esta versão usa o SDK oficial do Supabase no backend:

```js
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(supabaseUrl, supabaseKey);
```

O banco é o PostgreSQL hospedado pelo Supabase.

## 1. Criar as tabelas

No Supabase: **SQL Editor -> New query** e execute:

`supabase/schema.sql`

## 2. Configurar

Copie `.env.example` para `.env` e informe:

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SUA_CHAVE_SECRETA
JWT_SECRET=SUA_CHAVE_JWT
CORS_ORIGIN=http://localhost:5173
```

A `SUPABASE_SERVICE_ROLE_KEY` fica **somente no backend**. Nunca envie para React/browser.

## 3. Instalar e executar

```powershell
npm.cmd install
npm.cmd run dev
```

Se o PowerShell bloquear `npm.ps1`, use `npm.cmd`.

Teste:

`GET http://localhost:3000/api/health`

## Endpoints

```text
POST   /api/auth/register
POST   /api/auth/login
GET    /api/clients/search?name=mar
GET    /api/appointments
POST   /api/appointments
PATCH  /api/appointments/:id/status
PATCH  /api/appointments/:id/payment
GET    /api/payments/pending
GET    /api/payments/summary?month=2026-09
```

As rotas protegidas usam:

`Authorization: Bearer SEU_TOKEN`

## Pacotes

Quando `is_package=true`, `massage_count` é salvo em `clients.massage_count`.
A busca retorna `massage_count` e `package_available`.

A regra de desconto automático de sessões não foi alterada nesta versão.

## Deploy

Configure as mesmas variáveis de ambiente no serviço de hospedagem e use:

Build:
`npm install`

Start:
`npm start`

Não coloque `.env` nem a service role key no GitHub.
