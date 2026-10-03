#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera o Relatório de Auditoria de Segurança (PDF) do Ateliê ERP + DeskcommCRM.

Uso:
    cd docs/security-audit
    .venv/bin/python generate_report.py

Saídas:
    - relatorio-auditoria-seguranca.pdf
    - chart_severidade.png
    - chart_categoria.png
"""

import os
import datetime
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table,
    TableStyle, PageBreak, Image, HRFlowable
)

HERE = os.path.dirname(os.path.abspath(__file__))
VENV_MPL = os.path.join(HERE, ".venv", "lib")

# ---------------------------------------------------------------------------
# Cores da paleta (conforme pedido)
# ---------------------------------------------------------------------------
C_CRITICA = "#B91C1C"
C_ALTA    = "#EA580C"
C_MEDIA   = "#D97706"
C_BAIXA   = "#2563EB"
C_FORTE   = "#059669"
C_INFO    = "#6B7280"
C_PRIMARIA = "#0F2A43"

SEV_ORDER = ["Crítica", "Alta", "Média", "Baixa", "Informativa"]
SEV_COLOR = {
    "Crítica": C_CRITICA,
    "Alta": C_ALTA,
    "Média": C_MEDIA,
    "Baixa": C_BAIXA,
    "Informativa": C_INFO,
}

# ---------------------------------------------------------------------------
# Fonte TTF para acentuação (pt-BR)
# ---------------------------------------------------------------------------
def register_fonts():
    for root, _dirs, files in os.walk(VENV_MPL):
        if "DejaVuSans.ttf" in files:
            base = root
            pdfmetrics.registerFont(TTFont("DejaVu", os.path.join(base, "DejaVuSans.ttf")))
            pdfmetrics.registerFont(TTFont("DejaVu-Bold", os.path.join(base, "DejaVuSans-Bold.ttf")))
            pdfmetrics.registerFont(TTFont("DejaVu-Oblique", os.path.join(base, "DejaVuSans-Oblique.ttf")))
            pdfmetrics.registerFont(TTFont("DejaVu-BoldOblique", os.path.join(base, "DejaVuSans-BoldOblique.ttf")))
            pdfmetrics.registerFont(TTFont("DejaVuMono", os.path.join(base, "DejaVuSansMono.ttf")))
            if os.path.exists(os.path.join(base, "DejaVuSansMono-Bold.ttf")):
                pdfmetrics.registerFont(TTFont("DejaVuMono-Bold", os.path.join(base, "DejaVuSansMono-Bold.ttf")))
            pdfmetrics.registerFontFamily(
                "DejaVu",
                normal="DejaVu", bold="DejaVu-Bold",
                italic="DejaVu-Oblique", boldItalic="DejaVu-BoldOblique",
            )
            return
    raise SystemExit("DejaVuSans.ttf não encontrado")

# ---------------------------------------------------------------------------
# Dados da auditoria
# ---------------------------------------------------------------------------
FINDINGS = [
    # (id, severidade, categoria, arquivo:linha, descricao, exploravel)
    ("F1", "Alta", "Banco sem tranca",
     "routeFactory.ts:224-234 (listHandler); todos os GET /api/**/index.ts",
     "Todos os endpoints de listagem (contatos, conversas, mensagens, deals, pedidos, ingredientes, produtos, clientes) devolvem a base inteira, filtrando apenas por papel mínimo (viewer). Não há recorte por assignedUserId/tenant.",
     "Qualquer sessão válida lê os dados de todos os usuários do sistema."),
    ("F2", "Média", "Banco sem tranca",
     "events.ts:27-39, 49-103",
     "O recorte de visibilidade do SSE (visibleConversationIds) cobre apenas conversations/messages. Nenhum outro recurso exposto por SSE é filtrado por ownership.",
     "Agent/viewer recebe eventos sem o recorte de dono aplicado a outros recursos."),
    ("F4", "Baixa", "Permissão no navegador",
     "CrmContatosView.ts:205-211; crm/conversations/index.ts",
     "A UI só oferece 'Conversar' para contatos com telefone, mas POST /api/crm/conversations valida apenas o papel (agent) e não a viabilidade do canal/contato.",
     "Criação de conversa em canal inválido — falha de regra de negócio, não de autorização."),
    ("F5", "Média", "Permissão no navegador",
     "CrmInboxView.ts:492-506; orders/index.ts",
     "O compositor de pedido da inbox vincula o cliente do contato em aberto, mas POST /api/orders aceita qualquer customerId do body. O agente pode criar pedidos para clientes fora da conversa aberta.",
     "Escrita de pedido associada a cliente arbitrário."),
    ("F6", "Crítica", "IDOR",
     "routeFactory.ts:73-100 (OWNERSHIP + checkOwnership)",
     "Tabelas do ERP (ingredients, components, products, customers, orders, stock_movements) e demais (settings, pipelines, stages, tags...) não possuem coluna de dono no mapa OWNERSHIP. O checkOwnership devolve null (permite) para elas.",
     "Qualquer agent pode PUT/DELETE qualquer registro do ERP só com o ID (exclusão/danificação de catálogo, pedidos, estoque)."),
    ("F7", "Crítica", "IDOR",
     "users/[id].ts:28-65 (allowedRoles, PUT/DELETE)",
     "PUT /api/users/:id aceita, para manager, a edição de qualquer campo (exceto role/password sem admin) de qualquer usuário. Um manager pode mudar name/email de qualquer um e, como não há checagem de posse entre pares, a gestão de equipe fica aberta a escrita mútua.",
     "Escrita não autorizada sobre contas de outros usuários; base para escalada quando combinada a campos gerenciáveis."),
    ("F8", "Alta", "IDOR",
     "crm/quick-replies/[id].ts, crm/tags/[id].ts, crm/appointment-types/[id].ts, crm/pipelines/[id].ts, crm/stages/[id].ts",
     "Tabelas CRM de apoio (quick_replies, tags, appointment_types, pipelines, pipeline_stages) não estão em OWNERSHIP; qualquer agent pode editar/deletar respostas, etiquetas e estrutura do funil de todo o time.",
     "Alteração/remoção não autorizada de recursos compartilhados do funil CRM."),
    ("F9", "Média", "IDOR",
     "crm/messages/index.ts (POST); routeFactory.ts:248-255",
     "Na criação de mensagem, o conversationId vem do body do cliente e não é validado contra a posse da conversa. O checkOwnership só atua no PUT/DELETE (via conversas).",
     "Agent insere mensagem em conversa que não lhe pertence."),
    ("F10", "Baixa", "IDOR",
     "tables.ts:216-224; routeFactory.ts:175-176 (IMMUTABLE_FIELDS)",
     "Em conversation_notes, authorUserId é imutável mas assignedUserId é mutável no PUT; um agent dono da conversa pode reatribuir a nota a outro usuário.",
     "Reatribuição de nota entre usuários pela escrita."),
    ("F11", "Alta", "Chaves expostas",
     "domain/whatsapp.ts (WAHA_DEV_PLACEHOLDER_KEY); wahaWebhook.ts:41-54 (PLACEHOLDER_SECRETS)",
     "O placeholder 'dev_plaintext_change_me' está hardcodado no código-fonte. readWahaConfig/usableSecret o tratam como 'não configurado' (fail-closed), mas a constante viva no source é um segredo-valor conhecido e commitado.",
     "Se o deploy não sobrescrever a chave e a validação de startup for relaxada, o valor padrão vira segredo real."),
    ("F12", "Média", "Chaves expostas",
     ".dev.vars.example:31-45; wahaWebhook.ts:86-90",
     "WAHA_HMAC_SECRET vazio no exemplo deixa o receiver em 503 (fail-closed), mas a presença de WAHA_WEBHOOK_ALLOW_UNSIGNED='true' documentada permite operar sem assinatura em desenvolvimento — padrão de config insegura.",
     "Operação sem HMAC quando o escape hatch é ligado."),
    ("F14", "Informativa", "Chaves expostas",
     "waha/docker-compose.waha.yml, waha/.env (fora de src/)",
     "Config local do WAHA (compose + .env) não auditada neste escopo; pode conter a chave de API e o segredo HMAC usados pelo engine local.",
     "Segredos de ambiente local, não expostos no bundle de produção."),
    ("F15", "Baixa", "XSS",
     "views/**/*.ts (innerHTML em dezenas de pontos, ex.: CrmInboxView.ts:127, OrdersView.ts:46)",
     "Todo o render usa innerHTML com template string. A proteção depende 100% do escapeText/escapeAtrib aplicado em cada dado dinâmico; não há defesa em profundidade (CSP) nem biblioteca de sanitização dedicada.",
     "Um único ponto de escape esquecido vira XSS; não há segunda barreira."),
    ("F16", "Informativa", "XSS",
     "format.ts:41 (export const escapeHtml = escapeText)",
     "Alias depreciado escapeHtml exportado (mesma implementação). Não utilizado no código atual; mantém API legada que pode induzir uso incorreto (o nome sugere escape de HTML genérico).",
     "Risco de uso futuro incorreto do alias."),
]

SEV_COUNTS = {s: 0 for s in SEV_ORDER}
CAT_COUNTS = {}
for _f in FINDINGS:
    SEV_COUNTS[_f[1]] += 1
    CAT_COUNTS[_f[2]] = CAT_COUNTS.get(_f[2], 0) + 1
TOTAL = len(FINDINGS)

STRENGTHS = [
    ("Autenticação forte",
     "PBKDF2-SHA256 com 100 mil iterações e salt aleatório por usuário; hash/salt em colunas separadas e falha fechada quando ausente (auth.ts:41-55, 244-258)."),
    ("Sessões com expiração e rotação",
     "TTL de 30 dias, cookie HttpOnly + Secure + SameSite=Strict, expurgo de sessões expiradas e rotação no login (auth.ts:26, 71-87, 61-62)."),
    ("RBAC validado no servidor em todas as rotas sensíveis",
     "requireRole/requireRank aplicados em /api/users, /api/settings, /api/whatsapp/session e /api/whatsapp/send; a fábrica de rotas aplica a matriz viewer/agent/manager a todo CRUD (authz.ts:52-73, routeFactory.ts:56-60)."),
    ("Ownership check no CRUD do CRM",
     "checkOwnership recusa agent/viewer quando a coluna de dono está vazia (fail-closed) e rejeita escrita em registro alheio; mensagens herdam posse da conversa (routeFactory.ts:91-141)."),
    ("Campos imutáveis protegidos",
     "IMMUTABLE_FIELDS bloqueia alteração de createdBy/createdAt/assignedUserId (conversations) e dos campos de autoria de mensagem no PUT (routeFactory.ts:168-183)."),
    ("Validação de entrada no servidor",
     "numericProblems rejeita NaN/Infinity em campos numéricos; refuseEmptyOwner barra assignedUserId=''; settings filtra por allowlist e converte para número (mapping.ts, routeFactory.ts:185-222, settings.ts:32-44)."),
    ("Auditoria de ações",
     "action_logs e auth_audit registram CRUD, logins, trocas de senha e ações LGPD; dados de data/export/erase são recortados pelo titular (audit.ts, me/data.ts, me/erase.ts)."),
    ("Proteção de origem nos endpoints de sessão",
     "assertSameOrigin recusa login/logout/troca de senha com Origin de outra origem, barrando CSRF de sessão (origin.ts:10-20)."),
    ("HMAC do webhook WAHA com fail-closed",
     "Assinatura SHA-512 verificada em tempo constante; segredos placeholder/curtos são rejeitados; sem segredo útil o receiver devolve 503 secret_required (wahaWebhook.ts:80-133)."),
    ("XSS mitigado na borda do front",
     "escapeText (via textContent) e escapeAtrib aplicados a todo dado dinâmico antes do innerHTML; nenhum dangerouslySetInnerHTML/v-html/eval/new Function localizado (domain/format.ts:33-47)."),
    ("Superfície enxuta (framework-free)",
     "Sem React/Radix/shadcn; as views são DOM imperativo com escapatório único de render — reduz vetores de XSS do ecossistema (tests/dependencies.test.ts trava a regressão)."),
]

RECOMMENDATIONS = [
    ("P1", "F6", "Adicionar coluna/valor de dono a todos os recursos do ERP e estender o mapa OWNERSHIP de routeFactory.ts para ingredients, components, products, customers, orders e stock_movements (ou exigir papel write global para a área ERP e documentar a decisão).", "Eliminar escrita/deleção de qualquer ID pelo agent."),
    ("P1", "F7", "Proibir manager de editar qualquer campo de usuário; restringir escrita a 'si mesmo' ou a papéis estritamente inferiores, e exigir admin para deletar (atualização de allowedRoles + checagem de posse na users/[id].ts).", "Impedir escrita cruzada e escalada na gestão de equipe."),
    ("P2", "F8, F9, F10", "Incluir quick_replies, tags, appointment_types, pipelines e pipeline_stages em OWNERSHIP (ou torná-los só-admin); validar conversationId contra a posse na criação de mensagem; tornar assignedUserId de conversation_notes imutável.", "Fechar o IDOR restante no CRM."),
    ("P2", "F1, F2", "Definir política de escopo de leitura: ou filtrar listagens por ownership/tenant, ou documentar explicitamente que o app é single-tenant com visibilidade total por papel — e estender o recorte do SSE a todos os recursos expostos.", "Remover a ambiguidade de isolamento e o vazamento por SSE."),
    ("P2", "F11, F12, F14", "Tirar o valor placeholder do source (carregá-lo só de env), validar em startup que WAHA_API_KEY/WAHA_HMAC_SECRET diferem dos defaults conhecidos e falham fechado; documentar que WAHA_WEBHOOK_ALLOW_UNSIGNED só pode ser true em dev.", "Zerar segredo-valor conhecido no código e barrar config insegura no boot."),
    ("P3", "F4, F5, F15, F16", "Validar canal/telefone antes de criar conversa; restringir customerId do novo pedido ao contato da conversa aberta; adicionar CSP + considerar um passo de sanitização explícito; remover o alias escapeHtml.", "Profundizar a defesa (em profundidade) contra XSS e fechar os gaps de regra de negócio."),
]

# ---------------------------------------------------------------------------
# Issues de GitHub (agrupadas)
# ---------------------------------------------------------------------------
ISSUES = [
    ("ISSUE 1",
     "[Segurança] IDOR: tabelas do ERP sem verificação de posse permitem escrita/deleção de qualquer registro",
     "security, crítica",
     """### Problema
O mapa de posse (`OWNERSHIP`) em `src/server/routeFactory.ts` só lista as tabelas do CRM. As tabelas do ERP (`ingredients`, `components`, `products`, `customers`, `orders`, `stock_movements`) e recursos de apoio (`settings`, `pipelines`, `pipeline_stages`, `tags`, ...) não têm entrada nesse mapa, e o `checkOwnership` devolve `null` (permite) quando a tabela não está listada.

### Por que é explorável
Qualquer usuário com papel `agent` (o mínimo para `PUT`/`DELETE`) pode alterar ou excluir qualquer registro do ERP — bastando conhecer o `id`. Não há checagem de posse nem restrição por papel acima do mínimo.

### Evidência
`src/server/routeFactory.ts:73-100`
```ts
const OWNERSHIP: Record<string, OwnershipMap> = {
  contacts: { kind: 'column', field: 'assignedUserId' },
  // ... apenas tabelas do CRM
};
// linha ~100:
const om = OWNERSHIP[table];
if (!om) return null; // tabela sem dono definido, permite
```

### Impacto
Um `agent` pode danificar o catálogo (ingredientes/produtos/componentes), alterar pedidos ou dar baixa indevida de estoque — escrita/deleção não autorizada em dados críticos do ERP.

### Sugestão de correção
- Adicionar coluna/valor de dono às tabelas do ERP e incluir as tabelas em `OWNERSHIP`; ou
- Documentar que a área ERP é de escrita global por papel e elevar o mínimo de escrita/exclusão a `manager`/`admin` para essas tabelas.

### Critérios de aceite
- [ ] `PUT/DELETE` em `/api/ingredients/:id`, `/api/products/:id`, `/api/customers/:id`, `/api/orders/:id` e `/api/stock-movements` recusam (403) agente não proprietário;
- [ ] Teste de regressão prova que agent não-alvo recebe 403 e proprietário/manager/admin passam;
- [ ] Matriz de papéis documentada para a área ERP.""",),
    ("ISSUE 2",
     "[Segurança] Escalada/escrita cruzada na gestão de usuários: manager pode editar qualquer usuário",
     "security, crítica",
     """### Problema
`PUT /api/users/:id` valida o papel do chamador via `allowedRoles(body)`, mas não verifica a posse sobre o usuário alvo. Um `manager` consegue editar `name`/`email` de qualquer usuário (inclusive de outros managers), e a exclusão fica aberta a quem tem papel de gestão.

### Por que é explorável
Há hierarquia de papel (viewer/agent/manager/admin), mas a escrita sobre contas de terceiros não é limitada por posse nem por relação de senioridade.

### Evidência
`src/pages/api/users/[id].ts:62-65`
```ts
function allowedRoles(body: PutBody): Role[] {
  const adminOnly = ADMIN_ONLY_FIELDS.some(f => body[f] !== undefined);
  return adminOnly ? ADMINS : USER_MANAGERS; // manager edita qualquer usuário
}
```

### Impacto
Escrita cruzada sobre contas de outros usuários; degradação de integridade da equipe e base para manipulação de identidade/e-mail.

### Sugestão de correção
- Restringir a edição de um usuário a si mesmo ou a papéis estritamente inferiores;
- Exigir `admin` para editar `role`/`password` e para exclusão;
- Adicionar checagem de posse/senioridade no handler.

### Critérios de aceite
- [ ] Manager não consegue editar outro manager;
- [ ] Não-admin não consegue mudar `role` de ninguém;
- [ ] Testes cobrem os pares manager→manager e agent→qualquer um (esperado 403).""",),
    ("ISSUE 3",
     "[Segurança] IDOR residual no CRM: tabelas de apoio sem posse + mensagem criada em conversa alheia",
     "security, alta",
     """### Problema
Três recortes relacionados deixam escrita não autorizada no CRM:
1. `quick_replies`, `tags`, `appointment_types`, `pipelines` e `pipeline_stages` não estão em `OWNERSHIP` — qualquer `agent` edita/deleta recursos compartilhados.
2. Na criação de `messages`, o `conversationId` vem do body e não é validado contra a posse da conversa.
3. `conversation_notes`: `assignedUserId` é mutável no `PUT`, permitindo reatribuir a nota entre usuários.

### Evidência
- `src/pages/api/crm/quick-replies/[id].ts` (usa `createItemRoutes` sem posse)
- `src/server/routeFactory.ts:248-255` (criação deriva dono só quando há coluna direta; `messages` é `via` e não valida na criação)
- `src/server/tables.ts:216-224` (CONVERSATION_NOTES_SHAPE)

### Impacto
Manipulação do funil (etiquetas/estágios/respostas), injeção de mensagem em conversa alheia e reatribuição indevida de notas.

### Sugestão de correção
- Incluir as tabelas de apoio em `OWNERSHIP` (ou torná-las somente-admin);
- Validar `conversationId` contra a posse na criação de mensagem;
- Tornar `assignedUserId` de `conversation_notes` imutável.

### Critérios de aceite
- [ ] Agent não dono não edita tags/respostas/estágios de outro usuário;
- [ ] POST de mensagem em conversa alheia retorna 403;
- [ ] PUT em note não altera `assignedUserId`.""",),
    ("ISSUE 4",
     "[Segurança] Listagens expõem a base inteira sem filtro por inquilino/dono",
     "security, alta",
     """### Problema
Todos os endpoints de listagem devolvem a base completa, filtrando apenas pelo papel mínimo (viewer). Não há recorte por `assignedUserId`/tenant. O recorte por posse existe só no CRUD individual (CRM) e no SSE para conversas/mensagens.

### Por que é explorável
O app é single-tenant por design, mas a ausência de qualquer isolamento de leitura significa que, se a premissa de "um inquilino" mudar (ou houver vazamento de credencial de um agente), todos os dados de todos os usuários ficam expostos.

### Evidência
`src/server/routeFactory.ts:224-234` (`listHandler` devolve `listEntities` sem filtro) aplicado em `src/pages/api/**/index.ts`.

### Impacto
Leitura em massa de contatos, conversas, mensagens e pedidos por qualquer sessão válida.

### Sugestão de correção
- Documentar explicitamente o modelo single-tenant na arquitetura; e/ou
- Adicionar filtro opcional por ownership/tenant nos listers (ao menos para dados pessoais de terceiros) e estender o escopo do SSE a todos os recursos expostos.

### Critérios de aceite
- [ ] Decisão de escopo de leitura registrada (single-tenant vs por dono);
- [ ] Se por dono: listagens e SSE filtrados por ownership com teste de regressão.""",),
    ("ISSUE 5",
     "[Segurança] Segredo-valor conhecido (placeholder) no source e config insegura do HMAC do webhook",
     "security, alta",
     """### Problema
O placeholder `dev_plaintext_change_me` está hardcodado em `src/domain/whatsapp.ts` e `src/server/wahaWebhook.ts`. A leitura trata o valor como "não configurado" (fail-closed), mas o segredo-valor conhecido vive commitado no código. O `.dev.vars.example` ainda documenta `WAHA_WEBHOOK_ALLOW_UNSIGNED='true'` como escape, permitindo operar sem assinatura.

### Por que é explorável
Se um ambiente não sobrescrever a chave e a validação de startup for relaxada, o default vira segredo real e previsível.

### Evidência
`src/server/wahaWebhook.ts:41-54` (`PLACEHOLDER_SECRETS`), `src/domain/whatsapp.ts` (`WAHA_DEV_PLACEHOLDER_KEY`), `.dev.vars.example:31-45`.

### Impacto
Chave previsível de API/HMAC em um cenário de configuração incompleta.

### Sugestão de correção
- Carregar o valor default apenas de env, removendo a constante do source;
- Validar no boot que `WAHA_API_KEY`/`WAHA_HMAC_SECRET` diferem dos defaults conhecidos e falham fechado;
- Restringir `WAHA_WEBHOOK_ALLOW_UNSIGNED` a ambientes de dev (nunca em produção).

### Critérios de aceite
- [ ] Nenhum literal de segredo conhecido no source;
- [ ] Boot falha (503/abort) quando a chave é default/ausente;
- [ ] Teste prova que `allowUnsigned` não é aceito em produção.""",),
    ("ISSUE 6",
     "[Segurança] Gaps de regra de negócio na escrita: pedido para cliente arbitrário + conversa em canal inválido",
     "security, média",
     """### Problema
- O compositor de pedido da inbox associa o cliente do contato em aberto, mas `POST /api/orders` aceita qualquer `customerId` do body.
- A UI só abre conversa para contatos com telefone, porém `POST /api/crm/conversations` valida apenas o papel.

### Evidência
`src/ui/views/crm/CrmInboxView.ts:492-506`; `src/pages/api/orders/index.ts`; `src/ui/views/crm/CrmContatosView.ts:205-211`.

### Impacto
Escrita associada a recurso fora do contexto (pedido para cliente alheio; conversa sem canal viável).

### Sugestão de correção
- Validar o `customerId` contra o contato da conversa (ou exigir posse do cliente) no handler do pedido;
- Validar canal/telefone na criação de conversa.

### Critérios de aceite
- [ ] Pedido com `customerId` fora da conversa aberta → 403/422;
- [ ] Conversa sem canal/telefone válido → 422.""",),
    ("ISSUE 7",
     "[Segurança] Defesa em profundidade contra XSS ausente (dependência única de escapeText)",
     "security, média",
     """### Problema
Todo o render usa `innerHTML` com template string; a proteção depende exclusivamente de `escapeText`/`escapeAtrib` em cada dado dinâmico. Não há CSP nem sanitização em segunda etapa, e o alias depreciado `escapeHtml` continua exportado.

### Evidência
`src/domain/format.ts:33-47`; `src/ui/views/crm/CrmInboxView.ts:127`; dezenas de usos de `innerHTML`.

### Impacto
Um único ponto de escape esquecido vira XSS de armazenamento; não há barreira de contenção.

### Sugestão de correção
- Adicionar CSP (csp header / meta) para contenção de XSS;
- Considerar uma etapa de sanitização explícita em conteúdo longo (ex.: notas/mensagens);
- Remover o alias `escapeHtml` e manter apenas `escapeText`/`escapeAtrib`.

### Critérios de aceite
- [ ] CSP presente e testado;
- [ ] `escapeHtml` removido;
- [ ] Teste de regressão de XSS por vetor (nome, mensagem, nota, tag).""",),
]

# ---------------------------------------------------------------------------
# Gráficos
# ---------------------------------------------------------------------------
def _setup_font(path):
    font_manager.fontManager.addfont(path)
    name = font_manager.FontProperties(fname=path).get_name()
    plt.rcParams["font.family"] = name
    return path

def build_charts():
    path = register_dejavu()
    out_sev = os.path.join(HERE, "chart_severidade.png")
    out_cat = os.path.join(HERE, "chart_categoria.png")

    # Rosca por severidade
    labels = SEV_ORDER
    sizes = [SEV_COUNTS[l] for l in labels]
    clrs = [SEV_COLOR[l] for l in labels]
    fig, ax = plt.subplots(figsize=(5.5, 4.2), dpi=200)
    wedges, _texts = ax.pie(
        sizes, colors=clrs, startangle=90, counterclock=False,
        wedgeprops=dict(width=0.42, edgecolor="white", linewidth=1.5),
    )
    ax.text(0, 0, str(TOTAL), ha="center", va="center",
            fontsize=30, fontweight="bold", color=C_PRIMARIA)
    ax.text(0, -0.22, "achados", ha="center", va="center", fontsize=11,
            color="#555")
    ax.set_title("Achados por severidade", fontsize=14, fontweight="bold",
                 color=C_PRIMARIA, pad=14)
    leg_labels = [f"{l}: {SEV_COUNTS[l]}" for l in labels]
    ax.legend(wedges, leg_labels, loc="center left", bbox_to_anchor=(1.02, 0.5),
              fontsize=10, frameon=False)
    fig.tight_layout()
    fig.savefig(out_sev, bbox_inches="tight")
    plt.close(fig)

    # Barras por categoria
    cats = ["Banco sem tranca", "Permissão no navegador", "IDOR",
            "Chaves expostas", "XSS"]
    vals = [CAT_COUNTS.get(c, 0) for c in cats]
    cat_color = ["#0E7490", "#4F46E5", "#BE185D", "#B45309", "#15803D"]
    fig2, ax2 = plt.subplots(figsize=(6.4, 4.0), dpi=200)
    bars = ax2.barh(cats, vals, color=cat_color, edgecolor="white", height=0.62)
    ax2.invert_yaxis()
    for b, v in zip(bars, vals):
        ax2.text(v + 0.05, b.get_y() + b.get_height() / 2, str(v),
                 va="center", ha="left", fontsize=12, fontweight="bold",
                 color=C_PRIMARIA)
    ax2.set_title("Achados por categoria", fontsize=14, fontweight="bold",
                  color=C_PRIMARIA, pad=14)
    ax2.set_xlim(0, max(vals) + 1)
    ax2.set_xticks(range(0, max(vals) + 2))
    ax2.spines[["top", "right"]].set_visible(False)
    ax2.grid(axis="x", linestyle=":", alpha=0.5)
    fig2.tight_layout()
    fig2.savefig(out_cat, bbox_inches="tight")
    plt.close(fig2)
    return out_sev, out_cat

def register_dejavu():
    for root, _dirs, files in os.walk(VENV_MPL):
        if "DejaVuSans.ttf" in files:
            return os.path.join(root, "DejaVuSans.ttf")
    raise SystemExit("DejaVuSans.ttf não encontrado")

# ---------------------------------------------------------------------------
# Estilos
# ---------------------------------------------------------------------------
def styles():
    s = {}
    s["body"] = ParagraphStyle("body", fontName="DejaVu", fontSize=10, leading=13,
                              textColor=colors.HexColor("#1f2937"))
    s["h1"] = ParagraphStyle("h1", fontName="DejaVu-Bold",
                            fontSize=20, leading=24, textColor=colors.HexColor(C_PRIMARIA),
                            spaceAfter=8, spaceBefore=4)
    s["h2"] = ParagraphStyle("h2", fontName="DejaVu-Bold",
                            fontSize=14, leading=17, textColor=colors.HexColor(C_PRIMARIA),
                            spaceBefore=10, spaceAfter=5)
    s["h3"] = ParagraphStyle("h3", fontName="DejaVu-Bold",
                            fontSize=11.5, leading=14, textColor=colors.HexColor("#111827"),
                            spaceBefore=8, spaceAfter=4)
    s["small"] = ParagraphStyle("small", fontName="DejaVu",
                                fontSize=8.5, leading=10.5, textColor=colors.HexColor("#4b5563"))
    s["mono"] = ParagraphStyle("mono", fontName="DejaVuMono",
                               fontSize=8, leading=10.5, textColor=colors.HexColor("#111827"),
                               backColor=colors.HexColor("#f3f4f6"), borderPad=4,
                               leftIndent=6, rightIndent=6, spaceBefore=2, spaceAfter=4)
    s["chip"] = ParagraphStyle("chip", fontName="DejaVu-Bold",
                               fontSize=8, leading=10, alignment=TA_CENTER)
    s["title_big"] = ParagraphStyle("title_big", fontName="DejaVu-Bold",
                                    fontSize=30, leading=36, textColor=colors.white,
                                    alignment=TA_CENTER)
    s["subtitle"] = ParagraphStyle("subtitle", fontName="DejaVu",
                                   fontSize=13, leading=17, textColor=colors.HexColor("#d1d5db"),
                                   alignment=TA_CENTER)
    return s

def severity_chip(sev):
    color = SEV_COLOR.get(sev, C_INFO)
    inner = Paragraph(f"<font color='white'><b>{sev}</b></font>", styles()["chip"])
    t = Table([[inner]], colWidths=[2.4 * cm], rowHeights=[0.55 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(color)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    return t

def esc(t):
    return (t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))

# ---------------------------------------------------------------------------
# Cabeçalho / rodapé
# ---------------------------------------------------------------------------
REPORT_TITLE = "Relatório de Auditoria de Segurança — Ateliê ERP + DeskcommCRM"

def header_footer(canvas, doc):
    canvas.saveState()
    # header
    canvas.setStrokeColor(colors.HexColor(C_PRIMARIA))
    canvas.setLineWidth(0.8)
    canvas.line(doc.leftMargin, A4[1] - 1.4 * cm, A4[0] - doc.rightMargin, A4[1] - 1.4 * cm)
    canvas.setFont("DejaVu", 8)
    canvas.setFillColor(colors.HexColor("#374151"))
    canvas.drawString(doc.leftMargin, A4[1] - 1.25 * cm,
                      "Relatório de Auditoria de Segurança — Ateliê ERP + DeskcommCRM")
    canvas.drawRightString(A4[0] - doc.rightMargin, A4[1] - 1.25 * cm,
                           "Auditoria de 5 categorias · pt-BR")
    # footer
    canvas.line(doc.leftMargin, 1.4 * cm, A4[0] - doc.rightMargin, 1.4 * cm)
    canvas.drawCentredString(A4[0] / 2, 1.0 * cm,
                             f"Página {doc.page}")
    canvas.drawRightString(A4[0] - doc.rightMargin, 1.0 * cm,
                           datetime.date.today().strftime("%d/%m/%Y"))
    canvas.restoreState()

# ---------------------------------------------------------------------------
# Capa
# ---------------------------------------------------------------------------
def cover(st):
    el = []
    el.append(Spacer(1, 1.4 * cm))
    # faixa de título (fundo escuro via tabela)
    title_tbl = Table([
        [Paragraph("<font color='white'>Relatório de Auditoria</font><br/>"
                   "<font color='#FBBF24'><b>de Segurança</b></font>",
                   ParagraphStyle("c1", fontName="DejaVu-Bold", fontSize=28,
                                  leading=33, alignment=TA_CENTER, textColor=colors.white))],
        [Paragraph("<font color='#d1d5db'>Ateliê ERP + DeskcommCRM</font>",
                   ParagraphStyle("c2", fontName="DejaVu", fontSize=14,
                                  leading=17, alignment=TA_CENTER))],
        [Paragraph("<font color='#9ca3af'>Cloudflare Workers · Astro 7 · D1 · TypeScript</font>",
                   ParagraphStyle("c3", fontName="DejaVu", fontSize=10,
                                  leading=13, alignment=TA_CENTER))],
    ], colWidths=[16.5 * cm])
    title_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(C_PRIMARIA)),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("LINEBELOW", (0, 1), (-1, 1), 0, colors.white),
    ]))
    el.append(title_tbl)
    el.append(Spacer(1, 0.6 * cm))
    info = [
        ("Data da auditoria", datetime.date.today().strftime("%d/%m/%Y")),
        ("Escopo", "src/** (rotas de API, camada de auth/authz, front framework-free, migrations, configs de deploy)"),
        ("Metodologia", "Análise estática arquivo a arquivo + rastreamento de todos os handlers de rota"),
        ("Achados totais", f"{TOTAL} (critica={SEV_COUNTS['Crítica']}, alta={SEV_COUNTS['Alta']}, media={SEV_COUNTS['Média']}, baixa={SEV_COUNTS['Baixa']}, informativa={SEV_COUNTS['Informativa']})"),
    ]
    rows = [[Paragraph(f"<b>{esc(k)}</b>", st["body"]), Paragraph(esc(v), st["body"])] for k, v in info]
    it = Table(rows, colWidths=[4.5 * cm, 12.0 * cm])
    it.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eef2f7")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    el.append(it)
    el.append(Spacer(1, 0.5 * cm))
    el.append(Paragraph(
        "<b>Nota metodológica — mapeamento das 5 categorias para a stack detectada</b>",
        st["h3"]))
    mapping = [
        ("1. Banco sem tranca", "Sem RLS (não é Supabase). Verificou-se o isolamento de inquilino/dono nas listagens/agregações do D1: matriz RBAC em authz.ts + columns assignedUserId/assigneeUserId + recorte do SSE. Apontou onde falta recorte por dono."),
        ("2. Permissão no navegador", "Front framework-free: cruza cada gate de papel da UI (isAdmin/canEdit/role) com o endpoint correspondente e confere se o backend valida o privilégio em toda rota sensível (requireRole/requireRank)."),
        ("3. IDOR", "Percorreu 100% dos handlers PUT/DELETE por ID (fábrica createItemRoutes + rotas dedicadas) e validou a checagem de posse (OWNERSHIP/checkOwnership) em cada um."),
        ("4. Chaves expostas", "Buscou segredos hardcode, defaults públicos e ausência de validação de startup em src/, configs, docker-compose/CI; conferiu git (dev.vars gitignored) e o bundle do front por chaves embutidas."),
        ("5. Inputs sem tratamento (XSS)", "Localizou innerHTML/dangerouslySetInnerHTML/v-html/eval e a aplicação de escapeText/escapeAtrib em cada sink; checou a presença e o uso de sanitização no front e no back."),
    ]
    mrows = [[Paragraph(f"<b>{esc(a)}</b>", st["small"]), Paragraph(esc(b), st["small"])] for a, b in mapping]
    mt = Table(mrows, colWidths=[4.5 * cm, 12.0 * cm])
    mt.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eef2f7")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    el.append(mt)
    el.append(PageBreak())
    return el

# ---------------------------------------------------------------------------
# Resumo executivo
# ---------------------------------------------------------------------------
def executive(st, sev_img, cat_img):
    el = []
    el.append(Paragraph("1. Resumo executivo", st["h1"]))
    el.append(Paragraph(
        f"A auditoria identificou <b>{TOTAL} achados</b> distribuídos nas 5 categorias. "
        f"São <b>{SEV_COUNTS['Crítica']} críticos</b>, {SEV_COUNTS['Alta']} altos, "
        f"{SEV_COUNTS['Média']} médios, {SEV_COUNTS['Baixa']} baixos e "
        f"{SEV_COUNTS['Informativa']} informativos. Os riscos centrais concentram-se no "
        "IDOR das tabelas do ERP (sem verificação de posse) e na ausência de isolamento de "
        "leitura (single-tenant sem recorte por dono). A camada de autenticação, RBAC, "
        "auditoria e proteção de origem é sólida.", st["body"]))
    el.append(Spacer(1, 0.4 * cm))

    # cartões de severidade
    cards = []
    for sev in SEV_ORDER:
        c = colors.HexColor(SEV_COLOR[sev])
        p = Paragraph(f"<font color='white'><b>{SEV_COUNTS[sev]}</b></font>", st["chip"])
        card = Table([
            [p],
            [Paragraph(f"<font color='white'>{sev}</font>",
                       ParagraphStyle("cs", fontName="DejaVu", fontSize=8,
                                      leading=10, alignment=TA_CENTER, textColor=colors.white))]
        ], colWidths=[3.0 * cm], rowHeights=[1.1 * cm, 0.6 * cm])
        card.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), c),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ]))
        cards.append(card)
    ctab = Table([cards], colWidths=[3.4 * cm] * 5)
    ctab.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    el.append(ctab)
    el.append(Spacer(1, 0.5 * cm))

    imgs = Table([[Image(sev_img, width=7.8 * cm, height=6.0 * cm),
                   Image(cat_img, width=8.2 * cm, height=5.1 * cm)]],
                 colWidths=[8.4 * cm, 8.4 * cm])
    imgs.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"),
                              ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    el.append(imgs)
    el.append(PageBreak())
    return el

# ---------------------------------------------------------------------------
# Pontos fortes / fracos
# ---------------------------------------------------------------------------
def strengths_weak(st):
    el = []
    el.append(Paragraph("2. Pontos fortes e fracos", st["h1"]))
    el.append(Paragraph("2.1 Pontos fortes (verificados no código)", st["h2"]))
    rows = []
    for i, (k, v) in enumerate(STRENGTHS, 1):
        chip = Table([[Paragraph(f"<font color='white'>ok</font>", st["chip"])]],
                     colWidths=[0.9 * cm], rowHeights=[0.45 * cm])
        chip.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(C_FORTE)),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ]))
        rows.append([chip, Paragraph(f"<b>{esc(k)}</b>", st["body"]),
                     Paragraph(esc(v), st["small"])])
    t = Table(rows, colWidths=[1.1 * cm, 4.6 * cm, 10.8 * cm], repeatRows=0)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor("#e5e7eb")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    el.append(t)
    el.append(Spacer(1, 0.3 * cm))
    el.append(Paragraph("2.2 Pontos fracos (riscos centrais)", st["h2"]))
    weak = [
        ("IDOR nas tabelas do ERP", "Escrita/deleção de qualquer registro do ERP sem verificação de posse (F6)."),
        ("Gestão de usuários aberta", "Manager edita qualquer usuário; escrita cruzada sobre contas (F7)."),
        ("Sem isolamento de leitura", "Listagens devolvem a base inteira por papel, sem recorte por dono (F1)."),
        ("Segredo-valor conhecido no source", "Placeholder de WAHA commitado e config HMAC que pode operar sem assinatura (F11, F12)."),
    ]
    wrows = []
    for k, v in weak:
        chip = Table([[Paragraph(f"<font color='white'>!</font>", st["chip"])]],
                     colWidths=[0.9 * cm], rowHeights=[0.45 * cm])
        chip.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(C_CRITICA)),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ]))
        wrows.append([chip, Paragraph(f"<b>{esc(k)}</b>", st["body"]),
                      Paragraph(esc(v), st["small"])])
    wt = Table(wrows, colWidths=[1.1 * cm, 5.6 * cm, 9.8 * cm])
    wt.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor("#e5e7eb")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    el.append(wt)
    el.append(PageBreak())
    return el

# ---------------------------------------------------------------------------
# Tabela de achados
# ---------------------------------------------------------------------------
def findings_table(st):
    el = []
    el.append(Paragraph("3. Achados detalhados por categoria", st["h1"]))
    st["body"]
    data = [["Severidade", "Arquivo : linha", "Descrição"]]
    data_style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(C_PRIMARIA)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "DejaVu-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for fid, sev, cat, fl, desc, _expl in FINDINGS:
        chip = severity_chip(sev)
        data.append([
            chip,
            Paragraph(f"<font name='DejaVuMono' size='7.5'>{esc(fl)}</font>", st["body"]),
            Paragraph(f"<b>{fid} · {esc(cat)}</b><br/>{esc(desc)}", st["body"]),
        ])
    t = Table(data, colWidths=[2.0 * cm, 4.8 * cm, 10.0 * cm], repeatRows=1)
    t.setStyle(TableStyle(data_style + [
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    el.append(t)
    el.append(Spacer(1, 0.4 * cm))
    el.append(Paragraph(
        "Arquivo:linha aponta a origem primária de cada achado; o corpo do achado completo "
        "(evidência, impacto e correção) está na seção 5 (Issues para o GitHub).",
        st["small"]))
    el.append(PageBreak())
    return el

# ---------------------------------------------------------------------------
# Recomendações
# ---------------------------------------------------------------------------
def recommendations(st):
    el = []
    el.append(Paragraph("4. Recomendações priorizadas", st["h1"]))
    data = [["Prioridade", "Achados", "Ação", "Resultado esperado"]]
    for prio, refs, action, res in RECOMMENDATIONS:
        color = {"P1": C_CRITICA, "P2": C_MEDIA, "P3": C_BAIXA}.get(prio, C_INFO)
        pchip = Table([[Paragraph(f"<font color='white'><b>{prio}</b></font>", st["chip"])]],
                      colWidths=[1.3 * cm], rowHeights=[0.5 * cm])
        pchip.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(color)),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ]))
        data.append([pchip,
                     Paragraph(esc(refs), ParagraphStyle("rf", fontName="DejaVu-Bold",
                                                        fontSize=8, leading=10)),
                     Paragraph(esc(action), st["body"]),
                     Paragraph(esc(res), st["body"])])
    t = Table(data, colWidths=[1.5 * cm, 1.9 * cm, 8.3 * cm, 5.0 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(C_PRIMARIA)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "DejaVu-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    el.append(t)
    el.append(PageBreak())
    return el

# ---------------------------------------------------------------------------
# Issues para GitHub
# ---------------------------------------------------------------------------
def github_issues(st):
    el = []
    el.append(Paragraph("5. Issues para o GitHub", st["h1"]))
    el.append(Paragraph(
        "Para cada achado acionável, o texto completo de uma issue em Markdown, pronto para "
        "copiar/colar, delimitado por <font name='DejaVuMono'>--- ISSUE n ---</font> e "
        "<font name='DejaVuMono'>--- FIM ISSUE n ---</font>.", st["body"]))
    el.append(Spacer(1, 0.3 * cm))
    for tag, title, labels, body in ISSUES:
        el.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e5e7eb"),
                             spaceBefore=4, spaceAfter=4))
        # cabeçalho da issue
        head = Table([[
            Paragraph(f"<font name='DejaVuMono' color='{C_PRIMARIA}'><b>--- {tag} ---</b></font>", st["body"]),
            Paragraph(f"<font name='DejaVuMono' color='{C_INFO}'>{esc(labels)}</font>", st["body"]),
        ]], colWidths=[8.2 * cm, 8.2 * cm])
        head.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f3f4f6")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        el.append(head)
        el.append(Spacer(1, 0.15 * cm))
        # corpo como bloco monoespaçado sombreado (pronto para copiar/colar)
        body_text = esc(body.strip())
        body_para = ParagraphStyle("issuemono", fontName="DejaVuMono", fontSize=7.6,
                                   leading=10.0, textColor=colors.HexColor("#111827"))
        block = Table(
            [[Paragraph(body_text, body_para)]],
            colWidths=[16.4 * cm])
        block.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#cbd5e1")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]))
        el.append(block)
        el.append(Spacer(1, 0.12 * cm))
        el.append(Paragraph(
            f"<font name='DejaVuMono' color='{C_PRIMARIA}'><b>--- FIM {tag} ---</b></font>",
            st["body"]))
        el.append(Spacer(1, 0.2 * cm))
    return el

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main():
    register_fonts()
    sev_img, cat_img = build_charts()
    st = styles()
    out = os.path.join(HERE, "relatorio-auditoria-seguranca.pdf")

    doc = BaseDocTemplate(
        out, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
        title="Relatório de Auditoria de Segurança",
        author="Auditoria de Segurança",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin,
                  doc.width, doc.height, id="main")
    doc.addPageTemplates([PageTemplate(id="std", frames=[frame],
                                       onPage=header_footer)])

    story = []
    story += cover(st)
    story += executive(st, sev_img, cat_img)
    story += strengths_weak(st)
    story += findings_table(st)
    story += recommendations(st)
    story += github_issues(st)

    doc.build(story)
    print("OK:", out)

if __name__ == "__main__":
    main()
