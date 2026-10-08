/* =====================================================================
   QUESTÕES DE RESIDÊNCIA — Atenção ao Câncer e Cuidados Paliativos
   Mesma interface da área de questões do Leitor de Legislação.
   Sem login: as respostas de cada pessoa ficam guardadas no próprio aparelho.
   ===================================================================== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const agoraISO = () => new Date().toISOString();
const dataHora = iso => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dataCurta = d => { const [a, m, dd] = d.split("-"); return `${dd}/${m}`; };

/* ---------- armazenamento local (com reserva em memória) ---------- */
const memoria = {};
function lerLS(chave, padrao) {
  try { const v = localStorage.getItem("rq-" + chave); return v ? JSON.parse(v) : padrao; }
  catch { return chave in memoria ? memoria[chave] : padrao; }
}
function gravarLS(chave, valor) {
  memoria[chave] = valor;
  try { localStorage.setItem("rq-" + chave, JSON.stringify(valor)); } catch {}
}
const dados = Object.assign({ respostas: [], resets: [], favs: {}, notas: {} }, lerLS("dados", {}));
const salvarDados = () => gravarLS("dados", dados);

/* ---------- ajustes de leitura ---------- */
const ajustes = Object.assign({ fonte: 19, tema: "auto" }, lerLS("ajustes", {}));
function aplicarAjustes() {
  document.documentElement.style.setProperty("--fonte", ajustes.fonte + "px");
  if (ajustes.tema === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", ajustes.tema);
  gravarLS("ajustes", ajustes);
}
aplicarAjustes();

/* ---------- banco de questões ---------- */
const EIXOS = ["SUS Geral", "Atenção ao Câncer e Cuidados Paliativos", "Conhecimentos Específicos em Biomedicina"];
const EIXO_CURTO = { "SUS Geral": "SUS", "Atenção ao Câncer e Cuidados Paliativos": "Câncer e Paliativos", "Conhecimentos Específicos em Biomedicina": "Biomedicina" };
const NIVEIS = ["Fácil", "Médio", "Difícil"];
const seloNivel = n => n ? `<span class="selo-nivel nivel-${NIVEIS.indexOf(n)}" title="Nível de dificuldade"><span class="barras" aria-hidden="true"><i></i><i></i><i></i></span>${esc(n)}</span>` : "";
const ORIGEM_ROTULO = { prova: "Provas ASCES-UNITA", internet: "Provas de outras instituições", autoral: "Questões autorais" };
const banco = { provas: {}, q: new Map(), cadernos: {} };

async function carregarBanco() {
  const r = await fetch("dados/questoes.json", { cache: "no-cache" });
  const j = await r.json();
  for (const p of j.provas) banco.provas[p.id] = p;
  const ordemEixo = e => EIXOS.indexOf(e);
  for (const q of j.questoes) {
    const p = banco.provas[q.prova];
    q.origem = p.origem;
    q.rotulo = p.origem === "autoral" ? "Questão autoral" : `${p.banca} · ${p.ano}${q.num ? ` · questão ${q.num}` : ""}`;
    banco.q.set(q.id, q);
  }
  const todas = [...banco.q.values()];
  const novoCaderno = (id, titulo, sub, lista, grupo) => {
    lista.sort((a, b) => ordemEixo(a.eixo) - ordemEixo(b.eixo) || (a.num || 0) - (b.num || 0));
    banco.cadernos[id] = { id, titulo, sub, grupo, questoes: lista,
      assuntos: [...new Set(lista.map(q => q.assunto))], eixos: EIXOS.filter(e => lista.some(q => q.eixo === e)) };
  };
  for (const p of j.provas) {
    if (p.origem === "autoral") continue;
    novoCaderno(p.id, p.titulo, p.obs || "", todas.filter(q => q.prova === p.id), p.origem);
  }
  for (const e of EIXOS) {
    const l = todas.filter(q => q.origem === "autoral" && q.eixo === e);
    if (l.length) novoCaderno("autorais-" + EIXOS.indexOf(e), `Autorais — ${EIXO_CURTO[e]}`, "Questões inéditas no estilo da banca, com comentário em todas.", l, "autoral");
  }
  novoCaderno("todas", "Todas as questões", "O banco completo, com filtros por eixo, origem e assunto.", todas, "geral");
  const sim = lerLS("simulado", null);
  if (sim) montarCadernoSimulado(sim);
}
function montarCadernoSimulado(sim) {
  const lista = sim.ids.map(id => banco.q.get(id)).filter(Boolean);
  banco.cadernos.simulado = { id: "simulado", titulo: "Simulado", sub: `Criado em ${dataHora(sim.criado)}`, grupo: "simulado",
    questoes: lista, assuntos: [...new Set(lista.map(q => q.assunto))], eixos: EIXOS.filter(e => lista.some(q => q.eixo === e)), manterOrdem: true };
}

/* ---------- respostas, rodadas e situação ----------
   Toda resposta fica guardada (estatísticas usam todas).
   "Redefinir" cria um marco: as questões voltam a ficar sem resposta na rodada atual. */
function mapaRespostas() {
  const m = new Map();
  for (const r of dados.respostas) { if (!m.has(r.q)) m.set(r.q, []); m.get(r.q).push(r); }
  m.resets = new Map();
  for (const r of dados.resets) for (const q of r.ids) if (!m.resets.has(q) || m.resets.get(q) < r.em) m.resets.set(q, r.em);
  return m;
}
function respostaAtual(mapa, qid) {
  const l = mapa.get(qid);
  if (!l || !l.length) return null;
  const ult = l[l.length - 1];
  const marco = mapa.resets.get(qid);
  return marco && ult.em <= marco ? null : ult;
}
const situacaoQ = (mapa, qid) => { const r = respostaAtual(mapa, qid); return !r ? "nao" : r.correta ? "certa" : "errada"; };
const jaErrou = (mapa, qid) => (mapa.get(qid) || []).some(r => !r.correta);
const contaNasEstat = q => !q.anulada;
function redefinirQuestoes(ids) { if (ids.length) { dados.resets.push({ ids, em: agoraISO() }); salvarDados(); } }

/* ---------- topo, abas e painel ---------- */
function definirTopo({ titulo, voltar = null }) {
  $("#titulo").textContent = titulo;
  const b = $("#btn-voltar");
  b.classList.toggle("oculto", !voltar);
  b.onclick = () => { location.hash = voltar; };
}
function marcarAba(rota) {
  $("#abas").classList.remove("oculto");
  $$("#abas button").forEach(b => { if (b.dataset.rota === rota) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
}
$$("#abas button").forEach(b => b.onclick = () => { location.hash = b.dataset.rota === "cadernos" ? "#/" : "#/" + b.dataset.rota; });
const botaoFechar = `<button class="icone-btn" data-fechar aria-label="Fechar">✕</button>`;
function abrirPainel(html) {
  $("#painel-caixa").innerHTML = html;
  $("#painel").classList.remove("oculto");
  $$("[data-fechar]", $("#painel")).forEach(b => b.onclick = fecharPainel);
}

/* confirmações e avisos dentro da própria página (sem pop-up do navegador) */
function confirmar(msg, ok = "Confirmar", cancelar = "Cancelar") {
  return new Promise(res => {
    abrirPainel(`<h2>Confirmar ${botaoFechar}</h2><p style="line-height:1.5;white-space:pre-line">${esc(msg)}</p>
      <div class="acoes-linha" style="margin-top:12px"><button class="botao primario" id="cf-ok">${esc(ok)}</button><button class="botao" id="cf-nao">${esc(cancelar)}</button></div>`);
    $("#cf-ok").onclick = () => { fecharPainel(); res(true); };
    $("#cf-nao").onclick = () => { fecharPainel(); res(false); };
    $$("[data-fechar]", $("#painel")).forEach(b => b.onclick = () => { fecharPainel(); res(false); });
  });
}
function avisar(msg) { abrirPainel(`<h2>Aviso ${botaoFechar}</h2><p style="line-height:1.5">${esc(msg)}</p>`); }
function fecharPainel() { $("#painel").classList.add("oculto"); }
$("#painel").addEventListener("click", e => { if (e.target.id === "painel") fecharPainel(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") fecharPainel(); });

/* ---------- estatísticas ----------
   Rodada atual: situação de cada questão desde o último "redefinir".
   Histórico: TODAS as respostas já dadas (nada é apagado ao redefinir). */
function estatisticas(lista, mapa) {
  let resolvidas = 0, certas = 0, erradas = 0, respostas = 0, acertosTotal = 0, errosTotal = 0, tempo = 0;
  const porAssunto = {}, porEixo = {}, porOrigem = {}, porNivel = {}, porDia = {}, erros = [];
  const validas = lista.filter(contaNasEstat);
  for (const q of validas) {
    const rs = mapa.get(q.id) || [];
    const grupos = [[porAssunto, q.assunto], [porEixo, q.eixo], [porOrigem, ORIGEM_ROTULO[q.origem]], [porNivel, q.nivel || "Médio"]].map(([o, k]) => o[k] = o[k] || { total: 0, respostas: 0, acertos: 0, erros: 0 });
    grupos.forEach(g => g.total++);
    const atual = respostaAtual(mapa, q.id);
    if (atual) { resolvidas++; if (atual.correta) certas++; else erradas++; }
    let nErros = 0;
    for (const r of rs) {
      respostas++; tempo += r.tempo || 0;
      grupos.forEach(g => { g.respostas++; if (r.correta) g.acertos++; else g.erros++; });
      if (r.correta) acertosTotal++; else { errosTotal++; nErros++; }
      const d = new Date(r.em).toLocaleDateString("sv-SE");
      const pd = porDia[d] = porDia[d] || { certas: 0, erradas: 0 };
      if (r.correta) pd.certas++; else pd.erradas++;
    }
    if (nErros) erros.push({ q, nErros, tentativas: rs.length });
  }
  erros.sort((a, b) => b.nErros - a.nErros || b.tentativas - a.tentativas);
  return { total: validas.length, resolvidas, certas, erradas, respostas, acertosTotal, errosTotal, tempo, porAssunto, porEixo, porOrigem, porNivel, porDia, erros,
           pctTotal: respostas ? Math.round(100 * acertosTotal / respostas) : 0 };
}
function tabelaDesempenho(obj, ordem) {
  const chaves = ordem ? ordem.filter(k => obj[k]) : Object.keys(obj).sort((a, b) => a.localeCompare(b, "pt"));
  return `<div class="tabela-desemp">${chaves.map(k => {
    const v = obj[k];
    const pct = v.respostas ? Math.round(100 * v.acertos / v.respostas) : null;
    return `<div class="linha-desemp"><span class="nome-desemp">${esc(k)} <span class="contagem">(${v.total} questões)</span></span>
      <span class="barra-desemp" aria-hidden="true"><span class="b-ok" style="width:${v.respostas ? 100 * v.acertos / v.respostas : 0}%"></span><span class="b-erro" style="width:${v.respostas ? 100 * v.erros / v.respostas : 0}%"></span></span>
      <span class="num-desemp">${v.respostas ? `${v.acertos} ✓ · ${v.erros} ✗ · ${pct}%` : "sem respostas"}</span></div>`;
  }).join("")}</div>`;
}
function graficoDias(porDia) {
  const dias = [];
  for (let k = 29; k >= 0; k--) dias.push(new Date(Date.now() - k * 864e5).toLocaleDateString("sv-SE"));
  const max = Math.max(1, ...dias.map(d => (porDia[d]?.certas || 0) + (porDia[d]?.erradas || 0)));
  const L = 600, A = 140, w = L / 30;
  let barras = "";
  dias.forEach((d, k) => {
    const c = porDia[d]?.certas || 0, e = porDia[d]?.erradas || 0;
    const hc = A * c / max, he = A * e / max;
    barras += `<rect x="${k * w + 2}" y="${A - hc}" width="${w - 4}" height="${hc}" fill="var(--ok)"><title>${dataCurta(d)}: ${c} acertos</title></rect>`;
    barras += `<rect x="${k * w + 2}" y="${A - hc - he}" width="${w - 4}" height="${he}" fill="var(--alt)"><title>${dataCurta(d)}: ${e} erros</title></rect>`;
  });
  return `<svg class="grafico-dias" viewBox="0 0 ${L} ${A + 18}" role="img" aria-label="Respostas por dia nos últimos 30 dias">
    <line x1="0" y1="${A}" x2="${L}" y2="${A}" stroke="var(--fio)"/>${barras}
    <text x="0" y="${A + 14}" font-size="11" fill="var(--tinta-2)">${dataCurta(dias[0])}</text>
    <text x="${L}" y="${A + 14}" font-size="11" fill="var(--tinta-2)" text-anchor="end">hoje</text></svg>`;
}
const formatarTempo = s => { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; };

/* ---------- tela inicial: cadernos ---------- */
const CORES_ABA = ["#5E6B25", "#2E6F8E", "#8E4A2E", "#6B3F8E", "#2E7A4C", "#A8740F", "#B23A3A", "#3F5E8E"];
function telaCadernos() {
  definirTopo({ titulo: "Questões de Residência" });
  marcarAba("cadernos");
  const mapa = mapaRespostas();
  const g = estatisticas([...banco.q.values()], mapa);
  const total = banco.q.size;
  let h = `<div class="secao"><div class="cartao">
    <p style="font-family:var(--serif);font-size:19px;color:var(--tinta);margin:12px 0 4px"><strong>Residência Multiprofissional em Atenção ao Câncer e Cuidados Paliativos</strong></p>
    <p style="margin-top:0">Biomedicina · ${total} questões com gabarito e comentário · provas da ASCES-UNITA, de outras instituições e questões autorais.</p>
    <p><strong>Seu desempenho:</strong> ${g.respostas} respostas registradas · <span class="txt-ok">${g.acertosTotal} acertos</span> · <span class="txt-erro">${g.errosTotal} erros</span>${g.respostas ? ` · <strong>${g.pctTotal}% de acerto</strong>` : ""}</p>
    <div class="acoes-linha" style="margin-bottom:14px"><a class="botao" href="#/estatisticas" style="color:inherit;text-decoration:none">Ver desempenho completo</a>
      <a class="botao primario" href="#/simulado" style="text-decoration:none">⏱ Montar simulado</a></div>
  </div></div>`;
  const grupos = [["prova", ORIGEM_ROTULO.prova], ["internet", ORIGEM_ROTULO.internet], ["autoral", ORIGEM_ROTULO.autoral], ["simulado", "Seu simulado"], ["geral", "Banco completo"]];
  let cor = 0;
  for (const [gid, rot] of grupos) {
    const cads = Object.values(banco.cadernos).filter(c => c.grupo === gid);
    if (!cads.length) continue;
    h += `<h2 class="grupo-cadernos">${esc(rot)}</h2><ul class="acervo">`;
    for (const c of cads) {
      const e = estatisticas(c.questoes, mapa);
      const nEixos = c.eixos.map(x => `${c.questoes.filter(q => q.eixo === x).length} ${EIXO_CURTO[x]}`).join(" · ");
      h += `<li class="lei-item" style="--cor-aba:${CORES_ABA[cor++ % CORES_ABA.length]};grid-template-columns:10px 1fr"><span class="aba"></span>
        <button class="abrir" data-href="#/caderno/${esc(c.id)}">
          <span class="lei-nome">${esc(c.titulo)}</span>
          <span class="lei-num">${c.questoes.length} questões · ${esc(nEixos)}</span>
          <span class="lei-verif">${NIVEIS.map(n => `${c.questoes.filter(q => q.nivel === n).length} ${n.toLowerCase()}${c.questoes.filter(q => q.nivel === n).length === 1 ? "" : "s"}`).join(" · ").replace(/médios?/, m => m).replace(/fácils/, "fáceis").replace(/difícils/, "difíceis")}</span>
          <span class="barra-prog" aria-hidden="true"><span style="width:${e.total ? Math.round(100 * e.resolvidas / e.total) : 0}%"></span></span>
          <span class="lei-verif">Rodada atual: ${e.resolvidas} de ${e.total} resolvidas · Histórico: ${e.acertosTotal} acertos e ${e.errosTotal} erros${e.respostas ? ` (${e.pctTotal}%)` : ""}</span>
        </button></li>`;
    }
    h += "</ul>";
  }
  h += `<p class="marca-dagua">Gabaritos das provas da ASCES-UNITA revisados com base na legislação e nas diretrizes vigentes. Questões de outras instituições com gabarito oficial definitivo.</p>`;
  $("#conteudo").innerHTML = h;
  ligarHrefs();
}
function ligarHrefs(raiz = document) { $$("[data-href]", raiz).forEach(b => b.onclick = () => { fecharPainel(); location.hash = b.dataset.href; }); }

/* ---------- caderno: abas Questões / Índice / Gabarito / Estatísticas ---------- */
function filtrosDe(c) { return Object.assign({ assunto: "", situacao: "", eixo: "", origem: "", nivel: "" }, lerLS("filtros", {})[c.id] || {}); }
function gravarFiltros(c, f) { const t = lerLS("filtros", {}); t[c.id] = f; gravarLS("filtros", t); }
function listaFiltrada(c, mapa) {
  const f = filtrosDe(c);
  return c.questoes.filter(q => (!f.assunto || q.assunto === f.assunto) && (!f.eixo || q.eixo === f.eixo) && (!f.origem || q.origem === f.origem) && (!f.nivel || q.nivel === f.nivel) &&
    (!f.situacao || (f.situacao === "favoritas" ? dados.favs[q.id] : f.situacao === "ja-errei" ? jaErrou(mapa, q.id) : situacaoQ(mapa, q.id) === f.situacao)));
}
let sessao = null, cronometro = null;
function telaCaderno(cid, aba = "questoes", qAlvo = null) {
  const c = banco.cadernos[cid];
  if (!c) { $("#conteudo").innerHTML = `<p class="vazio">Caderno não encontrado.</p>`; return; }
  sessao = c;
  definirTopo({ titulo: c.titulo, voltar: "#/" });
  $("#abas").classList.add("oculto");
  const mapa = mapaRespostas();
  const f = filtrosDe(c);
  const baseAssuntos = c.questoes.filter(q => (!f.eixo || q.eixo === f.eixo) && (!f.origem || q.origem === f.origem));
  const assuntos = [...new Set(baseAssuntos.map(q => q.assunto))].sort((a, b) => a.localeCompare(b, "pt"));
  if (f.assunto && !assuntos.includes(f.assunto)) { f.assunto = ""; gravarFiltros(c, f); }
  const origens = [...new Set(c.questoes.map(q => q.origem))];
  const lista = listaFiltrada(c, mapa);
  c.lista = lista;
  $("#conteudo").innerHTML = `<div class="secao">
    ${c.sub ? `<p class="contagem" style="margin:0 0 10px">${esc(c.sub)}</p>` : ""}
    <div class="filtros"><div class="segmentado" id="abas-caderno">
      ${[["questoes", "Questões"], ["indice", "Índice"], ["gabarito", "Gabarito"], ["estatisticas", "Estatísticas"]].map(([v, r]) =>
        `<button data-aba-cad="${v}" aria-pressed="${aba === v}">${r}</button>`).join("")}
    </div></div>
    <div class="filtros">
      ${c.eixos.length > 1 ? `<select class="campo" id="f-eixo"><option value="">Todos os eixos</option>${c.eixos.map(e => `<option value="${esc(e)}" ${f.eixo === e ? "selected" : ""}>${esc(EIXO_CURTO[e])} (${c.questoes.filter(q => q.eixo === e).length})</option>`).join("")}</select>` : ""}
      ${origens.length > 1 ? `<select class="campo" id="f-origem"><option value="">Todas as origens</option>${origens.map(o => `<option value="${o}" ${f.origem === o ? "selected" : ""}>${esc(ORIGEM_ROTULO[o])}</option>`).join("")}</select>` : ""}
      <select class="campo" id="f-nivel"><option value="">Todos os níveis</option>${NIVEIS.map(n => `<option ${f.nivel === n ? "selected" : ""}>${n}</option>`).join("")}</select>
      <select class="campo" id="f-assunto"><option value="">Todos os assuntos (${baseAssuntos.length})</option>
        ${assuntos.map(a => `<option value="${esc(a)}" ${f.assunto === a ? "selected" : ""}>${esc(a)} (${baseAssuntos.filter(q => q.assunto === a).length})</option>`).join("")}</select>
      <select class="campo" id="f-situacao">
        ${[["", "Todas"], ["nao", "Não resolvidas"], ["errada", "Que errei (rodada atual)"], ["certa", "Que acertei (rodada atual)"], ["ja-errei", "Que já errei alguma vez"], ["favoritas", "★ Favoritas"]].map(([v, r]) =>
          `<option value="${v}" ${f.situacao === v ? "selected" : ""}>${r}</option>`).join("")}</select>
      ${lista.length ? `<button class="botao" id="redefinir-lista">Redefinir esta lista (${lista.length})</button>` : ""}
    </div>
    <div id="area-caderno"></div></div>`;
  const aplicar = () => {
    gravarFiltros(c, { assunto: $("#f-assunto").value, situacao: $("#f-situacao").value, nivel: $("#f-nivel").value, eixo: $("#f-eixo")?.value || "", origem: $("#f-origem")?.value || "" });
    telaCaderno(cid, aba);
  };
  ["#f-assunto", "#f-situacao", "#f-eixo", "#f-origem", "#f-nivel"].forEach(s => { if ($(s)) $(s).onchange = aplicar; });
  $$("[data-aba-cad]").forEach(b => b.onclick = () => { location.hash = `#/caderno/${cid}` + (b.dataset.abaCad === "questoes" ? "" : "/" + b.dataset.abaCad); });
  const br = $("#redefinir-lista");
  if (br) br.onclick = async () => {
    if (!await confirmar(`As ${lista.length} questões desta lista voltam a ficar sem resposta, para você resolver de novo.\n\nSuas estatísticas continuam com todos os acertos e erros já registrados. Redefinir?`)) return;
    redefinirQuestoes(lista.map(q => q.id));
    const f2 = filtrosDe(c);
    if (["errada", "certa"].includes(f2.situacao)) { f2.situacao = ""; gravarFiltros(c, f2); }
    const pos = lerLS("pos", {}); delete pos[c.id]; gravarLS("pos", pos);
    telaCaderno(cid, "questoes", lista[0].id);
  };
  if (aba === "indice") return abaIndice(mapa);
  if (aba === "gabarito") return abaGabarito(mapa);
  if (aba === "estatisticas") return abaEstatisticas(lista, mapa, true);
  abaQuestao(mapa, qAlvo);
}
function gruposPorAssunto(l) {
  const ordem = [];
  for (const q of l) if (!ordem.includes(q.assunto)) ordem.push(q.assunto);
  return sessao.manterOrdem || sessao.id === "todas" ? ordem.sort((a, b) => a.localeCompare(b, "pt")) : ordem;
}
function abaIndice(mapa) {
  const l = sessao.lista;
  if (!l.length) { $("#area-caderno").innerHTML = `<p class="vazio">Nenhuma questão com esses filtros.</p>`; return; }
  const icone = { nao: "•", certa: "✓", errada: "✗" };
  let h = "";
  for (const a of gruposPorAssunto(l)) {
    const qs = l.filter(q => q.assunto === a);
    h += `<h3 class="grupo-assunto">${esc(a)} <span class="contagem">(${qs.length})</span></h3><ul class="resultados">`;
    for (const q of qs) {
      const s = situacaoQ(mapa, q.id);
      h += `<li><button data-href="#/caderno/${esc(sessao.id)}/questao/${esc(q.id)}"><span class="res-titulo"><span class="sit sit-${s}">${icone[s]}</span> Questão ${l.indexOf(q) + 1}${dados.favs[q.id] ? " ★" : ""} — ${esc(q.rotulo)} ${seloNivel(q.nivel)}${q.anulada ? '<span class="selo-anulada">Anulada</span>' : ""}</span>
        <span class="res-trecho">${esc(q.enunciado.join(" ").slice(0, 160))}…</span></button></li>`;
    }
    h += "</ul>";
  }
  $("#area-caderno").innerHTML = h;
  ligarHrefs($("#area-caderno"));
}
function abaGabarito(mapa) {
  const l = sessao.lista;
  let mostrar = false;
  try { mostrar = sessionStorage.getItem("rq-mostrar-gabarito") === "1"; } catch {}
  let h = `<div class="acoes-linha" style="margin:4px 0 12px"><button class="botao" id="alt-gab">${mostrar ? "Esconder o gabarito" : "Mostrar o gabarito"}</button></div>`;
  if (!mostrar) h += `<p class="contagem">O gabarito fica escondido para não atrapalhar quem ainda vai resolver. Suas respostas da rodada atual aparecem em verde (acerto) ou vermelho (erro).</p>`;
  for (const a of gruposPorAssunto(l)) {
    const qs = l.filter(q => q.assunto === a);
    h += `<h3 class="grupo-assunto">${esc(a)}</h3><div class="grade-gabarito">`;
    for (const q of qs) {
      const r = respostaAtual(mapa, q.id);
      const cls = r ? (r.correta ? "certa" : "errada") : "";
      h += `<button class="cel-gab ${cls}" data-href="#/caderno/${esc(sessao.id)}/questao/${esc(q.id)}"><span>${l.indexOf(q) + 1}</span><strong>${mostrar ? (q.anulada ? "X" : esc(q.gabarito)) : r ? esc(r.marcada) : "–"}</strong></button>`;
    }
    h += "</div>";
  }
  $("#area-caderno").innerHTML = h;
  ligarHrefs($("#area-caderno"));
  $("#alt-gab").onclick = () => { try { sessionStorage.setItem("rq-mostrar-gabarito", mostrar ? "0" : "1"); } catch {} abaGabarito(mapa); };
}

/* ---------- resolução de uma questão ---------- */
const riscadas = {};
let inicioQuestao = 0;
function abaQuestao(mapa, qAlvo) {
  const l = sessao.lista;
  if (!l.length) { $("#area-caderno").innerHTML = `<p class="vazio">Nenhuma questão com esses filtros. Mude o eixo, o assunto ou a situação acima.</p>`; return; }
  const pos = lerLS("pos", {});
  let i = qAlvo ? l.findIndex(q => q.id === qAlvo) : l.findIndex(q => q.id === pos[sessao.id]);
  if (i < 0) i = 0;
  mostrarQuestao(i, mapa);
}
function cabecalhoRodada(l, mapa) {
  const e = estatisticas(l, mapa);
  return `(${e.resolvidas} resolvidas, <span class="txt-ok">${e.certas} acertos</span> e <span class="txt-erro">${e.erradas} erros</span>)`;
}
function htmlComentario(q, r) {
  const ok = r ? r.correta : true;
  return `<div class="comentario-q ${ok ? "" : "erro"}"><strong>Gabarito: ${esc(q.gabarito)}${q.anulada ? " (questão anulada pela banca)" : ""}</strong>${esc(q.comentario)}</div>`;
}
function mostrarQuestao(i, mapa = mapaRespostas()) {
  const l = sessao.lista;
  const q = l[i];
  const pos = lerLS("pos", {}); pos[sessao.id] = q.id; gravarLS("pos", pos);
  const todas = mapa.get(q.id) || [];
  const atual = respostaAtual(mapa, q.id);
  const fav = !!dados.favs[q.id];
  const nota = dados.notas[q.id];
  riscadas[q.id] = riscadas[q.id] || [];
  inicioQuestao = Date.now();
  const historico = todas.length ? `Histórico desta questão: ${todas.filter(r => r.correta).length} acerto(s) e ${todas.filter(r => !r.correta).length} erro(s) em ${todas.length} resposta(s).` : "";
  $("#area-caderno").innerHTML = `<article class="questao" data-q="${esc(q.id)}">
    <div class="q-cab">
      <div><strong>Questão ${i + 1} de ${l.length}</strong> <span class="contagem" id="q-rodada">${cabecalhoRodada(l, mapa)}</span></div>
      <div class="cronometro" title="Tempo de estudo nesta sessão">⏱ <span id="crono-t">00:00</span> <button class="link" id="crono-p">pausar</button></div>
    </div>
    <p class="q-meta">${esc(EIXO_CURTO[q.eixo])} · Assunto: ${esc(q.assunto)}</p>
    <p class="q-selos">${seloNivel(q.nivel)}</p>
    <p class="q-prova">${q.origem === "autoral" ? '<span class="selo-origem">Questão autoral</span>' : esc(q.rotulo)}${q.anulada ? '<span class="selo-anulada">Anulada</span>' : ""}</p>
    ${q.anulada ? `<p class="aviso-anulada">Esta questão foi anulada pela banca. Ela continua aqui para estudo, mas não entra nas suas estatísticas.</p>` : ""}
    <div class="q-enunciado">${q.enunciado.map(p => `<p>${esc(p)}</p>`).join("")}</div>
    <ul class="alternativas" role="radiogroup" aria-label="Alternativas">
      ${q.alternativas.map(a => `<li><button class="alt ${riscadas[q.id].includes(a.letra) ? "riscada" : ""}" role="radio" aria-checked="false" data-letra="${esc(a.letra)}">
        <span class="letra">${esc(a.letra)}</span><span class="alt-texto">${esc(a.texto)}</span></button>
        <button class="riscar" data-riscar="${esc(a.letra)}" aria-label="Riscar a alternativa ${esc(a.letra)}" title="Riscar alternativa">✂</button></li>`).join("")}
    </ul>
    <div class="acoes-q"><button class="botao primario" id="btn-responder" disabled>Responder</button></div>
    <div id="resultado-q" aria-live="polite"></div>
    <p class="contagem" id="q-historico">${historico}</p>
    <div class="barra-q">
      <button class="icone-btn" data-nav="-1" aria-label="Questão anterior" ${i === 0 ? "disabled" : ""}>← Anterior</button>
      <button class="icone-btn" data-nav="1" aria-label="Próxima questão" ${i === l.length - 1 ? "disabled" : ""}>Próxima →</button>
      <button class="icone-btn" id="q-aleatoria">Aleatória</button>
      <button class="icone-btn" id="q-fav" aria-pressed="${fav}">${fav ? "★ Favorita" : "☆ Favoritar"}</button>
      <button class="icone-btn" id="q-nota">${nota ? "✎ Minha anotação" : "✎ Anotar"}</button>
    </div>
  </article>`;
  iniciarCronometro();

  // Questão já respondida nesta rodada: fica travada com a sua resposta até você redefinir a lista.
  const exibirResultado = r => {
    $$(".alt").forEach(x => {
      x.disabled = true;
      if (x.dataset.letra === q.gabarito) x.classList.add("certa");
      else if (x.dataset.letra === r.marcada) x.classList.add("errada");
      if (x.dataset.letra === r.marcada) { x.classList.add("marcada"); x.setAttribute("aria-checked", "true"); }
    });
    $$(".riscar").forEach(x => { x.disabled = true; });
    $(".acoes-q").classList.add("oculto");
    $("#resultado-q").innerHTML = (r.correta ? `<p class="res-q ok">✓ Você acertou!</p>` : `<p class="res-q erro">✗ Você errou. Resposta: <strong>${esc(q.gabarito)}</strong>.</p>`) +
      htmlComentario(q, r) + `<p class="contagem">Respondida em ${dataHora(r.em)}. Para resolver de novo, use “Redefinir esta lista”.</p>`;
  };
  if (atual) exibirResultado(atual);

  let marcada = null;
  $$(".alt").forEach(b => b.onclick = () => {
    if (b.disabled) return;
    marcada = b.dataset.letra;
    $$(".alt").forEach(x => { x.classList.toggle("marcada", x === b); x.setAttribute("aria-checked", x === b); });
    $("#btn-responder").disabled = false;
  });
  $$("[data-riscar]").forEach(b => b.onclick = () => {
    const letra = b.dataset.riscar;
    const r = riscadas[q.id];
    riscadas[q.id] = r.includes(letra) ? r.filter(x => x !== letra) : [...r, letra];
    b.previousElementSibling.classList.toggle("riscada");
  });
  $("#btn-responder").onclick = () => {
    if (!marcada) return;
    $("#btn-responder").disabled = true;
    const tempo = Math.min(1800, Math.round((Date.now() - inicioQuestao) / 1000));
    const r = { id: uid(), q: q.id, marcada, correta: marcada === q.gabarito, em: agoraISO(), tempo };
    if (!q.anulada) { dados.respostas.push(r); salvarDados(); }
    exibirResultado(r);
    const m2 = mapaRespostas();
    $("#q-rodada").innerHTML = cabecalhoRodada(l, m2);
    const t = m2.get(q.id) || [];
    $("#q-historico").textContent = q.anulada ? "Questão anulada: esta resposta não foi registrada." :
      `Histórico desta questão: ${t.filter(x => x.correta).length} acerto(s) e ${t.filter(x => !x.correta).length} erro(s) em ${t.length} resposta(s).`;
  };
  $$("[data-nav]").forEach(b => b.onclick = () => { mostrarQuestao(i + Number(b.dataset.nav)); window.scrollTo(0, 0); });
  $("#q-aleatoria").onclick = () => {
    const m = mapaRespostas();
    const pendentes = l.map((x, k) => k).filter(k => k !== i && situacaoQ(m, l[k].id) === "nao");
    const pool = pendentes.length ? pendentes : l.map((x, k) => k).filter(k => k !== i);
    if (pool.length) { mostrarQuestao(pool[Math.floor(Math.random() * pool.length)]); window.scrollTo(0, 0); }
  };
  $("#q-fav").onclick = () => {
    if (dados.favs[q.id]) delete dados.favs[q.id]; else dados.favs[q.id] = true;
    salvarDados();
    const f = !!dados.favs[q.id];
    $("#q-fav").textContent = f ? "★ Favorita" : "☆ Favoritar";
    $("#q-fav").setAttribute("aria-pressed", f);
  };
  $("#q-nota").onclick = () => painelNota(q);
}
function painelNota(q) {
  abrirPainel(`<h2>Minha anotação ${botaoFechar}</h2>
    <p class="contagem">Sua anotação sobre esta questão (pegadinha, fundamento, norma cobrada). Fica guardada neste aparelho e entra no backup.</p>
    <textarea class="campo" id="nota-q" placeholder="Ex.: na RAS as relações são horizontais (Portaria 4.279/2010).">${esc(dados.notas[q.id] || "")}</textarea>
    <div class="acoes-linha" style="margin-top:10px"><button class="botao primario" id="salvar-nota-q">Salvar anotação</button></div>`);
  $("#nota-q").focus();
  $("#salvar-nota-q").onclick = () => {
    const texto = $("#nota-q").value.trim();
    if (texto) dados.notas[q.id] = texto; else delete dados.notas[q.id];
    salvarDados(); fecharPainel();
    const btn = $("#q-nota"); if (btn) btn.textContent = texto ? "✎ Minha anotação" : "✎ Anotar";
  };
}
function iniciarCronometro() {
  if (!cronometro || cronometro.sessao !== sessao.id) cronometro = { sessao: sessao.id, acumulado: 0, desde: Date.now(), pausado: false };
  const pintar = () => {
    const el = $("#crono-t");
    if (!el) return;
    const s = Math.floor((cronometro.acumulado + (cronometro.pausado ? 0 : Date.now() - cronometro.desde)) / 1000);
    const hh = Math.floor(s / 3600), mm = Math.floor(s / 60) % 60, ss = s % 60;
    el.textContent = (hh ? String(hh).padStart(2, "0") + ":" : "") + String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
    $("#crono-p").textContent = cronometro.pausado ? "continuar" : "pausar";
  };
  clearInterval(cronometro.intervalo);
  cronometro.intervalo = setInterval(pintar, 1000);
  pintar();
  $("#crono-p").onclick = () => {
    if (cronometro.pausado) { cronometro.desde = Date.now(); cronometro.pausado = false; }
    else { cronometro.acumulado += Date.now() - cronometro.desde; cronometro.pausado = true; }
    pintar();
  };
}

/* ---------- estatísticas (no caderno e gerais) ---------- */
function abaEstatisticas(lista, mapa, noCaderno) {
  const e = estatisticas(lista, mapa);
  const alvo = noCaderno ? $("#area-caderno") : $("#conteudo");
  if (!e.total) { alvo.innerHTML = `<p class="vazio">Nenhuma questão com esses filtros.</p>`; return; }
  const idCad = q => noCaderno ? sessao.id : "todas";
  alvo.innerHTML = `${noCaderno ? "" : '<div class="secao">'}
    <h3 class="grupo-assunto" style="margin-top:6px">Histórico (todas as respostas já dadas)</h3>
    <div class="numeros-desemp">
      <div><strong>${e.respostas}</strong><span>respostas registradas</span></div>
      <div><strong class="txt-ok">${e.acertosTotal}</strong><span>acertos</span></div>
      <div><strong class="txt-erro">${e.errosTotal}</strong><span>erros</span></div>
      <div><strong>${e.respostas ? e.pctTotal + "%" : "—"}</strong><span>de acerto</span></div>
      <div><strong>${formatarTempo(e.tempo)}</strong><span>resolvendo</span></div>
    </div>
    <p class="contagem">Rodada atual: ${e.resolvidas} de ${e.total} questões resolvidas (${e.certas} certas e ${e.erradas} erradas). Redefinir uma lista começa uma nova rodada, mas não apaga nada do histórico. Questões anuladas não entram na conta.</p>
    <h3 class="grupo-assunto">Por eixo da prova</h3>${tabelaDesempenho(e.porEixo, EIXOS)}
    <h3 class="grupo-assunto">Por nível de dificuldade</h3>${tabelaDesempenho(e.porNivel, NIVEIS)}
    <h3 class="grupo-assunto">Por origem</h3>${tabelaDesempenho(e.porOrigem, Object.values(ORIGEM_ROTULO))}
    <h3 class="grupo-assunto">Por assunto</h3>${tabelaDesempenho(e.porAssunto)}
    <h3 class="grupo-assunto">Evolução nos últimos 30 dias</h3>${graficoDias(e.porDia)}
    <p class="legenda-diff"><span style="color:var(--ok)">■ acertos</span><span style="color:var(--alt)">■ erros</span></p>
    <h3 class="grupo-assunto">Questões que você mais erra</h3>
    ${e.erros.length ? `<ul class="resultados">${e.erros.slice(0, 10).map(x => `<li><button data-href="#/caderno/${esc(idCad(x.q))}/questao/${esc(x.q.id)}">
      <span class="res-titulo">${x.nErros} erro(s) em ${x.tentativas} resposta(s) — ${esc(x.q.assunto)}</span>
      <span class="res-trecho">${esc(x.q.enunciado.join(" ").slice(0, 140))}…</span></button></li>`).join("")}</ul>
      ${noCaderno ? '<div class="acoes-linha" style="margin-top:12px"><button id="refazer-erradas" class="botao primario">Refazer as que já errei</button></div>' : ""}`
      : '<p class="contagem">Nenhum erro registrado até agora.</p>'}
    ${noCaderno ? "" : "</div>"}`;
  ligarHrefs(alvo);
  const btn = $("#refazer-erradas");
  if (btn) btn.onclick = async () => {
    const ids = e.erros.map(x => x.q.id);
    if (!await confirmar(`As ${ids.length} questões que você já errou voltam a ficar sem resposta, para resolver de novo. O histórico continua registrado. Continuar?`)) return;
    redefinirQuestoes(ids);
    const f = filtrosDe(sessao); f.situacao = "ja-errei"; gravarFiltros(sessao, f);
    location.hash = `#/caderno/${sessao.id}/questao/${ids[0]}`;
  };
}
function telaEstatisticasGerais() {
  definirTopo({ titulo: "Seu desempenho" });
  marcarAba("estatisticas");
  abaEstatisticas([...banco.q.values()], mapaRespostas(), false);
}

/* ---------- simulado ---------- */
function telaSimulado() {
  definirTopo({ titulo: "Simulado" });
  marcarAba("simulado");
  const sim = lerLS("simulado", null);
  const cfg = Object.assign({ n0: 10, n1: 10, n2: 10, origem: "", prioridade: "nao", nivel: "" }, lerLS("cfg-simulado", {}));
  const disp = e => [...banco.q.values()].filter(q => q.eixo === e && !q.anulada && (!cfg.origem || q.origem === cfg.origem) && (!cfg.nivel || q.nivel === cfg.nivel)).length;
  $("#conteudo").innerHTML = `<div class="secao">
    <div class="cartao"><p>O simulado sorteia questões de cada eixo no formato da prova da ASCES-UNITA (10 de SUS, 10 de Atenção ao Câncer e 10 de Biomedicina, 30 no total). Você pode mudar a quantidade.</p></div>
    ${sim && banco.cadernos.simulado ? `<div class="secao" style="margin:16px 0"><h2>Simulado em andamento</h2>
      <div class="acoes-linha"><a class="botao primario" href="#/caderno/simulado" style="text-decoration:none">Continuar o simulado (${banco.cadernos.simulado.questoes.length} questões)</a>
      <a class="botao" href="#/caderno/simulado/estatisticas" style="color:inherit;text-decoration:none">Ver resultado</a></div></div>` : ""}
    <div class="secao" style="margin:16px 0"><h2>Montar um novo simulado</h2><div class="cartao">
      ${EIXOS.map((e, k) => `<div class="linha-num"><span>${esc(EIXO_CURTO[e])} <span class="contagem">(${disp(e)} disponíveis)</span></span>
        <input class="campo" type="number" min="0" max="${disp(e)}" value="${cfg["n" + k]}" id="n${k}" inputmode="numeric"></div>`).join("")}
      <div class="linha-num"><span>Origem das questões</span><select class="campo" id="s-origem">
        <option value="">Todas</option>${Object.entries(ORIGEM_ROTULO).map(([k, v]) => `<option value="${k}" ${cfg.origem === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></div>
      <div class="linha-num"><span>Nível de dificuldade</span><select class="campo" id="s-nivel">
        <option value="">Todos</option>${NIVEIS.map(n => `<option ${cfg.nivel === n ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <div class="linha-num" style="border:0"><span>Dar preferência a</span><select class="campo" id="s-prior">
        <option value="nao" ${cfg.prioridade === "nao" ? "selected" : ""}>Questões ainda não resolvidas</option>
        <option value="erradas" ${cfg.prioridade === "erradas" ? "selected" : ""}>Questões que já errei</option>
        <option value="" ${cfg.prioridade === "" ? "selected" : ""}>Qualquer questão</option></select></div>
      <div class="acoes-linha" style="margin:6px 0 14px"><button class="botao primario" id="criar-sim">Criar simulado</button></div>
    </div></div></div>`;
  const ler = () => ({ n0: +$("#n0").value || 0, n1: +$("#n1").value || 0, n2: +$("#n2").value || 0, origem: $("#s-origem").value, nivel: $("#s-nivel").value, prioridade: $("#s-prior").value });
  ["#s-origem", "#s-nivel"].forEach(s => $(s).onchange = () => { gravarLS("cfg-simulado", ler()); telaSimulado(); });
  $("#criar-sim").onclick = async () => {
    const c = ler(); gravarLS("cfg-simulado", c);
    if (sim && !await confirmar("Já existe um simulado em andamento. Criar um novo substitui o atual (suas respostas continuam nas estatísticas). Continuar?")) return;
    const mapa = mapaRespostas();
    const embaralhar = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const ids = [];
    EIXOS.forEach((e, k) => {
      const pool = embaralhar([...banco.q.values()].filter(q => q.eixo === e && !q.anulada && (!c.origem || q.origem === c.origem) && (!c.nivel || q.nivel === c.nivel)));
      const pref = c.prioridade === "nao" ? pool.filter(q => situacaoQ(mapa, q.id) === "nao") : c.prioridade === "erradas" ? pool.filter(q => jaErrou(mapa, q.id)) : [];
      const resto = pool.filter(q => !pref.includes(q));
      ids.push(...[...pref, ...resto].slice(0, c["n" + k]).map(q => q.id));
    });
    if (!ids.length) { avisar("Escolha pelo menos uma questão."); return; }
    const novo = { criado: agoraISO(), ids };
    gravarLS("simulado", novo);
    montarCadernoSimulado(novo);
    redefinirQuestoes(ids);
    const t = lerLS("filtros", {}); delete t.simulado; gravarLS("filtros", t);
    const pos = lerLS("pos", {}); delete pos.simulado; gravarLS("pos", pos);
    cronometro = null;
    location.hash = "#/caderno/simulado";
  };
}

/* ---------- ajustes e backup ---------- */
function telaAjustes() {
  definirTopo({ titulo: "Ajustes" });
  marcarAba("ajustes");
  const ultimo = lerLS("ultimo-backup", null);
  $("#conteudo").innerHTML = `
  <div class="secao"><h2>Leitura</h2><div class="cartao"><div id="ajustes-leitura"></div></div></div>
  <div class="secao"><h2>Backup das suas respostas</h2><div class="cartao">
    <p>Suas respostas, favoritas e anotações ficam guardadas <strong>só neste aparelho e neste navegador</strong>. Ninguém mais vê o seu desempenho. Para levar seus dados para outro aparelho (ou não perdê-los ao limpar o navegador), exporte um backup e importe no outro.</p>
    <p>Último backup: ${ultimo ? esc(dataHora(ultimo)) : "nenhum ainda"}.</p>
    <div class="acoes-linha" style="margin-bottom:14px"><button id="btn-exportar" class="botao primario">Exportar backup</button><button id="btn-importar" class="botao">Importar backup</button></div>
  </div></div>
  <div class="secao"><h2>Zerar</h2><div class="cartao">
    <p>Apaga todas as respostas, favoritas e anotações deste aparelho. Não dá para desfazer (exporte um backup antes, se quiser guardar).</p>
    <div class="acoes-linha" style="margin-bottom:14px"><button id="btn-zerar" class="botao">Apagar meus dados</button></div>
  </div></div>
  <div class="secao"><h2>Sobre o banco de questões</h2><div class="cartao">
    <p>${Object.values(ORIGEM_ROTULO).map((r, k) => `${esc(r)}: <strong>${[...banco.q.values()].filter(q => ORIGEM_ROTULO[q.origem] === r).length}</strong>`).join(" · ")}.</p>
    <p>Provas da ASCES-UNITA transcritas das provas aplicadas, com gabarito revisado. Provas de outras instituições (UFPA) com gabarito oficial definitivo, selecionadas pela semelhança com a prova da ASCES. Questões autorais elaboradas no estilo da banca. Todas têm comentário.</p>
    <p><strong>Nível de dificuldade:</strong> classificação editorial de cada questão (Fácil, Médio ou Difícil), considerando a complexidade do conteúdo e o formato (questões com afirmativas para julgar, cálculos e casos clínicos tendem a ser mais difíceis). Seu desempenho por nível aparece em Desempenho.</p>
  </div></div>`;
  montarAjustesLeitura($("#ajustes-leitura"));
  $("#btn-exportar").onclick = exportarBackup;
  $("#btn-importar").onclick = () => $("#entrada-backup").click();
  $("#btn-zerar").onclick = async () => {
    if (!await confirmar("Apagar todas as suas respostas, favoritas e anotações deste aparelho?")) return;
    Object.assign(dados, { respostas: [], resets: [], favs: {}, notas: {} }); salvarDados();
    gravarLS("simulado", null); delete banco.cadernos.simulado;
    telaAjustes();
    avisar("Pronto. Seus dados foram apagados.");
  };
}
function montarAjustesLeitura(alvo) {
  const seg = (nome, opcoes, atual) => `<div class="segmentado" data-ajuste="${nome}">${opcoes.map(([v, r]) =>
    `<button data-v="${v}" aria-pressed="${String(v) === String(atual)}">${r}</button>`).join("")}</div>`;
  alvo.innerHTML = `
    <div class="linha-ajuste"><span>Tamanho do texto</span>
      <div class="segmentado"><button id="fonte-menos" aria-label="Diminuir fonte">A−</button>
      <button disabled>${ajustes.fonte}</button><button id="fonte-mais" aria-label="Aumentar fonte">A+</button></div></div>
    <div class="linha-ajuste" style="border:0"><span>Tema</span>${seg("tema", [["auto", "Automático"], ["light", "Claro"], ["dark", "Escuro"]], ajustes.tema)}</div>`;
  $("#fonte-menos", alvo).onclick = () => { ajustes.fonte = Math.max(14, ajustes.fonte - 1); aplicarAjustes(); montarAjustesLeitura(alvo); };
  $("#fonte-mais", alvo).onclick = () => { ajustes.fonte = Math.min(30, ajustes.fonte + 1); aplicarAjustes(); montarAjustesLeitura(alvo); };
  $$("[data-ajuste] button", alvo).forEach(b => b.onclick = () => { ajustes.tema = b.dataset.v; aplicarAjustes(); montarAjustesLeitura(alvo); });
}
$("#btn-aa").onclick = () => { abrirPainel(`<h2>Leitura ${botaoFechar}</h2><div id="aj-painel"></div>`); montarAjustesLeitura($("#aj-painel")); };
function exportarBackup() {
  const conteudo = JSON.stringify({ app: "questoes-residencia", versao: 1, em: agoraISO(), dados, simulado: lerLS("simulado", null) }, null, 1);
  const blob = new Blob([conteudo], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `backup-questoes-residencia-${new Date().toLocaleDateString("sv-SE")}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  gravarLS("ultimo-backup", agoraISO());
  if (location.hash === "#/ajustes") telaAjustes();
}
$("#entrada-backup").onchange = async e => {
  const arq = e.target.files[0]; e.target.value = "";
  if (!arq) return;
  try {
    const j = JSON.parse(await arq.text());
    if (j.app !== "questoes-residencia" || !j.dados) throw new Error("Este arquivo não é um backup desta plataforma.");
    const juntar = await confirmar("Como você quer importar este backup?", "Juntar com os dados deste aparelho", "Substituir tudo pelo backup");
    if (juntar) {
      const ids = new Set(dados.respostas.map(r => r.id));
      dados.respostas.push(...j.dados.respostas.filter(r => !ids.has(r.id)));
      dados.respostas.sort((a, b) => a.em.localeCompare(b.em));
      dados.resets.push(...(j.dados.resets || []));
      Object.assign(dados.favs, j.dados.favs || {}); Object.assign(dados.notas, j.dados.notas || {});
    } else Object.assign(dados, { respostas: [], resets: [], favs: {}, notas: {} }, j.dados);
    salvarDados();
    if (j.simulado && (!juntar || !lerLS("simulado", null))) { gravarLS("simulado", j.simulado); montarCadernoSimulado(j.simulado); }
    rotear();
    avisar("Backup importado.");
  } catch (err) { avisar("Não foi possível importar: " + err.message); }
};

/* ---------- rotas ---------- */
function rotear() {
  fecharPainel();
  window.scrollTo(0, 0);
  const p = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  if (p[0] === "caderno" && p[1]) {
    if (p[2] === "questao") return telaCaderno(p[1], "questoes", p[3]);
    return telaCaderno(p[1], p[2] || "questoes");
  }
  if (p[0] === "simulado") return telaSimulado();
  if (p[0] === "estatisticas") return telaEstatisticasGerais();
  if (p[0] === "ajustes") return telaAjustes();
  telaCadernos();
}
window.addEventListener("hashchange", rotear);
carregarBanco().then(rotear).catch(err => {
  $("#conteudo").innerHTML = `<p class="vazio">Não foi possível carregar as questões. Verifique a conexão e recarregue a página.<br><small>${esc(err.message)}</small></p>`;
});
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
