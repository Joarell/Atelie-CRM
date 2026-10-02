#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera o relatorio de auditoria de seguranca do atelie-erp em PDF.

Abordagem (sem instalar nada globalmente):
  1. Monta um HTML completo com graficos SVG embutidos (vetoriais).
  2. Converte HTML -> PDF com o Chromium headless (ja instalado no sistema).
  3. Carimba cabecalho/rodape com numero de pagina usando reportlab + pypdf,
     dentro de um venv isolado (reportlab/pypdf sao as unicas dependencias).

Regerar:  ./gerar-relatorio.py
Venv:     python3 -m venv .venv && .venv/bin/pip install reportlab pypdf
"""
from __future__ import annotations

import html
import math
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import List, Tuple

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from dados_auditoria import (  # noqa: E402
    ACHADOS,
    CATEGORIAS,
    DATA_AUDITORIA,
    ISSUES,
    PONTOS_FORTES,
    PROJETO,
    RECOMENDACOES,
    SEV,
)

PDF_SAIDA = HERE / "relatorio-auditoria-seguranca.pdf"

CAT_LIST: List[Tuple[str, str]] = [(str(c[0]), str(c[1])) for c in CATEGORIAS]

CAT_CURTO = {
    "cat1": "Banco sem trança (isolamento)",
    "cat2": "Permissão definida no navegador",
    "cat3": "IDOR",
    "cat4": "Chaves expostas (hardcode)",
    "cat5": "Inputs sem tratamento (XSS)",
}

SEV_ORDEM = ["critica", "alta", "media", "baixa", "informativa"]

PALETA = {
    "critica": "#B91C1C",
    "alta": "#EA580C",
    "media": "#D97706",
    "baixa": "#2563EB",
    "informativa": "#059669",
    "forte": "#059669",
}


def cor_sev(sev: str) -> str:
    return PALETA.get(sev, PALETA["media"])


def e(txt: str) -> str:
    return html.escape(txt, quote=True)


def contagens() -> dict:
    from collections import Counter
    c = Counter(a["sev"] for a in ACHADOS)
    return {s: c.get(s, 0) for s in SEV_ORDEM}


def contagem_categoria() -> dict:
    from collections import Counter
    c = Counter(a["cat"] for a in ACHADOS)
    return {k: c.get(k, 0) for k, _ in CAT_LIST}


# --------------------------------------------------------------------------
# Graficos SVG (vetoriais, sem matplotlib)
# --------------------------------------------------------------------------
def grafico_rosca(cont: dict) -> str:
    """Rosca de severidades. Raios reais, total no centro."""
    dados = [(s, cont[s]) for s in SEV_ORDEM if cont.get(s, 0) > 0]
    total = sum(v for _, v in dados) or 1

    size, cx, cy = 236.0, 118.0, 118.0
    r_out, r_in = 92.0, 58.0
    gap = 2.2 if len(dados) > 1 else 0.0

    partes = []
    ang = -90.0
    for sev, val in dados:
        sweep = 360.0 * val / total
        a0, a1 = ang + gap / 2.0, ang + sweep - gap / 2.0
        partes.append(_arco(cx, cy, r_in, r_out, a0, a1, cor_sev(sev)))
        amid = (a0 + a1) / 2.0
        lx, ly = _pt(cx, cy, (r_in + r_out) / 2.0, amid)
        partes.append(
            f'<text x="{lx:.1f}" y="{ly:.1f}" text-anchor="middle" '
            f'dominant-baseline="central" font-size="15" font-weight="700" '
            f'fill="#FFFFFF">{val}</text>'
        )
        ang += sweep

    partes.insert(0, (
        f'<text x="{cx}" y="{cy - 8}" text-anchor="middle" '
        f'font-size="27" font-weight="800" fill="#111827">{total}</text>'
        f'<text x="{cx}" y="{cy + 13}" text-anchor="middle" font-size="9.5" '
        f'fill="#6B7280">achados</text>'
    ))

    svg = (
        f'<svg viewBox="0 0 {size} {size}" width="{size}" height="{size}" '
        f'role="img" aria-label="Achados por severidade">'
        + "".join(partes)
        + "</svg>"
    )

    leg = ['<ul class="legenda">']
    for sev, val in dados:
        nome = SEV[sev][0]
        pct = 100.0 * val / total
        leg.append(
            f'<li><span class="sw" style="background:{cor_sev(sev)}"></span>'
            f'<span class="lg-nome">{nome}</span>'
            f'<span class="lg-val">{val}</span>'
            f'<span class="lg-pct">{pct:.0f}%</span></li>'
        )
    leg.append("</ul>")
    return svg + "".join(leg)


def _pt(cx: float, cy: float, r: float, ang_graus: float):
    """Ponto no circulo. Graus, 0 = east, crescendo anti-horario (y para baixo)."""
    rad = math.radians(ang_graus)
    return cx + r * math.cos(rad), cy + r * math.sin(rad)


def _arco(cx, cy, r_in, r_out, a0, a1, cor) -> str:
    largo = 1 if (a1 - a0) > 180 else 0
    x0o, y0o = _pt(cx, cy, r_out, a0)
    x1o, y1o = _pt(cx, cy, r_out, a1)
    x1i, y1i = _pt(cx, cy, r_in, a1)
    x0i, y0i = _pt(cx, cy, r_in, a0)
    d = (
        f"M {x0o:.2f} {y0o:.2f} "
        f"A {r_out} {r_out} 0 {largo} 1 {x1o:.2f} {y1o:.2f} "
        f"L {x1i:.2f} {y1i:.2f} "
        f"A {r_in} {r_in} 0 {largo} 0 {x0i:.2f} {y0i:.2f} Z"
    )
    return f'<path d="{d}" fill="{cor}" stroke="#FFFFFF" stroke-width="1.5"/>'


def grafico_barras(cat_cont: dict) -> str:
    """Barras horizontais por categoria.

    O viewBox e' dimensionado para a largura util do painel (~300px) para que a
    escala seja 1:1 e o texto fique legivel no PDF.
    """
    largura, alt_linha, pad = 300.0, 36.0, 6.0
    altura = len(CAT_LIST) * alt_linha + pad * 2
    maximo = max(cat_cont.values()) or 1
    track = largura - 26

    p = [
        f'<svg viewBox="0 0 {largura} {altura}" width="{largura}" height="{altura}" '
        f'role="img" aria-label="Achados por categoria">'
    ]
    for i, (cid, titulo) in enumerate(CAT_LIST):
        y = pad + i * alt_linha
        val = cat_cont[cid]
        curto = CAT_CURTO.get(cid, titulo)
        p.append(
            f'<text x="0" y="{y + 9:.1f}" font-size="8.6" font-weight="600" '
            f'fill="#374151">{e(curto)}</text>'
        )
        w = track * val / maximo
        cor = PALETA["forte"] if val == 0 else "#374151"
        p.append(
            f'<rect x="0" y="{y + 14:.1f}" width="{max(w, 3):.1f}" height="9" '
            f'rx="4.5" fill="{cor}"/>'
        )
        p.append(
            f'<text x="{largura:.1f}" y="{y + 22:.1f}" font-size="10" '
            f'font-weight="800" fill="#111827" text-anchor="end">{val}</text>'
        )
    p.append("</svg>")
    return "".join(p)


# --------------------------------------------------------------------------
# Blocos de HTML
# --------------------------------------------------------------------------
def chip(sev: str) -> str:
    nome = SEV[sev][0]
    return f'<span class="chip" style="background:{cor_sev(sev)}">{nome}</span>'


def bloco_capa() -> str:
    return f"""
<section class="capa">
  <div class="capa-topo">
    <div class="capa-tag">Relatório técnico de segurança</div>
    <h1>Relatório de Auditoria de Segurança<br><span class="capa-proj">{e(PROJETO)}</span></h1>
    <p class="capa-sub">Ateliê ERP + DeskcommCRM — Astro 7 SSR · Cloudflare Workers ·
      Cloudflare D1 · TypeScript</p>
  </div>

  <div class="capa-meta">
    <div class="meta-item"><span class="meta-k">Data</span><span class="meta-v">{e(DATA_AUDITORIA)}</span></div>
    <div class="meta-item"><span class="meta-k">Achados</span><span class="meta-v">{len(ACHADOS)}</span></div>
    <div class="meta-item"><span class="meta-k">Categorias</span><span class="meta-v">5</span></div>
    <div class="meta-item"><span class="meta-k">Rotas auditadas</span><span class="meta-v">52 arquivos em src/pages/api</span></div>
  </div>

  <div class="capa-box">
    <h2>Escopo auditado</h2>
    <ul>
      <li><strong>Backend.</strong> Os 52 arquivos de <code>src/pages/api/**</code> (todas as
        rotas, sem amostragem), as fábricas <code>routeFactory.ts</code> e <code>crud.ts</code>,
        e a camada de autenticação/autorização <code>middleware.ts</code>, <code>auth.ts</code>,
        <code>authz.ts</code>, <code>origin.ts</code>, <code>rateLimit.ts</code>.</li>
      <li><strong>Frontend.</strong> Todos os <code>src/ui/views/**</code> e
        <code>src/ui/**</code>, os layouts <code>.astro</code> e a política de escape
        (<code>escapeHtml</code> / <code>escapeAtrib</code> / <code>escapeAttr</code>) e a CSP.</li>
      <li><strong>Segredos.</strong> <code>wrangler.toml</code>, <code>.dev.vars</code>,
        <code>.dev.vars.example</code>, <code>waha/docker-compose.waha.yml</code>,
        <code>.github/workflows/ci.yml</code>, <code>migrations/*.sql</code>,
        <code>scripts/</code>, documentação e o <strong>histórico git completo</strong>
        (55 commits).</li>
    </ul>
  </div>

  <div class="capa-box">
    <h2>Nota metodológica — mapeamento das categorias para esta stack</h2>
    <p>A stack detectada é <strong>Astro 7</strong> em <code>output: 'server'</code> sobre
      <strong>Cloudflare Workers</strong>, com persistência em <strong>Cloudflare D1</strong>
      (SQLite) acessado por <strong>SQL parametrizado escrito à mão</strong>
      (<code>sql.ts</code>/<code>crud.ts</code>) — <strong>sem ORM e sem query builder</strong>.
      O frontend é <strong>framework-free</strong>: DOM imperativo + CSS puro, sem React, o que
      elimina a categoria de sinks <code>dangerouslySetInnerHTML</code> e transfere o XSS do
      frontend para <code>innerHTML</code> + Astro <code>set:html</code>. A autenticação é
      <strong>sessão em D1 com token Bearer</strong>, não cookie nem OAuth, e não existe
      Supabase no app auditado. Cada categoria foi endereçada assim:</p>
    <table class="capa-tbl">
      <tr><th>Categoria pedida</th><th>Equivalente nesta stack</th></tr>
      <tr><td><strong>1. Banco sem trança</strong></td>
        <td>Não há RLS (o projeto não usa Supabase). O mecanismo de isolamento real foi
        identificado como sendo <em>a ausência de isolamento</em>: schema single-tenant,
        <code>listEntities</code> = <code>SELECT *</code>, autorização por papel em
        <code>authz.ts</code>. Auditamos listagem, busca, agregação, relatório e exportação.</td></tr>
      <tr><td><strong>2. Permissão no navegador</strong></td>
        <td>Gate de papel existe em <code>authz.ts:requireRole</code> e é cruzado, um a um,
        com os gates do frontend (<code>isAdmin</code>/<code>canEdit</code>/<code>role</code>)
        e com o handler de cada endpoint.</td></tr>
      <tr><td><strong>3. IDOR</strong></td>
        <td>Todos os handlers com <code>:id</code> em path, query ou body foram percorridos
        (não amostras), rastreando até a tabela do D1 se há filtro de posse.</td></tr>
      <tr><td><strong>4. Chaves expostas</strong></td>
        <td>Código, config, <code>[vars]</code> do wrangler, <code>.dev.vars</code>,
        docker-compose, CI, migrations (seed), scripts, docs e histórico git
        (<code>git log -S</code>). Defaults inseguros <code>${{VAR:-default}}</code> e
        ausência de validação de startup foram checados.</td></tr>
      <tr><td><strong>5. Inputs sem tratamento</strong></td>
        <td>Inventário de todos os sinks <code>innerHTML</code>/<code>outerHTML</code>/
        <code>insertAdjacentHTML</code>/<code>set:html</code>, com rastreamento da
        <em>origem</em> de cada valor interpolado (API, storage, query string, digitação) e
        verificação de biblioteca de sanitização.</td></tr>
    </table>
  </div>

  <div class="capa-rodape">
    Relatório gerado por <code>docs/security-audit/gerar-relatorio.py</code> — regerável a
    qualquer momento. Todos os achados foram verificados no código real, com arquivo e linha.
  </div>
</section>
"""


def bloco_resumo() -> str:
    cont = contagens()
    cat = contagem_categoria()
    ordem = [s for s in SEV_ORDEM if cont.get(s, 0) > 0]
    cards = "".join(
        f'<div class="scard" style="border-top-color:{cor_sev(s)}">'
        f'<div class="scard-v" style="color:{cor_sev(s)}">{cont[s]}</div>'
        f'<div class="scard-l">{SEV[s][0]}</div></div>'
        for s in ordem
    )
    return f"""
<section class="pagina">
  <h2 class="sec">Resumo executivo</h2>
  <p class="lead">Foram registrados <strong>{len(ACHADOS)} achados</strong> em cinco
    categorias. O perfil é de uma base com <strong>fundamentos sólidos e uma lacuna
    estrutural</strong>: a autenticação, a criptografia de senha, o rate limit, a CSP, a
    auditoria e o transporte do WAHA estão bem implementados e verificados. O problema
    está na <strong>camada de autorização</strong> — e ele se origina em um único lugar:
    as fábricas que geram as rotas de entidade não recebem papéis, então o único controle
    real é "ter sessão". Disso decorrem a escalada de privilégio (crítica), a escrita por
    papel de leitura, e o IDOR em ~24 rotas.</p>

  <div class="scards">{cards}</div>

  <div class="dupla">
    <div class="painel">
      <h3 class="painel-t">Achados por severidade</h3>
      {grafico_rosca(cont)}
    </div>
    <div class="painel">
      <h3 class="painel-t">Achados por categoria</h3>
      {grafico_barras(cat)}
    </div>
  </div>

  <h3 class="sub">Leitura rápida</h3>
  <table class="tbl">
    <tr><th style="width:16%">Severidade</th><th style="width:30%">Achado</th><th>Por que importa</th></tr>
    <tr><td>{chip("critica")}</td><td>C2-01 — escalada de privilégio em <code>POST /api/users</code></td>
      <td>Um <code>manager</code> cria uma conta <code>admin</code>. O <code>PUT</code> irmão já
        bloqueia isso; o <code>POST</code> ficou de fora da regra.</td></tr>
    <tr><td>{chip("alta")}</td><td>C1-01 — exportação LGPD vaza a base inteira</td>
      <td>Qualquer sessão baixa todos os clientes e pedidos do sistema por uma rota de privacidade.</td></tr>
    <tr><td>{chip("alta")}</td><td>C2-02 — papel <code>viewer</code> com poder de escrita</td>
      <td>As fábricas de rota não chamam <code>requireRole</code>; o rótulo "Visualização" não cumpre.</td></tr>
    <tr><td>{chip("alta")}</td><td>C3-01 / C3-02 — IDOR em item routes e no envio de WhatsApp</td>
      <td>PUT/DELETE por id sem posse; e envio de WhatsApp para qualquer conversa por qualquer sessão.</td></tr>
    <tr><td>{chip("alta")}</td><td>C4-01 — credencial de admin de seed no repositório</td>
      <td>Senha e salt fixo versionados. A mitigação <code>mustChangePassword</code> existe e funciona;
        falta a validação de startup.</td></tr>
    <tr><td>{chip("alta")}</td><td>C5-01 / C5-02 — HTML armazenado em modal e Dashboard</td>
      <td>Nome de ingrediente/contato renderizado cru. A CSP contém a execução de script.</td></tr>
  </table>
</section>
"""


def bloco_pontos() -> str:
    itens = "".join(
        f'<tr><td style="width:26%"><strong>{e(titulo)}</strong>'
        f'<div class="mono sm">{e(loc)}</div></td><td>{e(desc)}</td></tr>'
        for titulo, loc, desc in PONTOS_FORTES
    )
    return f"""
<section class="pagina">
  <h2 class="sec">Pontos fortes</h2>
  <p class="lead">O que foi verificado e está <strong>correto</strong>. Esta seção é
    também a prova de cobertura: cada item é um controle que a auditoria procurou e
    encontrou implementado com evidência.</p>
  <table class="tbl tbl-forte">
    <tr><th>Controle</th><th>Evidência</th></tr>
    {itens}
  </table>

  <h3 class="sub cat-t quebra-antes">Pontos fracos — os riscos centrais</h3>
  <p class="lead">A partir daqui o relatório sai do campo "o que está bem" e entra no
    campo "o que precisa mudar". Estes quatro pontos resumem a superfície de risco real do
    aplicativo — os demais achados são consequência deles.</p>
  <div class="fracos">
    <div class="fcard">
      <div class="fcard-t">Autorização é a camada fraca</div>
      <p>Quatro arquivos no app inteiro chamam <code>requireRole</code>. Todas as demais
        rotas — que são a maioria — confiam apenas no middleware. A hierarquia de papéis foi
        declarada (<code>ROLE_RANK</code>) e nunca usada, e a matriz de permissões está
        duplicada em literais na UI e no servidor. É exatamente esse arranjo que deixou a
        escalada de privilégio passar.</p>
    </div>
    <div class="fcard">
      <div class="fcard-t">"Single-tenant" é uma premissa silenciosa</div>
      <p>O app é single-tenant por desenho, e isso está documentado. O risco é que a
        premissa se propaga sozinha: toda rota nova herdada das fábricas nasce global, e
        <code>assignedUserId</code>/<code>assigneeUserId</code> parecem fronteira de
        segurança quando são só metadado de atribuição. A rota de privacidade LGPD é a
        prova de que a distinção importa — e ela falhou (C1-01).</p>
    </div>
    <div class="fcard">
      <div class="fcard-t">Escape de HTML é aplicado por convenção, não por garantia</div>
      <p>Não há biblioteca de sanitização no projeto. O que existe são três helpers de
        escape, dois deles divergentes, e a aplicação é manual: a maioria das views escapa
        corretamente, mas <code>openModal</code>, o Dashboard, a LoginView e os campos
        numéricos foram esquecidos. Uma regra de lint fecharia essa classe inteira.</p>
    </div>
    <div class="fcard">
      <div class="fcard-t">Sessão em localStorage é o multiplicador</div>
      <p>Enquanto o token estiver em <code>localStorage</code>, qualquer injeção de HTML
        que evolua para execução de script vira comprometimento de conta. A CSP atual
        (<code>script-src 'self'</code>) é o que separa "deformar HTML" de "roubar
        sessão" — um controle único segurando o impacto de quatro achados.</p>
    </div>
  </div>
</section>
"""


def bloco_achados() -> str:
    out = [
        '<section class="pagina">',
        '<h2 class="sec">Achados detalhados por categoria</h2>',
        '<p class="lead">Cada linha cita o arquivo e a linha exatos, o trecho verificado e a '
        'condição de explorabilidade. Os achados marcados como <em>verificação positiva</em> '
        'existem para registrar a cobertura da auditoria.</p>',
    ]
    for cid, titulo in CAT_LIST:
        achados = [a for a in ACHADOS if a["cat"] == cid]
        out.append(f'<h3 class="sub cat-t">{e(titulo)}</h3>')
        out.append('<table class="tbl tbl-findings">')
        out.append(
            '<tr><th style="width:6.5%">ID</th><th style="width:9%">Severidade</th>'
            '<th style="width:18.5%">Arquivo:linha</th><th style="width:66%">Descrição</th></tr>'
        )
        for a in achados:
            locs = "<br>".join(
                f'<span class="mono">{e(f)}:{e(l)}</span>' for f, l, _ in a["arquivos"]
            )
            out.append(
                f'<tr><td class="mono sm nb">{e(a["id"])}</td>'
                f'<td>{chip(a["sev"])}</td>'
                f'<td>{locs}</td>'
                f'<td><strong>{e(a["titulo"])}</strong>'
                f'<div class="ev">{e(a["porque"])}</div>'
                f'<div class="cond"><span>Explorabilidade:</span> {e(a["cond"])}</div>'
                f'<div class="cond"><span>Correção:</span> {e(a["correcao"])}</div>'
                f'<details><summary>trecho de código</summary><pre>'
                + "\n\n".join(
                    f"{f}:{l}\n{snippet}" for f, l, snippet in a["arquivos"]
                )
                + "</pre></details></td></tr>"
            )
        out.append("</table>")
    out.append("</section>")
    return "\n".join(out)


def _ids_nb(achados: str) -> str:
    return " ".join(
        f'<span class="nb">{e(p)}</span>'
        for p in achados.replace(",", " ").split()
    )


def bloco_recs() -> str:
    linhas = "".join(
        f'<tr><td><span class="pri pri-{p.lower()}">{p}</span></td>'
        f'<td class="mono sm">{_ids_nb(achados)}</td>'
        f'<td>{e(acao)}</td><td>{e(porquem)}</td></tr>'
        for p, achados, acao, porquem in RECOMENDACOES
    )
    return f"""
<section class="pagina">
  <h2 class="sec">Recomendações priorizadas</h2>
  <p class="lead"><strong>P1</strong> fecha o vetor de comprometimento total
    (escalada de privilégio e vazamento de dados). <strong>P2</strong> fecha IDOR e
    injeção de HTML. <strong>P3</strong> é higiene e defesa em profundidade — os itens
    que reduzem a superfície e impedem a reintrodução das mesmas classes de falha.</p>
  <table class="tbl">
    <tr><th style="width:6%">Prio.</th><th style="width:13%">Achados</th>
      <th style="width:46%">Ação</th><th style="width:35%">Por quê</th></tr>
    {linhas}
  </table>
</section>
"""


def bloco_issues() -> str:
    partes = [
        '<section class="pagina issues">',
        '<h2 class="sec">Issues para o GitHub</h2>',
        '<p class="lead">Texto completo de cada issue, pronto para copiar e colar. Cada bloco '
        'delimitado por <code>--- ISSUE n ---</code> e <code>--- FIM ISSUE n ---</code>. '
        'Achados triviais relacionados foram agrupados em uma issue única (issues 7, 9 e 12) '
        'para não gerar spam.</p>',
    ]
    for iss in ISSUES:
        labels = " · ".join(f"`{l}`" for l in iss["labels"].split(", "))
        aceite = "\n".join(f"- [ ] {a}" for a in iss["aceite"])
        corpo = f"""--- ISSUE {iss['n']} ---
# {iss['titulo']}

**Labels sugeridas:** {labels}

## Problema

{iss['problema']}

## Evidência

```ts
{iss['evidencia']}
```

## Impacto

{iss['impacto']}

## Sugestão de correção

{iss['correcao']}

## Critérios de aceite

{aceite}
--- FIM ISSUE {iss['n']} ---"""
        partes.append(
            f'<div class="issue"><div class="issue-h">ISSUE {iss["n"]}</div>'
            f'<pre class="issue-body">{e(corpo)}</pre></div>'
        )
    partes.append("</section>")
    return "\n".join(partes)


# --------------------------------------------------------------------------
# CSS + montagem
# --------------------------------------------------------------------------
CSS = """
@page { size: A4; margin: 20mm 16mm 18mm 16mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  font-family: "DejaVu Sans", "Segoe UI", Helvetica, Arial, sans-serif;
  color: #111827; font-size: 9.1pt; line-height: 1.42; margin: 0;
}
code, pre, .mono { font-family: "DejaVu Sans Mono", "SF Mono", Menlo, Consolas, monospace; }
code { background: #F3F4F6; padding: 0 2px; border-radius: 2px; font-size: 8.2pt; }
.sm { font-size: 7.6pt; }
.nb { white-space: nowrap; }
.lead { font-size: 9.3pt; color: #374151; margin: 0 0 10px; }

/* ---------- capa ---------- */
.capa { page-break-after: always; }
.capa-topo { border-bottom: 3px solid #111827; padding-bottom: 12px; }
.capa-tag {
  display: inline-block; background: #111827; color: #fff; font-size: 7.4pt;
  letter-spacing: .09em; text-transform: uppercase; padding: 3px 8px;
  border-radius: 3px; margin-bottom: 10px;
}
.capa h1 { font-size: 21pt; line-height: 1.16; margin: 0 0 6px; letter-spacing: -.01em; }
.capa-proj { color: #B91C1C; }
.capa-sub { color: #6B7280; font-size: 9pt; margin: 0; }
.capa-meta { display: flex; gap: 8px; margin: 12px 0; }
.meta-item {
  flex: 1; border: 1px solid #E5E7EB; border-radius: 5px; padding: 6px 8px;
  background: #FAFAFA;
}
.meta-k { display: block; font-size: 7pt; color: #6B7280; text-transform: uppercase; letter-spacing: .05em; }
.meta-v { display: block; font-size: 9.4pt; font-weight: 700; margin-top: 2px; }
.capa-box { margin-bottom: 11px; }
.capa-box h2 { font-size: 10.6pt; margin: 0 0 5px; color: #111827; }
.capa-box ul { margin: 0; padding-left: 16px; }
.capa-box li { margin-bottom: 3px; }
.capa-tbl { width: 100%; border-collapse: collapse; margin-top: 7px; }
.capa-tbl th, .capa-tbl td { border: 1px solid #E5E7EB; padding: 4px 6px; text-align: left; vertical-align: top; }
.capa-tbl th { background: #F3F4F6; font-size: 8.2pt; }
.capa-tbl td { font-size: 7.9pt; }
.capa-rodape { margin-top: 12px; font-size: 7.6pt; color: #6B7280; border-top: 1px solid #E5E7EB; padding-top: 7px; }

/* ---------- secoes ---------- */
.pagina { page-break-before: always; }
.sec {
  font-size: 14pt; margin: 0 0 3px; padding-bottom: 5px;
  border-bottom: 2px solid #111827;
}
.sub { font-size: 10.6pt; margin: 13px 0 5px; color: #111827; }
.cat-t { background: #F3F4F6; padding: 5px 7px; border-left: 3px solid #111827;
        break-after: avoid; page-break-after: avoid; }
.quebra-antes { break-before: page; page-break-before: always; }

/* ---------- cartoes de severidade ---------- */
.scards { display: flex; gap: 7px; margin: 10px 0 12px; break-inside: avoid; page-break-inside: avoid; }
.scard {
  flex: 1; border: 1px solid #E5E7EB; border-top: 3px solid #999;
  border-radius: 5px; padding: 7px 9px; background: #fff;
}
.scard-v { font-size: 17pt; font-weight: 800; line-height: 1; }
.scard-l { font-size: 7.6pt; color: #6B7280; text-transform: uppercase; letter-spacing: .05em; margin-top: 2px; }

/* ---------- graficos ---------- */
.dupla { display: flex; gap: 12px; margin: 6px 0 10px; }
.painel { flex: 1; border: 1px solid #E5E7EB; border-radius: 6px; padding: 8px 10px;
         background: #FCFCFD; break-inside: avoid; page-break-inside: avoid; }
.painel-t { font-size: 8.6pt; margin: 0 0 5px; text-transform: uppercase; letter-spacing: .05em; color: #6B7280; }
.painel svg { display: block; max-width: 100%; height: auto; margin: 0 auto; }
.legenda { list-style: none; margin: 6px 0 0; padding: 0; }
.legenda li { display: flex; align-items: center; gap: 6px; font-size: 8.2pt; padding: 1.5px 0; }
.sw { width: 9px; height: 9px; border-radius: 2px; flex: none; }
.lg-nome { flex: 1; }
.lg-val { font-weight: 700; }
.lg-pct { color: #6B7280; width: 30px; text-align: right; }

/* ---------- tabelas ---------- */
.tbl { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
.tbl th {
  background: #111827; color: #fff; text-align: left; padding: 5px 6px;
  font-size: 7.9pt; text-transform: uppercase; letter-spacing: .04em;
  break-after: avoid; page-break-after: avoid;
}
.tbl td { border-bottom: 1px solid #E5E7EB; padding: 5px 6px; vertical-align: top; }
.tbl tr:nth-child(even) td { background: #FAFAFA; }
.tbl tr { break-inside: avoid; page-break-inside: avoid; }
.tbl-findings td { font-size: 8.1pt; }
.tbl-forte td { font-size: 8.1pt; }
.ev { margin-top: 3px; }
.cond { margin-top: 3px; color: #4B5563; }
.cond span { font-weight: 700; color: #111827; }
details { margin-top: 4px; }
details summary { cursor: pointer; font-size: 7.6pt; color: #2563EB; }
details pre {
  background: #0F172A; color: #E2E8F0; padding: 6px 7px; border-radius: 4px;
  font-size: 7pt; line-height: 1.34; overflow-x: auto; margin: 4px 0 0;
  white-space: pre-wrap; word-break: break-word;
}
.chip {
  display: inline-block; color: #fff; font-size: 7.1pt; font-weight: 700;
  padding: 1.5px 5px; border-radius: 8px; white-space: nowrap;
}

/* ---------- prioridade ---------- */
.pri { display: inline-block; color: #fff; font-weight: 700; font-size: 7.6pt;
       padding: 1.5px 6px; border-radius: 3px; }
.pri-p1 { background: #B91C1C; }
.pri-p2 { background: #EA580C; }
.pri-p3 { background: #2563EB; }

/* ---------- pontos fracos ---------- */
.fracos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.fcard { border: 1px solid #E5E7EB; border-left: 3px solid #D97706;
         border-radius: 5px; padding: 7px 9px; background: #FFFBF5;
         break-inside: avoid; page-break-inside: avoid; }
.fcard-t { font-weight: 700; font-size: 9pt; margin-bottom: 3px; }
.fcard p { margin: 0; font-size: 8.1pt; color: #374151; }

/* ---------- issues ---------- */
.issue { margin-bottom: 11px; }
.issue-h {
  background: #111827; color: #fff; font-size: 8pt; font-weight: 700;
  letter-spacing: .08em; padding: 3px 8px; border-radius: 3px 3px 0 0;
  break-after: avoid; page-break-after: avoid;
}
.issue-body {
  margin: 0; background: #F8FAFC; border: 1px solid #CBD5E1; border-top: none;
  border-radius: 0 0 4px 4px; padding: 8px 9px; font-size: 6.9pt;
  line-height: 1.36; white-space: pre-wrap; word-break: break-word;
}
"""

HTML_SHELL = """<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório de Auditoria de Segurança — {proj}</title>
<style>{css}</style></head>
<body>{corpo}</body></html>
"""


def achar_chromium() -> str | None:
    for nome in ("chromium", "chromium-browser", "google-chrome",
                 "google-chrome-stable", "chrome"):
        p = shutil.which(nome)
        if p:
            return p
    return os.environ.get("CHROME_BIN")


def html_para_pdf(html_path: Path, pdf_path: Path) -> None:
    chrome = achar_chromium()
    if not chrome:
        raise SystemExit(
            "Chromium/Chrome nao encontrado. Instale o chromium ou exporte\n"
            "CHROME_BIN=/caminho/do/chrome antes de rodar."
        )
    cmd = [
        chrome,
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-pdf-header-footer",
        "--run-all-compositor-stages-before-draw",
        "--virtual-time-budget=12000",
        f"--print-to-pdf={pdf_path}",
        str(html_path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if not pdf_path.exists():
        raise SystemExit(
            "Chromium nao gerou o PDF.\nstdout: %s\nstderr: %s"
            % (res.stdout[-800:], res.stderr[-800:])
        )


def carimbar_paginas(pdf_bruto: Path, pdf_final: Path, titulo: str) -> int:
    """Acrescenta cabecalho/rodape com numero de pagina (reportlab + pypdf)."""
    try:
        from pypdf import PdfReader, PdfWriter
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
    except ImportError:
        print("AVISO: reportlab/pypdf ausentes; PDF gerado sem cabecalho/rodape.")
        shutil.copy(pdf_bruto, pdf_final)
        return 0

    leitor = PdfReader(str(pdf_bruto))
    escritor = PdfWriter()
    n = len(leitor.pages)
    largura, altura = A4
    tam = 7.4

    for i, pagina in enumerate(leitor.pages, start=1):
        buffer = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        buffer.close()
        c = canvas.Canvas(buffer.name, pagesize=A4)
        c.setFont("Helvetica", tam)
        c.setFillGray(0.45)
        c.drawString(38, altura - 30, f"Relatório de Auditoria de Segurança — {titulo}")
        c.drawRightString(largura - 38, altura - 30, "Confidencial")
        c.setStrokeColorRGB(0.85, 0.85, 0.85)
        c.setLineWidth(0.4)
        c.line(38, altura - 34, largura - 38, altura - 34)
        c.setFillGray(0.45)
        c.line(38, 32, largura - 38, 32)
        c.drawString(38, 24, "Auditoria de segurança · atelie-erp")
        c.drawCentredString(largura / 2, 24, DATA_AUDITORIA)
        c.drawRightString(largura - 38, 24, f"Página {i} de {n}")
        c.save()

        marca = PdfReader(buffer.name).pages[0]
        marca.merge_page(pagina)
        escritor.add_page(marca)
        os.unlink(buffer.name)

    with open(pdf_final, "wb") as fh:
        escritor.write(fh)
    return n


def main() -> int:
    corpo = "".join([
        bloco_capa(),
        bloco_resumo(),
        bloco_pontos(),
        bloco_achados(),
        bloco_recs(),
        bloco_issues(),
    ])
    html_txt = HTML_SHELL.format(proj=e(PROJETO), css=CSS, corpo=corpo)

    tmpdir = Path(tempfile.mkdtemp(prefix="audit-"))
    html_path = tmpdir / "relatorio.html"
    bruto = tmpdir / "bruto.pdf"
    html_path.write_text(html_txt, encoding="utf-8")

    print(f"HTML gerado: {len(html_txt):,} bytes")
    html_para_pdf(html_path, bruto)
    n = carimbar_paginas(bruto, PDF_SAIDA, PROJETO)
    shutil.rmtree(tmpdir, ignore_errors=True)

    cont = contagens()
    print(f"PDF gerado: {PDF_SAIDA}")
    print(f"Paginas: {n}  |  tamanho: {PDF_SAIDA.stat().st_size:,} bytes")
    print(
        "Achados: "
        + ", ".join(f"{SEV[s][0]}={cont[s]}" for s in SEV_ORDEM if cont[s])
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())