import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { supabase } from "./supabase.js";
import { auth, hashPassword, comparePassword, createToken } from "./auth.js";
dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",").map((v) => v.trim())
      : true,
  }),
);
app.use(express.json());

const statuses = ["agendado", "confirmado", "concluido", "cancelado"];
const normalizeName = (v) =>
  String(v || "")
    .trim()
    .replace(/\s+/g, " ");

function clientResponse(r) {
  const count = Number(r.massage_count || 0);
  return {
    id: Number(r.id),
    name: r.name,
    address: r.address,
    massage_count: count,
    package_available: count > 0,
    created_at: r.created_at,
  };
}
function appointmentResponse(r) {
  const c = r.clients || {};
  const count = Number(c.massage_count ?? r.client_massage_count ?? 0);
  return {
    id: Number(r.id),
    client_id: Number(r.client_id),
    client_name: c.name ?? null,
    is_package: r.is_package,
    massage_count: Number(r.massage_count),
    value_cents: Number(r.value_cents),
    value: Number(r.value_cents) / 100,
    address: r.address,
    appointment_date: r.appointment_date,
    start_time: r.start_time,
    end_time: r.end_time,
    status: r.status,
    paid: r.paid,
    paid_at: r.paid_at,
    notes: r.notes,
    client_massage_count: count,
    package_available: count > 0,
    created_at: r.created_at,
  };
}
const appointmentSelect =
  "id,client_id,is_package,massage_count,value_cents,address,appointment_date,start_time,end_time,status,paid,paid_at,notes,created_at,clients(id,name,address,massage_count)";

app.get("/api/health", async (_req, res) => {
  const { error } = await supabase
    .from("clients")
    .select("id", { count: "exact", head: true });
  if (error) return res.status(503).json({ ok: false, database: "supabase" });
  res.json({ ok: true, database: "supabase", client: "@supabase/supabase-js" });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const name = normalizeName(req.body.name),
      email = String(req.body.email || "")
        .trim()
        .toLowerCase(),
      password = String(req.body.password || "");
    if (!name || !email || password.length < 6)
      return res.status(400).json({
        error: "Informe nome, e-mail e senha com pelo menos 6 caracteres.",
      });
    const { data, error } = await supabase
      .from("users")
      .insert({ name, email, password_hash: await hashPassword(password) })
      .select("id,name,email,created_at")
      .single();
    if (error) {
      if (error.code === "23505")
        return res.status(409).json({ error: "E-mail já cadastrado." });
      throw error;
    }
    res.status(201).json({ user: data, token: createToken(data) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao criar usuário." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "")
        .trim()
        .toLowerCase(),
      password = String(req.body.password || "");
    const { data: user, error } = await supabase
      .from("users")
      .select("id,name,email,password_hash,created_at")
      .eq("email", email)
      .maybeSingle();
    if (error) throw error;
    if (!user || !(await comparePassword(password, user.password_hash)))
      return res.status(401).json({ error: "E-mail ou senha inválidos." });
    const safe = {
      id: user.id,
      name: user.name,
      email: user.email,
      created_at: user.created_at,
    };
    res.json({ user: safe, token: createToken(safe) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao fazer login." });
  }
});

app.get("/api/clients/search", auth, async (req, res) => {
  try {
    const name = normalizeName(req.query.name);
    if (name.length < 3)
      return res
        .status(400)
        .json({ error: "Informe pelo menos 3 caracteres para pesquisar." });
    const { data, error } = await supabase
      .from("clients")
      .select("id,name,address,massage_count,created_at")
      .ilike("name", `%${name}%`)
      .order("name")
      .limit(20);
    if (error) throw error;
    res.json((data || []).map(clientResponse));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao pesquisar clientes." });
  }
});

app.post("/api/clients", auth, async (req, res) => {
  try {
    const name = normalizeName(req.body.name),
      address = req.body.address ? String(req.body.address).trim() : null,
      massage_count = Math.max(0, Number(req.body.massage_count || 0));
    if (!name)
      return res.status(400).json({ error: "Nome do cliente é obrigatório." });
    const { data: existing, error: ee } = await supabase
      .from("clients")
      .select("id,name,address,massage_count,created_at")
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    if (ee) throw ee;
    if (existing)
      return res.json({ client: clientResponse(existing), existing: true });
    const { data, error } = await supabase
      .from("clients")
      .insert({ name, address, massage_count })
      .select("id,name,address,massage_count,created_at")
      .single();
    if (error) throw error;
    res.status(201).json({ client: clientResponse(data), existing: false });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao cadastrar cliente." });
  }
});

app.get("/api/appointments", auth, async (req, res) => {
  try {
    let q = supabase
      .from("appointments")
      .select(appointmentSelect)
      .order("appointment_date")
      .order("start_time")
      .order("id");
    if (req.query.date) q = q.eq("appointment_date", req.query.date);
    if (req.query.from) q = q.gte("appointment_date", req.query.from);
    if (req.query.to) q = q.lte("appointment_date", req.query.to);
    if (req.query.status) q = q.eq("status", req.query.status);
    if (req.query.paid !== undefined)
      q = q.eq("paid", req.query.paid === "true");
    const { data, error } = await q;
    if (error) throw error;
    res.json((data || []).map(appointmentResponse));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao listar agendamentos." });
  }
});

app.post("/api/appointments", auth, async (req, res) => {
  try {
    const {
      client_id,
      is_package = false,
      massage_count = 1,
      value_cents = 0,
      address,
      appointment_date,
      start_time,
      end_time = null,
      notes = null,
    } = req.body;

    const clientId = Number(client_id);
    const count = Number(massage_count);
    const cents = Number(value_cents);

    if (!Number.isInteger(clientId) || clientId <= 0)
      return res.status(400).json({
        error: "client_id inválido.",
      });

    if (typeof is_package !== "boolean")
      return res.status(400).json({
        error: "is_package deve ser boolean.",
      });

    if (!Number.isInteger(count) || count < 1)
      return res.status(400).json({
        error: "massage_count deve ser inteiro >= 1.",
      });

    if (!Number.isInteger(cents) || cents < 0)
      return res.status(400).json({
        error: "value_cents inválido.",
      });

    if (!address || !appointment_date || !start_time)
      return res.status(400).json({
        error: "address, appointment_date e start_time são obrigatórios.",
      });

    // Busca o cliente
    const { data: client, error: ce } = await supabase
      .from("clients")
      .select("id,name,massage_count")
      .eq("id", clientId)
      .maybeSingle();

    if (ce) throw ce;

    if (!client)
      return res.status(404).json({
        error: "Cliente não encontrado.",
      });

    // Verifica conflito de horário
    const { data: conflict, error: xe } = await supabase
      .from("appointments")
      .select("id")
      .eq("appointment_date", appointment_date)
      .eq("start_time", start_time)
      .neq("status", "cancelado")
      .limit(1);

    if (xe) throw xe;

    if (conflict?.length)
      return res.status(409).json({
        error: "Já existe um agendamento nesse dia e horário.",
      });

    /*
     * ============================================================
     * ADICIONA AS MASSAGENS AO CLIENTE
     * ============================================================
     *
     * Só adiciona quando o NOVO agendamento é um pacote.
     *
     * Exemplo:
     *
     * Cliente:
     * massage_count = 2
     *
     * Novo pacote:
     * massage_count = 4
     *
     * Resultado:
     * massage_count = 6
     */
    if (is_package) {
      const currentMassageCount = Number(client.massage_count) || 0;
      const newMassageCount = currentMassageCount + count;

      const { error: updateClientError } = await supabase
        .from("clients")
        .update({
          massage_count: newMassageCount,
        })
        .eq("id", clientId);

      if (updateClientError) throw updateClientError;
    }
    /*
     * ============================================================
     * ABATER UMA MASSAGEM DO CLIENTE
     * ============================================================
     *
     * Só abate quando o NOVO agendamento é um pacote.
     *
     * Exemplo:
     *
     * Cliente:
     * massage_count = 4
     *
     * Novo agendamento:
     * is_package = true
     *
     * Resultado:
     * massage_count = 3
     */
    if (is_package && Number(client.massage_count) > 1) {
      const newMassageCount = Number(client.massage_count) - 1;

      const { error: updateClientError } = await supabase
        .from("clients")
        .update({
          massage_count: newMassageCount,
        })
        .eq("id", clientId);

      if (updateClientError) throw updateClientError;
    }

    /*
     * ============================================================
     * CRIA O NOVO AGENDAMENTO
     * ============================================================
     */
    const { data, error } = await supabase
      .from("appointments")
      .insert({
        client_id: clientId,
        is_package,
        massage_count: count,
        value_cents: cents,
        address: String(address).trim(),
        appointment_date,
        start_time,
        end_time,
        status: "agendado",
        paid: false,
        notes,
      })
      .select(appointmentSelect)
      .single();

    if (error) throw error;

    res.status(201).json(appointmentResponse(data));
  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: "Erro ao criar agendamento.",
    });
  }
});

app.patch("/api/appointments/:id/status", auth, async (req, res) => {
  try {
    const id = Number(req.params.id),
      status = String(req.body.status || "");
    if (!Number.isInteger(id) || !statuses.includes(status))
      return res
        .status(400)
        .json({ error: `status deve ser um destes: ${statuses.join(", ")}.` });
    const { data, error } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", id)
      .select(appointmentSelect)
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return res.status(404).json({ error: "Agendamento não encontrado." });
    res.json(appointmentResponse(data));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao alterar status." });
  }
});

app.patch("/api/appointments/:id/payment", auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (typeof req.body.paid !== "boolean")
      return res.status(400).json({ error: "paid deve ser boolean." });
    const { data, error } = await supabase
      .from("appointments")
      .update({
        paid: req.body.paid,
        paid_at: req.body.paid ? new Date().toISOString() : null,
      })
      .eq("id", id)
      .select(appointmentSelect)
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return res.status(404).json({ error: "Agendamento não encontrado." });
    res.json(appointmentResponse(data));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao alterar pagamento." });
  }
});

app.get("/api/payments/pending", auth, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("appointments")
      .select(appointmentSelect)
      .eq("paid", false)
      .neq("status", "cancelado")
      .order("appointment_date")
      .order("start_time")
      .order("id");
    if (error) throw error;
    const appointments = (data || []).map(appointmentResponse),
      total_pending_cents = appointments.reduce((s, a) => s + a.value_cents, 0);
    const by_date = appointments.reduce(
        (o, a) => (o[a.appointment_date] ??= []).push(a),
        o,
      ),
      total_pending = total_pending_cents / 100;
    res.json({ total_pending_cents, total_pending, appointments, by_date });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao listar pagamentos pendentes." });
  }
});

app.get("/api/payments/summary", auth, async (req, res) => {
  try {
    const month = String(req.query.month || "");
    if (!/^\d{4}-\d{2}$/.test(month))
      return res
        .status(400)
        .json({ error: "month deve estar no formato YYYY-MM." });
    const [y, m] = month.split("-").map(Number),
      next = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1))
        .toISOString()
        .slice(0, 10);
    const { data, error } = await supabase
      .from("appointments")
      .select("value_cents,paid")
      .gte("appointment_date", `${month}-01`)
      .lt("appointment_date", next)
      .neq("status", "cancelado");
    if (error) throw error;
    const rows = data || [],
      total_cents = rows.reduce((s, r) => s + Number(r.value_cents), 0),
      received_cents = rows
        .filter((r) => r.paid)
        .reduce((s, r) => s + Number(r.value_cents), 0),
      pending_cents = rows
        .filter((r) => !r.paid)
        .reduce((s, r) => s + Number(r.value_cents), 0);
    res.json({
      month,
      total_cents,
      total: total_cents / 100,
      received_cents,
      received: received_cents / 100,
      pending_cents,
      pending: pending_cents / 100,
      appointments: rows.length,
      paid_appointments: rows.filter((r) => r.paid).length,
      pending_appointments: rows.filter((r) => !r.paid).length,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao calcular resumo financeiro." });
  }
});

app.use((_req, res) => res.status(404).json({ error: "Rota não encontrada." }));

async function start() {
  const { error } = await supabase
    .from("clients")
    .select("id", { head: true, count: "exact" });
  if (error) {
    console.error("Erro ao conectar ao Supabase:", error);
    process.exit(1);
  }
  app.listen(port, () =>
    console.log(`API rodando na porta ${port} — Supabase`),
  );
}
start();
