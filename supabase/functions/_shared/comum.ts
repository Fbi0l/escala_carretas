// Funções comuns às Edge Functions da Escala das Carretas.
const ORIGENS = ["https://fbi0l.github.io"];
export function cors(req: Request): Record<string, string> {
  const origem = req.headers.get("Origin") || "";
  const permitida = ORIGENS.includes(origem);
  return {
    "Access-Control-Allow-Origin": permitida ? origem : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
export function resposta(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
export const PERFIS = ["administrador", "enfermagem"] as const;
export type Perfil = typeof PERFIS[number];
export const ehPerfil = (x: string): x is Perfil => (PERFIS as readonly string[]).includes(x);
export const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Senhas: de 8 a 128 caracteres e fora de vazamentos conhecidos (Have I Been Pwned, k-anonimato:
// só os 5 primeiros caracteres do SHA-1 saem do servidor). Se o serviço não responder, a senha é aceita.
export const SENHA_MIN = 8, SENHA_MAX = 128;
export const MSG_SENHA_TAMANHO = `A senha deve ter de ${SENHA_MIN} a ${SENHA_MAX} caracteres.`;
export const MSG_SENHA_VAZADA = "Esta senha aparece em vazamentos de dados conhecidos. Escolha outra.";
export async function senhaVazada(senha: string): Promise<boolean> {
  try {
    const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(senha));
    const hex = Array.from(new Uint8Array(digest)).map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
    const r = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, {
      headers: { "Add-Padding": "true", "User-Agent": "escala-carretas" },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return false;
    const sufixo = hex.slice(5);
    return (await r.text()).split("\n").some((l) => {
      const [s, n] = l.trim().split(":");
      return s === sufixo && Number(n) > 0;
    });
  } catch (e) {
    console.error("Verificação de senha vazada indisponível", e instanceof Error ? e.message : String(e));
    return false;
  }
}
export async function sha256(texto: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
