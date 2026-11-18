// Cadastro por convite: quem recebeu o link cria a própria conta, já com o perfil definido no convite.
import { createClient } from "npm:@supabase/supabase-js@2";
import { cors, EMAIL, MSG_SENHA_VAZADA, resposta, SENHA_MAX, SENHA_MIN, senhaVazada, sha256 } from "../_shared/comum.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return resposta(req, { error: "Método não permitido." }, 405);
  const url = Deno.env.get("SUPABASE_URL"), chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !chave) return resposta(req, { error: "Configuração indisponível." }, 500);
  const admin = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  let hash = "", reserva = "", criado = "";
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body.token || "");
    const nome = String(body.name || "").trim().replace(/\s+/g, " ");
    const email = String(body.email || "").trim().toLowerCase();
    const senha = String(body.password || "");
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return resposta(req, { error: "Convite inválido." }, 400);
    if (nome.length < 3 || nome.length > 150 || !EMAIL.test(email) || email.length > 200 || senha.length < SENHA_MIN || senha.length > SENHA_MAX)
      return resposta(req, { error: `Confira nome, e-mail e senha (${SENHA_MIN} a ${SENHA_MAX} caracteres).` }, 400);
    if (await senhaVazada(senha)) return resposta(req, { error: MSG_SENHA_VAZADA }, 400);
    hash = await sha256(token);
    reserva = crypto.randomUUID();
    const { data: perfil, error: errReserva } = await admin.rpc("reservar_convite_cadastro", { p_hash: hash, p_reserva: reserva });
    if (errReserva) throw errReserva;
    if (!perfil) { reserva = ""; return resposta(req, { error: "Convite expirado, já usado ou indisponível. Peça outro ao administrador." }, 409); }
    // O banco só aceita a conta nova se o convite reservado estiver ligado a este e-mail (cadastro público desligado).
    const { error: errEmail } = await admin.from("convites_cadastro").update({ email_reserva: email }).eq("token_hash", hash).eq("reserva_id", reserva);
    if (errEmail) throw errEmail;
    const { data: novo, error: errCriar } = await admin.auth.admin.createUser({
      email, password: senha, email_confirm: true, user_metadata: { full_name: nome },
    });
    // Mensagem genérica: o erro do Auth revelaria se o e-mail já tem conta.
    if (errCriar || !novo.user) {
      console.error("Falha ao criar conta por convite", errCriar?.message || "sem usuário");
      return resposta(req, { error: "Não foi possível criar a conta com estes dados. Confira o e-mail ou fale com o administrador." }, 400);
    }
    criado = novo.user.id;
    const { error: errPerfil } = await admin.from("perfis_usuarios").insert({ usuario_id: criado, perfil, nome });
    if (errPerfil) throw errPerfil;
    const { data: usado, error: errFim } = await admin.rpc("finalizar_convite_cadastro", { p_hash: hash, p_reserva: reserva, p_user: criado });
    if (errFim || !usado) throw errFim || new Error("Não foi possível finalizar o convite.");
    const id = criado; criado = ""; reserva = "";
    const { error: errAud } = await admin.from("auditoria").insert({
      autor_id: id, autor_email: email, acao: "cadastrou_por_convite", entidade: "usuario", entidade_id: id, descricao: email, detalhes: { perfil },
    });
    if (errAud) console.error("Falha ao registrar auditoria", errAud.message);
    return resposta(req, { message: "Conta criada. Entre com seu e-mail e senha." }, 201);
  } catch (e) {
    console.error("Erro no cadastro", e instanceof Error ? e.message : String(e));
    return resposta(req, { error: "Erro no cadastro. Tente de novo em instantes." }, 500);
  } finally {
    if (criado) { const { error } = await admin.auth.admin.deleteUser(criado); if (error) console.error("Falha ao desfazer usuário", error.message); }
    if (hash && reserva) { const { error } = await admin.rpc("liberar_convite_cadastro", { p_hash: hash, p_reserva: reserva }); if (error) console.error("Falha ao liberar reserva", error.message); }
  }
});
