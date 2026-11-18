/* Configuração pública do site. A chave abaixo é a chave PUBLICÁVEL do Supabase: ela pode ficar no código
   porque sozinha não lê nada. Quem protege os dados são as regras de acesso (RLS) do banco e o login. */
window.ESCALA_CONFIG = Object.freeze({
  supabaseUrl: 'https://nbqepxdoatjemxefgtzz.supabase.co',
  supabaseKey: 'sb_publishable_DhMIzJKxm2fHGVRqokie2g_xloCEhe4',
  versao: '1.0.16'
});

/* Proteção contra "clickjacking": o GitHub Pages não deixa enviar o cabeçalho que proíbe exibir o site dentro de
   outra página. Se isso acontecer, o sistema some e tenta abrir no lugar da página de fora. */
if (window.top !== window.self) {
  document.documentElement.classList.add('em-quadro');
  try { window.top.location.replace(window.self.location.href); } catch (_) { /* página de fora bloqueou; o site fica oculto */ }
}
