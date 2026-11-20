// Gestão de usuários: convites, perfis, bloqueio, senha e exclusão (somente administradores).
// Exceção: "self_password" troca a senha da própria pessoa, para qualquer perfil, com as mesmas regras do cadastro.
import { createClient } from "npm:@supabase/supabase-js@2";
import { cors, ehPerfil, MSG_SENHA_TAMANHO, MSG_SENHA_VAZADA, resposta, SENHA_MAX, SENHA_MIN, senhaVazada, sha256, UUID } from "../_shared/comum.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return resposta(req, { error: "Método não permitido." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !servico) return resposta(req, { error: "Configuração indisponível." }, 500);
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return resposta(req, { error: "Faça login novamente." }, 401);
    const publico = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: aut, error: errAut } = await publico.auth.getUser(jwt);
    if (errAut || !aut.user) return resposta(req, { error: "Sessão inválida. Entre novamente." }, 401);
    const eu = aut.user;
    const admin = createClient(url, servico, { auth: { persistSession: false, autoRefreshToken: false } });
    // A identidade vem do token validado, nunca do corpo do pedido. Conta bloqueada não administra.
    if (eu.banned_until && new Date(eu.banned_until) > new Date()) return resposta(req, { error: "Conta bloqueada." }, 403);
    const { data: meu } = await admin.from("perfis_usuarios").select("perfil").eq("usuario_id", eu.id).maybeSingle();
    const corpo = await req.json().catch(() => ({}));

    if (corpo.action === "self_password") {
      if (!meu?.perfil) return resposta(req, { error: "Sua conta não tem acesso a este sistema." }, 403);
      const senha = String(corpo.password || "");
      if (senha.length < SENHA_MIN || senha.length > SENHA_MAX) return resposta(req, { error: MSG_SENHA_TAMANHO }, 400);
      if (await senhaVazada(senha)) return resposta(req, { error: MSG_SENHA_VAZADA }, 400);
      const { error } = await admin.auth.admin.updateUserById(eu.id, { password: senha });
      if (error) return resposta(req, { error: "Não foi possível trocar a senha." }, 400);
      const { error: errAud } = await admin.from("auditoria").insert({ autor_id: eu.id, autor_email: eu.email ?? null, acao: "trocou_a_propria_senha", entidade: "usuario", entidade_id: eu.id, descricao: eu.email || eu.id });
      if (errAud) console.error("Falha ao registrar auditoria", errAud.message);
      return resposta(req, { message: "Senha alterada." });
    }

    if (meu?.perfil !== "administrador") return resposta(req, { error: "Somente administradores podem gerenciar usuários." }, 403);

    const auditar = async (acao: string, entidade_id: string | null, descricao: string, detalhes: Record<string, unknown> = {}) => {
      const { error } = await admin.from("auditoria").insert({ autor_id: eu.id, autor_email: eu.email ?? null, acao, entidade: "usuario", entidade_id, descricao, detalhes });
      if (error) console.error("Falha ao registrar auditoria", acao, error.message);
    };
    const body = corpo;
    const acao = String(body.action || "");
    const alvoId = String(body.userId || "");
    const alvo = async () => {
      if (!UUID.test(alvoId)) return null;
      const { data, error } = await admin.auth.admin.getUserById(alvoId);
      return error || !data.user ? null : data.user;
    };

    if (acao === "list") {
      const usuarios: any[] = [];
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
        if (error) return resposta(req, { error: error.message }, 400);
        usuarios.push(...data.users);
        if (data.users.length < 100) break;
      }
      const { data: perfis, error } = await admin.from("perfis_usuarios").select("usuario_id,perfil,nome");
      if (error) return resposta(req, { error: error.message }, 400);
      const mapa = new Map((perfis || []).map((p) => [p.usuario_id, p]));
      return resposta(req, {
        users: usuarios.map((u) => ({
          id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at, banned_until: u.banned_until,
          nome: mapa.get(u.id)?.nome || u.user_metadata?.full_name || "", perfil: mapa.get(u.id)?.perfil || null, eu: u.id === eu.id,
        })),
      });
    }

    if (acao === "invite") {
      const perfil = String(body.perfil || "enfermagem");
      if (!ehPerfil(perfil)) return resposta(req, { error: "Perfil inválido." }, 400);
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const token = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
      const { data, error } = await admin.from("convites_cadastro").insert({
        token_hash: await sha256(token), perfil, criado_por: eu.id, expira_em: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      }).select("id").single();
      if (error) return resposta(req, { error: "Não foi possível gerar o convite." }, 500);
      await auditar("gerou_convite", data.id, `Convite (${perfil}) válido por 48 horas`, { perfil });
      return resposta(req, { token, id: data.id, perfil, expires_in_hours: 48 });
    }

    if (acao === "list_invites") {
      const { data, error } = await admin.from("convites_cadastro").select("id,perfil,criado_em,expira_em,criado_por")
        .is("usado_em", null).gt("expira_em", new Date().toISOString()).order("criado_em", { ascending: false }).limit(100);
      if (error) return resposta(req, { error: error.message }, 400);
      return resposta(req, { invites: data || [] });
    }

    if (acao === "revoke_invite") {
      const id = String(body.inviteId || "");
      if (!UUID.test(id)) return resposta(req, { error: "Convite inválido." }, 400);
      const agora = new Date().toISOString();
      const { data, error } = await admin.from("convites_cadastro").update({ expira_em: agora })
        .eq("id", id).is("usado_em", null).gt("expira_em", agora).select("id").maybeSingle();
      if (error) return resposta(req, { error: error.message }, 400);
      if (!data) return resposta(req, { error: "Convite não encontrado, já usado ou vencido." }, 404);
      await auditar("cancelou_convite", id, "Convite cancelado");
      return resposta(req, { message: "Convite cancelado." });
    }

    if (acao === "role") {
      const perfil = String(body.perfil || "");
      if (!ehPerfil(perfil)) return resposta(req, { error: "Perfil inválido." }, 400);
      if (alvoId === eu.id && perfil !== "administrador") return resposta(req, { error: "Você não pode tirar seu próprio perfil de administrador." }, 400);
      const u = await alvo(); if (!u) return resposta(req, { error: "Usuário não encontrado." }, 404);
      const { data: antes } = await admin.from("perfis_usuarios").select("perfil").eq("usuario_id", u.id).maybeSingle();
      const { error } = await admin.from("perfis_usuarios").upsert({ usuario_id: u.id, perfil, atualizado_em: new Date().toISOString() });
      if (error) return resposta(req, { error: error.message }, 400);
      await auditar("alterou_perfil", u.id, u.email || u.id, { antes: antes?.perfil ?? null, depois: perfil });
      return resposta(req, { message: "Perfil alterado." });
    }

    if (acao === "access") {
      const bloquear = body.blocked === true;
      if (alvoId === eu.id) return resposta(req, { error: "Você não pode bloquear sua própria conta." }, 400);
      const u = await alvo(); if (!u) return resposta(req, { error: "Usuário não encontrado." }, 404);
      const { error } = await admin.auth.admin.updateUserById(u.id, { ban_duration: bloquear ? "876000h" : "none" });
      if (error) return resposta(req, { error: error.message }, 400);
      // Quem é bloqueado perde também os convites que gerou (o banco já recusa convite de autor bloqueado; aqui eles somem da lista).
      let convites = 0;
      if (bloquear) {
        const agora = new Date().toISOString();
        const { data: vencidos, error: errConv } = await admin.from("convites_cadastro").update({ expira_em: agora })
          .eq("criado_por", u.id).is("usado_em", null).gt("expira_em", agora).select("id");
        if (errConv) console.error("Falha ao cancelar convites do bloqueado", errConv.message);
        convites = vencidos?.length || 0;
      }
      await auditar(bloquear ? "bloqueou" : "desbloqueou", u.id, u.email || u.id, bloquear ? { convites_cancelados: convites } : undefined);
      const extra = convites ? ` ${convites === 1 ? "1 convite gerado por ela foi cancelado" : `${convites} convites gerados por ela foram cancelados`}.` : "";
      return resposta(req, { message: bloquear ? `Conta bloqueada. O acesso é cortado na hora.${extra}` : "Conta desbloqueada." });
    }

    if (acao === "password") {
      const senha = String(body.password || "");
      if (senha.length < SENHA_MIN || senha.length > SENHA_MAX) return resposta(req, { error: MSG_SENHA_TAMANHO }, 400);
      if (await senhaVazada(senha)) return resposta(req, { error: MSG_SENHA_VAZADA }, 400);
      const u = await alvo(); if (!u) return resposta(req, { error: "Usuário não encontrado." }, 404);
      const { error } = await admin.auth.admin.updateUserById(u.id, { password: senha });
      if (error) return resposta(req, { error: error.message }, 400);
      await auditar("alterou_senha", u.id, u.email || u.id);
      return resposta(req, { message: "Senha alterada." });
    }

    if (acao === "delete") {
      if (alvoId === eu.id) return resposta(req, { error: "Você não pode excluir sua própria conta." }, 400);
      const u = await alvo(); if (!u) return resposta(req, { error: "Usuário não encontrado." }, 404);
      const { data: antes } = await admin.from("perfis_usuarios").select("perfil").eq("usuario_id", u.id).maybeSingle();
      const { error } = await admin.auth.admin.deleteUser(u.id);
      if (error) return resposta(req, { error: error.message }, 400);
      await auditar("excluiu", u.id, u.email || u.id, { perfil: antes?.perfil ?? null });
      return resposta(req, { message: "Usuário excluído." });
    }

    return resposta(req, { error: "Ação não reconhecida." }, 400);
  } catch (e) {
    console.error("Erro na gestão de usuários", e instanceof Error ? e.message : String(e));
    return resposta(req, { error: "Erro interno. Tente de novo." }, 500);
  }
});
