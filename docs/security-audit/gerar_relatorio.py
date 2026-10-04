#!/usr/bin/env python3
"""Gera docs/security-audit/relatorio-auditoria-seguranca.pdf (pt-BR, A4).

Uso (ambiente isolado, nada global):
  python3 -m venv /tmp/opencode/pdfenv
  /tmp/opencode/pdfenv/bin/pip install reportlab matplotlib
  /tmp/opencode/pdfenv/bin/python docs/security-audit/gerar_relatorio.py

Conteúdo: auditoria de segurança em 5 categorias (stack TypeScript + Astro 7 SSR
+ Cloudflare Workers + D1), com gráficos (rosca por severidade, barras empilhadas
por categoria), achados arquivo:linha, pontos fortes verificados, recomendações
P1/P2/P3 e o bloco de issues para o GitHub.
"""

from __future__ import annotations

import io
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)

# --- Paleta exigida ---------------------------------------------------------
COR_CRITICA = colors.HexColor("#B91C1C")
COR_ALTA = colors.HexColor("#EA580C")
COR_MEDIA = colors.HexColor("#D97706")
COR_BAIXA = colors.HexColor("#2563EB")
COR_INFO = colors.HexColor("#6B7280")  # informativa (cinza) — documentado
COR_FORTE = colors.HexColor("#059669")

SEV_COR = {
    "Crítica": COR_CRITICA,
    "Alta": COR_ALTA,
    "Média": COR_MEDIA,
    "Baixa": COR_BAIXA,
    "Informativa": COR_INFO,
    "Forte": COR_FORTE,
}

# Hex puro para o matplotlib (não depende de Color.getRgb).
SEV_HEX = {
    "Crítica": "#B91C1C",
    "Alta": "#EA580C",
    "Média": "#D97706",
    "Baixa": "#2563EB",
    "Informativa": "#6B7280",
    "Forte": "#059669",
}

COR_TXT = colors.HexColor("#111827")
COR_TXT2 = colors.HexColor("#374151")
COR_LINHA = colors.HexColor("#D1D5DB")
COR_FUNDO = colors.HexColor("#F3F4F6")

CATEGORIAS = [
    "1. Banco sem tranca\n(isolamento de dono)",
    "2. Permissão no\nnavegador",
    "3. IDOR",
    "4. Chaves expostas",
    "5. XSS",
]

# Achados por categoria: (id, severidade, arquivo:linha, título)
ACHADOS = {
    1: [
        (
            "I1",
            "Informativa",
            "README.md; src/server/routeFactory.ts:73-117; src/server/authz.ts",
            "Single-tenant por design: listagens globais sem filtro por dono "
            "(decisão documentada); isolamento = RBAC + coluna de dono em escrita "
            "de item. Inconsistência: SSE (events.ts:25-40) recorta por dono, "
            "listagens REST não.",
        ),
        (
            "I2",
            "Informativa",
            "src/server/routeFactory.ts:236-255",
            "createHandler só deriva o dono da sessão quando ausente — o POST "
            "aceita assignedUserId arbitrário do cliente (forja de atribuição).",
        ),
    ],
    2: [
        (
            "F1",
            "Média",
            "src/pages/api/whatsapp/webhook-config.ts:25-27,57-59,72; "
            "src/middleware.ts:15-21",
            "GET/PUT de webhook-config exigem apenas sessão (userFromToken), sem "
            "requireRole — qualquer papel (viewer) pode re-registrar/substituir os "
            "webhooks da sessão do engine (updateSession substitui a lista). A rota "
            "está em PUBLIC_PATHS, logo também pula o gate mustChangePassword. "
            "Rota irmã session.ts:51,70,116 exige ADMINS.",
        ),
        (
            "F4",
            "Baixa",
            "src/pages/api/users/[id].ts:30,88-93",
            "PUT /api/users/:id: allowedRoles decide só pelo corpo da requisição "
            "(role/password → admin) e não pelo alvo — um manager pode alterar "
            "nome/e-mail de usuários admin (editablePatch).",
        ),
    ],
    3: [
        (
            "F2",
            "Média",
            "src/server/routeFactory.ts:236-264; "
            "src/pages/api/crm/messages/index.ts:3-6; "
            "conversation-notes/index.ts:6-9; activities/index.ts:6-9; "
            "src/pages/api/whatsapp/send.ts:39-52",
            "POST de registros-filho sem validar a posse do pai: um agent pode "
            "gravar mensagem/nota/atividade em conversationId/contactId de outro "
            "agente. A checagem de pai (OWNERSHIP, kind='via') só roda em "
            "PUT/DELETE (guardItemWrite:152-165); send.ts:39-52 prova a intenção "
            "de posse por conversa (guardConversation).",
        ),
    ],
    4: [
        (
            "F6",
            "Média",
            "waha/.env (commits 882b050..59d917b); "
            "migrations/0004_crm_seed.sql (13 commits); "
            "tests/server/wahaComposeSecurity.test.ts:21,28",
            "Segredos no histórico git: hash SHA-512 real da chave WAHA em "
            "waha/.env e como default de docker-compose.waha.yml (removido em "
            "01/10/2026); hash PBKDF2 da senha padrão 'admin123' com sal fixo em "
            "0004_crm_seed.sql; o teste anti-segredo ainda embute o hash antigo "
            "completo. Chave/plaintext ATUAIS nunca commitados (git log -S vazio).",
        ),
        (
            "I3",
            "Informativa",
            ".dev.vars:9; .dev.vars.example; waha/.env.example; "
            "src/server/waha.ts:60-64; .gitignore:5",
            "Segredos fora do repositório: .dev.vars com plaintext real é "
            "gitignored e nunca commitado; exemplos só com placeholders; "
            "readWahaConfig rejeita dev_plaintext_change_me (fail-closed).",
        ),
    ],
    5: [
        (
            "F3",
            "Média",
            "src/server/routeFactory.ts:36-40; ProductsView.ts:277; "
            "OrdersView.ts:272,312; CrmInboxView.ts:451; CrmFunilView.ts:104,129; "
            "ComponentsView.ts:210; PurchasesView.ts:141; IngredientsView.ts:359",
            "XSS armazenado via id: withNewId aceita body.id do cliente sem "
            "validar formato e os ids são interpolados em atributos HTML sem "
            "escapeAtrib (value=/data-id=). CSP script-src 'self' bloqueia a "
            "execução de JS inline, mas a injeção HTML/defacement persiste. "
            "Requer papel agent+ para criar.",
        ),
        (
            "F5",
            "Baixa",
            "src/ui/views/crm/CrmInboxView.ts:410; src/ui/views/OrdersView.ts:67",
            "value=\"${composerDelivery}\" e value=\"${day}\" sem escapeAtrib. "
            "Origem limitada a input[type=date]/todayISO (browser normaliza → não "
            "explorável via UI), mas viola a convenção do próprio arquivo "
            "(mesma função usa escapeText na linha 414).",
        ),
        (
            "I4",
            "Informativa",
            "src/pages/api/**/*.ts; src/layouts/BaseLayout.astro:13,37",
            "Parte servidor da categoria 5 não se aplica: respostas são JSON puro "
            "(sem templates HTML/e-mail com input do usuário); único set:html é "
            "constante estática (themeInitScript).",
        ),
    ],
}

# --- Pontos fortes verificados ----------------------------------------------
FORTES = [
    ("Escrita por item com posse", "routeFactory.ts:73-165"),
    ("Todas as 20 rotas [id] com guardItemWrite", "rotas */[id].ts"),
    ("Falha fechada para dono vazio", "routeFactory.ts:103-107"),
    ("SSE recorta conversas por dono p/ agent/viewer", "events.ts:25-40"),
    ("Envio WhatsApp valida posse da conversa", "send.ts:39-52"),
    ("Senha: PBKDF2-SHA256 100k + salt por usuário", "server/auth.ts"),
    ("Anti-CSRF same-origin nas rotas de sessão", "auth.ts (assertSameOrigin)"),
    ("Rate limit 5 login / 3 troca de senha", "rateLimit.ts:13-15"),
    ("Gate mustChangePassword em todas as rotas", "middleware.ts:119-123"),
    ("CSP + headers de segurança", "middleware.ts:31-46"),
    ("Admin semeado sem credencial default", "0004:5-9; bootstrap-admin.ts"),
    ("escapeText/escapeAtrib corretos (118 usos)", "domain/format.ts:33-47"),
    ("Modal escapa título; bodyHtml interno escapado", "ui/Modal.ts:36"),
    ("Sem eval/new Function/markdown lib/document.write", "grep verificado"),
    ("readWahaConfig rejeita placeholder (fail-closed)", "server/waha.ts:60-64"),
    ("Compose default sentinel + testes AC-120..123", "docker-compose.waha.yml:41"),
    ("CI, dist e exemplos sem segredos reais", "workflows; dist/; *.example"),
    ("Escopo LGPD por usuário (scopeForUser)", "lgpdScope.ts:69-92"),
]

RECOMENDACOES = [
    (
        "P1 (imediatas)",
        [
            "Adicionar requireRole(ADMINS) (ou operador equivalente) em GET/PUT "
            "de /api/whatsapp/webhook-config e removê-la de PUBLIC_PATHS se não "
            "precisar ser pública.",
            "Validar a posse do pai em createHandler quando o OWNERSHIP declarar "
            "kind='via' (conversationId/contactId do autor ou papel elevado).",
            "Validar formato do id aceito em withNewId (ex.: ^[A-Za-z0-9_-]{1,64}$) "
            "ou aplicar escapeAtrib em todos os value=/data-id= de id.",
        ],
    ),
    (
        "P2 (curto prazo)",
        [
            "Rotacionar a chave WAHA antiga se ainda válida em algum ambiente; "
            "limpar o histórico git (git filter-repo) de waha/.env e do default de "
            "docker-compose.waha.yml; substituir o hash antigo literal do teste por "
            "um valor truncado.",
            "No PUT /api/users/:id, considerar o alvo do recurso em allowedRoles "
            "(manager não edita admin).",
            "Aplicar escapeAtrib nos value= de inputs de data (CrmInboxView:410, "
            "OrdersView:67).",
        ],
    ),
    (
        "P3 (contínuo)",
        [
            "Unificar a intenção de isolamento: ou documentar que as listagens "
            "REST são globais por design, ou estender o recorte por dono do SSE às "
            "listagens.",
            "Validar assignedUserId no POST (derivação obrigatória da sessão para "
            "papéis não elevados).",
            "Teste de regressão: id malicioso rejeitado/escapado; POST filho em "
            "conversa alheia → 403; webhook-config sem papel → 403.",
        ],
    ),
]

# --- Issues para o GitHub ----------------------------------------------------
ISSUES = [
    (
        "[Segurança] webhook-config sem verificação de papel (viewer pode re-registrar webhook)",
        """CATEGORIA: 2 — Permissão no navegador / equivalente servidor
SEVERIDADE: Média

EVIDÊNCIA
- src/pages/api/whatsapp/webhook-config.ts:25-27 (GET) e :57-59 (PUT) chamam
  apenas userFromToken + 401; não há requireRole em nenhuma linha.
- src/pages/api/whatsapp/webhook-config.ts:72 — updateSession(config.session,
  [webhook]) SUBSTITUI a lista de webhooks da sessão no engine.
- src/middleware.ts:15-21 (linha 20) — rota listada em PUBLIC_PATHS, logo o
  middleware não anexa usuário e pula o gate mustChangePassword
  (middleware.ts:119-123).
- Contraste: src/pages/api/whatsapp/session.ts:51,70,116 exigem requireRole(ADMINS).

IMPACTO
Qualquer sessão autenticada (inclusive papel viewer, ou usuário bloqueado para
troca de senha) pode ler o relatório de webhook e forçar a re-registracao,
substituindo webhooks existentes da sessão do engine (perda de integrações).

CORREÇÃO SUGERIDA
- requireRole em GET/PUT (paridade com session.ts); remover de PUBLIC_PATHS se
  não for realmente pública; cobrir com teste de 403 para viewer.

CRITÉRIOS DE ACEITE
- GET/PUT sem papel adequado respondem 403 (viewer).
- Rota sai de PUBLIC_PATHS ou justificativa documentada.
- Teste automatizado cobrindo as permissões.""",
    ),
    (
        "[Segurança] IDOR na criação de registros-filho (mensagens/notas/atividades em conversa alheia)",
        """CATEGORIA: 3 — IDOR
SEVERIDADE: Média

EVIDÊNCIA
- src/server/routeFactory.ts:236-264 (createHandler): não valida posse do pai;
  em :249-255 só deriva owner de sessão para OWNERSHIP kind='column'.
- OWNERSHIP kind='via' (ex.: messages -> conversations) só é aplicado em
  guardItemWrite (:152-165), ou seja, apenas em PUT/DELETE.
- src/pages/api/crm/messages/index.ts:3-6, conversation-notes/index.ts:6-9,
  activities/index.ts:6-9: createCollectionRoutes com create:'agent'.
- Contraste: src/pages/api/whatsapp/send.ts:39-52 (guardConversation) exige
  assignedUserId === user.id ou papel elevado.

IMPACTO
Um agent autenticado pode gravar mensagem/nota/atividade em conversationId /
contactId pertencente a outro agente (falsificação de histórico e poluição da
conversa alheia), contornando a posse que o fluxo de envio já exige.

CORREÇÃO SUGERIDA
Em createHandler, quando o OWNERSHIP do recurso declarar kind='via', resolver o
registro pai e exigir posse (autor ou manager/admin) antes do insert.

CRITÉRIOS DE ACEITE
- POST de message/note/activity em conversa de outro agent → 403 nao_autorizado.
- POST na própria conversa continua 201.
- Teste de regressão cobrindo os três endpoints.""",
    ),
    (
        "[Segurança] XSS armazenado: id do cliente aceito sem validação e interpolado sem escape nos atributos",
        """CATEGORIA: 5 — XSS
SEVERIDADE: Média

EVIDÊNCIA
- src/server/routeFactory.ts:36-40 (withNewId): aceita body.id arbitrário do
  cliente, sem validar formato, e persiste via insertEntity.
- Sinks sem escapeAtrib em atributos HTML:
  - src/ui/views/ProductsView.ts:277      value="${item.id}"
  - src/ui/views/OrdersView.ts:272,312    value="${c.id}" / value="${p.id}"
  - src/ui/views/crm/CrmInboxView.ts:451  value=...
  - src/ui/views/crm/CrmFunilView.ts:104,129  data-deal-id=...
  - src/ui/views/ComponentsView.ts:210    value="${i.id}"
  - src/ui/views/PurchasesView.ts:141     value="${ing.id}"
  - src/ui/views/IngredientsView.ts:359   data-id="${p.id}"
- Mitigação existente: CSP script-src 'self' (src/middleware.ts:31-34) bloqueia
  handlers inline e javascript:, impedindo execução de JS; sobra injeção
  HTML/defacement armazenado.

IMPACTO
Agent+ cria registro com id contendo aspas/HTML; ao abrir cadastros/pedidos/funil
de outros usuários o HTML injetado é renderizado (defacement, phishing de UI,
clobbering). Segurança depende apenas do CSP.

CORREÇÃO SUGERIDA
- Validar id no withNewId (ex.: ^[A-Za-z0-9_-]{1,64}$) e rejeitar 400.
- Defesa em profundidade: escapeAtrib em todos os value=/data-id= de id.

CRITÉRIOS DE ACEITE
- POST com id fora do padrão → 400.
- id legítimo continua funcionando (testes existentes verdes).
- Varredura: nenhum ${...id} cruo em atributo HTML.""",
    ),
    (
        "[Segurança] Chave WAHA e hash admin123 presentes no histórico git",
        """CATEGORIA: 4 — Chaves expostas
SEVERIDADE: Média

EVIDÊNCIA
- waha/.env rastreado de 882b050 (2026-09-29) até 59d917b (2026-10-01,
  "T-103 feature: segredo da WAHA fora do controle de versao"):
  WAHA_API_KEY_SHA512=sha512:b6eb06b35fa2...
- waha/docker-compose.waha.yml (histórico) usava o mesmo hash como default de
  ${WAHA_API_KEY_SHA512:-sha512:b6eb06b35fa2...}.
- migrations/0004_crm_seed.sql (13 commits) continha hash PBKDF2 de 'admin123'
  com sal fixo 'deskcomm-seed-v1'; removido no HEAD (comentários 0004:5-9).
- tests/server/wahaComposeSecurity.test.ts:21,28 ainda embutem o hash antigo
  completo como literal negativo.
- OK: chave ATUAL e plaintext nunca commitados (git log -S vazio); .dev.vars e
  waha/.env gitignored e untracked.

IMPACTO
O histórico permite offline brute-force do hash antigo (se a chave era fraca) e
o hash 'admin123' confirma credencial default em bases que rodaram as migrations
antigas; instâncias antigas podem ainda ter o usuário seed.

CORREÇÃO SUGERIDA
- Rotacionar a chave WAHA caso a antiga exista em qualquer ambiente.
- git filter-repo para remover waha/.env e o default antigo do compose.
- Trocar o literal do teste por hash truncado; verificar bases legadas por
  usuários seed (0019/0021 já tratam).

CRITÉRIOS DE ACEITE
- git log -S <trecho do hash antigo> vazio após a limpeza.
- Chave rotacionada documentada.
- Testes verdes sem o hash completo no repositório.""",
    ),
    (
        "[Segurança] PUT /api/users/:id: manager pode editar nome/e-mail de usuários admin",
        """CATEGORIA: 2/3 — Permissão / IDOR (classe de privilégio)
SEVERIDADE: Baixa

EVIDÊNCIA
- src/pages/api/users/[id].ts:30 — requireRole(context, allowedRoles(body)) decide
  só pelo corpo: role/password exigem admin; name/email caem em USER_MANAGERS.
- src/pages/api/users/[id].ts:88-93 (editablePatch) aplica body.name/body.email
  sem considerar o papel do usuário ALVO.

IMPACTO
Um manager altera nome/e-mail de contas admin (integridade de cadastro e vetores
de phishing interno). role/password permanecem protegidos.

CORREÇÃO SUGERIDA
Recurso alvo admin só editável por admin (cheque de alvo em allowedRoles/patch).

CRITÉRIOS DE ACEITE
- manager → PUT em usuário admin (name/email) → 403.
- admin → PUT continua 200; manager editando agent continua 200.""",
    ),
    (
        "[Segurança] Inputs de data interpolados em value= sem escapeAtrib",
        """CATEGORIA: 5 — XSS (defesa em profundidade)
SEVERIDADE: Baixa

EVIDÊNCIA
- src/ui/views/crm/CrmInboxView.ts:410: value="${composerDelivery}" (a mesma
  função usa escapeText no vizinho da linha 414).
- src/ui/views/OrdersView.ts:67: value="${day}".
- Origem: todayISO()/input[type=date] (CrmInboxView:68,979; OrdersView:30,131) —
  o browser normaliza para yyyy-mm-dd, logo não explorável pela UI.

IMPACTO
Não explorável na prática hoje, mas quebra a convenção de escape do repositório
e vira XSS se a origem mudar (ex.: estado setado por query param).

CORREÇÃO SUGERIDA
escapeAtrib nos dois value= (e varredura de interpolções em atributos).

CRITÉRIOS DE ACEITE
- Ambos os value= usam escapeAtrib; testes verdes.""",
    ),
]

MAPPED = "Conclusões da auditoria de 04/10/2026 — 10 achados (0 crítica, 0 alta, "
MAPPED += "4 média, 2 baixa, 4 informativa) + 18 pontos fortes."

# --- Estilos -----------------------------------------------------------------
base = getSampleStyleSheet()
S = {
    "h1": ParagraphStyle(
        "h1", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=16,
        leading=20, textColor=COR_TXT, spaceAfter=8, spaceBefore=2, alignment=TA_LEFT,
    ),
    "h2": ParagraphStyle(
        "h2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=12.5,
        leading=16, textColor=COR_TXT, spaceBefore=12, spaceAfter=6,
    ),
    "h3": ParagraphStyle(
        "h3", parent=base["Heading3"], fontName="Helvetica-Bold", fontSize=10.5,
        leading=14, textColor=COR_TXT2, spaceBefore=8, spaceAfter=4,
    ),
    "body": ParagraphStyle(
        "body", parent=base["BodyText"], fontName="Helvetica", fontSize=9.3,
        leading=13, textColor=COR_TXT2, spaceAfter=6, alignment=TA_LEFT,
    ),
    "small": ParagraphStyle(
        "small", parent=base["BodyText"], fontName="Helvetica", fontSize=8,
        leading=11, textColor=COR_TXT2,
    ),
    "cell": ParagraphStyle(
        "cell", parent=base["BodyText"], fontName="Helvetica", fontSize=7.6,
        leading=10, textColor=COR_TXT2,
    ),
    "cellb": ParagraphStyle(
        "cellb", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=7.6,
        leading=10, textColor=COR_TXT2,
    ),
    "mono": ParagraphStyle(
        "mono", fontName="Courier",
        fontSize=7.2, leading=9.4, textColor=COR_TXT2,
    ),
    "issue": ParagraphStyle(
        "issue", fontName="Courier", fontSize=7.2, leading=9.6, textColor=COR_TXT2,
        alignment=TA_LEFT, wordWrap="CJK",
    ),
    "title": ParagraphStyle(
        "title", fontName="Helvetica-Bold", fontSize=24, leading=29,
        textColor=COR_TXT, alignment=TA_CENTER, spaceAfter=10,
    ),
    "sub": ParagraphStyle(
        "sub", fontName="Helvetica", fontSize=12, leading=17,
        textColor=COR_TXT2, alignment=TA_CENTER, spaceAfter=6,
    ),
    "cover": ParagraphStyle(
        "cover", fontName="Helvetica", fontSize=9.6, leading=14,
        textColor=COR_TXT2, alignment=TA_LEFT, spaceAfter=6,
    ),
    "sevchip": ParagraphStyle(
        "sevchip", fontName="Helvetica-Bold", fontSize=7.6, leading=10,
        textColor=colors.white, alignment=TA_CENTER,
    ),
}

SEV_ORDER = ["Crítica", "Alta", "Média", "Baixa", "Informativa"]


def all_findings():
    out = []
    for cat in (1, 2, 3, 4, 5):
        for f in ACHADOS[cat]:
            out.append((cat,) + f)
    return out


def counts_by_sev():
    c = {s: 0 for s in SEV_ORDER}
    for row in all_findings():
        c[row[2]] += 1
    return c


def counts_by_cat():
    return {cat: len(ACHADOS[cat]) for cat in ACHADOS}


# --- Gráficos ----------------------------------------------------------------
def fig_donut() -> Image:
    c = counts_by_sev()
    labels, sizes, cols = [], [], []
    for s in SEV_ORDER:
        if c[s]:
            labels.append(f"{s} ({c[s]})")
            sizes.append(c[s])
            cols.append(SEV_HEX[s])
    fig, ax = plt.subplots(figsize=(4.6, 3.4), dpi=200)
    wedges, _ = ax.pie(
        sizes, colors=cols, startangle=90, counterclock=False,
        wedgeprops=dict(width=0.42, edgecolor="white", linewidth=1.6),
    )
    ax.legend(
        wedges, labels, loc="center left", bbox_to_anchor=(0.98, 0.5),
        frameon=False, fontsize=8.5, labelspacing=0.55,
    )
    ax.set_aspect("equal")
    ax.set_title("Achados por severidade", fontsize=10, pad=8)
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", facecolor="white")
    plt.close(fig)
    buf.seek(0)
    return Image(buf, width=8.6 * cm, height=6.0 * cm)


def fig_cats() -> Image:
    sev_slice = ["Média", "Baixa", "Informativa"]
    counts = counts_by_cat()
    fig, ax = plt.subplots(figsize=(7.4, 3.0), dpi=200)
    ypos = list(range(len(CATEGORIAS)))[::-1]
    left = [0] * len(CATEGORIAS)
    for s in sev_slice:
        vals = []
        for i, cat in enumerate(counts):
            n = sum(1 for f in ACHADOS[cat] if f[1] == s)
            vals.append(n)
        ax.barh(
            ypos, vals, left=left, height=0.55,
            color=SEV_HEX[s],
            label=s, edgecolor="white",
        )
        for y, v, l in zip(ypos, vals, left):
            if v:
                ax.text(l + v / 2, y, str(v), ha="center", va="center",
                        color="white", fontsize=8, fontweight="bold")
        left = [a + b for a, b in zip(left, vals)]
    ax.set_yticks(ypos)
    ax.set_yticklabels([c.replace("\n", " ") for c in CATEGORIAS], fontsize=8.2)
    ax.set_xlabel("Número de achados", fontsize=8.5)
    ax.set_title("Achados por categoria", fontsize=10, pad=8)
    ax.legend(frameon=False, fontsize=8, ncol=3, loc="lower right")
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(axis="x", linestyle=":", alpha=0.5)
    ax.set_axisbelow(True)
    ax.set_xticks(range(0, 5))
    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", facecolor="white")
    plt.close(fig)
    buf.seek(0)
    return Image(buf, width=15.6 * cm, height=6.4 * cm)


# --- Tabelas -----------------------------------------------------------------
def sev_chip(sev: str) -> Table:
    t = Table([[Paragraph(sev, S["sevchip"])]], colWidths=[1.95 * cm], rowHeights=[0.42 * cm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), SEV_COR[sev]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 1.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("ROUNDEDCORNERS", [3, 3, 3, 3]),
            ]
        )
    )
    return t


def findings_table(cat: int) -> Table:
    rows: list = [[
        Paragraph("<b>ID</b>", S["cellb"]),
        Paragraph("<b>Severidade</b>", S["cellb"]),
        Paragraph("<b>Arquivo : linha</b>", S["cellb"]),
        Paragraph("<b>Descrição verificada</b>", S["cellb"]),
    ]]
    styles = []
    for i, (fid, sev, where, desc) in enumerate(ACHADOS[cat], start=1):
        rows.append([
            Paragraph(f"<b>{fid}</b>", S["cellb"]),
            sev_chip(sev),
            Paragraph(where.replace("; ", "<br/>"), S["cell"]),
            Paragraph(desc, S["cell"]),
        ])
        styles.append(("VALIGN", (0, i), (-1, i), "TOP"))
        if i % 2 == 0:
            styles.append(("BACKGROUND", (0, i), (-1, i), COR_FUNDO))
    t = Table(rows, colWidths=[0.9 * cm, 2.2 * cm, 4.9 * cm, 9.0 * cm], repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E5E7EB")),
                ("GRID", (0, 0), (-1, -1), 0.4, COR_LINHA),
                ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ]
            + styles
        )
    )
    return t


def strongs_table() -> Table:
    half = (len(FORTES) + 1) // 2
    left, right = FORTES[:half], FORTES[half:]
    rows = []
    for i in range(half):
        l = left[i]
        r = right[i] if i < len(right) else ("", "")
        rows.append([
            Paragraph(f"✔ {l[0]}", S["cell"]),
            Paragraph(f"<font color='#059669'>{l[1]}</font>", S["cell"]),
            Paragraph(f"✔ {r[0]}" if r[0] else "", S["cell"]),
            Paragraph(f"<font color='#059669'>{r[1]}</font>" if r[1] else "", S["cell"]),
        ])
    t = Table(rows, colWidths=[5.6 * cm, 3.1 * cm, 5.6 * cm, 3.1 * cm])
    t.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.4, COR_LINHA),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#ECFDF5")),
            ]
        )
    )
    return t


def summary_table() -> Table:
    c = counts_by_sev()
    rows: list = [[
        Paragraph("<b>Severidade</b>", S["cellb"]),
        Paragraph("<b>Qtd</b>", S["cellb"]),
        Paragraph("<b>Categorias afetadas</b>", S["cellb"]),
    ]]
    styles = []
    where = {
        "Média": "2, 3, 4, 5",
        "Baixa": "2, 5",
        "Informativa": "1, 4, 5",
        "Crítica": "—",
        "Alta": "—",
    }
    for i, s in enumerate(SEV_ORDER, start=1):
        rows.append([
            sev_chip(s),
            Paragraph(f"<b>{c[s]}</b>", S["cellb"]),
            Paragraph(where[s], S["cell"]),
        ])
        styles.append(("VALIGN", (0, i), (-1, i), "MIDDLE"))
    rows.append([
        Paragraph("<b>Total</b>", S["cellb"]),
        Paragraph(f"<b>{sum(c.values())}</b>", S["cellb"]),
        Paragraph("+ 18 pontos fortes verificados", S["cell"]),
    ])
    styles.append(("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), COR_FUNDO))
    t = Table(rows, colWidths=[2.6 * cm, 1.6 * cm, 6.4 * cm])
    t.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.4, COR_LINHA),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E5E7EB")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ]
            + styles
        )
    )
    return t


def esc_xml(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# --- Rodapé/cabeçalho --------------------------------------------------------
def _chrome(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(colors.HexColor("#6B7280"))
    canvas.drawString(2 * cm, h - 1.25 * cm, "Relatório de Auditoria de Segurança — atelie-erp")
    canvas.drawRightString(w - 2 * cm, h - 1.25 * cm, "04/10/2026")
    canvas.setStrokeColor(COR_LINHA)
    canvas.setLineWidth(0.5)
    canvas.line(2 * cm, h - 1.45 * cm, w - 2 * cm, h - 1.45 * cm)
    canvas.line(2 * cm, 1.45 * cm, w - 2 * cm, 1.45 * cm)
    canvas.drawString(2 * cm, 1.05 * cm, "docs/security-audit/relatorio-auditoria-seguranca.pdf")
    canvas.drawRightString(w - 2 * cm, 1.05 * cm, f"Página {doc.page}")
    canvas.restoreState()


def build(path: str) -> None:
    doc = BaseDocTemplate(
        path, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
        title="Relatório de Auditoria de Segurança — atelie-erp",
        author="Auditoria de segurança (código verificado)",
        subject="Segurança — 5 categorias",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
    doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=_chrome)])

    W = doc.width
    st: list = []

    # --- Capa ---
    st.append(Spacer(1, 2.2 * cm))
    st.append(Paragraph("Relatório de Auditoria de Segurança", S["title"]))
    st.append(Paragraph("Projeto atelie-erp — ERP/CRM de ateliê", S["sub"]))
    st.append(Paragraph("04 de outubro de 2026 · Escopo: 5 categorias de auditoria", S["sub"]))
    st.append(Spacer(1, 0.9 * cm))

    cover_box = Table(
        [
            [Paragraph(
                "<b>Stack verificada</b><br/>"
                "TypeScript · Astro 7 SSR · Cloudflare Workers (@astrojs/cloudflare) · "
                "D1 (SQL via prepared statements, sem ORM) · Auth por sessão "
                "(cookie HttpOnly crm_session / Bearer, PBKDF2-SHA256 100k + salt por "
                "usuário) · Frontend sem framework (DOM imperativo) · Wrangler · "
                "WAHA (WhatsApp) em dev via docker-compose · CI GitHub Actions · "
                "sem Helm/Terraform/Docker de produção.",
                S["cover"]),
             ],
            [Paragraph(
                "<b>Metodológica — mapeamento das 5 categorias para a stack</b><br/>"
                "1. Banco sem tranca (isolamento de dono) → RBAC + coluna de dono "
                "(OWNERSHIP) + SSE/LGPD.<br/>"
                "2. Permissão no navegador → gates de UI vs. requireRole/hasRole no "
                "servidor.<br/>"
                "3. IDOR → rotas de item/criação e ownership.<br/>"
                "4. Chaves expostas → .env/.dev.vars, histórico git, CI, bundle, "
                "migrations, testes.<br/>"
                "5. XSS → interpolações em innerHTML, escapeText/escapeAtrib, CSP, "
                "set:html.",
                S["cover"]),
             ],
            [Paragraph(
                "<b>Nota metodológica</b><br/>"
                "Somente achados verificados no código real (arquivo:linha + trecho + "
                "porquê + severidade). Nada de especulação. O que foi verificado e "
                "está CORRETO também é registrado (pontos fortes). Categorias "
                "parcialmente não aplicáveis são ditas explicitamente. "
                "Severidades: " + MAPPED,
                S["cover"]),
             ],
        ],
        colWidths=[W],
    )
    cover_box.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.8, COR_LINHA),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, COR_LINHA),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F9FAFB")),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    st.append(cover_box)
    st.append(PageBreak())

    # --- Resumo executivo ---
    st.append(Paragraph("1. Resumo executivo", S["h1"]))
    st.append(Paragraph(
        "Auditoria completa das 5 categorias sobre o código real do repositório "
        "(backend, rotas de API, frontend, configs, histórico git e bundle). "
        "<b>Nenhum achado crítico ou alto.</b> 4 médios concentram-se em controles "
        "de autorização faltantes (webhook-config e criação de filhos), segredos no "
        "histórico git e id de cliente interpolado sem escape. As defesas "
        "estruturais — CSP, PBKDF2, rate limit, ownership fail-closed em escrita de "
        "item, gates de sessão — foram verificadas e estão corretas.",
        S["body"],
    ))
    charts = Table([[summary_table(), fig_donut()]], colWidths=[W * 0.5, W * 0.5])
    charts.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                ("RIGHTPADDING", (0, 0), (0, 0), 8)]))
    st.append(charts)
    st.append(Spacer(1, 6))
    st.append(fig_cats())
    st.append(Spacer(1, 4))
    st.append(Paragraph(
        "Leitura: a categoria 2 (permissão) e a 5 (XSS) concentram a maioria dos "
        "achados acionáveis; a categoria 1 é majoritariamente informativa porque o "
        "app é single-tenant por decisão documentada; a 4 tem um achado de histórico "
        "git embora os segredos atuais estejam fora do repositório.",
        S["body"],
    ))

    # --- Pontos fortes ---
    st.append(Paragraph("2. Pontos fortes verificados (o que está CORRETO)", S["h1"]))
    st.append(Paragraph(
        "Tudo abaixo foi lido e confirmado no código — não é lista de intenções:",
        S["body"],
    ))
    st.append(strongs_table())
    st.append(Spacer(1, 6))

    # --- Achados por categoria ---
    st.append(Paragraph("3. Achados por categoria (arquivo : linha)", S["h1"]))
    cat_titles = {
        1: "Categoria 1 — Banco sem tranca (isolamento de dono/tenant)",
        2: "Categoria 2 — Permissão no navegador",
        3: "Categoria 3 — IDOR",
        4: "Categoria 4 — Chaves expostas",
        5: "Categoria 5 — XSS",
    }
    cat_notes = {
        1: "Mecanismo identificado: single-tenant por design (README) + RBAC "
           "(authz.ts) + coluna de dono na escrita de item (OWNERSHIP, fail-closed). "
           "As listagens REST são globais por decisão documentada — por isso esta "
           "categoria só produz informativos, não vulnerabilidades.",
        2: "Comparação:UI/esconde vs. servidor/valida. Achados abaixo são casos em "
           "que o servidor NÃO valida o papel equivalente.",
        3: "Rotas de item com guardItemWrite foram conferidas uma a uma (20 rotas) "
           "— o achado é na CRIAÇÃO (createHandler), única via sem checagem de pai.",
        4: "Verificado: git log -S por chave/plaintext (nunca commitados), "
           "gitignored, exemplos com placeholder, CI/bundle limpos, sentinel + "
           "testes de compose. O achado é do HISTÓRICO removido.",
        5: "escapeText/escapeAtrib corretos (118 usos); sem eval/markdown lib; "
           "CSP script-src 'self'. Achados são interpolações que escaparam da "
           "convenção de escape.",
    }
    for cat in (1, 2, 3, 4, 5):
        block = [
            Paragraph(cat_titles[cat], S["h2"]),
            Paragraph(cat_notes[cat], S["body"]),
            findings_table(cat),
        ]
        st.append(KeepTogether(block))

    # --- Recomendações ---
    st.append(Paragraph("4. Recomendações", S["h1"]))
    for title, items in RECOMENDACOES:
        st.append(Paragraph(title, S["h3"]))
        for j, it in enumerate(items, start=1):
            st.append(Paragraph(f"{j}. {it}", S["body"]))

    # --- Issues ---
    st.append(PageBreak())
    st.append(Paragraph("5. Issues para o GitHub (copiar/colar)", S["h1"]))
    st.append(Paragraph(
        "Agrupadas por causa-raiz para não gerar spam: 6 issues cobrem os 10 achados "
        "(F6 agrupa todo o histórico git). Título na primeira linha, corpo entre os "
        "delimitadores abaixo; labels sugeridas: <b>security</b> + severidade "
        "(medium/low).",
        S["body"],
    ))
    for n, (title, body) in enumerate(ISSUES, start=1):
        lines = [f"--- ISSUE {n} ---", f"TÍTULO: {title}", ""]
        lines += body.split("\n")
        lines += [f"--- FIM ISSUE {n} ---", ""]
        txt = esc_xml("\n".join(lines))
        txt = txt.replace("\n", "<br/>")
        box = Table(
            [[Paragraph(txt, S["issue"])]],
            colWidths=[W],
        )
        box.setStyle(
            TableStyle(
                [
                    ("BOX", (0, 0), (-1, -1), 0.7, COR_LINHA),
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F9FAFB")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 7),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        st.append(KeepTogether([box, Spacer(1, 9)]))

    doc.build(st)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, "relatorio-auditoria-seguranca.pdf")
    build(out)
    print(f"OK: {out}")
