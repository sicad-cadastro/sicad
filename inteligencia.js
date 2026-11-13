/* ═══════════════════════════════════════════════════════════════════════
   SICAD · MÓDULO INTELIGÊNCIA
   Carregado sob demanda (só perfis INTELIGÊNCIA e ADMIN). Depende de globais
   do SICAD: CU, SB, SB_ANON, supabase, esc, toast, showOv, hideOv, ICON, logAudit, L.
   Regras de acesso de verdade estão no banco (migration_v14_modulo_inteligencia.sql).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

// ── Catálogos ───────────────────────────────────────────────────────────
const TIPOS = {
  pessoa:      { rot: 'Pessoa',              plural: 'Pessoas',                 cor: '#1E3A8A', ico: 'usuarios', forma: 'dot' },
  veiculo:     { rot: 'Veículo',             plural: 'Veículos',                cor: '#0E7490', ico: 'carro',    forma: 'square' },
  telefone:    { rot: 'Telefone / ID',       plural: 'Telefones e identificadores', cor: '#7C3AED', ico: 'live', forma: 'triangle' },
  ocorrencia:  { rot: 'Ocorrência',          plural: 'Ocorrências',             cor: '#DC2626', ico: 'alerta',   forma: 'diamond' },
  localidade:  { rot: 'Localidade',          plural: 'Localidades',             cor: '#059669', ico: 'pin',      forma: 'star' },
  organizacao: { rot: 'Organização / grupo', plural: 'Organizações e grupos sob análise', cor: '#B45309', ico: 'shield', forma: 'hexagon' }
};
const NATUREZA = { documentado: 'Documentado', informado: 'Informado', hipotese: 'Hipótese em análise' };
const CONF_FONTE = { A: 'A — Totalmente confiável', B: 'B — Normalmente confiável', C: 'C — Razoavelmente confiável', D: 'D — Normalmente não confiável', E: 'E — Não confiável', F: 'F — Confiabilidade não avaliada' };
const CONF_INFO = { 1: '1 — Confirmada por outras fontes', 2: '2 — Provavelmente verdadeira', 3: '3 — Possivelmente verdadeira', 4: '4 — Duvidosa', 5: '5 — Improvável', 6: '6 — Veracidade não avaliada' };
const SITUACAO_DOS = { aberto: 'Aberto', em_analise: 'Em análise', suspenso: 'Suspenso', concluido: 'Concluído', arquivado: 'Arquivado' };
const CLASSIF = { reservado: 'Reservado', confidencial: 'Confidencial', secreto: 'Secreto' };
const CLASSIF_DOC = { ostensivo: 'Ostensivo', reservado: 'Reservado', sigiloso: 'Sigiloso' };
const STATUS_REL = { rascunho: 'Rascunho', em_revisao: 'Em revisão', revisado: 'Revisado', devolvido: 'Devolvido', aprovado: 'Aprovado' };
const MEMBRO = ['Integrante declarado de', 'Integrante de'];
const FUNCOES = { 'Liderança': 1, 'Conselho / sintonia': 2, 'Gerência': 2, 'Financeiro': 3, 'Disciplina': 3, 'Logística': 3, 'Recrutamento': 3, 'Executor': 4, 'Venda / vapor': 5, 'Olheiro': 5, 'Integrante': 4, 'Função não identificada': 5 };
const NIVEIS = { 1: '1 — Liderança', 2: '2 — Comando intermediário', 3: '3 — Coordenação de área', 4: '4 — Execução', 5: '5 — Base / apoio' };
const TIPOS_VINCULO = ['Integrante de', 'Subordinado a', 'Parentesco', 'Cônjuge / companheiro(a)', 'Proprietário de', 'Utiliza / conduz', 'Titular de', 'Reside em', 'Frequenta', 'Envolvido em', 'Comunica-se com', 'Associado a', 'Integrante declarado de', 'Visto com', 'Outro'];
const PERMS = [
  ['criar_dossie', 'Criar dossiês'], ['cadastrar', 'Cadastrar informações'], ['editar', 'Editar informações'],
  ['anexar', 'Anexar documentos'], ['gerar_relatorio', 'Gerar relatórios'], ['revisar_relatorio', 'Revisar relatórios'],
  ['aprovar_relatorio', 'Aprovar relatórios'], ['ver_sigilosos', 'Ver documentos sigilosos'], ['administrar', 'Administrar usuários do módulo']
];
const SECOES = [
  ['capa', 'Capa e classificação de acesso'], ['identificacao', 'Identificação do dossiê'], ['objetivo', 'Objetivo da análise'],
  ['metodologia', 'Metodologia'], ['fontes', 'Fontes consultadas'], ['informacoes', 'Informações cadastradas'],
  ['pessoas', 'Pessoas e registros relacionados'], ['diagrama', 'Diagrama de vínculos'], ['mapa', 'Mapa geográfico'],
  ['cronologia', 'Cronologia dos registros'], ['documentos', 'Documentos de referência'], ['analise', 'Análise técnica'],
  ['lacunas', 'Lacunas e divergências'], ['conclusao', 'Conclusão'], ['responsavel', 'Responsável pela elaboração'], ['aprovacao', 'Revisão e aprovação']
];
const MENU = [
  ['painel', 'Painel', 'dashboard'], ['central', 'Banco central', 'consultar'],
  ['pessoa', 'Pessoas', 'usuarios'], ['veiculo', 'Veículos', 'carro'], ['telefone', 'Telefones / IDs', 'live'],
  ['ocorrencia', 'Ocorrências', 'alerta'], ['localidade', 'Localidades', 'pin'], ['organizacao', 'Organizações', 'shield'],
  ['vinculos', 'Análise de vínculos', 'web'], ['organograma', 'Organograma', 'usuarios'], ['mapa', 'Mapa', 'mapa'], ['dossies', 'Dossiês', 'pdf'],
  ['documentos', 'Documentos', 'anexo'], ['relatorios', 'Relatórios', 'enviar'],
  ['acessos', 'Acessos', 'usuarios', 'administrar'], ['auditoria', 'Auditoria', 'clock', 'administrar']
];

// ── Estado ──────────────────────────────────────────────────────────────
const S = { perms: new Set(), ents: [], dossies: [], itens: [], vinculos: [], docs: [], rels: [], andamentos: [],
            view: 'painel', dossieId: null, filtros: {}, ok: false, carregando: null };
const byId = (arr, id) => arr.find(x => x.id === id);
const ent = id => byId(S.ents, id);
const e = s => esc(s == null ? '' : String(s));
const dataBR = d => d ? new Date(String(d).length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR') : '—';
const dataHoraBR = d => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const soDig = s => (s || '').replace(/\D/g, '');

function pode(p) {
  if (!CU) return false;
  if (CU.role === 'admin') return true;
  if (CU.role !== 'inteligencia') return false;
  if (['visualizar', 'consultar', 'ver_dossies'].includes(p)) return true;
  return S.perms.has(p);
}
function exige(p, rot) { if (pode(p)) return true; toast('Sem permissão: ' + (rot || p) + '. Peça ao administrador do módulo.', 'error'); return false; }

// ── API (PostgREST com o token do usuário; RLS decide) ──────────────────
async function req(method, path, body, prefer) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    method,
    headers: { apikey: SB_ANON, Authorization: `Bearer ${session?.access_token || SB_ANON}`, 'Content-Type': 'application/json',
               Prefer: prefer || 'return=representation' },
    body: body ? JSON.stringify(body) : undefined
  });
  const t = await r.text();
  if (!r.ok) { let m = t; try { const j = JSON.parse(t); m = j.message || j.hint || t; } catch (_) {} throw new Error(traduzErro(m)); }
  try { return JSON.parse(t); } catch (_) { return []; }
}
function traduzErro(m) {
  if (/int_entidades_chave_uk|duplicate key/i.test(m)) return 'Já existe registro com este CPF / placa / número no banco central. Use o registro existente.';
  if (/row-level security|permission denied/i.test(m)) return 'Sem permissão para esta operação.';
  if (/relation .*int_.* does not exist|Could not find the table/i.test(m)) return 'Banco do módulo ainda não preparado (migration v14).';
  return m;
}
const aud = (acao, recurso, id, det) => { try { logAudit('int_' + acao, recurso || 'inteligencia', id, det); } catch (_) {} };

// ── Carga ───────────────────────────────────────────────────────────────
async function carregar(forcar) {
  if (S.carregando) return S.carregando;
  if (S.ok && !forcar) return;
  S.carregando = (async () => {
    const [acc, ents, dos, itens, vin, docs, rels] = await Promise.all([
      req('GET', `int_acessos?user_id=eq.${CU.id}&select=perms`).catch(() => []),
      req('GET', 'int_entidades?select=*&excluido_em=is.null&order=criado_em.desc&limit=5000'),
      req('GET', 'int_dossies?select=*&excluido_em=is.null&order=criado_em.desc'),
      req('GET', 'int_dossie_itens?select=*&excluido_em=is.null'),
      req('GET', 'int_vinculos?select=*&excluido_em=is.null'),
      req('GET', 'int_documentos?select=*&excluido_em=is.null&order=criado_em.desc'),
      req('GET', 'int_relatorios?select=*&excluido_em=is.null&order=criado_em.desc')
    ]);
    S.perms = new Set((acc[0] && acc[0].perms) || []);
    Object.assign(S, { ents, dossies: dos, itens, vinculos: vin, docs, rels, ok: true });
  })();
  try { await S.carregando; } finally { S.carregando = null; }
}

// ── Estilos ─────────────────────────────────────────────────────────────
function injetarCSS() {
  if (document.getElementById('intCSS')) return;
  const st = document.createElement('style'); st.id = 'intCSS';
  st.textContent = `
#page-inteligencia{padding-bottom:24px}
.int-wrap{display:grid;grid-template-columns:220px 1fr;gap:20px;align-items:start}
.int-nav{position:sticky;top:12px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:10px;display:flex;flex-direction:column;gap:2px}
.int-nav .int-nav-tit{font-size:10.5px;font-weight:700;letter-spacing:.1em;color:var(--neutral-400);padding:8px 10px 6px;text-transform:uppercase}
.int-nav button{display:flex;align-items:center;gap:10px;border:0;background:transparent;padding:9px 10px;border-radius:9px;font-size:13.5px;color:var(--neutral-600);cursor:pointer;text-align:left;font-family:var(--font-sans);font-weight:500;white-space:nowrap}
.int-nav button:hover{background:var(--neutral-100);color:var(--neutral-900)}
.int-nav button.on{background:var(--brand-navy,#1E3A8A);color:#fff}
.int-main{min-width:0}
.int-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.int-h1{font-size:20px;font-weight:800;letter-spacing:-.01em;color:var(--neutral-900)}
.int-sub{font-size:12.5px;color:var(--neutral-500);margin-top:2px}
.int-acoes{display:flex;gap:8px;flex-wrap:wrap}
.int-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px}
.int-kpi{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;cursor:pointer;transition:border-color .15s}
.int-kpi:hover{border-color:var(--neutral-400)}
.int-kpi b{display:block;font-size:24px;font-weight:800;color:var(--neutral-900);font-variant-numeric:tabular-nums}
.int-kpi span{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--neutral-500)}
.int-kpi.alerta b{color:#B45309}
.int-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:14px}
.int-card h3{font-size:13px;font-weight:700;color:var(--neutral-800);margin:0 0 12px;display:flex;justify-content:space-between;align-items:center;gap:8px}
.int-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.int-busca{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.int-busca input,.int-busca select{flex:1;min-width:140px;height:42px;border:1px solid var(--border);border-radius:10px;padding:0 12px;background:var(--surface);font-size:14px;color:var(--text)}
.int-tab{width:100%;border-collapse:collapse;font-size:13px}
.int-tab th{text-align:left;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--neutral-500);font-weight:700;padding:8px 10px;border-bottom:1px solid var(--border);white-space:nowrap}
.int-tab td{padding:10px;border-bottom:1px solid var(--neutral-100);vertical-align:top}
.int-tab tr.cl{cursor:pointer}.int-tab tr.cl:hover td{background:var(--neutral-50)}
.int-cod{font-family:var(--font-mono);font-size:11.5px;color:var(--neutral-500);white-space:nowrap}
.int-tag{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;border:1px solid var(--border);color:var(--neutral-600);background:var(--neutral-50);white-space:nowrap}
.int-tag.doc{background:#ECFDF5;border-color:#A7F3D0;color:#047857}
.int-tag.inf{background:#EFF6FF;border-color:#BFDBFE;color:#1D4ED8}
.int-tag.hip{background:#FFFBEB;border-color:#FDE68A;color:#92400E;border-style:dashed}
.int-tag.sig{background:#FEF2F2;border-color:#FECACA;color:#B91C1C}
.int-tipo{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600}
.int-tipo i{width:9px;height:9px;border-radius:50%;display:inline-block}
.int-vazio{text-align:center;color:var(--neutral-500);padding:28px 10px;font-size:13.5px}
.int-barras{display:flex;flex-direction:column;gap:8px}
.int-barra{display:grid;grid-template-columns:150px 1fr 40px;gap:10px;align-items:center;font-size:12.5px;cursor:pointer}
.int-barra .t{height:10px;background:var(--neutral-100);border-radius:6px;overflow:hidden}
.int-barra .t i{display:block;height:100%;border-radius:6px}
.int-barra:hover span{color:var(--neutral-900);font-weight:600}
.int-col{display:flex;align-items:flex-end;gap:6px;height:120px;padding-top:6px}
.int-col div{flex:1;background:var(--brand-navy,#1E3A8A);border-radius:4px 4px 0 0;min-height:2px;position:relative;opacity:.85}
.int-col div:hover{opacity:1}
.int-col-l{display:flex;gap:6px;font-size:10px;color:var(--neutral-500);margin-top:4px}.int-col-l span{flex:1;text-align:center}
.int-lista{display:flex;flex-direction:column;gap:8px}
.int-item{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface);cursor:pointer}
.int-item:hover{border-color:var(--neutral-400)}
.int-item .m{flex:1;min-width:0}.int-item .m b{display:block;font-size:13.5px;color:var(--neutral-900)}
.int-item .m small{color:var(--neutral-500);font-size:12px}
.int-aviso{font-size:12.5px;line-height:1.5;color:#78350F;background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:10px 12px;margin-bottom:12px}
.int-net{height:560px;border:1px solid var(--border);border-radius:12px;background:#fff}
.int-map{height:560px;border:1px solid var(--border);border-radius:12px;z-index:0}
.int-legenda{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--neutral-600);margin-top:10px;align-items:center}
.int-legenda span{display:inline-flex;align-items:center;gap:6px}
.int-ln{width:26px;height:0;border-top:2px solid #334155;display:inline-block}
.int-ln.inf{border-top-style:dashed}.int-ln.hip{border-top:2px dotted #94A3B8}
.int-form{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
.int-form .full{grid-column:1/-1}
.int-form textarea{min-height:80px}
.int-chk{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;font-size:13px}
.int-chk label{display:flex;gap:8px;align-items:center;cursor:pointer;text-transform:none;letter-spacing:0;font-size:13px;color:var(--neutral-700);font-weight:500}
.int-dl{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;font-size:13px}
.int-dl div small{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--neutral-500);font-weight:700;margin-bottom:2px}
.int-tabs{display:flex;gap:4px;background:var(--neutral-100);padding:4px;border-radius:10px;margin-bottom:14px;overflow-x:auto;scrollbar-width:none}
.int-tabs button{border:0;background:transparent;padding:8px 12px;border-radius:7px;font-size:12.5px;font-weight:600;color:var(--neutral-600);cursor:pointer;white-space:nowrap}
.int-tabs button.on{background:#fff;color:var(--neutral-900);box-shadow:var(--shadow-sm)}
.int-foto{width:132px;height:160px;border-radius:12px;object-fit:cover;border:1px solid var(--border);background:var(--neutral-100);cursor:zoom-in;display:block}
.int-foto-vazia{width:132px;height:160px;border-radius:12px;border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;color:var(--neutral-400);font-size:12px;text-align:center;padding:8px}
.int-ficha-top{display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:start}
.int-galeria{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
.int-galeria figure{margin:0;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#fff}
.int-galeria img{width:100%;height:150px;object-fit:cover;display:block;cursor:zoom-in}
.int-galeria figcaption{font-size:11.5px;color:var(--neutral-600);padding:6px 8px}
.int-org{height:640px;border:1px solid var(--border);border-radius:12px;background:#fff}
.oc-wrap{overflow:auto;border:1px solid var(--border);border-radius:12px;background:#fff;max-height:72vh;-webkit-overflow-scrolling:touch}
.oc-in{position:relative}
.oc-card{position:absolute;width:190px;height:76px;display:flex;gap:9px;align-items:center;background:#fff;border:2px solid #94A3B8;border-radius:12px;padding:8px;box-shadow:0 2px 6px rgba(15,23,42,.08);cursor:pointer;transition:box-shadow .15s,transform .15s}
.oc-card:hover{box-shadow:0 6px 16px rgba(15,23,42,.16);transform:translateY(-1px)}
.oc-card.hipotese{border-style:dashed}
.oc-card img{width:52px;height:56px;border-radius:8px;object-fit:cover;flex-shrink:0;background:#E2E8F0}
.oc-card div{min-width:0;display:flex;flex-direction:column;gap:1px}
.oc-card b{font-size:12px;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.oc-card small{font-size:11px;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.oc-card span{font-size:10px;color:#94A3B8;font-family:var(--font-mono)}
.int-trava{position:fixed;inset:0;z-index:2000;background:rgba(15,23,42,.92);display:flex;align-items:center;justify-content:center;padding:20px}
.int-trava .bx{background:#fff;border-radius:16px;padding:24px;max-width:380px;width:100%}
.int-classif{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.12em;font-weight:700;color:#B91C1C;border:1px solid #FECACA;background:#FEF2F2;padding:3px 8px;border-radius:6px}
@media(max-width:900px){
  .int-wrap{grid-template-columns:1fr;gap:12px}
  .int-nav{position:static;flex-direction:row;overflow-x:auto;padding:6px;scrollbar-width:none;border-radius:12px}
  .int-nav .int-nav-tit{display:none}
  .int-nav button{padding:8px 11px;font-size:12.5px}
  .int-grid2,.int-form,.int-dl,.int-chk{grid-template-columns:1fr}
  .int-net,.int-map{height:420px}
  .int-org{height:520px}
  .int-ficha-top{grid-template-columns:1fr}
  .int-foto,.int-foto-vazia{width:100%;height:240px}
  .int-barra{grid-template-columns:110px 1fr 32px}
  .int-tab .hm{display:none}
}`;
  document.head.appendChild(st);
}

// ── Modal próprio ───────────────────────────────────────────────────────
function modal(titulo, html, largo) {
  let ov = document.getElementById('intModal');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'intModal'; ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal"><div class="mhandle"></div><div class="mi"><div class="mhdr"><div class="c3-mtitle" id="intModalT"></div><div class="mclose" onclick="INT.fechar()">✕</div></div><div id="intModalB"></div></div></div>`;
    ov.addEventListener('click', ev => { if (ev.target === ov) INT.fechar(); });
    document.body.appendChild(ov);
  }
  ov.querySelector('.modal').style.maxWidth = largo ? '860px' : '';
  document.getElementById('intModalT').innerHTML = titulo;
  document.getElementById('intModalB').innerHTML = html;
  ov.classList.add('open');
  ov.querySelector('.modal').scrollTop = 0;
}
function fechar() { const ov = document.getElementById('intModal'); if (ov) ov.classList.remove('open'); }

// ── Helpers de formulário ───────────────────────────────────────────────
const campo = (lbl, inner, cls = '') => `<div class="fg ${cls}"><label>${lbl}</label>${inner}</div>`;
const opts = (obj, sel, vazio) => (vazio ? `<option value="">${vazio}</option>` : '') + Object.entries(obj).map(([k, v]) => `<option value="${e(k)}"${String(sel) === k ? ' selected' : ''}>${e(v)}</option>`).join('');
const val = id => { const el = document.getElementById(id); return el ? (el.value || '').trim() : ''; };
const nul = v => (v === '' ? null : v);
const tagNat = n => `<span class="int-tag ${n === 'documentado' ? 'doc' : n === 'hipotese' ? 'hip' : 'inf'}">${e(NATUREZA[n] || n)}</span>`;
const tipoTag = t => `<span class="int-tipo"><i style="background:${(TIPOS[t] || {}).cor}"></i>${e((TIPOS[t] || {}).rot || t)}</span>`;
const confTxt = (f, i) => (f || i) ? `${f || '—'}${i || ''}` : '—';
function camposConfiabilidade(o = {}) {
  return campo('Fonte da informação *', `<input id="iFonte" value="${e(o.fonte)}" placeholder="Ex.: BO 1234/2026 — 16º BPM; relatório de campo; informante">`, 'full') +
    campo('Documento comprobatório', `<input id="iDocRef" value="${e(o.documento_ref)}" placeholder="Nº do documento, ofício, processo SEI...">`) +
    campo('Situação da informação', `<select id="iNat">${opts(NATUREZA, o.natureza || 'documentado')}</select>`) +
    campo('Confiabilidade da fonte', `<select id="iConfF">${opts(CONF_FONTE, o.conf_fonte, 'Não avaliada')}</select>`) +
    campo('Credibilidade da informação', `<select id="iConfI">${opts(CONF_INFO, o.conf_info, 'Não avaliada')}</select>`);
}
function listaEntidadesDatalist() {
  return `<datalist id="intEntDL">${S.ents.map(x => `<option value="${e(x.codigo)} — ${e(x.titulo)}">`).join('')}</datalist>`;
}
function entPorTexto(txt) {
  const cod = (txt || '').split(' — ')[0].trim();
  return S.ents.find(x => x.codigo === cod) || S.ents.find(x => norm(x.titulo) === norm(txt));
}
const dossiesDoEnt = id => S.itens.filter(i => i.entidade_id === id).map(i => byId(S.dossies, i.dossie_id)).filter(Boolean);
const entsDoDossie = id => S.itens.filter(i => i.dossie_id === id).map(i => ent(i.entidade_id)).filter(Boolean);

// ── Layout ──────────────────────────────────────────────────────────────
function render() {
  const root = document.getElementById('intRoot'); if (!root) return;
  if (!root.querySelector('.int-wrap')) {
    root.innerHTML = `<div class="int-wrap"><aside class="int-nav" id="intNav"></aside><main class="int-main" id="intMain"></main></div>`;
  }
  const grupos = [['Visão geral', ['painel', 'central']], ['Cadastros', ['pessoa', 'veiculo', 'telefone', 'ocorrencia', 'localidade', 'organizacao']],
                  ['Análise', ['vinculos', 'organograma', 'mapa', 'dossies', 'documentos', 'relatorios']], ['Controle', ['acessos', 'auditoria']]];
  document.getElementById('intNav').innerHTML = grupos.map(([g, ids]) => {
    const itens = ids.map(id => MENU.find(m => m[0] === id)).filter(m => !m[3] || pode(m[3]));
    if (!itens.length) return '';
    return `<div class="int-nav-tit">${g}</div>` + itens.map(([id, rot, ico]) =>
      `<button class="${S.view === id || (id === 'dossies' && S.view === 'dossie') ? 'on' : ''}" onclick="INT.ir('${id}')">${ICON(ico, { size: 16 })}${rot}</button>`).join('');
  }).join('');
  const main = document.getElementById('intMain');
  const fn = VIEWS[S.view] || VIEWS.painel;
  main.innerHTML = fn();
  if (AFTER[S.view]) setTimeout(AFTER[S.view], 30);
}
function cabecalho(t, sub, acoes = '') {
  return `<div class="int-head"><div><div class="int-h1">${t}</div>${sub ? `<div class="int-sub">${sub}</div>` : ''}</div><div class="int-acoes">${acoes}</div></div>`;
}

// ── VIEWS ───────────────────────────────────────────────────────────────
const VIEWS = {}, AFTER = {};

VIEWS.painel = () => {
  const ativos = S.dossies.filter(d => !['concluido', 'arquivado'].includes(d.situacao));
  const hip = S.vinculos.filter(v => v.situacao === 'hipotese').length + S.ents.filter(x => x.natureza === 'hipotese').length;
  const pendRev = S.rels.filter(r => r.status === 'em_revisao').length, pendApr = S.rels.filter(r => r.status === 'revisado').length;
  const hoje = new Date().toISOString().slice(0, 10);
  const vencidos = S.dossies.filter(d => d.reter_ate && d.reter_ate < hoje);
  const max = Math.max(1, ...Object.keys(TIPOS).map(t => S.ents.filter(x => x.tipo === t).length));
  // registros por mês (12 meses)
  const meses = []; const d0 = new Date(); d0.setDate(1);
  for (let i = 11; i >= 0; i--) { const d = new Date(d0.getFullYear(), d0.getMonth() - i, 1); meses.push([d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')]); }
  const porMes = meses.map(([k]) => S.ents.filter(x => (x.criado_em || '').slice(0, 7) === k).length);
  const mxM = Math.max(1, ...porMes);
  return cabecalho('Painel de Inteligência', 'Banco central, dossiês e produção de conhecimento',
      (pode('criar_dossie') ? `<button class="btn btn-primary btn-sm" onclick="INT.formDossie()">${ICON('novo', { size: 15 })} Novo dossiê</button>` : '') +
      (pode('gerar_relatorio') ? `<button class="btn btn-outline btn-sm" onclick="INT.formRelatorio()">${ICON('pdf', { size: 15 })} Gerar relatório</button>` : '')) +
    `<div class="int-busca"><input id="intBuscaG" placeholder="Pesquisa central: nome, CPF, placa, telefone, código, dossiê..." onkeydown="if(event.key==='Enter')INT.pesquisar(this.value)"><button class="btn btn-primary btn-sm" onclick="INT.pesquisar(document.getElementById('intBuscaG').value)">Pesquisar</button></div>
    <div class="int-kpis">
      <div class="int-kpi" onclick="INT.ir('dossies')"><b>${ativos.length}</b><span>Dossiês ativos</span></div>
      <div class="int-kpi" onclick="INT.ir('central')"><b>${S.ents.length}</b><span>Registros no banco</span></div>
      <div class="int-kpi" onclick="INT.ir('vinculos')"><b>${S.vinculos.length}</b><span>Vínculos lançados</span></div>
      <div class="int-kpi" onclick="INT.filtrarCentral({facc:'1'})"><b>${S.ents.filter(x => x.dados && x.dados.faccionado_sicad).length}</b><span>Faccionados (SICAD)</span></div>
      <div class="int-kpi" onclick="INT.filtrarCentral({nat:'hipotese'})"><b>${hip}</b><span>Hipóteses em análise</span></div>
      <div class="int-kpi ${pendRev + pendApr ? 'alerta' : ''}" onclick="INT.ir('relatorios')"><b>${pendRev + pendApr}</b><span>Relatórios pendentes</span></div>
      <div class="int-kpi ${vencidos.length ? 'alerta' : ''}" onclick="INT.ir('dossies')"><b>${vencidos.length}</b><span>Retenção vencida</span></div>
    </div>
    <div class="int-grid2">
      <div class="int-card"><h3>Registros por tipo</h3><div class="int-barras">${Object.entries(TIPOS).map(([t, c]) => { const n = S.ents.filter(x => x.tipo === t).length; return `<div class="int-barra" onclick="INT.ir('${t}')" title="Abrir ${e(c.plural)}"><span>${e(c.plural.split(' ')[0])}</span><div class="t"><i style="width:${Math.round(n / max * 100)}%;background:${c.cor}"></i></div><b>${n}</b></div>`; }).join('')}</div></div>
      <div class="int-card"><h3>Novos registros (12 meses)</h3><div class="int-col">${porMes.map((n, i) => `<div style="height:${Math.round(n / mxM * 100)}%" title="${meses[i][1]}: ${n} registro(s)"></div>`).join('')}</div><div class="int-col-l">${meses.map(m => `<span>${m[1]}</span>`).join('')}</div></div>
    </div>
    <div class="int-grid2">
      <div class="int-card"><h3>Dossiês recentes <button class="btn btn-outline btn-sm" onclick="INT.ir('dossies')">Ver todos</button></h3>${listaDossies(S.dossies.slice(0, 5))}</div>
      <div class="int-card"><h3>Últimos registros <button class="btn btn-outline btn-sm" onclick="INT.ir('central')">Banco central</button></h3><div class="int-lista">${S.ents.slice(0, 6).map(itemEnt).join('') || '<div class="int-vazio">Nenhum registro ainda.</div>'}</div></div>
    </div>
    ${vencidos.length ? `<div class="int-card"><h3>Retenção vencida — revisar necessidade de manter os dados</h3>${listaDossies(vencidos)}</div>` : ''}`;
};

function itemEnt(x) {
  return `<div class="int-item" onclick="INT.ficha('${x.id}')"><div style="color:${TIPOS[x.tipo].cor};padding-top:2px">${ICON(TIPOS[x.tipo].ico, { size: 18 })}</div><div class="m"><b>${e(x.titulo)}</b><small><span class="int-cod">${e(x.codigo)}</span> · ${e(TIPOS[x.tipo].rot)} · ${dataBR(x.criado_em)}</small></div>${tagNat(x.natureza)}</div>`;
}
function listaDossies(lista) {
  if (!lista.length) return '<div class="int-vazio">Nenhum dossiê.</div>';
  return `<div class="int-lista">${lista.map(d => `<div class="int-item" onclick="INT.abrirDossie('${d.id}')"><div style="color:var(--brand-navy,#1E3A8A);padding-top:2px">${ICON('pdf', { size: 18 })}</div><div class="m"><b>${e(d.titulo)}</b><small><span class="int-cod">${e(d.numero)}</span> · ${e(d.responsavel_nome || d.criado_por_nome || '—')} · ${entsDoDossie(d.id).length} registro(s)</small></div><span class="int-tag">${e(SITUACAO_DOS[d.situacao])}</span></div>`).join('')}</div>`;
}

// Banco central / listas por tipo
function viewLista(tipo) {
  const f = S.filtros[tipo || 'central'] || {};
  let l = S.ents.filter(x => !tipo || x.tipo === tipo);
  if (f.tipo) l = l.filter(x => x.tipo === f.tipo);
  if (f.nat) l = l.filter(x => x.natureza === f.nat);
  if (f.facc) l = l.filter(x => x.dados && x.dados.faccionado_sicad);
  if (f.dos) { const ids = new Set(S.itens.filter(i => i.dossie_id === f.dos).map(i => i.entidade_id)); l = l.filter(x => ids.has(x.id)); }
  if (f.q) { const q = norm(f.q), qd = soDig(f.q); l = l.filter(x => norm([x.titulo, x.codigo, x.fonte, x.observacoes, JSON.stringify(x.dados)].join(' ')).includes(q) || (qd.length >= 3 && (x.chave || '').includes(qd))); }
  const chave = tipo || 'central';
  const titulo = tipo ? TIPOS[tipo].plural : 'Banco central de informações';
  const sub = tipo ? 'Registro único no banco central — o mesmo registro pode estar em vários dossiês' : 'Base unificada: cada pessoa, veículo, telefone, ocorrência, localidade e organização tem um código único';
  return cabecalho(titulo, sub, pode('cadastrar') ? `<button class="btn btn-primary btn-sm" onclick="INT.formEnt('${tipo || ''}')">${ICON('novo', { size: 15 })} Novo ${tipo ? e(TIPOS[tipo].rot.toLowerCase()) : 'registro'}</button>` : '') +
    (tipo === 'organizacao' ? `<div class="int-aviso">Cadastro de <b>organizações e grupos sob análise</b>. Incluir uma pessoa num grupo exige vínculo lançado com fonte e situação (documentado, informado ou hipótese). O sistema <b>não classifica ninguém automaticamente</b> como integrante de organização criminosa.</div>` : '') +
    `<div class="int-busca">
      <input placeholder="Buscar por nome, código, CPF, placa, número, fonte..." value="${e(f.q)}" oninput="INT.setFiltro('${chave}','q',this.value)">
      ${!tipo ? `<select onchange="INT.setFiltro('${chave}','tipo',this.value,true)">${opts(Object.fromEntries(Object.entries(TIPOS).map(([k, v]) => [k, v.rot])), f.tipo, 'Todos os tipos')}</select>` : ''}
      <select onchange="INT.setFiltro('${chave}','nat',this.value,true)">${opts(NATUREZA, f.nat, 'Toda situação')}</select>
      ${!tipo || tipo === 'pessoa' ? `<select onchange="INT.setFiltro('${chave}','facc',this.value,true)"><option value="">Todas as pessoas</option><option value="1"${f.facc ? ' selected' : ''}>Só faccionados (SICAD)</option></select>` : ''}
      <select onchange="INT.setFiltro('${chave}','dos',this.value,true)">${opts(Object.fromEntries(S.dossies.map(d => [d.id, d.numero + ' — ' + d.titulo])), f.dos, 'Todos os dossiês')}</select>
    </div>
    <div class="int-card" style="padding:0;overflow-x:auto" id="intTabEnt">${tabelaEnts(l)}</div>`;
}
function tabelaEnts(l) {
  if (!l.length) return '<div class="int-vazio">Nenhum registro encontrado.</div>';
  return `<table class="int-tab"><thead><tr><th>Código</th><th>Registro</th><th class="hm">Tipo</th><th>Situação</th><th class="hm">Conf.</th><th class="hm">Dossiês</th><th class="hm">Cadastro</th></tr></thead><tbody>${l.slice(0, 300).map(x => `<tr class="cl" onclick="INT.ficha('${x.id}')"><td class="int-cod">${e(x.codigo)}</td><td><b>${e(x.titulo)}</b>${x.dados && x.dados.faccionado_sicad ? ` <span class="int-tag sig">Faccionado${x.dados.faccao_sicad ? ': ' + e(x.dados.faccao_sicad) : ''}</span>` : ''}${resumoEnt(x) ? `<div style="font-size:12px;color:var(--neutral-500)">${e(resumoEnt(x))}</div>` : ''}</td><td class="hm">${tipoTag(x.tipo)}</td><td>${tagNat(x.natureza)}</td><td class="hm int-cod">${confTxt(x.conf_fonte, x.conf_info)}</td><td class="hm">${dossiesDoEnt(x.id).length}</td><td class="hm" style="font-size:12px;color:var(--neutral-500)">${dataBR(x.criado_em)}<br>${e(x.criado_por_nome || '')}</td></tr>`).join('')}</tbody></table>${l.length > 300 ? `<div class="int-vazio">Mostrando 300 de ${l.length}. Refine a busca.</div>` : ''}`;
}
function resumoEnt(x) {
  const d = x.dados || {};
  switch (x.tipo) {
    case 'pessoa': return [d.cpf && 'CPF ' + d.cpf, d.alcunha && 'vulgo ' + d.alcunha, d.mae && 'mãe ' + d.mae].filter(Boolean).join(' · ');
    case 'veiculo': return [d.marca_modelo, d.cor, d.ano].filter(Boolean).join(' · ');
    case 'telefone': return [d.tipo_id, d.titular && 'titular ' + d.titular].filter(Boolean).join(' · ');
    case 'ocorrencia': return [d.natureza_fato, x.data_fato && dataBR(x.data_fato), d.unidade].filter(Boolean).join(' · ');
    case 'localidade': return [d.tipo_local, d.endereco].filter(Boolean).join(' · ');
    case 'organizacao': return [d.area_atuacao].filter(Boolean).join(' · ');
  }
  return '';
}
VIEWS.central = () => viewLista(null);
Object.keys(TIPOS).forEach(t => { VIEWS[t] = () => viewLista(t); });

// ── Formulário de registro ──────────────────────────────────────────────
const CAMPOS = {
  pessoa: [['nome', 'Nome completo *', 'full'], ['alcunha', 'Alcunha / vulgo'], ['cpf', 'CPF'], ['rg', 'RG'], ['nascimento', 'Nascimento', '', 'date'], ['mae', 'Nome da mãe', 'full'], ['endereco', 'Endereço', 'full']],
  veiculo: [['placa', 'Placa *'], ['marca_modelo', 'Marca / modelo'], ['cor', 'Cor'], ['ano', 'Ano'], ['renavam', 'Renavam'], ['chassi', 'Chassi'], ['proprietario_declarado', 'Proprietário declarado', 'full']],
  telefone: [['numero', 'Número / identificador *', 'full'], ['tipo_id', 'Tipo', '', 'sel:Celular|Fixo|IMEI|E-mail|Perfil de rede social|Outro'], ['operadora', 'Operadora / plataforma'], ['titular', 'Titular declarado', 'full'], ['autorizacao', 'Autorização / fundamento da obtenção *', 'full']],
  ocorrencia: [['numero_ocorrencia', 'Nº da ocorrência / BO *'], ['natureza_fato', 'Natureza *'], ['unidade', 'Unidade / delegacia'], ['local', 'Local do fato'], ['descricao', 'Descrição', 'full', 'area']],
  localidade: [['nome', 'Nome da localidade *', 'full'], ['tipo_local', 'Tipo', '', 'sel:Residência|Comércio|Ponto de encontro|Ponto de venda|Área rural|Via pública|Outro'], ['endereco', 'Endereço'], ['descricao', 'Descrição', 'full', 'area']],
  organizacao: [['nome', 'Nome do grupo / organização *', 'full'], ['area_atuacao', 'Área de atuação'], ['descricao', 'Descrição da análise', 'full', 'area']]
};
function formEnt(tipo, id) {
  if (!exige(id ? 'editar' : 'cadastrar', id ? 'editar informações' : 'cadastrar informações')) return;
  const x = id ? ent(id) : null; tipo = x ? x.tipo : tipo;
  if (!tipo) {
    return modal('Novo registro no banco central', `<div class="int-lista">${Object.entries(TIPOS).map(([t, c]) => `<div class="int-item" onclick="INT.formEnt('${t}')"><div style="color:${c.cor}">${ICON(c.ico, { size: 18 })}</div><div class="m"><b>${e(c.rot)}</b><small>${e(c.plural)}</small></div></div>`).join('')}</div>`);
  }
  const d = (x && x.dados) || {};
  const comData = tipo === 'ocorrencia';
  const comGeo = ['ocorrencia', 'localidade', 'pessoa'].includes(tipo);
  const camposHtml = CAMPOS[tipo].map(([k, lbl, cls, tp]) => {
    let inp;
    if (tp === 'area') inp = `<textarea id="iD_${k}">${e(d[k])}</textarea>`;
    else if (tp && tp.startsWith('sel:')) inp = `<select id="iD_${k}">${tp.slice(4).split('|').map(o => `<option${d[k] === o ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
    else inp = `<input id="iD_${k}" type="${tp || 'text'}" value="${e(d[k])}">`;
    return campo(lbl, inp, cls || '');
  }).join('');
  modal(`${x ? 'Editar' : 'Novo'} registro · ${e(TIPOS[tipo].rot)}${x ? ` <span class="int-cod">${e(x.codigo)}</span>` : ''}`, `
    ${tipo === 'pessoa' && !x ? `<div class="int-aviso" style="background:#EFF6FF;border-color:#BFDBFE;color:#1E3A8A">Pessoa já cadastrada no SICAD? <a href="#" onclick="INT.importarSicad();return false" style="font-weight:700">Puxar do cadastro do SICAD</a> — evita digitar de novo e mantém o vínculo.</div>` : ''}
    <div class="int-form">
      ${camposHtml}
      ${comData ? campo('Data do fato', `<input id="iDataFato" type="date" value="${e(x && x.data_fato)}">`) : ''}
      ${comGeo ? campo('Latitude', `<input id="iLat" inputmode="decimal" value="${e(x && x.lat)}" placeholder="-15.67...">`) + campo('Longitude', `<input id="iLng" inputmode="decimal" value="${e(x && x.lng)}" placeholder="-48.19...">`) : ''}
      ${camposConfiabilidade(x || {})}
      ${campo('Observações', `<textarea id="iObs">${e(x && x.observacoes)}</textarea>`, 'full')}
      ${!x && S.dossies.length ? campo('Incluir no dossiê', `<select id="iDosAdd">${opts(Object.fromEntries(S.dossies.map(d => [d.id, d.numero + ' — ' + d.titulo])), S.view === 'dossie' ? S.dossieId : '', 'Não incluir agora')}</select>`, 'full') : ''}
      <input type="hidden" id="iSicadId" value="${e(x && x.sicad_pessoa_id)}">
    </div>
    <div class="row-btns" style="margin-top:12px"><button class="btn btn-outline" onclick="INT.fechar()">Cancelar</button><button class="btn btn-primary" onclick="INT.salvarEnt('${tipo}','${x ? x.id : ''}')">Salvar</button></div>`, true);
}
function importarSicad() {
  const l = (typeof allP !== 'undefined' ? allP : []);
  modal('Puxar pessoa do SICAD', `<div class="int-busca"><input id="iSicadQ" placeholder="Nome, apelido ou CPF" oninput="INT.buscaSicad(this.value)" autofocus></div><div id="iSicadR" class="int-lista">${l.length ? '' : '<div class="int-vazio">Abra o Consultar do SICAD uma vez para carregar os cadastros.</div>'}</div>`);
}
function buscaSicad(q) {
  const l = (typeof allP !== 'undefined' ? allP : []); const n = norm(q), dg = soDig(q);
  const r = q.length < 2 ? [] : l.filter(p => norm([p.nome, p.apelido, p.mae].join(' ')).includes(n) || (dg.length >= 4 && soDig(p.cpf).includes(dg))).slice(0, 20);
  document.getElementById('iSicadR').innerHTML = r.map(p => `<div class="int-item" onclick="INT.usarSicad('${p.id}')"><div class="m"><b>${e(p.nome)}</b><small>${e([p.cpf && 'CPF ' + p.cpf, p.apelido, p.bairro].filter(Boolean).join(' · '))}</small></div></div>`).join('') || (q.length >= 2 ? '<div class="int-vazio">Nada encontrado.</div>' : '');
}
function usarSicad(pid) {
  const p = (allP || []).find(x => x.id === pid); if (!p) return;
  const ja = S.ents.find(x => x.sicad_pessoa_id === String(pid) || (p.cpf && x.tipo === 'pessoa' && x.chave === soDig(p.cpf)));
  if (ja) { toast('Esta pessoa já está no banco central (' + ja.codigo + ').', 'info'); return ficha(ja.id); }
  formEnt('pessoa');
  setTimeout(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    set('iD_nome', p.nome); set('iD_alcunha', p.apelido); set('iD_cpf', p.cpf); set('iD_mae', p.mae); set('iD_nascimento', p.nascimento);
    set('iD_endereco', [p.endereco, p.quadra && 'Qd ' + p.quadra, p.bairro].filter(Boolean).join(', '));
    set('iLat', p.lat); set('iLng', p.lng); set('iFonte', 'Cadastro SICAD'); set('iSicadId', String(p.id));
  }, 50);
}
async function salvarEnt(tipo, id) {
  const dados = {};
  CAMPOS[tipo].forEach(([k]) => { const v = val('iD_' + k); if (v) dados[k] = v; });
  const obrig = CAMPOS[tipo].filter(c => c[1].endsWith('*')).find(c => !dados[c[0]]);
  if (obrig) return toast('Preencha: ' + obrig[1].replace(' *', ''), 'error');
  const fonte = val('iFonte'); if (!fonte) return toast('Informe a fonte da informação.', 'error');
  let chave = null;
  if (tipo === 'pessoa' && dados.cpf) { chave = soDig(dados.cpf); if (chave.length !== 11) return toast('CPF deve ter 11 dígitos.', 'error'); if (typeof validarCPF === 'function' && !validarCPF(dados.cpf)) return toast('CPF inválido.', 'error'); }
  if (tipo === 'veiculo') { dados.placa = dados.placa.toUpperCase().replace(/[^A-Z0-9]/g, ''); chave = dados.placa; }
  if (tipo === 'telefone') chave = soDig(dados.numero).length >= 8 ? soDig(dados.numero) : norm(dados.numero);
  if (tipo === 'ocorrencia') chave = norm(dados.numero_ocorrencia).replace(/\s+/g, '');
  const titulo = dados.nome || dados.placa || dados.numero || (dados.numero_ocorrencia ? dados.numero_ocorrencia + ' — ' + (dados.natureza_fato || '') : '');
  const lat = parseFloat(val('iLat')), lng = parseFloat(val('iLng'));
  const reg = { tipo, titulo, chave, dados, fonte, documento_ref: nul(val('iDocRef')), natureza: val('iNat') || 'documentado',
    conf_fonte: nul(val('iConfF')), conf_info: nul(val('iConfI')), observacoes: nul(val('iObs')),
    lat: isNaN(lat) ? null : lat, lng: isNaN(lng) ? null : lng, data_fato: nul(val('iDataFato')), sicad_pessoa_id: nul(val('iSicadId')) };
  if ((reg.lat == null) !== (reg.lng == null)) return toast('Informe latitude e longitude juntas.', 'error');
  // duplicidade (antes de bater no banco, mensagem amigável)
  if (chave) { const dup = S.ents.find(x => x.tipo === tipo && x.chave === chave && x.id !== id); if (dup) { toast('Já existe: ' + dup.codigo + ' — ' + dup.titulo + '. Abrindo o registro existente.', 'info'); return ficha(dup.id); } }
  const dosAdd = val('iDosAdd');
  showOv('SALVANDO...');
  try {
    let r;
    if (id) { r = (await req('PATCH', `int_entidades?id=eq.${id}`, reg))[0]; aud('editar_registro', 'int_entidades', id); }
    else { r = (await req('POST', 'int_entidades', reg))[0]; aud('cadastrar_registro', 'int_entidades', r.id, { tipo, codigo: r.codigo }); }
    if (!id && dosAdd) await req('POST', 'int_dossie_itens', { dossie_id: dosAdd, entidade_id: r.id });
    await carregar(true); fechar(); toast(`${id ? 'Registro atualizado' : 'Registro ' + r.codigo + ' criado'}.`, 'success');
    render(); ficha(r.id);
  } catch (err) { toast(err.message, 'error'); } finally { hideOv(); }
}

// ── Fotos (vêm do cadastro do SICAD; RLS do SICAD decide) ───────────────
S.fotos = {};
async function fotosSicad(lista) {
  const falta = lista.filter(x => x && x.sicad_pessoa_id && !(x.id in S.fotos));
  for (let i = 0; i < falta.length; i += 30) {
    const lote = falta.slice(i, i + 30);
    const ids = lote.map(x => '"' + String(x.sicad_pessoa_id).replace(/"/g, '') + '"').join(',');
    try {
      const r = await req('GET', 'sicad_pessoas?select=id,foto&id=in.(' + encodeURIComponent(ids) + ')');
      lote.forEach(x => { const p = r.find(z => String(z.id) === String(x.sicad_pessoa_id)); S.fotos[x.id] = (p && p.foto) || null; });
    } catch (_) { lote.forEach(x => { S.fotos[x.id] = null; }); }
  }
  lista.forEach(x => { if (x && !(x.id in S.fotos)) S.fotos[x.id] = null; });
}
function avatarSVG(nome, cor) {
  const ini = (nome || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="${cor || '#1E3A8A'}"/><text x="60" y="74" font-family="Arial" font-size="44" font-weight="700" fill="#fff" text-anchor="middle">${ini}</text></svg>`);
}
async function preencherFotoFicha(x) {
  const el = document.getElementById('iFotoP'); if (!el) return;
  await fotosSicad([x]);
  let src = S.fotos[x.id];
  if (!src) { // sem foto no SICAD: primeira imagem anexada ao registro
    const im = S.docs.find(d => d.entidade_id === x.id && /^image\//.test(d.mime || '') && d.classificacao !== 'sigiloso');
    if (im) { try { const { data } = await supabase.storage.from('int-docs').download(im.storage_path); if (data) src = URL.createObjectURL(data); } catch (_) {} }
  }
  if (!document.getElementById('iFotoP')) return;
  el.innerHTML = src ? `<img class="int-foto" src="${src}" alt="Foto" onclick="lbOpen(this.src)">` : `<div class="int-foto-vazia">Sem foto cadastrada${x.sicad_pessoa_id ? '' : '<br>(não vinculado ao SICAD)'}</div>`;
}
async function preencherGaleria(x) {
  const el = document.getElementById('iGaleria'); if (!el) return;
  const itens = [];
  if (x.sicad_pessoa_id) {
    try {
      const r = await req('GET', 'sicad_pessoas?select=foto,tatuagens&id=eq.' + encodeURIComponent(x.sicad_pessoa_id));
      const p = r[0] || {};
      if (p.foto) itens.push([p.foto, 'Foto do cadastro SICAD']);
      let t = p.tatuagens; try { t = typeof t === 'string' ? JSON.parse(t) : t; } catch (_) { t = []; }
      (Array.isArray(t) ? t : []).forEach((tt, i) => { const src = typeof tt === 'string' ? tt : tt && tt.img; if (src) itens.push([src, 'Tatuagem ' + (i + 1) + (tt && tt.local ? ' · ' + tt.local : '') + (tt && tt.desc ? ' · ' + tt.desc : '')]); });
    } catch (_) {}
  }
  for (const d of S.docs.filter(d => d.entidade_id === x.id && /^image\//.test(d.mime || ''))) {
    try { const { data } = await supabase.storage.from('int-docs').download(d.storage_path); if (data) itens.push([URL.createObjectURL(data), d.codigo + ' · ' + d.titulo]); } catch (_) {}
  }
  if (!document.getElementById('iGaleria')) return;
  el.className = itens.length ? 'int-galeria' : 'int-vazio';
  el.innerHTML = itens.length ? itens.map(([src, cap]) => `<figure><img src="${src}" alt="" onclick="lbOpen(this.src)"><figcaption>${e(cap)}</figcaption></figure>`).join('') : 'Nenhuma foto. Fotos vêm do cadastro do SICAD (foto e tatuagens) ou de imagens anexadas em Documentos.';
  aud('ver_fotos', 'int_entidades', x.id);
}

// ── Ficha do registro ───────────────────────────────────────────────────
async function ficha(id, aba) {
  const x = ent(id); if (!x) return toast('Registro não encontrado.', 'error');
  aud('consultar_registro', 'int_entidades', id);
  aba = aba || 'dados';
  const d = x.dados || {};
  const dos = dossiesDoEnt(id);
  const vin = S.vinculos.filter(v => v.origem_id === id || v.destino_id === id);
  const docs = S.docs.filter(dc => dc.entidade_id === id);
  let corpo = '';
  if (aba === 'dados') {
    corpo = `${x.tipo === 'pessoa' ? '<div class="int-ficha-top"><div id="iFotoP"><div class="int-foto-vazia">Carregando foto...</div></div>' : ''}<div class="int-dl">${CAMPOS[x.tipo].map(([k, lbl]) => d[k] ? `<div><small>${e(lbl.replace(' *', ''))}</small>${e(d[k])}</div>` : '').join('')}
      ${x.data_fato ? `<div><small>Data do fato</small>${dataBR(x.data_fato)}</div>` : ''}
      ${x.lat != null ? `<div><small>Coordenadas</small>${(+x.lat).toFixed(5)}, ${(+x.lng).toFixed(5)} · <a href="https://www.google.com/maps?q=${x.lat},${x.lng}" target="_blank" rel="noopener">abrir</a></div>` : ''}
      <div><small>Situação</small>${tagNat(x.natureza)}</div>
      <div><small>Fonte</small>${e(x.fonte)}</div>
      <div><small>Documento comprobatório</small>${e(x.documento_ref || '—')}</div>
      <div><small>Confiabilidade</small>${e(x.conf_fonte ? CONF_FONTE[x.conf_fonte] : 'Fonte não avaliada')}<br>${e(x.conf_info ? CONF_INFO[x.conf_info] : 'Informação não avaliada')}</div>
      <div><small>Cadastro</small>${dataHoraBR(x.criado_em)} · ${e(x.criado_por_nome || '—')}</div>
      ${x.atualizado_em ? `<div><small>Última alteração</small>${dataHoraBR(x.atualizado_em)}</div>` : ''}
      ${x.sicad_pessoa_id ? `<div><small>Cadastro SICAD</small><a href="#" onclick="INT.fechar();viewPerson('${e(x.sicad_pessoa_id)}');return false">abrir ficha no SICAD</a></div>` : ''}
      ${x.observacoes ? `<div style="grid-column:1/-1"><small>Observações</small>${e(x.observacoes)}</div>` : ''}</div>${x.tipo === 'pessoa' ? '</div>' : ''}`;
  } else if (aba === 'dossies') {
    corpo = `${pode('cadastrar') ? `<div class="int-busca"><select id="iAddDos">${opts(Object.fromEntries(S.dossies.filter(dd => !dos.includes(dd)).map(dd => [dd.id, dd.numero + ' — ' + dd.titulo])), '', 'Escolha o dossiê')}</select><input id="iAddPapel" placeholder="Papel no dossiê (opcional)"><button class="btn btn-primary btn-sm" onclick="INT.addAoDossie('${id}')">Incluir</button></div>` : ''}
      ${dos.length ? listaDossies(dos) : '<div class="int-vazio">Este registro ainda não está em nenhum dossiê.</div>'}`;
  } else if (aba === 'vinculos') {
    corpo = `${pode('cadastrar') ? `<button class="btn btn-primary btn-sm" style="margin-bottom:10px" onclick="INT.formVinculo('${id}')">${ICON('novo', { size: 15 })} Novo vínculo</button>` : ''}${tabelaVinculos(vin, id)}`;
  } else if (aba === 'docs') {
    corpo = `${pode('anexar') ? `<button class="btn btn-primary btn-sm" style="margin-bottom:10px" onclick="INT.formDoc({entidade_id:'${id}'})">${ICON('anexo', { size: 15 })} Anexar documento</button>` : ''}${tabelaDocs(docs)}`;
  } else if (aba === 'hist') {
    corpo = '<div id="iHist" class="int-vazio">Carregando histórico...</div>';
  } else if (aba === 'fotos') {
    corpo = '<div id="iGaleria" class="int-vazio">Carregando fotos...</div>';
  }
  modal(`<span class="int-cod">${e(x.codigo)}</span> ${e(x.titulo)}`, `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">${tipoTag(x.tipo)} ${tagNat(x.natureza)} <span class="int-tag">${dos.length} dossiê(s)</span> <span class="int-tag">${vin.length} vínculo(s)</span></div>
    <div class="int-tabs">${[['dados', 'Dados'], ...(x.tipo === 'pessoa' ? [['fotos', 'Fotos']] : []), ['dossies', 'Dossiês'], ['vinculos', 'Vínculos'], ['docs', 'Documentos'], ['hist', 'Histórico']].map(([k, r]) => `<button class="${aba === k ? 'on' : ''}" onclick="INT.ficha('${id}','${k}')">${r}</button>`).join('')}</div>
    ${corpo}
    <div class="row-btns" style="margin-top:14px;flex-wrap:wrap">
      ${pode('editar') ? `<button class="btn btn-outline" onclick="INT.formEnt('${x.tipo}','${id}')">${ICON('editar', { size: 15 })} Editar</button>` : ''}
      <button class="btn btn-outline" onclick="INT.fechar();INT.verRede('${id}')">${ICON('web', { size: 15 })} Ver na rede</button>
      ${x.lat != null ? `<button class="btn btn-outline" onclick="INT.fechar();INT.verMapa('${id}')">${ICON('mapa', { size: 15 })} Ver no mapa</button>` : ''}
      ${pode('editar') ? `<button class="btn btn-outline" style="color:var(--danger)" onclick="INT.arquivar('int_entidades','${id}')">Arquivar</button>` : ''}
    </div>`, true);
  if (aba === 'hist') carregarHistorico(id, 'iHist');
  if (aba === 'dados' && x.tipo === 'pessoa') preencherFotoFicha(x);
  if (aba === 'fotos') preencherGaleria(x);
}
async function carregarHistorico(id, alvo) {
  try {
    const h = await req('GET', `int_historico?registro_id=eq.${id}&order=em.desc&limit=100`);
    const el = document.getElementById(alvo); if (!el) return;
    el.className = '';
    el.innerHTML = h.length ? `<table class="int-tab"><thead><tr><th>Quando</th><th>Operação</th><th>Usuário</th><th class="hm">Campos alterados</th></tr></thead><tbody>${h.map(r => {
      let campos = '';
      if (r.antes && r.depois) campos = Object.keys(r.depois).filter(k => !['atualizado_em', 'atualizado_por'].includes(k) && JSON.stringify(r.antes[k]) !== JSON.stringify(r.depois[k])).join(', ');
      return `<tr><td style="white-space:nowrap">${dataHoraBR(r.em)}</td><td>${e({ INSERT: 'Cadastro', UPDATE: 'Alteração', ARQUIVAMENTO: 'Arquivamento', RESTAURACAO: 'Restauração' }[r.operacao] || r.operacao)}</td><td>${e(r.usuario_nome || '—')}</td><td class="hm" style="font-size:12px;color:var(--neutral-500)">${e(campos || (r.operacao === 'ARQUIVAMENTO' ? (r.depois && r.depois.excluido_motivo) : '') || '—')}</td></tr>`;
    }).join('')}</tbody></table>` : '<div class="int-vazio">Sem histórico.</div>';
  } catch (err) { const el = document.getElementById(alvo); if (el) el.textContent = err.message; }
}
async function addAoDossie(entId) {
  const dos = val('iAddDos'); if (!dos) return toast('Escolha o dossiê.', 'error');
  try { await req('POST', 'int_dossie_itens', { dossie_id: dos, entidade_id: entId, papel: nul(val('iAddPapel')) }); aud('incluir_no_dossie', 'int_dossies', dos, { entidade: entId }); await carregar(true); toast('Incluído no dossiê.', 'success'); ficha(entId, 'dossies'); render(); }
  catch (err) { toast(/duplicate/i.test(err.message) ? 'Já está neste dossiê.' : err.message, 'error'); }
}
async function arquivar(tabela, id, depois) {
  if (!exige('editar', 'arquivar registros')) return;
  const motivo = prompt('ARQUIVAR (o registro sai das listas, mas continua guardado e auditado).\n\nInforme o motivo (mínimo 10 caracteres):');
  if (motivo == null) return;
  if (motivo.trim().length < 10) return toast('Motivo muito curto (mínimo 10 caracteres).', 'error');
  showOv('ARQUIVANDO...');
  try { await req('PATCH', `${tabela}?id=eq.${id}`, { excluido_em: new Date().toISOString(), excluido_por: CU.id, excluido_motivo: motivo.trim() }); aud('arquivar', tabela, id, { motivo: motivo.trim() }); await carregar(true); fechar(); toast('Arquivado.', 'success'); if (depois) depois(); else render(); }
  catch (err) { toast(err.message, 'error'); } finally { hideOv(); }
}

// ── Vínculos ────────────────────────────────────────────────────────────
function tabelaVinculos(vin, refId) {
  if (!vin.length) return '<div class="int-vazio">Nenhum vínculo lançado.</div>';
  return `<div style="overflow-x:auto"><table class="int-tab"><thead><tr><th>Relação</th><th>Situação</th><th class="hm">Fonte</th><th class="hm">Data</th><th class="hm">Dossiê</th><th class="hm">Conf.</th><th class="hm">Lançado por</th></tr></thead><tbody>${vin.map(v => {
    const o = ent(v.origem_id), dd = ent(v.destino_id), dos = byId(S.dossies, v.dossie_id);
    const fmt = z => z ? `<a href="#" onclick="INT.ficha('${z.id}');return false">${e(z.titulo)}</a>` : '?';
    return `<tr><td>${fmt(o)} <span style="color:var(--neutral-500)">— ${e(v.tipo)} →</span> ${fmt(dd)}${v.observacoes ? `<div style="font-size:12px;color:var(--neutral-500)">${e(v.observacoes)}</div>` : ''}</td><td>${tagNat(v.situacao)}</td><td class="hm">${e(v.fonte)}</td><td class="hm">${dataBR(v.data_fato)}</td><td class="hm int-cod">${e(dos ? dos.numero : '—')}</td><td class="hm int-cod">${confTxt(v.conf_fonte, v.conf_info)}</td><td class="hm" style="font-size:12px">${e(v.criado_por_nome || '—')}<br>${dataBR(v.criado_em)}${pode('editar') ? ` · <a href="#" style="color:var(--danger)" onclick="INT.arquivar('int_vinculos','${v.id}');return false">arquivar</a>` : ''}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function formVinculo(origemId, dossieId) {
  if (!exige('cadastrar', 'lançar vínculos')) return;
  const o = origemId ? ent(origemId) : null;
  modal('Novo vínculo', `${listaEntidadesDatalist()}
    <div class="int-aviso">Lance somente relações com fonte. Use <b>Hipótese em análise</b> para o que ainda não foi confirmado — ela aparece pontilhada no diagrama e nunca é tratada como fato.</div>
    <div class="int-form">
      ${campo('Registro de origem *', `<input id="vO" list="intEntDL" value="${o ? e(o.codigo + ' — ' + o.titulo) : ''}" placeholder="Digite nome ou código">`, 'full')}
      ${campo('Tipo de vínculo *', `<select id="vTipo">${TIPOS_VINCULO.map(t => `<option>${t}</option>`).join('')}</select>`)}
      ${campo('Situação da relação *', `<select id="vSit">${opts(NATUREZA, 'informado')}</select>`)}
      ${campo('Registro de destino *', `<input id="vD" list="intEntDL" placeholder="Digite nome ou código">`, 'full')}
      ${campo('Fonte *', `<input id="vFonte" placeholder="Documento, relatório, informante...">`, 'full')}
      ${campo('Data', `<input id="vData" type="date">`)}
      ${campo('Dossiê relacionado', `<select id="vDos">${opts(Object.fromEntries(S.dossies.map(d => [d.id, d.numero + ' — ' + d.titulo])), dossieId || '', 'Nenhum')}</select>`)}
      ${campo('Confiabilidade da fonte', `<select id="vConfF">${opts(CONF_FONTE, '', 'Não avaliada')}</select>`)}
      ${campo('Credibilidade da informação', `<select id="vConfI">${opts(CONF_INFO, '', 'Não avaliada')}</select>`)}
      ${campo('Observações', `<textarea id="vObs"></textarea>`, 'full')}
    </div>
    <div class="row-btns" style="margin-top:12px"><button class="btn btn-outline" onclick="INT.fechar()">Cancelar</button><button class="btn btn-primary" onclick="INT.salvarVinculo()">Salvar vínculo</button></div>`, true);
}
async function salvarVinculo() {
  const o = entPorTexto(val('vO')), d = entPorTexto(val('vD'));
  if (!o || !d) return toast('Escolha origem e destino na lista (registros do banco central).', 'error');
  if (o.id === d.id) return toast('Origem e destino são o mesmo registro.', 'error');
  if (!val('vFonte')) return toast('Informe a fonte do vínculo.', 'error');
  const reg = { origem_id: o.id, destino_id: d.id, tipo: val('vTipo'), situacao: val('vSit'), fonte: val('vFonte'), data_fato: nul(val('vData')),
    dossie_id: nul(val('vDos')), conf_fonte: nul(val('vConfF')), conf_info: nul(val('vConfI')), observacoes: nul(val('vObs')) };
  showOv('SALVANDO...');
  try { const r = (await req('POST', 'int_vinculos', reg))[0]; aud('lancar_vinculo', 'int_vinculos', r.id, { origem: o.codigo, destino: d.codigo, situacao: reg.situacao }); await carregar(true); fechar(); toast('Vínculo lançado.', 'success'); render(); }
  catch (err) { toast(err.message, 'error'); } finally { hideOv(); }
}

// Diagrama de rede (vis-network)
let _rede = null, _redeFoco = null;
function dadosRede(filtroDossies, filtroSit, focoId) {
  let vin = S.vinculos.filter(v => !filtroSit || filtroSit.includes(v.situacao));
  if (filtroDossies && filtroDossies.length) {
    const ents = new Set(S.itens.filter(i => filtroDossies.includes(i.dossie_id)).map(i => i.entidade_id));
    vin = vin.filter(v => filtroDossies.includes(v.dossie_id) || (ents.has(v.origem_id) && ents.has(v.destino_id)));
    filtroDossies.forEach(dId => entsDoDossie(dId).forEach(x => ents.add(x.id)));
    var ids = ents;
  }
  if (focoId) { // vizinhança de 2 níveis
    const viz = new Set([focoId]);
    for (let k = 0; k < 2; k++) vin.forEach(v => { if (viz.has(v.origem_id) || viz.has(v.destino_id)) { viz.add(v.origem_id); viz.add(v.destino_id); } });
    vin = vin.filter(v => viz.has(v.origem_id) && viz.has(v.destino_id)); ids = viz;
  }
  const usados = ids ? new Set(ids) : new Set();
  vin.forEach(v => { usados.add(v.origem_id); usados.add(v.destino_id); });
  const nodes = [...usados].map(ent).filter(Boolean).map(x => {
    const nDos = dossiesDoEnt(x.id).length; const c = TIPOS[x.tipo];
    return { id: x.id, label: x.titulo.length > 28 ? x.titulo.slice(0, 26) + '…' : x.titulo, title: `${x.codigo} · ${c.rot}\n${x.titulo}\n${nDos} dossiê(s)${nDos > 1 ? ' — CONEXÃO COMPARTILHADA' : ''}`,
      shape: c.forma, color: { background: c.cor, border: nDos > 1 ? '#F59E0B' : c.cor, highlight: { background: c.cor, border: '#0F172A' } },
      borderWidth: nDos > 1 ? 4 : 1, size: x.id === focoId ? 22 : 15, font: { size: 12, color: '#0F172A', strokeWidth: 3, strokeColor: '#fff' },
      shapeProperties: { borderDashes: x.natureza === 'hipotese' ? [4, 3] : false } };
  });
  const edges = vin.map(v => ({ id: v.id, from: v.origem_id, to: v.destino_id, label: v.tipo, arrows: 'to',
    dashes: v.situacao === 'informado' ? [8, 6] : v.situacao === 'hipotese' ? [2, 5] : false,
    color: { color: v.situacao === 'hipotese' ? '#94A3B8' : '#334155' }, width: v.situacao === 'documentado' ? 2 : 1.4,
    font: { size: 10, color: '#475569', strokeWidth: 3, strokeColor: '#fff', align: 'middle' },
    title: `${v.tipo} — ${NATUREZA[v.situacao]}\nFonte: ${v.fonte}\nData: ${dataBR(v.data_fato)}\nLançado por: ${v.criado_por_nome || '—'}` }));
  return { nodes, edges };
}
function carregarVis() {
  if (window.vis && window.vis.Network) return Promise.resolve();
  return new Promise((ok, falha) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/vis-network/9.1.9/standalone/umd/vis-network.min.js'; s.onload = ok; s.onerror = () => falha(new Error('Não foi possível carregar o diagrama (sem internet?)')); document.head.appendChild(s); });
}
VIEWS.vinculos = () => {
  const f = S.filtros.rede || { dos: [], sit: ['documentado', 'informado', 'hipotese'] };
  S.filtros.rede = f;
  return cabecalho('Análise de vínculos', 'Relações lançadas com fonte. Bordas douradas = registro presente em mais de um dossiê (conexão compartilhada).',
      pode('cadastrar') ? `<button class="btn btn-primary btn-sm" onclick="INT.formVinculo()">${ICON('novo', { size: 15 })} Novo vínculo</button>` : '') +
    `<div class="int-aviso">O diagrama mostra apenas relações lançadas por analistas, com fonte. <b>Proximidade no gráfico ou ligação indireta não prova participação em organização criminosa</b> — toda conclusão exige análise e documentação.</div>
    <div class="int-card" style="padding:12px">
      <div class="int-chk" style="margin-bottom:10px">${S.dossies.map(d => `<label><input type="checkbox" ${f.dos.includes(d.id) ? 'checked' : ''} onchange="INT.redeDos('${d.id}',this.checked)"> ${e(d.numero)} — ${e(d.titulo)}</label>`).join('') || '<span style="color:var(--neutral-500)">Sem dossiês: mostrando todos os vínculos.</span>'}</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:13px">${Object.entries(NATUREZA).map(([k, v]) => `<label style="display:flex;gap:6px;align-items:center;text-transform:none;letter-spacing:0;font-size:13px;font-weight:500"><input type="checkbox" ${f.sit.includes(k) ? 'checked' : ''} onchange="INT.redeSit('${k}',this.checked)"> ${v}</label>`).join('')}</div>
    </div>
    <div id="intNet" class="int-net"></div>
    <div class="int-legenda">${Object.values(TIPOS).map(c => `<span><i style="width:10px;height:10px;border-radius:50%;background:${c.cor};display:inline-block"></i>${c.rot}</span>`).join('')}
      <span><i class="int-ln"></i>Documentado</span><span><i class="int-ln inf"></i>Informado</span><span><i class="int-ln hip"></i>Hipótese</span>
      <span><i style="width:12px;height:12px;border:3px solid #F59E0B;border-radius:50%;display:inline-block"></i>Em vários dossiês</span></div>
    <div id="intNetInfo" style="margin-top:12px"></div>`;
};
AFTER.vinculos = async () => {
  const el = document.getElementById('intNet'); if (!el) return;
  try { await carregarVis(); } catch (err) { el.innerHTML = `<div class="int-vazio">${e(err.message)}</div>`; return; }
  const f = S.filtros.rede;
  const { nodes, edges } = dadosRede(f.dos, f.sit, _redeFoco);
  if (!nodes.length) { el.innerHTML = '<div class="int-vazio" style="padding-top:120px">Nenhum vínculo para os filtros escolhidos.</div>'; return; }
  _rede = new vis.Network(el, { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) }, {
    physics: { solver: 'forceAtlas2Based', forceAtlas2Based: { gravitationalConstant: -60, springLength: 120 }, stabilization: { iterations: 250 } },
    interaction: { hover: true, tooltipDelay: 120, navigationButtons: false, keyboard: false }, nodes: { borderWidthSelected: 3 } });
  _rede.on('click', p => {
    const info = document.getElementById('intNetInfo');
    if (p.nodes.length) { const x = ent(p.nodes[0]); info.innerHTML = `<div class="int-card"><h3>${e(x.codigo)} · ${e(x.titulo)} <button class="btn btn-outline btn-sm" onclick="INT.ficha('${x.id}')">Abrir ficha</button></h3>${tabelaVinculos(S.vinculos.filter(v => v.origem_id === x.id || v.destino_id === x.id))}</div>`; }
    else if (p.edges.length) { info.innerHTML = `<div class="int-card"><h3>Vínculo</h3>${tabelaVinculos(S.vinculos.filter(v => v.id === p.edges[0]))}</div>`; }
  });
  aud('analise_vinculos', 'int_vinculos', null, { dossies: f.dos });
  _redeFoco = null;
};

// ── Organograma das organizações ────────────────────────────────────────
// Faccionado = marcado como faccionado no SICAD, ou lançado pelo analista como integrante da organização
function ehFaccionado(x, v) { return !!x && x.tipo === 'pessoa' && ((x.dados && (x.dados.faccionado_sicad === true || x.dados.faccionado === true)) || (v && v.tipo === 'Integrante de')); }
function membrosDe(orgId) {
  return S.vinculos.filter(v => v.destino_id === orgId && MEMBRO.includes(v.tipo) && ehFaccionado(ent(v.origem_id), v))
    .map(v => ({ v, x: ent(v.origem_id), nivel: v.nivel || FUNCOES[v.funcao] || 4 }));
}
function estruturaOrg(orgId) {
  const membros = membrosDe(orgId); const ids = new Set(membros.map(m => m.x.id));
  const sub = S.vinculos.filter(v => v.tipo === 'Subordinado a' && ids.has(v.origem_id) && ids.has(v.destino_id));
  const com = S.vinculos.filter(v => v.tipo === 'Comunica-se com' && ids.has(v.origem_id) && ids.has(v.destino_id));
  return { membros, sub, com };
}
const SIT_COR = { documentado: '#059669', informado: '#2563EB', hipotese: '#D97706' };
// Altura no desenho = posição na cadeia de comando (quem responde a quem), não o nível da função
function profundidades(est) {
  const sup = {}; est.sub.forEach(v => { sup[v.origem_id] = v.destino_id; });
  const prof = {};
  const calc = (id, visto = new Set()) => {
    if (prof[id]) return prof[id];
    if (!sup[id] || visto.has(id)) return (prof[id] = 1);
    visto.add(id); return (prof[id] = calc(sup[id], visto) + 1);
  };
  est.membros.forEach(m => calc(m.x.id));
  return prof;
}
function nodesOrg(org, est, fotos) {
  const prof = profundidades(est);
  const nodes = [{ id: org.id, level: 0, shape: 'box', label: org.titulo, margin: 12, color: { background: '#0F172A', border: '#0F172A' }, font: { color: '#fff', size: 15, bold: true }, title: org.codigo + ' · ' + (org.dados && org.dados.area_atuacao || 'Organização') }];
  est.membros.forEach(m => nodes.push({ id: m.x.id, level: prof[m.x.id] || 1, shape: 'circularImage', image: (fotos && fotos[m.x.id]) || avatarSVG(m.x.titulo, TIPOS.pessoa.cor), brokenImage: avatarSVG(m.x.titulo),
    label: m.x.titulo + '\n' + (m.v.funcao || 'Função não informada') + ' · N' + m.nivel, size: m.nivel <= 1 ? 34 : m.nivel === 2 ? 30 : 26,
    borderWidth: 4, color: { border: SIT_COR[m.v.situacao] || '#64748B', background: '#fff', highlight: { border: '#0F172A' } },
    shapeProperties: { borderDashes: m.v.situacao === 'hipotese' ? [6, 4] : false, useBorderWithImage: true },
    font: { size: 13, color: '#0F172A', strokeWidth: 4, strokeColor: '#fff', multi: false },
    title: m.x.codigo + ' · ' + m.x.titulo + '\nFunção: ' + (m.v.funcao || '—') + ' · nível ' + m.nivel + '\nSituação: ' + NATUREZA[m.v.situacao] + '\nFonte: ' + m.v.fonte }));
  return nodes;
}
function edgesOrg(org, est) {
  const comSuperior = new Set(est.sub.map(v => v.origem_id));
  const edges = est.sub.map(v => ({ id: v.id, from: v.destino_id, to: v.origem_id, arrows: 'to', width: 2, color: { color: '#334155' }, dashes: v.situacao === 'hipotese' ? [3, 5] : v.situacao === 'informado' ? [8, 5] : false, smooth: { type: 'cubicBezier', forceDirection: 'vertical', roundness: .4 }, title: 'Hierarquia: ' + NATUREZA[v.situacao] + ' · fonte: ' + v.fonte }));
  est.membros.filter(m => !comSuperior.has(m.x.id)).forEach(m => edges.push({ id: 'org_' + m.x.id, from: org.id, to: m.x.id, color: { color: '#CBD5E1' }, width: 1, smooth: { type: 'cubicBezier', forceDirection: 'vertical', roundness: .4 }, title: 'Integrante (superior não identificado)' }));
  est.com.forEach(v => edges.push({ id: v.id, from: v.origem_id, to: v.destino_id, color: { color: '#7C3AED' }, width: 2, dashes: [2, 6], arrows: { to: { enabled: true, scaleFactor: .5 }, from: { enabled: true, scaleFactor: .5 } }, smooth: { type: 'curvedCW', roundness: .25 }, label: v.observacoes ? v.observacoes.slice(0, 18) : '', font: { size: 9, color: '#6D28D9', strokeWidth: 3, strokeColor: '#fff' }, title: 'Comunica-se com · ' + NATUREZA[v.situacao] + '\nFonte: ' + v.fonte + (v.data_fato ? '\nData: ' + dataBR(v.data_fato) : '') + (v.observacoes ? '\n' + v.observacoes : '') }));
  return edges;
}
const OPC_ORG = { layout: { hierarchical: { direction: 'UD', sortMethod: 'directed', levelSeparation: 140, nodeSpacing: 190, treeSpacing: 200, parentCentralization: true } }, physics: false, interaction: { hover: true, tooltipDelay: 120 } };
let _org = null;
VIEWS.organograma = () => {
  const orgs = S.ents.filter(x => x.tipo === 'organizacao');
  if (!S.orgId || !ent(S.orgId)) { const comMembros = orgs.map(o => [o, membrosDe(o.id).length]).sort((a, b) => b[1] - a[1]); S.orgId = comMembros[0] ? comMembros[0][0].id : null; }
  const org = S.orgId ? ent(S.orgId) : null; const est = org ? estruturaOrg(org.id) : { membros: [], sub: [], com: [] };
  return cabecalho('Organograma', 'Estrutura da organização: função e nível de cada integrante, quem responde a quem e quem se comunica com quem',
      (org && pode('cadastrar') ? `<button class="btn btn-primary btn-sm" onclick="INT.formIntegrante('${org.id}')">${ICON('novo', { size: 15 })} Integrante / posição</button><button class="btn btn-outline btn-sm" onclick="INT.formComunicacao('${org.id}')">Lançar comunicação</button>` : '') +
      (pode('cadastrar') ? `<button class="btn btn-outline btn-sm" onclick="INT.formEnt('organizacao')">Nova organização</button>` : '')) +
    `<div class="int-aviso">Função, hierarquia e comunicação só entram com <b>fonte</b>. Cor da borda: <b style="color:#059669">verde</b> documentado · <b style="color:#2563EB">azul</b> informado · <b style="color:#D97706">laranja tracejado</b> hipótese. Integrantes vindos do campo "faccionado" do SICAD entram como <b>informado</b> até serem confirmados. <b>Só faccionados aparecem no organograma</b>; parentes, contatos e demais pessoas ligadas aparecem ao clicar no faccionado.</div>
    <div class="int-busca"><select onchange="INT.escolherOrg(this.value)">${orgs.map(o => `<option value="${o.id}" ${o.id === S.orgId ? 'selected' : ''}>${e(o.titulo)} (${membrosDe(o.id).length})</option>`).join('') || '<option>Nenhuma organização cadastrada</option>'}</select></div>
    ${org ? `<div class="int-kpis"><div class="int-kpi"><b>${est.membros.length}</b><span>Integrantes</span></div><div class="int-kpi"><b>${est.membros.filter(m => m.v.funcao).length}</b><span>Com função definida</span></div><div class="int-kpi"><b>${est.sub.length}</b><span>Ligações de hierarquia</span></div><div class="int-kpi"><b>${est.com.length}</b><span>Comunicações lançadas</span></div></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-bottom:8px"><button class="btn btn-outline btn-sm" onclick="INT.zoomOrg(-1)">−</button><button class="btn btn-outline btn-sm" onclick="INT.zoomOrg(0)">Ajustar à tela</button><button class="btn btn-outline btn-sm" onclick="INT.zoomOrg(1)">+</button></div>
    <div id="intOrg" class="oc-wrap"></div>
    <div class="int-legenda"><span><i class="int-ln"></i>Responde a (hierarquia)</span><span><i class="int-ln" style="border-top:2px dotted #7C3AED"></i>Comunica-se com</span><span><i style="width:14px;height:14px;border:2px solid #059669;border-radius:4px;display:inline-block"></i>Documentado</span><span><i style="width:14px;height:14px;border:2px solid #2563EB;border-radius:4px;display:inline-block"></i>Informado</span><span><i style="width:14px;height:14px;border:2px dashed #D97706;border-radius:4px;display:inline-block"></i>Hipótese</span></div>
    <div id="intOrgInfo" style="margin-top:12px"></div>` : '<div class="int-vazio">Cadastre uma organização em Organizações.</div>'}`;
};
// Layout hierárquico: faixa por nível (função) e a cadeia "responde a" sempre desce
const OC = { W: 190, H: 76, GX: 22, ROW: 132, LBL: 170, TOP: 92, PAD: 28 };
function layoutOrg(org, est) {
  const porId = {}; est.membros.forEach(m => { porId[m.x.id] = m; });
  const supDe = {}; est.sub.forEach(v => { if (porId[v.destino_id]) supDe[v.origem_id] = v.destino_id; });
  const niv = {};
  const calc = (id, visto) => {
    if (niv[id] !== undefined) return niv[id];
    visto = visto || new Set(); if (visto.has(id)) return null; visto.add(id);
    const m = porId[id]; let n = m.v.funcao && m.v.funcao !== 'Função não identificada' ? (m.v.nivel || FUNCOES[m.v.funcao] || 4) : null;
    if (supDe[id]) { const ns = calc(supDe[id], visto); if (typeof ns === 'number') n = Math.max(n || 0, ns + 1); }
    return (niv[id] = n == null ? 'sem' : Math.min(n, 9));
  };
  est.membros.forEach(m => calc(m.x.id));
  const chaves = [...new Set(Object.values(niv))].sort((a, b) => (a === 'sem') - (b === 'sem') || a - b);
  // Árvore: cada subordinado ganha sua coluna embaixo do superior; o superior fica centralizado sobre a equipe
  const filhos = {}; const raizes = [];
  est.membros.forEach(m => {
    const s = supDe[m.x.id];
    if (niv[m.x.id] !== 'sem' && s && niv[s] !== 'sem' && niv[s] < niv[m.x.id]) (filhos[s] = filhos[s] || []).push(m.x.id);
    else if (niv[m.x.id] !== 'sem') raizes.push(m.x.id);
  });
  const ordem = (a, b) => niv[a] - niv[b] || porId[a].x.titulo.localeCompare(porId[b].x.titulo);
  raizes.sort(ordem); Object.values(filhos).forEach(l => l.sort(ordem));
  const col = {}; let slot = 0;
  const posiciona = id => { const k = filhos[id] || []; if (!k.length) { col[id] = slot++; return; } k.forEach(posiciona); col[id] = (col[k[0]] + col[k[k.length - 1]]) / 2; };
  raizes.forEach(posiciona);
  const semPos = est.membros.filter(m => niv[m.x.id] === 'sem').map(m => m.x.id).sort((a, b) => porId[a].x.titulo.localeCompare(porId[b].x.titulo));
  const larg = n => n * OC.W + Math.max(0, n - 1) * OC.GX;
  const PORLINHA = 6, linhasSem = Math.ceil(semPos.length / PORLINHA);
  const W = Math.max(OC.LBL + Math.max(larg(slot), larg(Math.min(semPos.length, PORLINHA))) + OC.PAD * 2, 640);
  const area = W - OC.LBL - OC.PAD * 2;
  const xArvore = OC.LBL + OC.PAD + (area - larg(slot)) / 2;
  const pos = {}; const rows = [];
  chaves.forEach((k, i) => {
    const y = OC.TOP + i * OC.ROW;
    rows.push({ k, y, h: k === 'sem' ? OC.ROW + (linhasSem - 1) * (OC.H + 18) : OC.ROW, rot: k === 'sem' ? 'SEM POSIÇÃO DEFINIDA' : (NIVEIS[k] || 'Nível ' + k).replace(/^\d+ — /, 'N' + k + ' · ').toUpperCase() });
    if (k === 'sem') semPos.forEach((id, j) => { const li = Math.floor(j / PORLINHA), naLinha = Math.min(PORLINHA, semPos.length - li * PORLINHA), x0 = OC.LBL + OC.PAD + (area - larg(naLinha)) / 2; pos[id] = { x: x0 + (j % PORLINHA) * (OC.W + OC.GX), y: y + li * (OC.H + 18) }; });
    else est.membros.filter(m => niv[m.x.id] === k).forEach(m => { pos[m.x.id] = { x: xArvore + col[m.x.id] * (OC.W + OC.GX), y }; });
  });
  const ult = rows[rows.length - 1];
  return { pos, rows, W, H: ult ? ult.y - 22 + ult.h + 6 : OC.TOP + 40, supDe, niv, porId };
}
function caminhoHier(a, b) { const x1 = a.x + OC.W / 2, y1 = a.y + OC.H, x2 = b.x + OC.W / 2, y2 = b.y, ym = y1 + Math.min(28, (y2 - y1) / 2); return `M${x1},${y1} V${ym} H${x2} V${y2}`; }
function caminhoCom(a, b) {
  const ax = a.x + OC.W / 2, ay = a.y + OC.H / 2, bx = b.x + OC.W / 2, by = b.y + OC.H / 2;
  const mx = (ax + bx) / 2, my = (ay + by) / 2 - (Math.abs(ax - bx) < 10 ? 0 : 46); const dx = Math.abs(ay - by) < 10 ? 0 : 70;
  return { d: `M${ax},${ay} Q${mx + dx},${my} ${bx},${by}`, lx: (ax + 2 * (mx + dx) + bx) / 4, ly: (ay + 2 * my + by) / 4 };
}
const DASH = { documentado: '', informado: '7 5', hipotese: '2 5' };
function htmlOrg(org, est, L) {
  const linhas = [], cards = [];
  L.rows.forEach((r, i) => linhas.push(`<rect x="0" y="${r.y - 22}" width="${L.W}" height="${r.h}" fill="${i % 2 ? '#FFFFFF' : '#F8FAFC'}"/><text x="14" y="${r.y + OC.H / 2 + 4}" font-size="11" font-weight="700" letter-spacing="1" fill="${r.k === 'sem' ? '#B45309' : '#64748B'}">${e(r.rot)}</text>`));
  // título da organização
  const tx = OC.LBL + (L.W - OC.LBL) / 2;
  linhas.push(`<rect x="${tx - 150}" y="18" width="300" height="38" rx="8" fill="#0F172A"/><text x="${tx}" y="42" font-size="14" font-weight="800" fill="#fff" text-anchor="middle">${e(org.titulo.length > 38 ? org.titulo.slice(0, 36) + '…' : org.titulo)}</text>`);
  const topo = L.rows.find(r => r.k !== 'sem');
  est.membros.forEach(m => { const p = L.pos[m.x.id]; if (topo && L.niv[m.x.id] === topo.k && !L.supDe[m.x.id]) linhas.push(`<path d="M${tx},56 V${(56 + p.y) / 2} H${p.x + OC.W / 2} V${p.y}" fill="none" stroke="#CBD5E1" stroke-width="1.5"/>`); });
  est.sub.forEach(v => { const a = L.pos[v.destino_id], b = L.pos[v.origem_id]; if (a && b) linhas.push(`<path d="${caminhoHier(a, b)}" fill="none" stroke="#334155" stroke-width="2" stroke-dasharray="${DASH[v.situacao] || ''}"/>`); });
  est.com.forEach(v => { const a = L.pos[v.origem_id], b = L.pos[v.destino_id]; if (!a || !b) return; const c = caminhoCom(a, b); linhas.push(`<path d="${c.d}" fill="none" stroke="#7C3AED" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round"><title>${e('Comunica-se com · ' + NATUREZA[v.situacao] + ' · fonte: ' + v.fonte)}</title></path>${v.observacoes ? `<text x="${c.lx}" y="${c.ly}" font-size="10" fill="#6D28D9" text-anchor="middle" paint-order="stroke" stroke="#fff" stroke-width="3">${e(v.observacoes)}</text>` : ''}`); });
  est.membros.forEach(m => {
    const p = L.pos[m.x.id]; const foto = S.fotos[m.x.id] || avatarSVG(m.x.titulo, TIPOS.pessoa.cor);
    cards.push(`<div class="oc-card ${m.v.situacao}" style="left:${p.x}px;top:${p.y}px;border-color:${SIT_COR[m.v.situacao] || '#94A3B8'}" onclick="INT.infoInt('${org.id}','${m.x.id}')" title="${e(m.x.codigo + ' · ' + NATUREZA[m.v.situacao] + ' · fonte: ' + m.v.fonte)}"><img src="${foto}" alt=""><div><b>${e(m.x.titulo)}</b><small>${e(m.v.funcao || 'Função não informada')}</small><span>${e(m.x.codigo)}${m.v.nivel || FUNCOES[m.v.funcao] ? ' · N' + (m.v.nivel || FUNCOES[m.v.funcao]) : ''}</span></div></div>`);
  });
  return `<div class="oc-in" style="width:${L.W}px;height:${L.H}px"><svg width="${L.W}" height="${L.H}" style="position:absolute;inset:0">${linhas.join('')}</svg>${cards.join('')}</div>`;
}
let _ocZoom = null;
function aplicarZoomOrg() {
  const w = document.getElementById('intOrg'); const inn = w && w.querySelector('.oc-in'); if (!inn) return;
  if (_ocZoom == null) { const ajuste = (w.clientWidth - 4) / parseFloat(inn.style.width); _ocZoom = Math.max(.45, Math.min(1, ajuste)); }
  inn.style.zoom = _ocZoom;
}
AFTER.organograma = async () => {
  const el = document.getElementById('intOrg'); const org = S.orgId && ent(S.orgId); if (!el || !org) return;
  if (S._ocOrg !== org.id) { _ocZoom = null; S._ocOrg = org.id; }
  const est = estruturaOrg(org.id);
  if (!est.membros.length) { el.innerHTML = '<div class="int-vazio" style="padding:60px 10px">Nenhum integrante lançado. Use "Integrante / posição".</div>'; return; }
  const desenhar = () => { const w = document.getElementById('intOrg'); if (!w) return; w.innerHTML = htmlOrg(org, est, layoutOrg(org, est)); aplicarZoomOrg(); };
  desenhar();
  await fotosSicad(est.membros.map(m => m.x)); desenhar();
  aud('consultar_organograma', 'int_entidades', org.id);
};
function relacionadosHtml(orgId, pid, est) {
  const noOrg = new Set(est.membros.map(m => m.x.id)); noOrg.add(orgId);
  const rel = S.vinculos.filter(v => (v.origem_id === pid || v.destino_id === pid))
    .map(v => ({ v, o: ent(v.origem_id === pid ? v.destino_id : v.origem_id) }))
    .filter(r => r.o && !noOrg.has(r.o.id) && !(MEMBRO.includes(r.v.tipo) && r.o.tipo === 'organizacao'));
  if (!rel.length) return '<div style="margin-top:12px;font-size:12.5px;color:var(--neutral-500)">Nenhuma pessoa ou registro relacionado a este faccionado.</div>';
  const pessoas = rel.filter(r => r.o.tipo === 'pessoa'), outros = rel.filter(r => r.o.tipo !== 'pessoa');
  const linha = r => `<div class="int-item" onclick="INT.ficha('${r.o.id}')" style="align-items:center">${r.o.tipo === 'pessoa' ? `<img src="${S.fotos[r.o.id] || avatarSVG(r.o.titulo, '#64748B')}" style="width:38px;height:42px;border-radius:7px;object-fit:cover;flex-shrink:0">` : `<div style="color:${TIPOS[r.o.tipo].cor}">${ICON(TIPOS[r.o.tipo].ico, { size: 18 })}</div>`}<div class="m"><b>${e(r.o.titulo)}</b><small>${e(r.v.tipo)} · ${e(NATUREZA[r.v.situacao])} · fonte: ${e(r.v.fonte)}${r.o.tipo === 'pessoa' && !ehFaccionado(r.o) ? ' · não faccionado' : ''}</small></div></div>`;
  return `<div style="margin-top:14px"><div style="font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--neutral-500);margin-bottom:6px">Relacionadas a este faccionado (${rel.length})</div>
    <div class="int-lista">${pessoas.map(linha).join('')}${outros.map(linha).join('')}</div></div>`;
}
async function carregarFotosRelacionados(orgId, pid) {
  const est = estruturaOrg(orgId); const noOrg = new Set(est.membros.map(m => m.x.id));
  const pes = S.vinculos.filter(v => v.origem_id === pid || v.destino_id === pid).map(v => ent(v.origem_id === pid ? v.destino_id : v.origem_id)).filter(o => o && o.tipo === 'pessoa' && !noOrg.has(o.id) && !(o.id in S.fotos));
  if (!pes.length) return;
  await fotosSicad(pes);
  const el = document.getElementById('intOrgInfo'); if (el && el.dataset.pid === pid) infoIntegrante(orgId, pid, true);
}
function infoIntegrante(orgId, pid, semRecarga) {
  const est = estruturaOrg(orgId); const m = est.membros.find(z => z.x.id === pid); if (!m) return;
  const sup = est.sub.filter(v => v.origem_id === pid).map(v => ent(v.destino_id)).filter(Boolean);
  const subs = est.sub.filter(v => v.destino_id === pid).map(v => ent(v.origem_id)).filter(Boolean);
  const com = est.com.filter(v => v.origem_id === pid || v.destino_id === pid);
  const el = document.getElementById('intOrgInfo'); if (!el) return;
  el.dataset.pid = pid;
  const foto = S.fotos[pid];
  el.innerHTML = `<div class="int-card"><div class="int-ficha-top">${foto ? `<img class="int-foto" style="width:96px;height:116px" src="${foto}" onclick="lbOpen(this.src)">` : ''}<div>
    <h3 style="justify-content:flex-start;gap:10px">${e(m.x.titulo)} <span class="int-cod">${e(m.x.codigo)}</span></h3>
    <div class="int-dl"><div><small>Função</small>${e(m.v.funcao || 'Não informada')}</div><div><small>Nível</small>${e(NIVEIS[m.nivel] || m.nivel)}</div>
    <div><small>Situação</small>${tagNat(m.v.situacao)}</div><div><small>Fonte</small>${e(m.v.fonte)}</div>
    <div><small>Responde a</small>${sup.map(s => e(s.titulo)).join(', ') || '—'}</div><div><small>Subordinados</small>${subs.map(s => e(s.titulo)).join(', ') || '—'}</div>
    <div style="grid-column:1/-1"><small>Comunica-se com</small>${com.map(v => { const o = ent(v.origem_id === pid ? v.destino_id : v.origem_id); return e(o ? o.titulo : '?') + ' <span style="color:var(--neutral-500)">(' + e(NATUREZA[v.situacao]) + (v.observacoes ? ' · ' + e(v.observacoes) : '') + ')</span>'; }).join('<br>') || '—'}</div></div>
    ${relacionadosHtml(orgId, pid, est)}
    <div class="row-btns" style="margin-top:12px;flex-wrap:wrap">${pode('cadastrar') ? `<button class="btn btn-outline btn-sm" onclick="INT.formVinculo('${pid}')">Relacionar pessoa</button>` : ''}${pode('editar') || pode('cadastrar') ? `<button class="btn btn-primary btn-sm" onclick="INT.formIntegrante('${orgId}','${pid}')">Editar posição</button>` : ''}${pode('cadastrar') ? `<button class="btn btn-outline btn-sm" onclick="INT.formComunicacao('${orgId}','${pid}')">Lançar comunicação</button>` : ''}<button class="btn btn-outline btn-sm" onclick="INT.ficha('${pid}')">Ficha completa</button></div>
  </div></div></div>`;
  if (!semRecarga) { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); carregarFotosRelacionados(orgId, pid); }
}
function formIntegrante(orgId, pid) {
  if (!exige(pid ? 'editar' : 'cadastrar', pid ? 'editar posição' : 'lançar integrante')) return;
  const org = ent(orgId); const est = estruturaOrg(orgId); const m = pid ? est.membros.find(z => z.x.id === pid) : null;
  const supAtual = pid ? (est.sub.find(v => v.origem_id === pid) || {}).destino_id : '';
  const pessoas = S.ents.filter(x => x.tipo === 'pessoa');
  modal(`${m ? 'Posição de ' + e(m.x.titulo) : 'Integrante'} · ${e(org.titulo)}`, `
    <datalist id="intPesDL">${pessoas.map(x => `<option value="${e(x.codigo)} — ${e(x.titulo)}">`).join('')}</datalist>
    <div class="int-form">
      ${campo('Pessoa *', `<input id="oPes" list="intPesDL" value="${m ? e(m.x.codigo + ' — ' + m.x.titulo) : ''}" ${m ? 'disabled' : ''} placeholder="Digite nome ou código (pessoa do banco central)">`, 'full')}
      ${campo('Função na estrutura *', `<select id="oFun" onchange="INT.nivelDaFuncao(this.value)">${Object.keys(FUNCOES).map(k => `<option ${m && m.v.funcao === k ? 'selected' : ''}>${k}</option>`).join('')}</select>`)}
      ${campo('Nível', `<select id="oNiv">${opts(NIVEIS, String(m ? m.nivel : 4))}</select>`)}
      ${campo('Responde a (superior)', `<select id="oSup"><option value="">Não identificado</option>${est.membros.filter(z => z.x.id !== pid).map(z => `<option value="${z.x.id}" ${z.x.id === supAtual ? 'selected' : ''}>${e(z.x.titulo)}${z.v.funcao ? ' — ' + e(z.v.funcao) : ''}</option>`).join('')}</select>`)}
      ${campo('Situação *', `<select id="oSit">${opts(NATUREZA, m ? m.v.situacao : 'informado')}</select>`)}
      ${campo('Fonte *', `<input id="oFonte" value="${m && m.v.fonte !== 'Cadastro SICAD (marcado como faccionado)' ? e(m.v.fonte) : ''}" placeholder="Relatório, interceptação autorizada, depoimento...">`, 'full')}
      ${campo('Data', `<input id="oData" type="date" value="${e(m && m.v.data_fato)}">`)}
      ${campo('Confiabilidade', `<select id="oConf">${opts(CONF_FONTE, m && m.v.conf_fonte, 'Não avaliada')}</select>`)}
      ${campo('Observações', `<textarea id="oObs">${e(m && m.v.observacoes)}</textarea>`, 'full')}
    </div>
    <div class="row-btns" style="margin-top:12px"><button class="btn btn-outline" onclick="INT.fechar()">Cancelar</button><button class="btn btn-primary" onclick="INT.salvarIntegrante('${orgId}','${pid || ''}')">Salvar</button></div>`, true);
}
async function salvarIntegrante(orgId, pid) {
  const x = pid ? ent(pid) : (S.ents.find(z => z.tipo === 'pessoa' && z.codigo === val('oPes').split(' — ')[0].trim()));
  if (!x) return toast('Escolha uma pessoa do banco central (cadastre antes em Pessoas, se preciso).', 'error');
  const fonte = val('oFonte'); if (!fonte) return toast('Informe a fonte da posição na estrutura.', 'error');
  const est = estruturaOrg(orgId); const m = est.membros.find(z => z.x.id === x.id);
  const dadosV = { funcao: val('oFun'), nivel: +val('oNiv') || null, situacao: val('oSit'), fonte, data_fato: nul(val('oData')), conf_fonte: nul(val('oConf')), observacoes: nul(val('oObs')) };
  const sup = val('oSup');
  showOv('SALVANDO...');
  try {
    if (m) {
      if (!pode('editar')) throw new Error('Sem permissão para editar posição.');
      await req('PATCH', `int_vinculos?id=eq.${m.v.id}`, dadosV);
    } else {
      await req('POST', 'int_vinculos', Object.assign({ origem_id: x.id, destino_id: orgId, tipo: 'Integrante de' }, dadosV));
    }
    // hierarquia: arquiva superior antigo e lança o novo
    const atual = est.sub.find(v => v.origem_id === x.id);
    if (atual && atual.destino_id !== sup && pode('editar')) await req('PATCH', `int_vinculos?id=eq.${atual.id}`, { excluido_em: new Date().toISOString(), excluido_por: CU.id, excluido_motivo: 'Superior alterado no organograma' });
    if (sup && (!atual || atual.destino_id !== sup)) await req('POST', 'int_vinculos', { origem_id: x.id, destino_id: sup, tipo: 'Subordinado a', situacao: dadosV.situacao, fonte, data_fato: dadosV.data_fato, conf_fonte: dadosV.conf_fonte });
    aud('organograma_posicao', 'int_vinculos', x.id, { org: orgId, funcao: dadosV.funcao, nivel: dadosV.nivel, superior: sup || null });
    await carregar(true); fechar(); toast('Posição salva.', 'success'); S.view = 'organograma'; S.orgId = orgId; render();
  } catch (err) { toast(/funcao|nivel/.test(err.message) ? 'Rode a migration v16 para habilitar função e nível.' : err.message, 'error'); } finally { hideOv(); }
}
function formComunicacao(orgId, pid) {
  if (!exige('cadastrar', 'lançar comunicação')) return;
  const est = estruturaOrg(orgId);
  const op = sel => est.membros.map(z => `<option value="${z.x.id}" ${z.x.id === sel ? 'selected' : ''}>${e(z.x.titulo)}${z.v.funcao ? ' — ' + e(z.v.funcao) : ''}</option>`).join('');
  modal('Lançar comunicação entre integrantes', `<div class="int-form">
      ${campo('Integrante A *', `<select id="cA">${op(pid)}</select>`)}${campo('Integrante B *', `<select id="cB">${op('')}</select>`)}
      ${campo('Meio', `<select id="cMeio"><option>Telefone</option><option>WhatsApp / aplicativo</option><option>Presencial</option><option>Por intermediário</option><option>Carta / bilhete</option><option>Não identificado</option></select>`)}
      ${campo('Situação *', `<select id="cSit">${opts(NATUREZA, 'informado')}</select>`)}
      ${campo('Fonte *', `<input id="cFonte" placeholder="Ex.: interceptação autorizada proc. nº ..., relatório ...">`, 'full')}
      ${campo('Data', `<input id="cData" type="date">`)}${campo('Confiabilidade', `<select id="cConf">${opts(CONF_FONTE, '', 'Não avaliada')}</select>`)}
    </div><div class="row-btns" style="margin-top:12px"><button class="btn btn-outline" onclick="INT.fechar()">Cancelar</button><button class="btn btn-primary" onclick="INT.salvarComunicacao('${orgId}')">Salvar</button></div>`, true);
}
async function salvarComunicacao(orgId) {
  const a = val('cA'), b = val('cB'); if (!a || !b || a === b) return toast('Escolha dois integrantes diferentes.', 'error');
  const fonte = val('cFonte'); if (!fonte) return toast('Informe a fonte.', 'error');
  showOv('SALVANDO...');
  try { await req('POST', 'int_vinculos', { origem_id: a, destino_id: b, tipo: 'Comunica-se com', situacao: val('cSit'), fonte, data_fato: nul(val('cData')), conf_fonte: nul(val('cConf')), observacoes: val('cMeio') });
    aud('organograma_comunicacao', 'int_vinculos', null, { org: orgId, a, b }); await carregar(true); fechar(); toast('Comunicação lançada.', 'success'); S.view = 'organograma'; S.orgId = orgId; render(); }
  catch (err) { toast(err.message, 'error'); } finally { hideOv(); }
}
async function imagemOrg(orgId) {
  const org = ent(orgId); const est = estruturaOrg(orgId); if (!org || !est.membros.length) return null;
  await fotosSicad(est.membros.map(m => m.x));
  const L = layoutOrg(org, est); const K = 2;
  const cv = document.createElement('canvas'); cv.width = L.W * K; cv.height = L.H * K; const g = cv.getContext('2d'); g.scale(K, K);
  g.fillStyle = '#fff'; g.fillRect(0, 0, L.W, L.H);
  L.rows.forEach((r, i) => { g.fillStyle = i % 2 ? '#FFFFFF' : '#F8FAFC'; g.fillRect(0, r.y - 22, L.W, r.h); g.fillStyle = r.k === 'sem' ? '#B45309' : '#64748B'; g.font = 'bold 11px Arial'; g.fillText(r.rot, 14, r.y + OC.H / 2 + 4); });
  const tx = OC.LBL + (L.W - OC.LBL) / 2;
  g.fillStyle = '#0F172A'; g.fillRect(tx - 150, 18, 300, 38); g.fillStyle = '#fff'; g.font = 'bold 14px Arial'; g.textAlign = 'center'; g.fillText(org.titulo.slice(0, 40), tx, 42); g.textAlign = 'left';
  const traco = (d, cor, larg, dash) => { g.save(); g.strokeStyle = cor; g.lineWidth = larg; g.setLineDash(dash ? dash.split(' ').map(Number) : []); g.lineCap = 'round'; g.stroke(new Path2D(d)); g.restore(); };
  const topo = L.rows.find(r => r.k !== 'sem');
  est.membros.forEach(m => { const p = L.pos[m.x.id]; if (topo && L.niv[m.x.id] === topo.k && !L.supDe[m.x.id]) traco(`M${tx},56 V${(56 + p.y) / 2} H${p.x + OC.W / 2} V${p.y}`, '#CBD5E1', 1.5); });
  est.sub.forEach(v => { const a = L.pos[v.destino_id], b = L.pos[v.origem_id]; if (a && b) traco(caminhoHier(a, b), '#334155', 2, DASH[v.situacao]); });
  est.com.forEach(v => { const a = L.pos[v.origem_id], b = L.pos[v.destino_id]; if (!a || !b) return; const c = caminhoCom(a, b); traco(c.d, '#7C3AED', 2, '2 5'); if (v.observacoes) { g.font = '10px Arial'; g.fillStyle = '#6D28D9'; g.textAlign = 'center'; g.fillText(v.observacoes, c.lx, c.ly); g.textAlign = 'left'; } });
  const carregaImg = src => new Promise(ok => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });
  for (const m of est.membros) {
    const p = L.pos[m.x.id]; const cor = SIT_COR[m.v.situacao] || '#94A3B8';
    g.save(); g.fillStyle = '#fff'; g.strokeStyle = cor; g.lineWidth = 2; g.setLineDash(m.v.situacao === 'hipotese' ? [5, 4] : []);
    g.beginPath(); g.roundRect ? g.roundRect(p.x, p.y, OC.W, OC.H, 10) : g.rect(p.x, p.y, OC.W, OC.H); g.fill(); g.stroke(); g.restore();
    const im = await carregaImg(S.fotos[m.x.id] || avatarSVG(m.x.titulo, TIPOS.pessoa.cor));
    if (im) { g.save(); g.beginPath(); g.rect(p.x + 8, p.y + 10, 52, 56); g.clip(); const r = Math.max(52 / im.width, 56 / im.height); g.drawImage(im, p.x + 8 + (52 - im.width * r) / 2, p.y + 10 + (56 - im.height * r) / 2, im.width * r, im.height * r); g.restore(); }
    g.fillStyle = '#0F172A'; g.font = 'bold 11.5px Arial'; let t = m.x.titulo; while (g.measureText(t).width > OC.W - 76 && t.length > 4) t = t.slice(0, -1); g.fillText(t === m.x.titulo ? t : t + '…', p.x + 68, p.y + 28);
    g.fillStyle = '#334155'; g.font = '10.5px Arial'; let f = m.v.funcao || 'Função não informada'; while (g.measureText(f).width > OC.W - 76 && f.length > 4) f = f.slice(0, -1); g.fillText(f, p.x + 68, p.y + 44);
    g.fillStyle = '#94A3B8'; g.font = '9.5px Arial'; g.fillText(m.x.codigo + ((m.v.nivel || FUNCOES[m.v.funcao]) ? ' · N' + (m.v.nivel || FUNCOES[m.v.funcao]) : ''), p.x + 68, p.y + 59);
  }
  return { url: cv.toDataURL('image/jpeg', .92), w: cv.width, h: cv.height };
}

// ── Mapa ────────────────────────────────────────────────────────────────
let _mapa = null, _mapaFoco = null;
VIEWS.mapa = () => {
  const f = S.filtros.mapa || (S.filtros.mapa = { de: '', ate: '' });
  return cabecalho('Mapeamento geográfico', 'Camadas por dossiê. Ponto cheio = fato documentado · contorno tracejado = hipótese em análise. Toque no mapa para cadastrar uma localidade.') +
    `<div class="int-busca"><label style="display:flex;align-items:center;gap:6px;font-size:12px;text-transform:none;letter-spacing:0">De <input type="date" value="${e(f.de)}" onchange="INT.setFiltro('mapa','de',this.value,true)"></label><label style="display:flex;align-items:center;gap:6px;font-size:12px;text-transform:none;letter-spacing:0">Até <input type="date" value="${e(f.ate)}" onchange="INT.setFiltro('mapa','ate',this.value,true)"></label></div>
    <div id="intMapa" class="int-map"></div>
    <div class="int-legenda"><span><i style="width:12px;height:12px;border-radius:50%;background:#1E3A8A;display:inline-block"></i>Documentado</span><span><i style="width:12px;height:12px;border-radius:50%;background:#1E3A8A;opacity:.45;display:inline-block"></i>Informado</span><span><i style="width:12px;height:12px;border-radius:50%;border:2px dashed #B45309;display:inline-block"></i>Hipótese</span></div>`;
};
function marcador(x) {
  const c = TIPOS[x.tipo].cor;
  const m = x.natureza === 'hipotese'
    ? L.circleMarker([x.lat, x.lng], { radius: 11, color: '#B45309', weight: 2, dashArray: '4,4', fillColor: '#FDE68A', fillOpacity: .35 })
    : L.circleMarker([x.lat, x.lng], { radius: 8, color: '#fff', weight: 2, fillColor: c, fillOpacity: x.natureza === 'informado' ? .45 : .95 });
  const dos = dossiesDoEnt(x.id).map(d => d.numero).join(', ');
  const docs = S.docs.filter(d => d.entidade_id === x.id).length;
  m.bindPopup(`<div style="min-width:200px;font-family:var(--font-sans)"><div class="int-cod">${e(x.codigo)} · ${e(TIPOS[x.tipo].rot)}</div><b>${e(x.titulo)}</b><div style="font-size:12px;margin:4px 0">${NATUREZA[x.natureza]} · ${x.data_fato ? dataBR(x.data_fato) : dataBR(x.criado_em)}</div><div style="font-size:12px;color:#64748b">Dossiês: ${e(dos || '—')} · ${docs} doc(s)</div><button class="btn btn-primary btn-sm" style="margin-top:8px;width:100%" onclick="INT.ficha('${x.id}')">Abrir ficha</button></div>`);
  return m;
}
AFTER.mapa = () => {
  const el = document.getElementById('intMapa'); if (!el) return;
  if (_mapa) { _mapa.remove(); _mapa = null; }
  _mapa = L.map(el, { center: [-15.6760, -48.1870], zoom: 13 });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(_mapa);
  const f = S.filtros.mapa;
  const dataRef = x => (x.data_fato || (x.criado_em || '').slice(0, 10));
  const geo = S.ents.filter(x => x.lat != null && x.lng != null && (!f.de || dataRef(x) >= f.de) && (!f.ate || dataRef(x) <= f.ate));
  const camadas = {}; const todos = [];
  S.dossies.forEach(d => {
    const ids = new Set(entsDoDossie(d.id).map(x => x.id));
    const g = L.layerGroup(geo.filter(x => ids.has(x.id)).map(marcador));
    camadas[`${e(d.numero)} — ${e(d.titulo)}`] = g; g.addTo(_mapa);
  });
  const semDos = L.layerGroup(geo.filter(x => !dossiesDoEnt(x.id).length).map(marcador)); semDos.addTo(_mapa);
  camadas['Sem dossiê'] = semDos;
  L.control.layers(null, camadas, { collapsed: innerWidth < 900 }).addTo(_mapa);
  geo.forEach(x => todos.push([x.lat, x.lng]));
  if (_mapaFoco) { const x = ent(_mapaFoco); if (x) { _mapa.setView([x.lat, x.lng], 17); } _mapaFoco = null; }
  else if (todos.length) _mapa.fitBounds(todos, { padding: [30, 30], maxZoom: 16 });
  _mapa.on('click', ev => {
    if (!pode('cadastrar')) return;
    L.popup().setLatLng(ev.latlng).setContent(`<div style="font-family:var(--font-sans)"><b>Nova localidade aqui?</b><br><button class="btn btn-primary btn-sm" style="margin-top:6px" onclick="INT.novaLocalidade(${ev.latlng.lat},${ev.latlng.lng})">Cadastrar</button></div>`).openOn(_mapa);
  });
  setTimeout(() => _mapa && _mapa.invalidateSize(), 200);
  aud('consultar_mapa', 'int_entidades', null, { pontos: geo.length });
};
function novaLocalidade(lat, lng) {
  if (_mapa) _mapa.closePopup();
  formEnt('localidade');
  setTimeout(() => { document.getElementById('iLat').value = lat.toFixed(6); document.getElementById('iLng').value = lng.toFixed(6); }, 50);
}

// ── Dossiês ─────────────────────────────────────────────────────────────
VIEWS.dossies = () => {
  const f = S.filtros.dossies || {};
  let l = S.dossies;
  if (f.sit) l = l.filter(d => d.situacao === f.sit);
  if (f.q) { const q = norm(f.q); l = l.filter(d => norm([d.numero, d.titulo, d.descricao, d.objetivo, d.responsavel_nome].join(' ')).includes(q)); }
  const hoje = new Date().toISOString().slice(0, 10);
  return cabecalho('Dossiês de inteligência', 'Todos os usuários do módulo visualizam; alterações dependem de permissão',
      pode('criar_dossie') ? `<button class="btn btn-primary btn-sm" onclick="INT.formDossie()">${ICON('novo', { size: 15 })} Novo dossiê</button>` : '') +
    `<div class="int-busca"><input placeholder="Buscar por número, título, responsável..." value="${e(f.q)}" oninput="INT.setFiltro('dossies','q',this.value)"><select onchange="INT.setFiltro('dossies','sit',this.value,true)">${opts(SITUACAO_DOS, f.sit, 'Toda situação')}</select></div>
    <div class="int-card" style="padding:0;overflow-x:auto" id="intTabDos">${l.length ? `<table class="int-tab"><thead><tr><th>Número</th><th>Título</th><th>Situação</th><th class="hm">Responsável</th><th class="hm">Abertura</th><th class="hm">Registros</th><th class="hm">Retenção</th></tr></thead><tbody>${l.map(d => `<tr class="cl" onclick="INT.abrirDossie('${d.id}')"><td class="int-cod">${e(d.numero)}</td><td><b>${e(d.titulo)}</b><div style="font-size:12px;color:var(--neutral-500)">${e(CLASSIF[d.classificacao])}</div></td><td><span class="int-tag">${e(SITUACAO_DOS[d.situacao])}</span></td><td class="hm">${e(d.responsavel_nome || '—')}</td><td class="hm">${dataBR(d.aberto_em)}</td><td class="hm">${entsDoDossie(d.id).length}</td><td class="hm" style="${d.reter_ate && d.reter_ate < hoje ? 'color:#B45309;font-weight:700' : ''}">${dataBR(d.reter_ate)}</td></tr>`).join('')}</tbody></table>` : '<div class="int-vazio">Nenhum dossiê.</div>'}</div>`;
};
async function formDossie(id) {
  const d = id ? byId(S.dossies, id) : null;
  if (!d && !exige('criar_dossie', 'criar dossiês')) return;
  let usuarios = [];
  try { usuarios = await req('GET', 'sicad_perfis?select=id,nome,role&ativo=eq.true&role=in.(admin,inteligencia)&order=nome'); } catch (_) {}
  const resp = d ? d.responsavel_id : CU.id;
  modal(d ? `Editar dossiê <span class="int-cod">${e(d.numero)}</span>` : 'Novo dossiê', `
    <div class="int-form">
      ${campo('Título *', `<input id="dTit" value="${e(d && d.titulo)}">`, 'full')}
      ${campo('Objetivo da análise *', `<textarea id="dObj">${e(d && d.objetivo)}</textarea>`, 'full')}
      ${campo('Descrição', `<textarea id="dDesc">${e(d && d.descricao)}</textarea>`, 'full')}
      ${campo('Finalidade do tratamento dos dados *', `<input id="dFin" value="${e(d && d.finalidade)}" placeholder="Ex.: subsidiar planejamento operacional / segurança pública">`, 'full')}
      ${campo('Fundamento legal *', `<input id="dFund" value="${e(d && d.fundamento_legal)}" placeholder="Ex.: Lei 13.709/18 art. 4º, III; CF art. 144; Decreto ...">`, 'full')}
      ${campo('Responsável', `<select id="dResp">${usuarios.map(u => `<option value="${u.id}" ${u.id === resp ? 'selected' : ''}>${e(u.nome)}</option>`).join('') || `<option value="${CU.id}">${e(CU.nome)}</option>`}</select>`)}
      ${campo('Classificação de acesso', `<select id="dClas">${opts(CLASSIF, d ? d.classificacao : 'reservado')}</select>`)}
      ${campo('Situação', `<select id="dSit">${opts(SITUACAO_DOS, d ? d.situacao : 'aberto')}</select>`)}
      ${campo('Data de abertura', `<input id="dAb" type="date" value="${e(d ? d.aberto_em : new Date().toISOString().slice(0, 10))}">`)}
      ${campo('Reter dados até (revisão de retenção)', `<input id="dRet" type="date" value="${e(d && d.reter_ate)}">`)}
    </div>
    <div class="row-btns" style="margin-top:12px"><button class="btn btn-outline" onclick="INT.fechar()">Cancelar</button><button class="btn btn-primary" onclick="INT.salvarDossie('${id || ''}')">Salvar</button></div>`, true);
}
async function salvarDossie(id) {
  const reg = { titulo: val('dTit'), objetivo: val('dObj'), descricao: nul(val('dDesc')), finalidade: val('dFin'), fundamento_legal: val('dFund'),
    classificacao: val('dClas'), situacao: val('dSit'), aberto_em: val('dAb') || null, reter_ate: nul(val('dRet')), responsavel_id: val('dResp') || CU.id };
  const sel = document.getElementById('dResp'); reg.responsavel_nome = sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : CU.nome;
  if (!reg.titulo || !reg.objetivo || !reg.finalidade || !reg.fundamento_legal) return toast('Preencha título, objetivo, finalidade e fundamento legal.', 'error');
  showOv('SALVANDO...');
  try {
    let r;
    if (id) { r = (await req('PATCH', `int_dossies?id=eq.${id}`, reg))[0]; aud('editar_dossie', 'int_dossies', id); }
    else { r = (await req('POST', 'int_dossies', reg))[0]; aud('criar_dossie', 'int_dossies', r.id, { numero: r.numero }); }
    await carregar(true); fechar(); toast(id ? 'Dossiê atualizado.' : 'Dossiê ' + r.numero + ' criado.', 'success'); abrirDossie(r.id);
  } catch (err) { toast(err.message, 'error'); } finally { hideOv(); }
}
function abrirDossie(id, aba) {
  fechar(); S.view = 'dossie'; S.dossieId = id; S.abaDossie = aba || S.abaDossie || 'resumo';
  if (!aba && S._ultDos !== id) S.abaDossie = 'resumo';
  S._ultDos = id;
  aud('consultar_dossie', 'int_dossies', id);
  render();
}
VIEWS.dossie = () => {
  const d = byId(S.dossies, S.dossieId); if (!d) return '<div class="int-vazio">Dossiê não encontrado.</div>';
  const ents = entsDoDossie(d.id), aba = S.abaDossie;
  const vin = S.vinculos.filter(v => v.dossie_id === d.id || (ents.some(x => x.id === v.origem_id) && ents.some(x => x.id === v.destino_id)));
  const docs = S.docs.filter(x => x.dossie_id === d.id || ents.some(y => y.id === x.entidade_id));
  const rels = S.rels.filter(r => (r.dossies || []).includes(d.id));
  const compart = ents.filter(x => dossiesDoEnt(x.id).length > 1);
  let corpo = '';
  if (aba === 'resumo') {
    corpo = `<div class="int-card"><div class="int-dl">
      <div><small>Objetivo da análise</small>${e(d.objetivo)}</div><div><small>Descrição</small>${e(d.descricao || '—')}</div>
      <div><small>Finalidade do tratamento</small>${e(d.finalidade)}</div><div><small>Fundamento legal</small>${e(d.fundamento_legal)}</div>
      <div><small>Responsável</small>${e(d.responsavel_nome || '—')}</div><div><small>Abertura</small>${dataBR(d.aberto_em)}</div>
      <div><small>Retenção até</small>${dataBR(d.reter_ate)}</div><div><small>Criado por</small>${e(d.criado_por_nome || '—')} · ${dataHoraBR(d.criado_em)}</div></div></div>
      <div class="int-kpis"><div class="int-kpi" onclick="INT.abaDossie('registros')"><b>${ents.length}</b><span>Registros</span></div><div class="int-kpi" onclick="INT.abaDossie('vinculos')"><b>${vin.length}</b><span>Vínculos</span></div><div class="int-kpi" onclick="INT.abaDossie('documentos')"><b>${docs.length}</b><span>Documentos</span></div><div class="int-kpi" onclick="INT.abaDossie('relatorios')"><b>${rels.length}</b><span>Relatórios</span></div><div class="int-kpi ${compart.length ? 'alerta' : ''}" onclick="INT.abaDossie('registros')"><b>${compart.length}</b><span>Em outros dossiês</span></div></div>
      ${compart.length ? `<div class="int-card"><h3>Conexões compartilhadas com outros dossiês</h3><div class="int-lista">${compart.map(x => `<div class="int-item" onclick="INT.ficha('${x.id}')"><div class="m"><b>${e(x.titulo)}</b><small>${dossiesDoEnt(x.id).filter(o => o.id !== d.id).map(o => e(o.numero + ' — ' + o.titulo)).join(' · ')}</small></div></div>`).join('')}</div></div>` : ''}`;
  } else if (aba === 'registros') {
    corpo = `<div class="int-acoes" style="margin-bottom:10px">${pode('cadastrar') ? `<button class="btn btn-primary btn-sm" onclick="INT.formEnt('')">${ICON('novo', { size: 15 })} Novo registro</button><button class="btn btn-outline btn-sm" onclick="INT.incluirExistente('${d.id}')">Incluir do banco central</button>` : ''}</div>
      ${Object.keys(TIPOS).map(t => { const l = ents.filter(x => x.tipo === t); return l.length ? `<div class="int-card"><h3>${e(TIPOS[t].plural)} (${l.length})</h3><div class="int-lista">${l.map(x => { const it = S.itens.find(i => i.dossie_id === d.id && i.entidade_id === x.id); return itemEnt(x).replace('</small>', (it && it.papel ? ' · ' + e(it.papel) : '') + '</small>'); }).join('')}</div></div>` : ''; }).join('') || '<div class="int-vazio">Nenhum registro neste dossiê.</div>'}`;
  } else if (aba === 'vinculos') {
    corpo = `<div class="int-acoes" style="margin-bottom:10px">${pode('cadastrar') ? `<button class="btn btn-primary btn-sm" onclick="INT.formVinculo(null,'${d.id}')">${ICON('novo', { size: 15 })} Novo vínculo</button>` : ''}<button class="btn btn-outline btn-sm" onclick="INT.redeDoDossie('${d.id}')">${ICON('web', { size: 15 })} Abrir diagrama</button></div>${tabelaVinculos(vin)}`;
  } else if (aba === 'mapa') {
    corpo = `<div id="intMapaDos" class="int-map" style="height:440px"></div>`;
  } else if (aba === 'documentos') {
    corpo = `${pode('anexar') ? `<button class="btn btn-primary btn-sm" style="margin-bottom:10px" onclick="INT.formDoc({dossie_id:'${d.id}'})">${ICON('anexo', { size: 15 })} Anexar documento</button>` : ''}${tabelaDocs(docs)}`;
  } else if (aba === 'andamentos') {
    corpo = `${pode('cadastrar') ? `<div class="int-card"><textarea id="andTxt" style="width:100%;min-height:70px" placeholder="Registrar andamento / atualização do dossiê"></textarea><div style="text-align:right;margin-top:8px"><button class="btn btn-primary btn-sm" onclick="INT.salvarAndamento('${d.id}')">Registrar</button></div></div>` : ''}<div id="andLista" class="int-vazio">Carregando...</div><div class="int-card" style="margin-top:14px"><h3>Histórico de alterações do dossiê</h3><div id="dosHist" class="int-vazio">Carregando...</div></div>`;
  } else if (aba === 'relatorios') {
    corpo = `${pode('gerar_relatorio') ? `<button class="btn btn-primary btn-sm" style="margin-bottom:10px" onclick="INT.formRelatorio(null,['${d.id}'])">${ICON('pdf', { size: 15 })} Novo relatório deste dossiê</button>` : ''}${tabelaRels(rels)}`;
  }
  return `<div style="margin-bottom:10px"><a href="#" onclick="INT.ir('dossies');return false" style="font-size:13px">← Dossiês</a></div>` +
    cabecalho(`<span class="int-cod" style="font-size:13px">${e(d.numero)}</span> ${e(d.titulo)}`, `<span class="int-classif">${e(CLASSIF[d.classificacao].toUpperCase())}</span> · ${e(SITUACAO_DOS[d.situacao])} · responsável ${e(d.responsavel_nome || '—')}`,
      (pode('editar') || (d.responsavel_id === CU.id && pode('criar_dossie')) ? `<button class="btn btn-outline btn-sm" onclick="INT.formDossie('${d.id}')">${ICON('editar', { size: 15 })} Editar</button>` : '') +
      (pode('gerar_relatorio') ? `<button class="btn btn-primary btn-sm" onclick="INT.formRelatorio(null,['${d.id}'])">${ICON('pdf', { size: 15 })} Relatório</button>` : '') +
      (pode('editar') ? `<button class="btn btn-outline btn-sm" style="color:var(--danger)" onclick="INT.arquivar('int_dossies','${d.id}',()=>INT.ir('dossies'))">Arquivar</button>` : '')) +
    `<div class="int-tabs">${[['resumo', 'Resumo'], ['registros', 'Registros'], ['vinculos', 'Vínculos'], ['mapa', 'Mapa'], ['documentos', 'Documentos'], ['andamentos', 'Andamentos'], ['relatorios', 'Relatórios']].map(([k, r]) => `<button class="${aba === k ? 'on' : ''}" onclick="INT.abaDossie('${k}')">${r}</button>`).join('')}</div>${corpo}`;
};
AFTER.dossie = () => {
  const d = byId(S.dossies, S.dossieId); if (!d) return;
  if (S.abaDossie === 'mapa') {
    const el = document.getElementById('intMapaDos'); if (!el) return;
    if (_mapa) { _mapa.remove(); _mapa = null; }
    _mapa = L.map(el, { center: [-15.6760, -48.1870], zoom: 13 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(_mapa);
    const geo = entsDoDossie(d.id).filter(x => x.lat != null);
    geo.forEach(x => marcador(x).addTo(_mapa));
    if (geo.length) _mapa.fitBounds(geo.map(x => [x.lat, x.lng]), { padding: [30, 30], maxZoom: 16 });
    else el.insertAdjacentHTML('afterend', '<div class="int-vazio">Nenhum registro deste dossiê tem coordenadas.</div>');
    setTimeout(() => _mapa && _mapa.invalidateSize(), 200);
  }
  if (S.abaDossie === 'andamentos') {
    req('GET', `int_andamentos?dossie_id=eq.${d.id}&excluido_em=is.null&order=criado_em.desc`).then(l => {
      const el = document.getElementById('andLista'); if (!el) return; el.className = '';
      el.innerHTML = l.length ? `<div class="int-lista">${l.map(a => `<div class="int-item" style="cursor:default"><div class="m"><small>${dataHoraBR(a.criado_em)} · ${e(a.criado_por_nome)}</small><div style="white-space:pre-wrap;font-size:13.5px;margin-top:4px">${e(a.texto)}</div></div></div>`).join('')}</div>` : '<div class="int-vazio">Sem andamentos.</div>';
    }).catch(err => toast(err.message, 'error'));
    carregarHistorico(d.id, 'dosHist');
  }
};
function incluirExistente(dosId) {
  modal('Incluir registro do banco central', `${listaEntidadesDatalist()}<div class="int-form">${campo('Registro *', `<input id="incEnt" list="intEntDL" placeholder="Digite nome ou código">`, 'full')}${campo('Papel no dossiê', `<input id="incPapel" placeholder="Ex.: investigado, proprietário, local de encontro">`, 'full')}</div>
    <div class="row-btns" style="margin-top:12px"><button class="btn btn-outline" onclick="INT.fechar()">Cancelar</button><button class="btn btn-primary" onclick="INT.confirmarInclusao('${dosId}')">Incluir</button></div>`);
}
async function confirmarInclusao(dosId) {
  const x = entPorTexto(val('incEnt')); if (!x) return toast('Escolha um registro da lista.', 'error');
  try { await req('POST', 'int_dossie_itens', { dossie_id: dosId, entidade_id: x.id, papel: nul(val('incPapel')) }); aud('incluir_no_dossie', 'int_dossies', dosId, { entidade: x.codigo }); await carregar(true); fechar(); toast('Incluído.', 'success'); render(); }
  catch (err) { toast(/duplicate/i.test(err.message) ? 'Já está neste dossiê.' : err.message, 'error'); }
}
async function salvarAndamento(dosId) {
  const t = val('andTxt'); if (t.length < 3) return toast('Escreva o andamento.', 'error');
  try { await req('POST', 'int_andamentos', { dossie_id: dosId, texto: t }); aud('andamento', 'int_dossies', dosId); toast('Andamento registrado.', 'success'); render(); }
  catch (err) { toast(err.message, 'error'); }
}

// ── Documentos ──────────────────────────────────────────────────────────
function tabelaDocs(docs) {
  if (!docs.length) return '<div class="int-vazio">Nenhum documento.</div>';
  return `<div style="overflow-x:auto"><table class="int-tab"><thead><tr><th>Código</th><th>Documento</th><th>Classificação</th><th class="hm">Origem</th><th class="hm">Data</th><th class="hm">Versão</th><th class="hm">Anexado por</th></tr></thead><tbody>${docs.map(d => `<tr class="cl" onclick="INT.abrirDoc('${d.id}')"><td class="int-cod">${e(d.codigo)}</td><td><b>${e(d.titulo)}</b><div style="font-size:12px;color:var(--neutral-500)">${e(d.nome_arquivo || '')} · ${Math.round((d.tamanho || 0) / 1024)} KB</div></td><td><span class="int-tag ${d.classificacao === 'sigiloso' ? 'sig' : ''}">${e(CLASSIF_DOC[d.classificacao])}</span></td><td class="hm">${e(d.origem)}</td><td class="hm">${dataBR(d.data_doc)}</td><td class="hm">v${d.versao}</td><td class="hm" style="font-size:12px">${e(d.criado_por_nome || '—')}<br>${dataBR(d.criado_em)}</td></tr>`).join('')}</tbody></table></div>`;
}
VIEWS.documentos = () => {
  const f = S.filtros.docs || {};
  let l = S.docs;
  if (f.cl) l = l.filter(d => d.classificacao === f.cl);
  if (f.q) { const q = norm(f.q); l = l.filter(d => norm([d.codigo, d.titulo, d.origem, d.descricao, d.nome_arquivo].join(' ')).includes(q)); }
  return cabecalho('Documentos e fontes', 'Arquivos guardados em área privada, com verificação de integridade (SHA-256) a cada abertura',
      pode('anexar') ? `<button class="btn btn-primary btn-sm" onclick="INT.formDoc({})">${ICON('anexo', { size: 15 })} Anexar documento</button>` : '') +
    `<div class="int-busca"><input placeholder="Buscar documento..." value="${e(f.q)}" oninput="INT.setFiltro('docs','q',this.value)"><select onchange="INT.setFiltro('docs','cl',this.value,true)">${opts(CLASSIF_DOC, f.cl, 'Toda classificação')}</select></div>
    <div class="int-card" style="padding:0">${tabelaDocs(l)}</div>`;
};
function formDoc(alvo, raizId) {
  if (!exige('anexar', 'anexar documentos')) return;
  const raiz = raizId ? byId(S.docs, raizId) : null;
  modal(raiz ? `Nova versão de <span class="int-cod">${e(raiz.codigo)}</span>` : 'Anexar documento', `${listaEntidadesDatalist()}
    <div class="int-form">
      ${campo('Arquivo * (até 25 MB)', `<input id="docArq" type="file">`, 'full')}
      ${campo('Título *', `<input id="docTit" value="${e(raiz && raiz.titulo)}">`, 'full')}
      ${campo('Origem *', `<input id="docOri" value="${e(raiz && raiz.origem)}" placeholder="Órgão / unidade / meio de obtenção">`)}
      ${campo('Data do documento', `<input id="docData" type="date" value="${e(raiz && raiz.data_doc)}">`)}
      ${campo('Classificação de acesso *', `<select id="docCl">${opts(CLASSIF_DOC, raiz ? raiz.classificacao : 'reservado')}</select>`)}
      ${campo('Registro vinculado', `<input id="docEnt" list="intEntDL" value="${alvo.entidade_id ? e(ent(alvo.entidade_id).codigo + ' — ' + ent(alvo.entidade_id).titulo) : (raiz && raiz.entidade_id && ent(raiz.entidade_id) ? e(ent(raiz.entidade_id).codigo + ' — ' + ent(raiz.entidade_id).titulo) : '')}">`)}
      ${campo('Dossiê vinculado', `<select id="docDos">${opts(Object.fromEntries(S.dossies.map(d => [d.id, d.numero + ' — ' + d.titulo])), alvo.dossie_id || (raiz && raiz.dossie_id) || '', 'Nenhum')}</select>`, 'full')}
      ${campo('Descrição', `<textarea id="docDesc">${e(raiz && raiz.descricao)}</textarea>`, 'full')}
    </div>
    <div class="row-btns" style="margin-top:12px"><button class="btn btn-outline" onclick="INT.fechar()">Cancelar</button><button class="btn btn-primary" onclick="INT.salvarDoc('${raizId || ''}')">Enviar</button></div>`, true);
}
async function sha256(buf) { const h = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function salvarDoc(raizId) {
  const f = document.getElementById('docArq').files[0];
  if (!f) return toast('Escolha o arquivo.', 'error');
  if (f.size > 25 * 1024 * 1024) return toast('Arquivo acima de 25 MB.', 'error');
  const titulo = val('docTit'), origem = val('docOri'), cl = val('docCl');
  if (!titulo || !origem) return toast('Informe título e origem.', 'error');
  const raiz = raizId ? byId(S.docs, raizId) : null;
  const entTxt = val('docEnt'); const x = entTxt ? entPorTexto(entTxt) : null;
  if (entTxt && !x) return toast('Registro vinculado não encontrado na lista.', 'error');
  showOv('ENVIANDO DOCUMENTO...');
  try {
    const buf = await f.arrayBuffer(); const hash = await sha256(buf);
    const docId = crypto.randomUUID();
    const nomeSeguro = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-80);
    const path = `${cl}/${docId}/${nomeSeguro}`;
    const up = await supabase.storage.from('int-docs').upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false });
    if (up.error) throw new Error(up.error.message);
    const reg = { id: docId, titulo, origem, data_doc: nul(val('docData')), classificacao: cl, descricao: nul(val('docDesc')), storage_path: path,
      nome_arquivo: f.name, mime: f.type || null, tamanho: f.size, sha256: hash, versao: raiz ? (Math.max(...S.docs.filter(d => (d.doc_raiz_id || d.id) === (raiz.doc_raiz_id || raiz.id)).map(d => d.versao)) + 1) : 1,
      doc_raiz_id: raiz ? (raiz.doc_raiz_id || raiz.id) : null, entidade_id: x ? x.id : null, dossie_id: nul(val('docDos')) };
    const r = (await req('POST', 'int_documentos', reg))[0];
    aud('anexar_documento', 'int_documentos', r.id, { codigo: r.codigo, sha256: hash, versao: reg.versao });
    await carregar(true); fechar(); toast('Documento ' + r.codigo + ' anexado.', 'success'); render();
  } catch (err) { toast(err.message, 'error'); } finally { hideOv(); }
}
async function abrirDoc(id) {
  const d = byId(S.docs, id); if (!d) return;
  const versoes = S.docs.filter(x => (x.doc_raiz_id || x.id) === (d.doc_raiz_id || d.id)).sort((a, b) => b.versao - a.versao);
  modal(`<span class="int-cod">${e(d.codigo)}</span> ${e(d.titulo)}`, `
    <div class="int-dl">
      <div><small>Classificação</small><span class="int-tag ${d.classificacao === 'sigiloso' ? 'sig' : ''}">${e(CLASSIF_DOC[d.classificacao])}</span></div>
      <div><small>Origem</small>${e(d.origem)}</div><div><small>Data</small>${dataBR(d.data_doc)}</div><div><small>Versão</small>v${d.versao}</div>
      <div><small>Arquivo</small>${e(d.nome_arquivo)} · ${Math.round((d.tamanho || 0) / 1024)} KB</div><div><small>Anexado</small>${e(d.criado_por_nome)} · ${dataHoraBR(d.criado_em)}</div>
      <div style="grid-column:1/-1"><small>SHA-256 (integridade)</small><span class="int-cod" style="word-break:break-all">${e(d.sha256)}</span></div>
      ${d.entidade_id && ent(d.entidade_id) ? `<div><small>Registro</small><a href="#" onclick="INT.ficha('${d.entidade_id}');return false">${e(ent(d.entidade_id).codigo)} — ${e(ent(d.entidade_id).titulo)}</a></div>` : ''}
      ${d.dossie_id && byId(S.dossies, d.dossie_id) ? `<div><small>Dossiê</small>${e(byId(S.dossies, d.dossie_id).numero)}</div>` : ''}
      ${d.descricao ? `<div style="grid-column:1/-1"><small>Descrição</small>${e(d.descricao)}</div>` : ''}
    </div>
    ${versoes.length > 1 ? `<div class="int-card" style="margin-top:12px"><h3>Versões</h3>${versoes.map(v => `<div style="font-size:13px;padding:4px 0"><a href="#" onclick="INT.abrirDoc('${v.id}');return false">v${v.versao}</a> · ${dataHoraBR(v.criado_em)} · ${e(v.criado_por_nome)}</div>`).join('')}</div>` : ''}
    <div id="docVerif" style="margin-top:10px;font-size:13px"></div>
    <div class="row-btns" style="margin-top:12px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="INT.baixarDoc('${d.id}')">${ICON('importar', { size: 15 })} Abrir / baixar</button>
      ${pode('anexar') ? `<button class="btn btn-outline" onclick="INT.formDoc({}, '${d.id}')">Nova versão</button>` : ''}
      ${pode('editar') ? `<button class="btn btn-outline" style="color:var(--danger)" onclick="INT.arquivar('int_documentos','${d.id}')">Arquivar</button>` : ''}
    </div>`, true);
}
async function baixarDoc(id) {
  const d = byId(S.docs, id); if (!d) return;
  showOv('VERIFICANDO INTEGRIDADE...');
  try {
    const { data, error } = await supabase.storage.from('int-docs').download(d.storage_path);
    if (error) throw new Error(error.message);
    const hash = await sha256(await data.arrayBuffer());
    const ok = hash === d.sha256;
    const el = document.getElementById('docVerif');
    if (el) el.innerHTML = ok ? '<span style="color:#047857;font-weight:700">Integridade conferida: o arquivo é idêntico ao anexado.</span>' : '<span style="color:#B91C1C;font-weight:700">ATENÇÃO: o arquivo NÃO confere com o original anexado.</span>';
    aud('abrir_documento', 'int_documentos', id, { integro: ok });
    const url = URL.createObjectURL(data); const a = document.createElement('a'); a.href = url; a.download = d.nome_arquivo || d.codigo; a.target = '_blank'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) { toast(err.message, 'error'); } finally { hideOv(); }
}

// ── Relatórios ──────────────────────────────────────────────────────────
function tabelaRels(rels) {
  if (!rels.length) return '<div class="int-vazio">Nenhum relatório.</div>';
  return `<div style="overflow-x:auto"><table class="int-tab"><thead><tr><th>Número</th><th>Título</th><th>Situação</th><th class="hm">Tipo</th><th class="hm">Versão</th><th class="hm">Elaboração</th></tr></thead><tbody>${rels.map(r => `<tr class="cl" onclick="INT.abrirRel('${r.id}')"><td class="int-cod">${e(r.numero)}</td><td><b>${e(r.titulo)}</b></td><td><span class="int-tag ${r.status === 'aprovado' ? 'doc' : r.status === 'devolvido' ? 'sig' : ''}">${e(STATUS_REL[r.status])}</span></td><td class="hm">${r.tipo === 'individual' ? 'Individual' : 'Consolidado'}</td><td class="hm">v${r.versao}</td><td class="hm" style="font-size:12px">${e(r.elaborado_por_nome || '—')}<br>${dataBR(r.criado_em)}</td></tr>`).join('')}</tbody></table></div>`;
}
VIEWS.relatorios = () => cabecalho('Relatórios de inteligência', 'Fluxo: rascunho → revisão → aprovação. Quem elabora não revisa nem aprova o próprio relatório.',
    pode('gerar_relatorio') ? `<button class="btn btn-primary btn-sm" onclick="INT.formRelatorio()">${ICON('pdf', { size: 15 })} Novo relatório</button>` : '') +
  `<div class="int-card" style="padding:0">${tabelaRels(S.rels)}</div>`;

function formRelatorio(id, dossiesPre, baseId) {
  const r = id ? byId(S.rels, id) : (baseId ? byId(S.rels, baseId) : null);
  if (!exige('gerar_relatorio', 'gerar relatórios')) return;
  if (id && !['rascunho', 'devolvido'].includes(r.status)) return toast('Só é possível editar rascunho ou relatório devolvido.', 'error');
  const sec = (r && r.secoes) || {}; const inc = sec.incluir || SECOES.map(s => s[0]);
  const dosSel = r ? r.dossies : (dossiesPre || []);
  modal(id ? `Editar relatório <span class="int-cod">${e(r.numero)}</span>` : baseId ? `Nova versão de <span class="int-cod">${e(r.numero)}</span>` : 'Novo relatório de inteligência', `
    <div class="int-form">
      ${campo('Título *', `<input id="rTit" value="${e(r ? r.titulo : (dosSel.length === 1 && byId(S.dossies, dosSel[0]) ? 'Relatório de Inteligência — ' + byId(S.dossies, dosSel[0]).titulo : ''))}">`, 'full')}
      ${campo('Classificação de acesso', `<select id="rClas">${opts(CLASSIF, r ? r.classificacao : 'reservado')}</select>`)}
      ${campo('Tipo', `<input disabled value="Definido pela quantidade de dossiês (1 = individual, 2+ = consolidado)">`)}
    </div>
    <label style="margin-top:6px">Dossiês incluídos *</label>
    <div class="int-chk" style="margin:6px 0 14px">${S.dossies.map(d => `<label><input type="checkbox" class="rDos" value="${d.id}" ${dosSel.includes(d.id) ? 'checked' : ''}> ${e(d.numero)} — ${e(d.titulo)}</label>`).join('') || 'Nenhum dossiê.'}</div>
    <label>Seções do relatório</label>
    <div class="int-chk" style="margin:6px 0 14px">${SECOES.map(([k, rot], i) => `<label><input type="checkbox" class="rSec" value="${k}" ${inc.includes(k) ? 'checked' : ''}> ${i + 1}. ${rot}</label>`).join('')}</div>
    <div class="int-form">
      ${campo('Metodologia', `<textarea id="rMet">${e(sec.metodologia || 'Levantamento e cruzamento de registros do banco central de inteligência do SICAD, análise documental das fontes indicadas e análise de vínculos lançados com fonte e grau de confiabilidade (Sistema Admiralty: fonte A–F / informação 1–6).')}</textarea>`, 'full')}
      ${campo('Análise técnica', `<textarea id="rAna" style="min-height:120px">${e(sec.analise)}</textarea>`, 'full')}
      ${campo('Lacunas e divergências', `<textarea id="rLac">${e(sec.lacunas)}</textarea>`, 'full')}
      ${campo('Conclusão', `<textarea id="rCon" style="min-height:100px">${e(sec.conclusao)}</textarea>`, 'full')}
    </div>
    <div class="row-btns" style="margin-top:12px"><button class="btn btn-outline" onclick="INT.fechar()">Cancelar</button><button class="btn btn-primary" onclick="INT.salvarRel('${id || ''}','${baseId || ''}')">Salvar rascunho</button></div>`, true);
}
async function salvarRel(id, baseId) {
  const dossies = [...document.querySelectorAll('.rDos:checked')].map(c => c.value);
  const incluir = [...document.querySelectorAll('.rSec:checked')].map(c => c.value);
  if (!val('rTit')) return toast('Informe o título.', 'error');
  if (!dossies.length) return toast('Escolha ao menos um dossiê.', 'error');
  const secoes = { incluir, metodologia: val('rMet'), analise: val('rAna'), lacunas: val('rLac'), conclusao: val('rCon') };
  const reg = { titulo: val('rTit'), classificacao: val('rClas'), dossies, tipo: dossies.length > 1 ? 'consolidado' : 'individual', secoes };
  const base = baseId ? byId(S.rels, baseId) : null;
  if (base) { const raiz = base.relatorio_raiz_id || base.id; Object.assign(reg, { relatorio_raiz_id: raiz, numero: base.numero, versao: Math.max(...S.rels.filter(x => (x.relatorio_raiz_id || x.id) === raiz).map(x => x.versao)) + 1 }); }
  showOv('SALVANDO...');
  try {
    let r;
    if (id) { r = (await req('PATCH', `int_relatorios?id=eq.${id}`, reg))[0]; aud('editar_relatorio', 'int_relatorios', id); }
    else { r = (await req('POST', 'int_relatorios', reg))[0]; aud('criar_relatorio', 'int_relatorios', r.id, { numero: r.numero, versao: r.versao }); }
    await carregar(true); fechar(); toast('Rascunho salvo.', 'success'); S.view = 'relatorios'; render(); abrirRel(r.id);
  } catch (err) { toast(err.message, 'error'); } finally { hideOv(); }
}
function abrirRel(id) {
  const r = byId(S.rels, id); if (!r) return;
  const meu = r.elaborado_por === CU.id;
  const versoes = S.rels.filter(x => (x.relatorio_raiz_id || x.id) === (r.relatorio_raiz_id || r.id)).sort((a, b) => b.versao - a.versao);
  const acoes = [];
  acoes.push(`<button class="btn btn-primary" onclick="INT.gerarPDF('${id}')">${ICON('pdf', { size: 15 })} Gerar PDF</button>`);
  if (['rascunho', 'devolvido'].includes(r.status) && (meu || CU.role === 'admin')) {
    acoes.push(`<button class="btn btn-outline" onclick="INT.formRelatorio('${id}')">${ICON('editar', { size: 15 })} Editar</button>`);
    acoes.push(`<button class="btn btn-outline" onclick="INT.fluxoRel('${id}','enviar_revisao')">Enviar para revisão</button>`);
  }
  if (r.status === 'em_revisao' && pode('revisar_relatorio') && !meu) acoes.push(`<button class="btn btn-outline" onclick="INT.fluxoRel('${id}','revisar')">Marcar como revisado</button>`);
  if (r.status === 'revisado' && pode('aprovar_relatorio') && !meu) acoes.push(`<button class="btn btn-success" onclick="INT.fluxoRel('${id}','aprovar')">Aprovar</button>`);
  if (['em_revisao', 'revisado'].includes(r.status) && (pode('revisar_relatorio') || pode('aprovar_relatorio')) && !meu) acoes.push(`<button class="btn btn-outline" style="color:var(--danger)" onclick="INT.fluxoRel('${id}','devolver')">Devolver</button>`);
  if (r.status === 'aprovado' && pode('gerar_relatorio')) acoes.push(`<button class="btn btn-outline" onclick="INT.formRelatorio(null,null,'${id}')">Nova versão</button>`);
  modal(`<span class="int-cod">${e(r.numero)} v${r.versao}</span> ${e(r.titulo)}`, `
    <div class="int-dl">
      <div><small>Situação</small><span class="int-tag ${r.status === 'aprovado' ? 'doc' : r.status === 'devolvido' ? 'sig' : ''}">${e(STATUS_REL[r.status])}</span></div>
      <div><small>Tipo</small>${r.tipo === 'individual' ? 'Individual' : 'Consolidado'} · ${e(CLASSIF[r.classificacao])}</div>
      <div><small>Dossiês</small>${r.dossies.map(dId => { const d = byId(S.dossies, dId); return d ? e(d.numero) : '?'; }).join(', ')}</div>
      <div><small>Elaborado por</small>${e(r.elaborado_por_nome)} · ${dataHoraBR(r.criado_em)}</div>
      <div><small>Revisado por</small>${r.revisado_por_nome ? e(r.revisado_por_nome) + ' · ' + dataHoraBR(r.revisado_em) : '—'}</div>
      <div><small>Aprovado por</small>${r.aprovado_por_nome ? e(r.aprovado_por_nome) + ' · ' + dataHoraBR(r.aprovado_em) : '—'}</div>
      ${r.parecer ? `<div style="grid-column:1/-1"><small>Parecer</small>${e(r.parecer)}</div>` : ''}
    </div>
    ${versoes.length > 1 ? `<div class="int-card" style="margin-top:12px"><h3>Versões</h3>${versoes.map(v => `<div style="font-size:13px;padding:3px 0"><a href="#" onclick="INT.abrirRel('${v.id}');return false">v${v.versao}</a> · ${e(STATUS_REL[v.status])} · ${dataHoraBR(v.criado_em)}</div>`).join('')}</div>` : ''}
    <div class="row-btns" style="margin-top:14px;flex-wrap:wrap">${acoes.join('')}</div>`, true);
}
async function fluxoRel(id, acao) {
  let parecer = null;
  if (acao === 'devolver') { parecer = prompt('Motivo da devolução:'); if (parecer == null) return; }
  else if (acao === 'revisar' || acao === 'aprovar') { parecer = prompt((acao === 'aprovar' ? 'Aprovar relatório. ' : 'Marcar como revisado. ') + 'Parecer (opcional):') ; if (parecer === null) return; }
  else if (!confirm('Enviar para revisão? Depois disso o texto fica travado até ser devolvido.')) return;
  showOv('ATUALIZANDO...');
  try { const { error } = await supabase.rpc('int_relatorio_fluxo', { p_id: id, p_acao: acao, p_parecer: parecer || null }); if (error) throw new Error(error.message); await carregar(true); toast('Relatório: ' + ({ enviar_revisao: 'enviado para revisão', revisar: 'revisado', aprovar: 'aprovado', devolver: 'devolvido' }[acao]) + '.', 'success'); render(); abrirRel(id); }
  catch (err) { toast(err.message, 'error'); } finally { hideOv(); }
}

// PDF ─ imagens auxiliares
async function imagemRede(dossies) {
  await carregarVis();
  const { nodes, edges } = dadosRede(dossies, ['documentado', 'informado', 'hipotese']);
  if (!nodes.length) return null;
  const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-3000px;top:0;width:1100px;height:720px;background:#fff';
  document.body.appendChild(box);
  try {
    const net = new vis.Network(box, { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) }, { physics: { solver: 'forceAtlas2Based', stabilization: { iterations: 400 } }, interaction: { dragNodes: false } });
    await new Promise(ok => { net.once('stabilizationIterationsDone', ok); setTimeout(ok, 4000); });
    net.setOptions({ physics: false }); net.fit(); await new Promise(ok => setTimeout(ok, 300));
    const cv = box.querySelector('canvas'); const out = document.createElement('canvas'); out.width = cv.width; out.height = cv.height;
    const cx = out.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, out.width, out.height); cx.drawImage(cv, 0, 0);
    net.destroy();
    return { url: out.toDataURL('image/jpeg', .9), w: out.width, h: out.height };
  } finally { box.remove(); }
}
async function imagemMapa(pontos) {
  if (!pontos.length) return null;
  const W = 1000, H = 640;
  const lon2x = (lon, z) => (lon + 180) / 360 * 256 * 2 ** z;
  const lat2y = (lat, z) => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z; };
  const lats = pontos.map(p => p.lat), lngs = pontos.map(p => p.lng);
  let z = 17;
  for (; z > 3; z--) { const w = lon2x(Math.max(...lngs), z) - lon2x(Math.min(...lngs), z), h = lat2y(Math.min(...lats), z) - lat2y(Math.max(...lats), z); if (w < W - 120 && h < H - 120) break; }
  const cx = (lon2x(Math.min(...lngs), z) + lon2x(Math.max(...lngs), z)) / 2, cy = (lat2y(Math.min(...lats), z) + lat2y(Math.max(...lats), z)) / 2;
  const x0 = cx - W / 2, y0 = cy - H / 2;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = '#eef2f7'; g.fillRect(0, 0, W, H);
  const tiles = [];
  for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + W) / 256); tx++) for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + H) / 256); ty++) tiles.push([tx, ty]);
  await Promise.all(tiles.map(([tx, ty]) => new Promise(ok => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { g.drawImage(im, tx * 256 - x0, ty * 256 - y0); ok(); }; im.onerror = ok; im.src = `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`; })));
  pontos.forEach((p, i) => {
    const x = lon2x(p.lng, z) - x0, y = lat2y(p.lat, z) - y0;
    g.beginPath(); g.arc(x, y, p.natureza === 'hipotese' ? 11 : 8, 0, Math.PI * 2);
    if (p.natureza === 'hipotese') { g.setLineDash([4, 3]); g.strokeStyle = '#B45309'; g.lineWidth = 2.5; g.fillStyle = 'rgba(253,230,138,.5)'; g.fill(); g.stroke(); g.setLineDash([]); }
    else { g.fillStyle = TIPOS[p.tipo].cor; g.globalAlpha = p.natureza === 'informado' ? .55 : 1; g.fill(); g.globalAlpha = 1; g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
    g.font = 'bold 12px Arial'; g.lineWidth = 3; g.strokeStyle = '#fff'; g.strokeText(String(i + 1), x + 10, y - 8); g.fillStyle = '#0F172A'; g.fillText(String(i + 1), x + 10, y - 8);
  });
  g.font = '10px Arial'; g.fillStyle = '#334155'; g.fillText('© OpenStreetMap contributors', W - 150, H - 6);
  try { return { url: cv.toDataURL('image/jpeg', .88), w: W, h: H }; } catch (_) { return null; }
}

async function gerarPDF(id) {
  const r = byId(S.rels, id); if (!r) return;
  if (!window.jspdf) return toast('Gerador de PDF indisponível.', 'error');
  showOv('GERANDO RELATÓRIO...');
  try {
    const inc = new Set((r.secoes && r.secoes.incluir) || SECOES.map(s => s[0])); const sec = r.secoes || {};
    const dossies = r.dossies.map(dId => byId(S.dossies, dId)).filter(Boolean);
    const ids = new Set(); dossies.forEach(d => entsDoDossie(d.id).forEach(x => ids.add(x.id)));
    const ents = [...ids].map(ent).filter(Boolean);
    const vin = S.vinculos.filter(v => r.dossies.includes(v.dossie_id) || (ids.has(v.origem_id) && ids.has(v.destino_id)));
    const docs = S.docs.filter(d => r.dossies.includes(d.dossie_id) || ids.has(d.entidade_id));
    const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const PW = 210, M = 18, CW = PW - 2 * M; let y = M;
    const CLS = CLASSIF[r.classificacao].toUpperCase();
    const novaPag = () => { doc.addPage(); y = M + 6; };
    const precisa = h => { if (y + h > 280) novaPag(); };
    const tit = (t, min) => { precisa(min || 16); y += 4; doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(30, 58, 138); doc.text(t, M, y); y += 2; doc.setDrawColor(30, 58, 138); doc.setLineWidth(.4); doc.line(M, y, PW - M, y); y += 6; doc.setTextColor(15, 23, 42); };
    const par = (t, tam = 10, estilo = 'normal') => { t = String(t == null ? '—' : t).replace(/→/g, '->'); doc.setFont('helvetica', estilo); doc.setFontSize(tam); doc.splitTextToSize(String(t || '—'), CW).forEach(l => { precisa(5.2); doc.text(l, M, y); y += 5; }); y += 1.5; };
    const kv = (k, v) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); const kw = 48; precisa(5.5); doc.text(k, M, y); doc.setFont('helvetica', 'normal'); const ls = doc.splitTextToSize(String(v || '—'), CW - kw); ls.forEach((l, i) => { if (i) precisa(5); doc.text(l, M + kw, y); y += 5; }); };
    const img = (im, maxH) => { if (!im) return; const w = CW, h = Math.min(maxH, w * im.h / im.w), ww = h * im.w / im.h; precisa(h + 4); doc.addImage(im.url, 'JPEG', M + (CW - ww) / 2, y, ww, h); doc.setDrawColor(203, 213, 225); doc.rect(M + (CW - ww) / 2, y, ww, h); y += h + 4; };
    let n = 0; const num = () => `${++n}. `;

    // 1. Capa
    if (inc.has('capa')) {
      doc.setFillColor(15, 23, 42); doc.rect(0, 0, PW, 297, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('SICAD · MÓDULO INTELIGÊNCIA', M, 30);
      doc.setFillColor(185, 28, 28); doc.rect(M, 44, CW, 14, 'F'); doc.setFontSize(14); doc.text(CLS, PW / 2, 53, { align: 'center' });
      doc.setFontSize(22); doc.splitTextToSize(r.titulo, CW).forEach((l, i) => doc.text(l, M, 100 + i * 10));
      doc.setFont('helvetica', 'normal'); doc.setFontSize(12);
      doc.text(`Relatório de Inteligência nº ${r.numero} · versão ${r.versao}`, M, 140);
      doc.text(`Tipo: ${r.tipo === 'individual' ? 'Individual' : 'Consolidado'} · Dossiês: ${dossies.map(d => d.numero).join(', ')}`, M, 148);
      doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')} por ${CU.nome}`, M, 156);
      doc.text(`Situação: ${STATUS_REL[r.status]}`, M, 164);
      doc.setFontSize(9); doc.setTextColor(203, 213, 225);
      doc.splitTextToSize('Documento de acesso restrito. A divulgação, reprodução ou uso fora da finalidade declarada sujeita o responsável às sanções legais. Hipóteses analíticas estão identificadas como tais e não constituem prova.', CW).forEach((l, i) => doc.text(l, M, 260 + i * 5));
      novaPag();
    }
    doc.setTextColor(15, 23, 42);
    if (inc.has('identificacao')) { tit(num() + 'Identificação do dossiê'); dossies.forEach(d => { kv('Dossiê', `${d.numero} — ${d.titulo}`); kv('Situação', SITUACAO_DOS[d.situacao]); kv('Responsável', d.responsavel_nome); kv('Abertura', dataBR(d.aberto_em)); kv('Classificação', CLASSIF[d.classificacao]); kv('Finalidade', d.finalidade); kv('Fundamento legal', d.fundamento_legal); y += 3; }); }
    if (inc.has('objetivo')) { tit(num() + 'Objetivo da análise'); dossies.forEach(d => par((dossies.length > 1 ? d.numero + ': ' : '') + d.objetivo)); }
    if (inc.has('metodologia')) { tit(num() + 'Metodologia'); par(sec.metodologia); }
    if (inc.has('fontes')) { tit(num() + 'Fontes consultadas'); const fontes = [...new Set([...ents.map(x => x.fonte), ...vin.map(v => v.fonte), ...docs.map(d => d.origem)].filter(Boolean))]; fontes.forEach(f => par('• ' + f)); if (!fontes.length) par('Nenhuma fonte registrada.'); }
    if (inc.has('informacoes')) {
      tit(num() + 'Informações cadastradas');
      Object.keys(TIPOS).forEach(t => { const l = ents.filter(x => x.tipo === t && t !== 'pessoa'); if (!l.length) return; par(TIPOS[t].plural, 10.5, 'bold'); l.forEach(x => par(`${x.codigo} — ${x.titulo}${resumoEnt(x) ? ' (' + resumoEnt(x) + ')' : ''} · ${NATUREZA[x.natureza]} · fonte: ${x.fonte} · conf. ${confTxt(x.conf_fonte, x.conf_info)}`, 9.5)); });
    }
    if (inc.has('pessoas')) { tit(num() + 'Pessoas e registros relacionados'); const ps = ents.filter(x => x.tipo === 'pessoa'); ps.forEach(x => par(`${x.codigo} — ${x.titulo}${resumoEnt(x) ? ' · ' + resumoEnt(x) : ''} · ${NATUREZA[x.natureza]} · fonte: ${x.fonte}`, 9.5)); if (!ps.length) par('Nenhuma pessoa relacionada.'); if (vin.length) { par('Vínculos lançados', 10.5, 'bold'); vin.forEach(v => par(`${(ent(v.origem_id) || {}).titulo || '?'} — ${v.tipo} → ${(ent(v.destino_id) || {}).titulo || '?'} [${NATUREZA[v.situacao]}; fonte: ${v.fonte}; conf. ${confTxt(v.conf_fonte, v.conf_info)}]`, 9.5)); } }
    if (inc.has('diagrama')) { tit(num() + 'Diagrama de vínculos', 120); const im = await imagemRede(r.dossies).catch(() => null); if (im) { img(im, 150); par('Legenda: linha contínua = documentado; tracejada = informado; pontilhada = hipótese em análise. Borda dourada = registro presente em mais de um dossiê.', 8.5, 'italic'); } else par('Sem vínculos lançados para os dossiês do relatório.'); }
    if (inc.has('diagrama')) { for (const o of ents.filter(x => x.tipo === 'organizacao' && membrosDe(x.id).length)) { const im = await imagemOrg(o.id).catch(() => null); if (im) { tit('Organograma — ' + o.titulo, 120); img(im, 160); const est = estruturaOrg(o.id); est.membros.sort((a, b) => a.nivel - b.nivel).forEach(m => par(`${m.x.titulo} — ${m.v.funcao || 'função não informada'} (nível ${m.nivel}; ${NATUREZA[m.v.situacao]}; fonte: ${m.v.fonte})`, 9)); } } }
    if (inc.has('mapa')) { const geo = ents.filter(x => x.lat != null); if (geo.length) { tit(num() + 'Mapa geográfico', 120); const im = await imagemMapa(geo).catch(() => null); img(im, 150); geo.forEach((x, i) => par(`${i + 1}. ${x.codigo} — ${x.titulo} (${NATUREZA[x.natureza]}) · ${(+x.lat).toFixed(5)}, ${(+x.lng).toFixed(5)}`, 9)); } }
    if (inc.has('cronologia')) { tit(num() + 'Cronologia dos registros'); const ev = [...ents.map(x => [x.data_fato || x.criado_em.slice(0, 10), `${x.codigo} ${x.titulo} (${TIPOS[x.tipo].rot}${x.data_fato ? '' : ', data de cadastro'})`]), ...vin.filter(v => v.data_fato).map(v => [v.data_fato, `Vínculo: ${(ent(v.origem_id) || {}).titulo} — ${v.tipo} → ${(ent(v.destino_id) || {}).titulo}`]), ...docs.filter(d => d.data_doc).map(d => [d.data_doc, `Documento ${d.codigo}: ${d.titulo}`])].sort((a, b) => a[0] < b[0] ? -1 : 1); ev.forEach(([dt, t]) => par(`${dataBR(dt)} — ${t}`, 9.5)); if (!ev.length) par('Sem registros datados.'); }
    if (inc.has('documentos')) { tit(num() + 'Documentos de referência'); docs.forEach(d => par(`${d.codigo} — ${d.titulo} · ${CLASSIF_DOC[d.classificacao]} · origem: ${d.origem} · ${dataBR(d.data_doc)} · v${d.versao} · SHA-256 ${d.sha256.slice(0, 16)}…`, 9.5)); if (!docs.length) par('Nenhum documento anexado.'); }
    if (inc.has('analise')) { tit(num() + 'Análise técnica'); par(sec.analise); }
    if (inc.has('lacunas')) { tit(num() + 'Lacunas e divergências'); const hip = ents.filter(x => x.natureza === 'hipotese').length + vin.filter(v => v.situacao === 'hipotese').length; par(sec.lacunas || 'Não informadas.'); if (hip) par(`Constam ${hip} item(ns) classificados como hipótese em análise, pendentes de confirmação.`, 9.5, 'italic'); }
    if (inc.has('conclusao')) { tit(num() + 'Conclusão'); par(sec.conclusao); }
    if (inc.has('responsavel')) { tit(num() + 'Responsável pela elaboração'); kv('Elaborado por', r.elaborado_por_nome); kv('Data', dataHoraBR(r.criado_em)); }
    if (inc.has('aprovacao')) { tit(num() + 'Revisão e aprovação'); kv('Revisado por', r.revisado_por_nome ? `${r.revisado_por_nome} em ${dataHoraBR(r.revisado_em)}` : 'Pendente'); kv('Aprovado por', r.aprovado_por_nome ? `${r.aprovado_por_nome} em ${dataHoraBR(r.aprovado_em)}` : 'Pendente'); if (r.parecer) kv('Parecer', r.parecer); }

    // Cabeçalho/rodapé em todas as páginas
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p); if (p === 1 && inc.has('capa')) continue;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(185, 28, 28); doc.text(CLS, PW / 2, 10, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
      doc.text(`${r.numero} v${r.versao} · ${STATUS_REL[r.status]} · emitido por ${CU.nome} em ${new Date().toLocaleString('pt-BR')}`, M, 290);
      doc.text(`${p}/${total}`, PW - M, 290, { align: 'right' });
      doc.setTextColor(185, 28, 28); doc.text(CLS, PW / 2, 294, { align: 'center' });
    }
    const buf = doc.output('arraybuffer'); const hash = await sha256(buf);
    doc.save(`${r.numero}_v${r.versao}.pdf`);
    aud('exportar_relatorio', 'int_relatorios', id, { numero: r.numero, versao: r.versao, status: r.status, sha256: hash, paginas: total });
    toast('PDF gerado. Emissão registrada na auditoria.', 'success');
  } catch (err) { toast('Erro ao gerar PDF: ' + err.message, 'error'); } finally { hideOv(); }
}

// ── Acessos (permissões) ────────────────────────────────────────────────
VIEWS.acessos = () => cabecalho('Acessos ao módulo', 'Usuários com perfil INTELIGÊNCIA. Todos visualizam; marque o que cada um pode fazer. O perfil é concedido/retirado na tela Usuários do SICAD.') + '<div id="intAcessos" class="int-vazio">Carregando...</div>';
AFTER.acessos = async () => {
  try {
    const [us, acc] = await Promise.all([req('GET', 'sicad_perfis?select=id,nome,matricula,role,ativo&role=eq.inteligencia&order=nome'), req('GET', 'int_acessos?select=*')]);
    const el = document.getElementById('intAcessos'); if (!el) return; el.className = '';
    el.innerHTML = us.length ? us.map(u => { const p = new Set((acc.find(a => a.user_id === u.id) || {}).perms || []); const eu = u.id === CU.id; return `<div class="int-card"><h3><span style="display:inline-flex;align-items:center;gap:6px">${typeof iconePerfil === 'function' ? iconePerfil(u.role, 16) : ''}${e(u.nome)}</span> ${u.matricula ? `<span class="int-cod">mat ${e(u.matricula)}</span>` : ''} ${u.ativo ? '' : '<span class="int-tag sig">inativo</span>'}${eu ? '<span class="int-tag">você</span>' : ''}</h3><div class="int-chk">${PERMS.map(([k, rot]) => `<label><input type="checkbox" class="pm_${u.id}" value="${k}" ${p.has(k) ? 'checked' : ''} ${eu && CU.role !== 'admin' ? 'disabled' : ''}> ${rot}</label>`).join('')}</div>${eu && CU.role !== 'admin' ? '<div style="font-size:12px;color:var(--neutral-500);margin-top:8px">Você não altera as próprias permissões.</div>' : `<div style="text-align:right;margin-top:10px"><button class="btn btn-primary btn-sm" onclick="INT.salvarPerms('${u.id}','${e(u.nome).replace(/'/g, '')}')">Salvar permissões</button></div>`}</div>`; }).join('') : '<div class="int-vazio">Nenhum usuário com perfil INTELIGÊNCIA.</div>';
  } catch (err) { const el = document.getElementById('intAcessos'); if (el) el.textContent = err.message; }
};
async function salvarPerms(uid, nome) {
  const perms = [...document.querySelectorAll('.pm_' + uid + ':checked')].map(c => c.value);
  try { await req('POST', 'int_acessos?on_conflict=user_id', { user_id: uid, perms, concedido_por: CU.id, concedido_por_nome: CU.nome, atualizado_em: new Date().toISOString() }, 'resolution=merge-duplicates,return=representation'); aud('permissoes', 'int_acessos', uid, { nome, perms }); toast('Permissões de ' + nome + ' salvas.', 'success'); }
  catch (err) { toast(err.message, 'error'); }
}

// ── Auditoria ───────────────────────────────────────────────────────────
VIEWS.auditoria = () => cabecalho('Auditoria do módulo', 'Acessos, consultas, exportações e alterações — com usuário, data e horário') +
  `<div class="int-tabs"><button class="${(S.abaAud || 'acessos') === 'acessos' ? 'on' : ''}" onclick="INT.abaAud('acessos')">Acessos e consultas</button><button class="${S.abaAud === 'alteracoes' ? 'on' : ''}" onclick="INT.abaAud('alteracoes')">Alterações de registros</button></div><div id="intAud" class="int-vazio">Carregando...</div>`;
AFTER.auditoria = async () => {
  const el = document.getElementById('intAud'); if (!el) return;
  const NOMES = { int_acesso: 'Abriu o módulo', int_consultar_registro: 'Consultou registro', int_consultar_dossie: 'Consultou dossiê', int_cadastrar_registro: 'Cadastrou registro', int_editar_registro: 'Editou registro', int_arquivar: 'Arquivou', int_criar_dossie: 'Criou dossiê', int_editar_dossie: 'Editou dossiê', int_incluir_no_dossie: 'Incluiu no dossiê', int_lancar_vinculo: 'Lançou vínculo', int_anexar_documento: 'Anexou documento', int_abrir_documento: 'Abriu documento', int_exportar_relatorio: 'Exportou relatório (PDF)', int_criar_relatorio: 'Criou relatório', int_editar_relatorio: 'Editou relatório', int_permissoes: 'Alterou permissões', int_pesquisa: 'Pesquisa central', int_analise_vinculos: 'Análise de vínculos', int_consultar_mapa: 'Consultou mapa', int_sessao_bloqueada: 'Sessão bloqueada por inatividade', int_sessao_desbloqueada: 'Sessão desbloqueada', int_andamento: 'Registrou andamento' };
  try {
    if ((S.abaAud || 'acessos') === 'acessos') {
      const l = await req('GET', 'sicad_audit?select=created_at,acao,recurso,recurso_id,detalhes,user_email&acao=like.int_*&order=created_at.desc&limit=300');
      el.className = ''; el.innerHTML = `<div class="int-card" style="padding:0;overflow-x:auto"><table class="int-tab"><thead><tr><th>Quando</th><th>Usuário</th><th>Ação</th><th class="hm">Detalhe</th></tr></thead><tbody>${l.map(a => `<tr><td style="white-space:nowrap">${dataHoraBR(a.created_at)}</td><td>${e(a.user_email || '—')}</td><td>${e(NOMES[a.acao] || a.acao.replace(/^int_/, '').replace(/_/g, ' '))}</td><td class="hm" style="font-size:12px;color:var(--neutral-500)">${e(a.detalhes ? JSON.stringify(a.detalhes).slice(0, 140) : (a.recurso_id || ''))}</td></tr>`).join('')}</tbody></table></div>`;
    } else {
      const l = await req('GET', 'int_historico?select=id,tabela,registro_id,operacao,usuario_nome,em&order=em.desc&limit=300');
      const TAB = { int_entidades: 'Registro', int_dossies: 'Dossiê', int_dossie_itens: 'Item de dossiê', int_vinculos: 'Vínculo', int_documentos: 'Documento', int_relatorios: 'Relatório', int_andamentos: 'Andamento' };
      el.className = ''; el.innerHTML = `<div class="int-card" style="padding:0;overflow-x:auto"><table class="int-tab"><thead><tr><th>Quando</th><th>Usuário</th><th>Operação</th><th>Onde</th></tr></thead><tbody>${l.map(h => { const x = ent(h.registro_id) || byId(S.dossies, h.registro_id); return `<tr><td style="white-space:nowrap">${dataHoraBR(h.em)}</td><td>${e(h.usuario_nome || '—')}</td><td>${e({ INSERT: 'Cadastro', UPDATE: 'Alteração', ARQUIVAMENTO: 'Arquivamento', RESTAURACAO: 'Restauração' }[h.operacao] || h.operacao)}</td><td>${e(TAB[h.tabela] || h.tabela)} ${x ? `<span class="int-cod">${e(x.codigo || x.numero)}</span>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
    }
  } catch (err) { el.textContent = err.message; }
};

// ── Pesquisa central ────────────────────────────────────────────────────
function pesquisar(q) {
  q = (q || '').trim(); if (q.length < 2) return toast('Digite ao menos 2 caracteres.', 'error');
  aud('pesquisa', 'inteligencia', null, { termo: q.slice(0, 60) });
  S.filtros.central = { q }; S.view = 'central'; render();
  const n = norm(q); const dos = S.dossies.filter(d => norm([d.numero, d.titulo, d.objetivo].join(' ')).includes(n));
  if (dos.length) document.getElementById('intMain').insertAdjacentHTML('beforeend', `<div class="int-card" style="margin-top:14px"><h3>Dossiês encontrados</h3>${listaDossies(dos)}</div>`);
}

// ── Sessão: bloqueio por inatividade (15 min) ───────────────────────────
let _ultimaAtividade = Date.now(), _travado = false, _timerSessao = null;
function marcarAtividade() { _ultimaAtividade = Date.now(); }
function vigiarSessao() {
  if (_timerSessao) return;
  ['click', 'keydown', 'touchstart', 'scroll'].forEach(ev => document.addEventListener(ev, marcarAtividade, { passive: true, capture: true }));
  _timerSessao = setInterval(() => {
    if (_travado || document.body.dataset.pagina !== 'inteligencia') return;
    if (Date.now() - _ultimaAtividade > 15 * 60 * 1000) travar();
  }, 30000);
}
function travar() {
  _travado = true; aud('sessao_bloqueada');
  const t = document.createElement('div'); t.className = 'int-trava'; t.id = 'intTrava';
  t.innerHTML = `<div class="bx"><div style="font-weight:800;font-size:17px;margin-bottom:4px">Módulo bloqueado</div><div style="font-size:13px;color:var(--neutral-500);margin-bottom:14px">Inatividade de 15 minutos. Digite sua senha para continuar.</div><input type="password" id="intTravaSenha" placeholder="Senha" style="width:100%;margin-bottom:10px" onkeydown="if(event.key==='Enter')INT.destravar()"><button class="btn btn-primary btn-full" onclick="INT.destravar()">Continuar</button><button class="btn btn-outline btn-full" style="margin-top:8px" onclick="INT.sairTrava()">Sair do módulo</button></div>`;
  document.body.appendChild(t); fechar();
  const main = document.getElementById('intMain'); if (main) main.innerHTML = '';
}
async function destravar() {
  const senha = val('intTravaSenha'); if (!senha) return;
  const { error } = await supabase.auth.signInWithPassword({ email: CU.email, password: senha });
  if (error) return toast('Senha incorreta.', 'error');
  document.getElementById('intTrava')?.remove(); _travado = false; marcarAtividade(); aud('sessao_desbloqueada'); render();
}
function sairTrava() { document.getElementById('intTrava')?.remove(); _travado = false; go(rotaInicialPerfil()); }

// ── Navegação / API pública ─────────────────────────────────────────────
async function abrir() {
  injetarCSS();
  const root = document.getElementById('intRoot');
  if (!['admin', 'inteligencia'].includes(CU && CU.role)) { root.innerHTML = '<div class="int-vazio">Acesso restrito ao perfil INTELIGÊNCIA.</div>'; return; }
  if (_travado) return;
  vigiarSessao(); marcarAtividade();
  if (!S.ok) root.innerHTML = '<div class="int-vazio">Carregando módulo de inteligência...</div>';
  try { await carregar(); }
  catch (err) { root.innerHTML = `<div class="int-card"><b>Não foi possível abrir o módulo.</b><div style="margin-top:6px;color:var(--neutral-600)">${e(err.message)}</div></div>`; return; }
  aud('acesso', 'inteligencia');
  render();
}
let _filtroTimer = null;
Object.assign(INT_API(), {
  abrir, ir: v => { S.view = v; fechar(); render(); document.querySelector('#shell .content')?.scrollTo?.(0, 0); },
  fechar, ficha, formEnt, salvarEnt, importarSicad, buscaSicad, usarSicad, addAoDossie, arquivar,
  formVinculo, salvarVinculo, formDossie, salvarDossie, abrirDossie, incluirExistente, confirmarInclusao, salvarAndamento,
  abaDossie: a => { S.abaDossie = a; render(); }, redeDoDossie: id => { S.filtros.rede = { dos: [id], sit: ['documentado', 'informado', 'hipotese'] }; S.view = 'vinculos'; render(); },
  formIntegrante, salvarIntegrante, formComunicacao, salvarComunicacao, escolherOrg: id => { S.orgId = id; render(); },
  infoInt: (o, p) => infoIntegrante(o, p),
  zoomOrg: d => { if (d === 0) _ocZoom = null; else _ocZoom = Math.max(.35, Math.min(1.6, (_ocZoom || 1) + d * .15)); aplicarZoomOrg(); },
  nivelDaFuncao: f => { const el = document.getElementById('oNiv'); if (el) el.value = String(FUNCOES[f] || 4); },
  formDoc, salvarDoc, abrirDoc, baixarDoc, formRelatorio, salvarRel, abrirRel, fluxoRel, gerarPDF, salvarPerms, pesquisar, novaLocalidade,
  destravar, sairTrava, abaAud: a => { S.abaAud = a; render(); },
  verRede: id => { _redeFoco = id; S.filtros.rede = { dos: [], sit: ['documentado', 'informado', 'hipotese'] }; S.view = 'vinculos'; render(); },
  verMapa: id => { _mapaFoco = id; S.view = 'mapa'; render(); },
  filtrarCentral: f => { S.filtros.central = f; S.view = 'central'; render(); },
  redeDos: (id, on) => { const f = S.filtros.rede; f.dos = on ? [...f.dos, id] : f.dos.filter(x => x !== id); render(); },
  redeSit: (k, on) => { const f = S.filtros.rede; f.sit = on ? [...f.sit, k] : f.sit.filter(x => x !== k); render(); },
  setFiltro: (chave, k, v, ja) => {
    S.filtros[chave] = Object.assign({}, S.filtros[chave], { [k]: v });
    clearTimeout(_filtroTimer);
    const redesenhar = () => {
      if (['central', ...Object.keys(TIPOS)].includes(S.view) && k === 'q') { const html = VIEWS[S.view](); const tmp = document.createElement('div'); tmp.innerHTML = html; const novo = tmp.querySelector('#intTabEnt'); const at = document.getElementById('intTabEnt'); if (novo && at) { at.innerHTML = novo.innerHTML; return; } }
      if (S.view === 'dossies' && k === 'q') { const tmp = document.createElement('div'); tmp.innerHTML = VIEWS.dossies(); const at = document.getElementById('intTabDos'); if (at) { at.innerHTML = tmp.querySelector('#intTabDos').innerHTML; return; } }
      render();
    };
    if (ja) redesenhar(); else _filtroTimer = setTimeout(redesenhar, 200);
  },
  _estado: S
});
function INT_API() { return (window.INT = window.INT || {}); }
})();
