# -*- coding: utf-8 -*-
"""
Base de dados da auditoria de seguranca do atelie-erp.

REAUDITORIA (2a rodada): reflete o estado do codigo DEPOIS da remediacao.
Cada achado e' um dict verificado no codigo real (arquivo:linha + trecho).
NAO edite este arquivo para "corrigir" severidade sem reverificar o codigo.

INVARIANTE DESTA RODADA (achado C4-01): NENHUM valor de segredo real pode
aparecer neste arquivo. Ele e' texto versionado e o teste
`tests/spec-v2/c-settings-secrets.test.ts` (AC-335) falha se um segredo real
for encontrado em qualquer arquivo rastreado do git. Segredos sao citados
sempre por arquivo:linha, com o valor redigido.
"""

PROJETO = "atelie-erp"
DATA_AUDITORIA = "02 de outubro de 2026"
RODADA = "Reauditoria pos-remediacao (2a rodada)"

# ---------------------------------------------------------------- severidades
SEV = {
    "critica": ("Crítica", "#B91C1C"),
    "alta": ("Alta", "#EA580C"),
    "media": ("Média", "#D97706"),
    "baixa": ("Baixa", "#2563EB"),
    "informativa": ("Informativa", "#059669"),
}

CATEGORIAS = [
    ("cat1", "1. Banco sem trança (isolamento de inquilino/dono)"),
    ("cat2", "2. Permissão definida no navegador"),
    ("cat3", "3. IDOR"),
    ("cat4", "4. Chaves expostas (hardcode)"),
    ("cat5", "5. Inputs sem tratamento (XSS)"),
]

# -------------------------------------------------------------------- achados
ACHADOS = [
    # ------------------------------------------------------------- CATEGORIA 1
    dict(
        id="C1-01", cat="cat1", sev="informativa",
        titulo="Verificação positiva: o recorte LGPD filtra mensagens, clientes e pedidos, e o SSE é escopado por conversa",
        arquivos=[
            ("src/domain/lgpdScope.ts", "69-92",
             "export function scopeForUser(user: User, all: LgpdData): LgpdScope {\n"
             "\tconst contacts = all.contacts.filter((c) => c.assignedUserId === user.id);\n"
             "\tconst contactIds = new Set(contacts.map((c) => c.id));\n"
             "\tconst conversations = all.conversations.filter((c) =>\n"
             "\t\tcontactIds.has(c.contactId)\n"
             "\t);\n"
             "\tconst conversationIds = new Set(conversations.map((c) => c.id));\n"
             "\tconst customers = customersForContacts(contacts, all.customers);\n"
             "\tconst customerIds = new Set(customers.map((c) => c.id));\n"
             "\treturn {\n"
             "\t\tcontacts,\n"
             "\t\tconversations,\n"
             "\t\tmessages: all.messages.filter((m) =>\n"
             "\t\t\tconversationIds.has(m.conversationId)\n"
             "\t\t),\n"
             "\t\tdeals: all.deals.filter((d) => d.assignedUserId === user.id),\n"
             "\t\ttasks: all.tasks.filter((t) => t.assigneeUserId === user.id),\n"
             "\t\tcustomers,\n"
             "\t\torders: all.orders.filter((o) => customerIds.has(o.customerId)),\n"
             "\t\tconsents: all.consents.filter(\n"
             "\t\t\t(c) => c.subjectId === user.id && c.subjectType === 'user'\n"
             "\t\t),\n"
             "\t};\n"
             "}"),
            ("src/pages/api/crm/events.ts", "27-38",
             "async function visibleConversationIds(\n"
             "\tdb: Database, user: User\n"
             "): Promise<string[] | null> {\n"
             "\tif (SEES_ALL.includes(user.role)) return null;\n"
             "\tconst assigned = await db\n"
             "\t\t.prepare(\n"
             "\t\t\t`SELECT c.id FROM conversations c\n"
             "\t\t\t JOIN contacts ct ON ct.id = c.contactId\n"
             "\t\t\t WHERE ct.assignedUserId = ? OR c.assignedUserId = ?`\n"
             "\t\t)\n"
             "\t\t.bind(user.id, user.id)\n"
             "\t\t.all<{ id: string }>();\n"
             "\treturn (assigned.results ?? []).map((row) => row.id);\n"
             "}"),
            ("src/pages/api/crm/events.ts", "186",
             "const since = url.searchParams.get('since');"),
            ("src/server/crud.ts", "16",
             "const stmt = db.prepare(`SELECT * FROM ${table}`);"),
            ("README.md", "Modelo de acesso",
             "**As listagens devolvem a base inteira.** Não existe isolamento por linha:\n"
             "quem tem sessão válida vê todos os contatos, conversas, pedidos, clientes e\n"
             "tarefas do D1. Não há filtro por dono em nenhuma listagem."),
        ],
        porque=(
            "O vazamento de PII da rodada anterior está fechado. `scopeForUser` deriva o "
            "recorte em cascata: contatos por atribuição → conversas por contato → "
            "mensagens por conversa, e clientes por identidade de contato → pedidos por "
            "cliente. `GET /api/me/data`, `/api/me/export` e `/api/me/erase` consomem esse "
            "recorte, então um `viewer` sem atribuição não recebe mais linhas de "
            "terceiros. O SSE segue a mesma disciplina: `visibleConversationIds` devolve "
            "`null` (tudo) só para manager/admin e, nos demais papéis, o conjunto de "
            "conversas atribuídas — com o filtro aplicado na consulta, não depois. O "
            "stream também deixou de transportar o token por query string: o único "
            "parâmetro lido na URL é `since`.\n\n"
            "A listagem global (`SELECT *` sem filtro) permanece, e isso é DECISÃO DE "
            "PROJETO documentada no README, não descuido: o app é single-tenant e o "
            "controle é por papel. Fica registrado como invariante, não como garantia de "
            "isolamento."
        ),
        cond=(
            "Qualquer sessão válida lê a base inteira nas listagens — aceito por desenho "
            "documentado. Já o recorte LGPD e o stream SSE só vazam se alguém remover o "
            "filtro do módulo ou da consulta."
        ),
        correcao=(
            "Manter. Registrar como teste de invariante: (a) `scopeForUser` nunca devolve "
            "linha sem atribuição — testável com um usuário sem atribuição; (b) uma rota "
            "nova não pode assumir que `listEntities` é restrita; (c) se um dia existir "
            "multi-tenant, `listEntities` é o ponto de entrada obrigatório do filtro."
        ),
    ),
    dict(
        id="C1-02", cat="cat1", sev="informativa",
        titulo="Verificação positiva: sessão em cookie HttpOnly; nenhum token legível por script",
        arquivos=[
            ("src/server/auth.ts", "70",
             "function cookieAttributes(maxAge: number): string {\n"
             "\treturn `Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;\n"
             "}"),
            ("src/repositories/ApiAuthRepository.ts", "6-10",
             "// Thin client for the /api/auth/* + /api/users endpoints. The session\n"
             "// token lives in an HttpOnly cookie set by the server, so no script on this\n"
             "// origin can read it — an HTML injection cannot escalate into session\n"
             "// theft. A `currentUser` cache plus a small listener set lets views\n"
             "// re-render when the session changes; the cache holds only non-sensitive\n"
             "// profile fields."),
        ],
        porque=(
            "O modelo de ameaça da rodada anterior era: script injetado no origin lê o "
            "token e vira sessão válida. Isso não é mais possível — o token vive em cookie "
            "`HttpOnly; Secure; SameSite=Strict`, e o cliente guarda apenas o perfil "
            "não-sensível do usuário. Como consequência, qualquer regressão de escaping na "
            "categoria 5 deixa de ser um elevador direto para sequestro de sessão: o pior "
            "caso passa a ser execução no contexto da origem."
        ),
        cond="Não explorável isoladamente; é a garantia que limita o impacto de C5-01.",
        correcao="Nenhuma. Preservar e cobrir com teste que falhe se o cookie perder HttpOnly.",
    ),

    # ------------------------------------------------------------- CATEGORIA 2
    dict(
        id="C2-01", cat="cat2", sev="informativa",
        titulo="Verificação positiva: POST /api/users deriva os papéis permitidos do corpo (manager não fabrica admin)",
        arquivos=[
            ("src/pages/api/users/index.ts", "31-33",
             "export const POST: APIRoute = async (context) => {\n"
             "\tconst body = await readUserBody(context.request);\n"
             "\tconst denied = await requireRole(context, allowedRoles(body));\n"
             "\tif (denied) return denied;"),
            ("src/pages/api/users/index.ts", "51-58",
             "// Um `manager` cria e senha os demais usuarios, mas nao pode fabricar outro\n"
             "// `admin` — escalada de privilegio. O campo `password` nao entra na conta:\n"
             "// todo POST precisa de uma senha, e trata-lo como restrito barrava o proprio\n"
             "// `manager` que a regra existe para permitir.\n"
             "function allowedRoles(body: UserBody): Role[] {\n"
             "\treturn body.role === 'admin' ? ADMINS : USER_MANAGERS;\n"
             "}"),
            ("src/pages/api/users/[id].ts", "62-65",
             "function allowedRoles(body: PutBody): Role[] {\n"
             "\tconst adminOnly = ADMIN_ONLY_FIELDS.some(f => body[f] !== undefined);\n"
             "\treturn adminOnly ? ADMINS : USER_MANAGERS;\n"
             "}"),
        ],
        porque=(
            "A escalada de privilégio da rodada anterior está fechada. O gate vem ANTES de "
            "qualquer validação de conteúdo, e o conjunto de papéis aceitos é derivado do "
            "próprio corpo: pedir `role: 'admin'` exige `ADMINS`. Os dois verbos ficam "
            "paritários — POST e PUT chamam funções de AllowedRoles equivalentes, então não "
            "existe mais a assimetria em que a rota brother validava papel corretamente e o "
            "outro não."
        ),
        cond="Sessão `manager` + POST com `role:'admin'` → 403. Ilegível a `viewer`/`agent`.",
        correcao="Nenhuma. Teste existente já cobre manager→admin nos dois verbos.",
    ),
    dict(
        id="C2-02", cat="cat2", sev="informativa",
        titulo="Verificação positiva: matriz de papéis por operação aplicada na fábrica de rotas (ROLE_RANK deixou de ser código morto)",
        arquivos=[
            ("src/server/routeFactory.ts", "19-34",
             "// Matriz por operacao, declarada como PAPEIS MINIMOS: leitura = viewer+,\n"
             "// escrita = agent+, exclusao = manager+. Um `admin` passa em todas sem cada\n"
             "// rota repetir a lista, e `ROLE_RANK` deixa de ser codigo morto.\n"
             "type RoleConfig = {\n"
             "\tlist?: Role;\n"
             "\tcreate?: Role;\n"
             "\tupdate?: Role;\n"
             "\tdelete?: Role;\n"
             "};\n"
             "\n"
             "const DEFAULT_ROLES: Required<RoleConfig> = {\n"
             "\tlist: 'viewer',\n"
             "\tcreate: 'agent',\n"
             "\tupdate: 'agent',\n"
             "\tdelete: 'manager',\n"
             "};"),
            ("src/server/routeFactory.ts", "56-60",
             "async function checkRole(\n"
             "\tcontext: APIContext, minimum: Role\n"
             "): Promise<Response | null> {\n"
             "\treturn requireRank(context, minimum);\n"
             "}"),
            ("src/server/authz.ts", "25-30",
             "export function hasRank(\n"
             "\tuser: User | null,\n"
             "\tminimum: Role\n"
             "): boolean {\n"
             "\treturn user !== null && ROLE_RANK[user.role] >= ROLE_RANK[minimum];\n"
             "}"),
            ("src/server/authz.ts", "43-50",
             "export function requireRank(\n"
             "\tcontext: APIContext,\n"
             "\tminimum: Role\n"
             "): Promise<Response | null> {\n"
             "\treturn requireRole(context, ALL_ROLES.filter(\n"
             "\t\t(role) => ROLE_RANK[role] >= ROLE_RANK[minimum]\n"
             "\t));\n"
             "}"),
        ],
        porque=(
            "O gate de papel deixou de ser uma lista escrita à mão em cada rota. A fábrica "
            "declara pisos por operação — leitura `viewer+`, escrita `agent+`, exclusão "
            "`manager+` — e um `admin` passa em todas sem repetição. `requireRank` faz a "
            "comparação por `ROLE_RANK`, então a hierarquia de papéis, antes declarada e "
            "sem consumidor, agora decide de fato. O efeito colateral relevante: escrever "
            "não é mais synonym de `viewer`, e apagar não é mais synonym de `agent`."
        ),
        cond="Toda rota gerada por createCollectionRoutes/createItemRoutes herda os pisos; rota que declarar RoleConfig próprio sobrescreve.",
        correcao="Nenhuma. Teste que falhe se uma rota nova for criada sem RoleConfig explícito quando o piso padrão mudar.",
    ),
    dict(
        id="C2-03", cat="cat2", sev="informativa",
        titulo="Verificação positiva: a UI da Equipe espelha os gates do servidor",
        arquivos=[
            ("src/ui/views/crm/CrmEquipeView.ts", "42-52",
             "const USER_MANAGERS: Role[] = ['admin', 'manager'];\n"
             "\n"
             "function pageHead(role: Role | null): string {\n"
             "\treturn section('Equipe', 'Usuários e papéis do sistema', newUserBtn(role));\n"
             "}\n"
             "\n"
             "// POST /api/users exige `['admin','manager']` (users/index.ts). Renderizar\n"
             "// o botao para um `viewer` produzia um clique que so voltava 403 — a UI\n"
             "// dizia que a acao existia quando o servidor nao aceitava.\n"
             "function newUserBtn(role: Role | null): string {\n"
             "\tif (!role || !USER_MANAGERS.includes(role)) return '';"),
        ],
        porque=(
            "A divergência UI↔servidor — botão renderizado para papel que o endpoint "
            "recusa, e opção `admin` oferecida a quem não pode conceder — está fechada: a "
            "decisão de renderizar acontece com o mesmo conjunto de papéis que o endpoint "
            "exige. A UI deixou de ser um oráculo de permissão; ela reflete o servidor, que "
            "continua sendo a fronteira."
        ),
        cond="Qualquer sessão; o efeito é UX (o botão não aparece), não autorização.",
        correcao="Nenhuma. Preservar o comentário que amarra a UI ao endpoint, para a próxima tela não quebrar o espelho.",
    ),
    dict(
        id="C2-04", cat="cat2", sev="informativa",
        titulo="Verificação positiva: escrita no WhatsApp exige papel agent+ e posse da conversa",
        arquivos=[
            ("src/pages/api/whatsapp/send.ts", "28-33",
             "// Sem este gate, um `viewer` dono da propria conversa escrevia no WhatsApp:\n"
             "// a posse sozinha nao distingue leitura de escrita. A rota se auto-autentica\n"
             "// por token, entao o gate usa o usuario ja resolvido em vez de locals.user.\n"
             "if (!hasRole(user, ['agent', 'manager', 'admin'])) {\n"
             "\treturn json({ error: 'papel_insuficiente' }, 403);\n"
             "}"),
            ("src/pages/api/whatsapp/send.ts", "50-51",
             "const elevated = user.role === 'manager' || user.role === 'admin';\n"
             "if (conversation.assignedUserId === user.id || elevated) return null;"),
        ],
        porque=(
            "Duas deficiências sobrepostas foram fechadas: posse sem papel (viewer donando "
            "a própria conversa disparava mensagem para o cliente) e papel sem posse "
            "(agent disparava para qualquer conversa). A rota combina as duas, e usa o "
            "usuário já resolvido pelo token — coerente com ela ser `PUBLIC_PATHS` e não "
            "ter `locals.user`."
        ),
        cond="Ilegível sem sessão. Escrita exige papel agent+ e conversa atribuída (ou manager/admin).",
        correcao="Nenhuma.",
    ),
    dict(
        id="C2-05", cat="cat2", sev="informativa",
        titulo="Verificação positiva: /api/settings é leitura pura na escrita, com allowlist de colunas e papel",
        arquivos=[
            ("src/pages/api/settings.ts", "46-51",
             "// GET e' somente leitura: a linha nasce em migrations/0022. Antes, um GET em\n"
             "// banco sem configuracao fazia INSERT — estado mudando em resposta a um read.\n"
             "export const GET: APIRoute = async () => {\n"
             "\tconst existing = await readSettings(getDb());\n"
             "\treturn json(existing ?? DEFAULT_SETTINGS);\n"
             "};"),
            ("src/pages/api/settings.ts", "53-62",
             "export const PUT: APIRoute = async (context) => {\n"
             "\tconst denied = await requireRole(context, SETTINGS_MANAGERS);\n"
             "\tif (denied) return denied;\n"
             "\tconst db = getDb();\n"
             "\tconst patch = sanitizeSettingsPatch(await context.request.json());\n"
             "\tconst current = (await readSettings(db)) ?? DEFAULT_SETTINGS;\n"
             "\tconst merged = { ...current, ...patch };\n"
             "\tawait writeSettings(db, merged);\n"
             "\treturn json(merged);\n"
             "};"),
            ("src/server/mapping.ts", "52-58",
             "function keepAllowed(\n"
             "\tentity: Record<string, unknown>,\n"
             "\tcolumns: string[] | undefined\n"
             "): Record<string, unknown> {\n"
             "\tif (!columns) return { ...entity };\n"
             "\tconst allowed = new Set(columns);\n"
             "\tconst out: Record<string, unknown> = {};"),
        ],
        porque=(
            "A rota que permitia escrita em GET, e gravação de coluna arbitrária no PUT, "
            "está fechada: o GET não toca mais no banco, o PUT exige `admin/manager` e o "
            "patch passa por `sanitizeSettingsPatch` antes do merge. A allowlist de "
            "colunas (`keepAllowed`, via `shape.columns`) permanece como segunda barreira "
            "contra chave forasteira no corpo — vale notar que ela é o que mantém o "
            "contrabando de coluna por JSON fechado no resto do app também."
        ),
        cond="PUT exige sessão admin/manager; chave fora do shape é descartada no merge.",
        correcao="Nenhuma.",
    ),

    # ------------------------------------------------------------- CATEGORIA 3
    dict(
        id="C3-01", cat="cat3", sev="alta",
        titulo="IDOR em 15 das 19 rotas de item: agent+ altera registro de terceiro que não tem coluna de dono",
        arquivos=[
            ("src/server/routeFactory.ts", "62-69",
             "// Entidades que têm dono - mapeamento de tabela para campo de dono\n"
             "const OWNER_FIELDS: Record<string, string> = {\n"
             "\tcontacts: 'assignedUserId',\n"
             "\tconversations: 'assignedUserId',\n"
             "\tdeals: 'assignedUserId',\n"
             "\ttasks: 'assigneeUserId',\n"
             "\t// Adicionar mais conforme necessário\n"
             "};"),
            ("src/server/routeFactory.ts", "81-82",
             "\tconst ownerField = OWNER_FIELDS[table];\n"
             "\tif (!ownerField) return null; // Sem campo de dono, permite"),
            ("src/server/routeFactory.ts", "168-186",
             "function updateHandler(\n"
             "\ttable: string,\n"
             "\tshape: TableShape,\n"
             "\tminimum: Role\n"
             "): APIRoute {\n"
             "\treturn async (context) => {\n"
             "\t\tconst blocked = await guardItemWrite(context, table, shape, minimum);\n"
             "\t\tif (blocked) return blocked;\n"
             "\t\tconst patch = (await context.request.json()) as {\n"
             "\t\t\tid?: string;\n"
             "\t\t} & Record<string, unknown>;\n"
             "\t\tconst invalid = refuseInvalid(shape, patch);\n"
             "\t\tif (invalid) return invalid;\n"
             "\t\tconst saved = await updateEntity(\n"
             "\t\t\tgetDb(), table, shape, context.params.id!, patch\n"
             "\t\t);\n"
             "\t\treturn saved ? json(saved) : notFound();\n"
             "\t};\n"
             "}"),
        ],
        porque=(
            "`OWNER_FIELDS` cobre quatro tabelas (contacts, conversations, deals, tasks) "
            "dezenove expostas por `createItemRoutes`. Para as outras quinze, "
            "`checkOwnership` retorna `null` na primeira linha — o gate de posse é "
            "literalmente ausente, não apenas frouxo. Somado ao piso `update: agent` "
            "introduzido em C2-02, o efeito é: qualquer `agent` autenticado faz PUT em "
            "qualquer registro de qualquer tabela sem dono, por knowing do id.\n\n"
            "O caso mais direto é `messages`. A rota é `createItemRoutes(MESSAGES_TABLE, "
            "MESSAGES_SHAPE)` — sem RoleConfig, sem dono — e `MESSAGES_SHAPE` inclui "
            "`text`, `fromMe`, `createdBy`, `direction`, `conversationId`, `externalId`, "
            "`remoteJid`, `waStatus`. Ou seja: um `agent` reescreve o texto de uma "
            "mensagem já entregue, marca `fromMe: true`, e forja `createdBy`. Isso não é "
            "só acesso indevido a registro alheio; é reescrita de histórico de "
            "conversação e de autoria.\n\n"
            "Para contexto, as quatro tabelas com dono estão bem guardadas: manager/admin "
            "passam (`:92`), e divergência de dono retorna 403 (`:95-97`). O problema é a "
            "cobertura, não o mecanismo — que está correto onde se aplica."
        ),
        cond=(
            "Sessão `agent` (o papel mais comum do time de vendas) + PUT em `/api/**/[id]` "
            "de tabela sem coluna de dono: 200 e a alteração persiste. `viewer` é barrado "
            "por C2-02 — a explorabilidade depende de `agent`, não de escalate."
        ),
        correcao=(
            "Duas frentes. (1) Subir o piso de `update` para `manager` em tabelas "
            "sensíveis sem dono — `messages`, `orders`, `calendar-events`, "
            "`conversation-notes`, `catalog-products` — enquanto o modelo de posse não "
            "existe. (2) Modelar dono onde faz sentido: acrescentar `assignedUserId` às "
            "tabelas de trabalho do CRM (activities, notes, products) com migration e "
            "registrar em `OWNER_FIELDS`, e tratar `messages` por posse da conversa "
            "(`conversationId` → `conversations.assignedUserId`) em vez de coluna própria. "
            "Em qualquer das duas, escrever teste que falhe: agent+writ de terceiro = 403."
        ),
    ),
    dict(
        id="C3-02", cat="cat3", sev="media",
        titulo="checkOwnership falha aberto quando o registro não tem dono — e as migrations criam exatamente esse caso",
        arquivos=[
            ("src/server/routeFactory.ts", "84-89",
             "\tconst entity = await getEntity(db, table, shape, id);\n"
             "\tif (!entity) return notFound();\n"
             "\n"
             "\tconst ownerId = (entity as Record<string, unknown>)[ownerField] as\n"
             "\t\tstring | undefined;\n"
             "\tif (!ownerId) return null; // Sem dono definido, permite"),
            ("migrations/0018_add_assigned_user_to_contact_deal.sql", "12",
             "ALTER TABLE contacts ADD COLUMN assignedUserId TEXT NOT NULL DEFAULT '';"),
            ("migrations/0018_add_assigned_user_to_contact_deal.sql", "15",
             "ALTER TABLE deals ADD COLUMN assignedUserId TEXT NOT NULL DEFAULT '';"),
            ("migrations/0003_crm.sql", "66",
             "  assigneeUserId TEXT NOT NULL DEFAULT '',   -- tasks"),
            ("migrations/0003_crm.sql", "99",
             "  assignedUserId TEXT NOT NULL DEFAULT '',   -- conversations"),
        ],
        porque=(
            "Mesmo nas quatro tabelas com dono, a checagem cede quando o campo está "
            "vazio: `if (!ownerId) return null`. O comentário assume que \"sem dono "
            "definido\" é um estado legítimo, mas o schema garante o oposto — `DEFAULT "
            "''` em contacts, deals, tasks e conversations significa que todo registro "
            "criado sem atribuição explícita nasce sem dono. Um registro desses é "
            "gravação livre para qualquer `agent`: a proteção existe no código e não "
            "dispara no dado.\n\n"
            "O efeito é inverso ao esperado: quanto mais antigo o registro (criado antes "
            "de a atribuição ser obrigatória, ou por um caminho que não a preenche), "
            "menos protegido ele está. A condição é fácil de alcançar — basta um contato "
            "importado."
        ),
        cond="Registro com `assignedUserId`/`assigneeUserId` vazio + PUT por `agent` ≠ dono → 200. O silêncio da checagem não é logado.",
        correcao=(
            "Falhar fechado é a opção simples e alinhada ao resto do app: `if (!ownerId) "
            "retornar 403 nao_autorizado` para papéis abaixo de manager. Se a intenção for "
            "tratar \"sem dono\" como posse da empresa (legítimo em CRM comassignação "
            "opcional), então o caminho certo é tornar a atribuição obrigatória no "
            "schema (`NOT NULL` sem default, com backfill) — e não deixar o default "
            "vazio decidir a segurança. Registrar a decisão como invariante, com teste que "
            "falhe para linha sem dono."
        ),
    ),
    dict(
        id="C3-03", cat="cat3", sev="media",
        titulo="PUT aceita campos de autoria e atribuição no corpo: agente se autoatribui e falsifica autoria",
        arquivos=[
            ("src/server/routeFactory.ts", "176-183",
             "\t\tconst patch = (await context.request.json()) as {\n"
             "\t\t\tid?: string;\n"
             "\t\t} & Record<string, unknown>;\n"
             "\t\tconst invalid = refuseInvalid(shape, patch);\n"
             "\t\tif (invalid) return invalid;\n"
             "\t\tconst saved = await updateEntity(\n"
             "\t\t\tgetDb(), table, shape, context.params.id!, patch\n"
             "\t\t);"),
            ("src/server/crud.ts", "57-65",
             "\tconst existing = await getEntity<T>(db, table, shape, id);\n"
             "\tif (!existing) return null;\n"
             "\tconst merged = { ...existing, ...patch } as T;\n"
             "\tconst row = entityToRow(\n"
             "\t\tmerged as unknown as Record<string, unknown>,\n"
             "\t\tshape\n"
             "\t);\n"
             "\tconst { sql, values } = buildUpdate(table, id, row, shape.columns);\n"
             "\tawait db.prepare(sql).bind(...values).run();"),
            ("src/server/tables.ts", "169-175",
             "export const MESSAGES_SHAPE: TableShape = {\n"
             "\tcolumns: [\n"
             "\t\t'ack', 'conversationId', 'createdAt', 'createdBy', 'deliveredAt', 'direction',\n"
             "\t\t'editedAt', 'externalId', 'fromMe', 'id', 'mediaMime', 'mediaUrl',\n"
             "\t\t'messageType', 'readAt', 'remoteJid', 'revokedAt', 'text', 'waStatus',\n"
             "\t\t'waTimestamp'\n"
             "\t],\n"
             "\tjsonFields: [],\n"
             "\tboolFields: ['fromMe'],"),
        ],
        porque=(
            "O patch do PUT é repassado ao merge sem allowlist própria — a única "
            "restrição é a coluna existir no `shape`. Como os shapes incluem justamente os "
            "campos de autoria e atribuição, três jogadas ficam disponíveis para um "
            "`agent` numa tabela sem dono: (a) `assignedUserId` no próprio corpo, "
            "autoatribuindo o registro; (b) `createdBy`/`authorUserId` em qualquer "
            "tabela, falsitando autoria; (c) em `messages`, `text` + `fromMe` + "
            "`direction`, reescrevendo a mensagem como se fosse própria.\n\n"
            "O ponto importante é que (a) e (b) continuam disponíveis mesmo nas tabelas COM "
            "dono (C3-01 fecha só a cobertura): o gate de posse compara o dono persistido "
            "com o usuário, mas nada impede o mesmo PUT de trocar o dono junto. Um agente "
            "pode tomar um contato de outro, em uma requisição só, sem nenhum 403."
        ),
        cond=(
            "Sessão `agent` + PUT com `assignedUserId`/`assigneeUserId`/`createdBy` no "
            "corpo. Em tabela sem dono: 200 sempre. Em tabela com dono: 200 se a posse "
            "atual permitir (inclusive linha sem dono, por C3-02)."
        ),
        correcao=(
            "Derivar `assignedUserId`/`assigneeUserId` do `locals.user.id` no servidor "
            "(ignorar o valor do corpo), e remover `createdBy`/`authorUserId`/`fromMe` "
            "da superfície de escrita — `createdBy` deve ser preenchido na criação, nunca "
            "editado; `fromMe` só muda por caminho de sistema (ingest de webhook). Para o "
            "PUT, a forma mais barata de garantir isso é uma lista de campos "
            "imutáveis por tabela, checada antes do merge, com teste que falhe se um PUT "
            "conseguir mudar `createdBy`."
        ),
    ),

    # ------------------------------------------------------------- CATEGORIA 4
    dict(
        id="C4-01", cat="cat4", sev="critica",
        titulo="Segredo real da WAHA dentro de arquivo de texto versionado (docs/security-audit/dados_auditoria.py)",
        arquivos=[
            ("docs/security-audit/dados_auditoria.py", "433, 1354, 1358 (blob e5cd231)",
             "O arquivo de dados do relatório — texto plano, RASTREADO pelo git —\n"
             "continha o valor da WAHA_API_KEY em três lugares (achado C4-02 da rodada\n"
             "anterior e evidência de .dev.vars). Valor redigido; recuperável em\n"
             "qualquer clone com `git show e5cd231:docs/security-audit/dados_auditoria.py`."),
            (".dev.vars", "9",
             "WAHA_API_KEY=\"<valor real redigido nesta auditoria>\"   # untracked, .gitignore:5"),
            ("tests/spec-v2/c-settings-secrets.test.ts", "232-259",
             "it('@spec:AC-335 no tracked file carries the real WAHA key', () => {\n"
             "  ...\n"
             "  const leaked = [...content.matchAll(KEY_ASSIGNMENT)]\n"
             "    .map((match) => match[1])\n"
             "    .filter(looksLikeRealKey);\n"
             "  expect([file, leaked]).toEqual([file, []]);\n"
             "});"),
        ],
        porque=(
            "O guardião do próprio repositório reagiu: `npm test` falha em "
            "`c-settings-secrets.test.ts` (AC-335), apontando `docs/security-audit/dados_auditoria.py` "
            "como arquivo rastreado que carrega a chave real. O relatório de auditoria "
            "vazava a credencial que ele deveria auditar — o arquivo de achados citava o "
            "segredo em claro para provar a existência dele. Isso é pior que tê-lo só em "
            "`.dev.vars`: `.dev.vars` é ignorado por design (AC-334 passa), enquanto um "
            "arquivo de documentação está no histórico do git.\n\n"
            "A chave aparece em: esta árvore de trabalho, todos os clones, qualquer "
            "backup do repositório, e o histórico — onde não basta apagar o arquivo, "
            "porque o conteúdo anterior permanece recuperável."
        ),
        cond=(
            "Qualquer pessoa ou processo com leitura do repositório (ou de um clone dele) "
            "obtém a credencial da API WAHA. Não é explorável por requisição HTTP — é "
            "exposição por leitura de repositório."
        ),
        correcao=(
            "Rotacionar a WAHA_API_KEY primeiro — é o que tira o valor do histórico; só "
            "depois purga. Depois: (a) reescrever este arquivo citando apenas "
            "`arquivo:linha` com valor redigido (feito nesta rodada); (b) nunca colar "
            "segredo em texto versionado, nem para provar um achado — `git grep` do prefixo "
            "no histórico basta como evidência; (c) reescrever o histórico "
            "(`git filter-repo`) ou, no mínimo, registrar que a chave antiga está morta. "
            "O teste AC-335 já é a trava: ele falhou exatamente como deveria."
        ),
    ),
    dict(
        id="C4-02", cat="cat4", sev="alta",
        titulo="Credencial real da WAHA presente na árvore de trabalho (.dev.vars)",
        arquivos=[
            (".dev.vars", "9", "WAHA_API_KEY=\"<valor real redigido nesta auditoria>\""),
            (".gitignore", "5", ".dev.vars"),
        ],
        porque=(
            "`.dev.vars` guarda a `WAHA_API_KEY` real em texto plano na máquina de "
            "desenvolvimento. O arquivo está corretamente ignorado e não rastreado "
            "(AC-334 passa), então não é um vazamento de repositório — mas é um segredo "
            "reproduzível em qualquer backup da máquina, snapshot de disco, ou sessão de "
            "shell que leia o arquivo. O relatório antigo tratava este item como achado de "
            "exposição; hoje o enquadramento correto é: material de segredo presente, "
            "contenção por filesystem em vez de por gestão de segredo. A severidade só cai "
            "depois da rotação de C4-01, porque a mesma chave também está no histórico do "
            "git."
        ),
        cond="Leitura do arquivo por processo/usuário na mesma máquina. Sem exposição de rede: o arquivo não é servido.",
        correcao=(
            "Rotacionar junto com C4-01 e mover a credencial para um cofre ou `wrangler "
            "secret put`, mantendo em `.dev.vars` apenas o ponteiro não-sensível. Se o "
            "arquivo precisa existir localmente, documentar a CONTENTS_DENY por diretório "
            "(600) e a proibição de anexá-lo a ticket/bug report."
        ),
    ),
    dict(
        id="C4-03", cat="cat4", sev="media",
        titulo="Histórico do git carrega hash de credencial WAHA (waha/.env em commits antigos)",
        arquivos=[
            ("waha/.env", "12",
             "WAHA_API_KEY_SHA512=sha512:<hash redigido>   # em commits antigos; arquivo hoje não rastreado"),
            (".gitignore", "7", ".env"),
        ],
        porque=(
            "Nove commits tocaram `waha/.env`, entre eles `882b050`, `59d917b` (\"T-103 "
            "feature: segredo da WAHA fora do controle de versao\"), `563bbf2`, "
            "`34829fe`, `46f03b2`, `588a256`, `0ce4f2d`, `8aab53d`, `484c891` e "
            "`90dfd83`. O conteúdo versionado é o hash SHA-512 da chave — não a chave em "
            "si, mas um derivado que permite verificação offline de candidatos e confirma "
            "qual credencial era a válida na época. O arquivo não está mais rastreado e "
            "`.gitignore` cobre `.env`, então a exposição atual é só histórica; mas "
            "histórico é o armazenamento que ninguém limpa sozinho."
        ),
        cond="Qualquer pessoa com um clone do repositório (inclusive shallow=false) lê o hash; brute-force de chave candidata é verificável offline sem rede.",
        correcao=(
            "Rotacionar a credencial (o hash só é inofensivo depois que o segredo que ele "
            "resume está morto) e reescrever o histórico removendo `waha/.env` de todos os "
            "commits (`git filter-repo --path waha/.env --invert-paths`), com force-push "
            "coordenado. Se reescrever histórico for inviável, registrar explicitamente "
            "que o hash está comprometido e que a rotação é obrigatória — sem isso, o "
            "achado se repete a cada clone."
        ),
    ),
    dict(
        id="C4-04", cat="cat4", sev="media",
        titulo="Webhook WAHA nasce com verificação de assinatura desligada: o template entrega segredo e flag vazios",
        arquivos=[
            (".dev.vars.example", "33-35",
             "# Um segredo de uso unico por ambiente: `openssl rand -hex 32`.\n"
             "# Vazio DESLIGA a verificacao de assinatura; um segredo curto (<32) tambem e\n"
             "# recusado e o receiver falha fechado. Copie este arquivo e troque o valor.\n"
             "WAHA_HMAC_SECRET=\"\"\n"
             "WAHA_WEBHOOK_REQUIRE_SIGNATURE=\"\""),
            ("src/server/wahaWebhook.ts", "51-57",
             "export function readWahaWebhookConfig(source: unknown): WahaWebhookConfig {\n"
             "\tconst record = source as Record<string, unknown> | null | undefined;\n"
             "\tconst secret = usableSecret(text(record?.WAHA_HMAC_SECRET));\n"
             "\tconst flag = record?.WAHA_WEBHOOK_REQUIRE_SIGNATURE ?? '';\n"
             "\tconst requireSignature = String(flag) === 'true';\n"
             "\treturn { hmacSecret: secret, requireSignature };\n"
             "}"),
        ],
        porque=(
            "A leitura de configuração agora é correta — placeholder e segredo curto são "
            "recusados —, mas o valor default do arquivo de exemplo continua sendo \"sem "
            "segredo e sem exigência\". Quem copia `.dev.vars.example` para `.dev.vars` e "
            "não preenche esses dois campos (o caminho natural, já que o resto do arquivo "
            "vem preenchido) sobe o receiver com a assinatura desligada, e o comentário do "
            "próprio template diz isso. O ponto é o default: a proteção depende de o "
            "operador fazer a parte difícil, e o estado inicial é o inseguro."
        ),
        cond="Configuração não editada → qualquer POST em /api/whatsapp/webhook é aceito e ingerido no CRM, sem autenticação.",
        correcao=(
            "Trocar o default por seguro: `WAHA_WEBHOOK_REQUIRE_SIGNATURE=\"true\"` no "
            "template, com `WAHA_HMAC_SECRET` claramente marcado como obrigatório, e "
            "fazer o receiver recusar o startup (não o request) quando o modo estrito não "
            "tiver segredo — hoje a recusa acontece por request, então a falha é silenciosa "
            "e o sintoma é \"a verificação simplesmente não existe\". Se o modo aberto for "
            "necessário em desenvolvimento, que seja explícito (`WAHA_WEBHOOK_REQUIRE_SIGNATURE=\"false\"` "
            "comentado como só-dev)."
        ),
    ),
    dict(
        id="C4-05", cat="cat4", sev="media",
        titulo="fail-open na exigência de assinatura: modo estrito sem segredo utilizável aceita payload sem header",
        arquivos=[
            ("src/server/wahaWebhook.ts", "33-34",
             "// curtas sao recusados, e um segredo recusado DEIXA A VERIFICACAO DESLIGADA\n"
             "// (fail-closed, nunca fail-open)."),
            ("src/server/wahaWebhook.ts", "69-86",
             "export async function authenticateWahaWebhook(\n"
             "\trequest: Request,\n"
             "\tconfig: WahaWebhookConfig\n"
             "): Promise<WahaWebhookAuth> {\n"
             "\tconst signature = wahaWebhookSignature(request);\n"
             "\tif (signature) {\n"
             "\t\tif (!config.hmacSecret) return signedDenied();\n"
             "\t\tconst rawBody = await request.clone().text();\n"
             "\t\tconst ok = await verifyWahaHmac(rawBody, signature, config.hmacSecret);\n"
             "\t\treturn ok\n"
             "\t\t\t? { ok: true, reason: 'ok', signatureVerified: true }\n"
             "\t\t\t: signedDenied();\n"
             "\t}\n"
             "\tif (config.requireSignature && config.hmacSecret) {\n"
             "\t\treturn { ok: false, reason: 'missing_signature', signatureVerified: false };\n"
             "\t}\n"
             "\treturn { ok: true, reason: 'ok', signatureVerified: false };\n"
             "}"),
            ("src/server/wahaWebhook.ts", "44-49",
             "function usableSecret(value: string | null): string | null {\n"
             "\tif (!value) return null;\n"
             "\tif (PLACEHOLDER_SECRETS.has(value.trim().toLowerCase())) return null;\n"
             "\tif (value.length < HMAC_MIN_BYTES) return null;\n"
             "\treturn value;\n"
             "}"),
        ],
        porque=(
            "O comentário das linhas 33-34 afirma fail-closed, e o código faz o oposto no "
            "caminho que importa. O ponto de recusa sem assinatura exige as DUAS condições: "
            "`config.requireSignature && config.hmacSecret`. Se o operador liga o modo "
            "estrito mas o segredo é recusado por `usableSecret` (placeholder, curto, ou "
            "vazio), `hmacSecret` é `null`, a conjunção falha e a execução cai no "
            "`return { ok: true }` final. Ou seja: a configuração que o operador entende "
            "como \"mais segura\" resulta em nenhuma verificação.\n\n"
            "O caminho de assinatura presente está correto (`:75` nega sem segredo, `:77`"
            " compara em tempo constante) — o defeito é exclusivamente a combinação "
            "require+secret, que transforma erro de configuração em autenticação desligada "
            "em vez de erro visível. Agrava C4-04: o template já entrega o modo estrito "
            "desligado, então o operador que liga a flag e esquece o segredo cai "
            "silenciosamente no modo aberto."
        ),
        cond=(
            "`WAHA_WEBHOOK_REQUIRE_SIGNATURE=true` + segredo ausente/placeholder/curto + "
            "POST sem header `x-webhook-hmac` → aceito, arquivado e ingerido no CRM."
        ),
        correcao=(
            "Inverter a lógica para que a recusa dependa só da flag: "
            "`if (config.requireSignature && !signature) return { ok: false, reason: "
            "'missing_signature' }` — assim modo estrito sem segredo utilizável recusa "
            "todo request (fail-closed), que é o comportamento prometido pelo comentário. "
            "Complementar com erro explícito no startup e com a troca do teste existente "
            "em `tests/server/wahaWebhook.test.ts:102` (hoje afirma que `requireSignature: "
            "true` com `hmacSecret: null` aceita) — esse teste é a prova viva do "
            "fail-open e precisa mudar junto."
        ),
    ),
    dict(
        id="C4-06", cat="cat4", sev="baixa",
        titulo="npm audit não bloqueia a CI (continue-on-error: true)",
        arquivos=[
            (".github/workflows/ci.yml", "142-144",
             "      - name: Run npm audit\n"
             "        run: npm audit --audit-level=high\n"
             "        continue-on-error: true"),
        ],
        porque=(
            "O job de auditoria roda e o resultado é ignorado: `continue-on-error: true` "
            "faz o GitHub Actions marcar o step como sucesso mesmo com vulnerabilidade "
            "high/critical, então a verificação não tem efeito de gate. Não é uma "
            "vulnerabilidade por si só — é um controle que não controla, o que é pior que "
            "não tê-lo, porque o relatório de CI mostra o job como verde."
        ),
        cond="Qualquer vulnerabilidade high/critical em dependência: a CI segue verde.",
        correcao=(
            "Remover `continue-on-error` para `npm audit --audit-level=high`, ou trocar "
            "por `continue-on-error: true` com upload de artifact do relatório e uma "
            "condição de falha separada no nível critical. Como dependência é superfície "
            "de alto retorno para esta categoria, o passo só é útil se mandar em gate."
        ),
    ),
    dict(
        id="C4-07", cat="cat4", sev="baixa",
        titulo="Nenhuma validação de configuração no startup: assertNoSeedCredential não é chamada pelo Worker",
        arquivos=[
            ("src/server/seedCredential.ts", "36-43",
             "// Fail-closed: refuses to continue while a replayable admin credential exists.\n"
             "export async function assertNoSeedCredential(db: Database): Promise<void> {\n"
             "\tconst users = await listEntities<{ email: string; passwordHash: string }>(\n"
             "\t\tdb, USERS_TABLE, USERS_SHAPE\n"
             "\t);\n"
             "\tconst offender = users.find((user) => isLegacySeedHash(user.passwordHash));\n"
             "\tif (offender) throw new SeedCredentialError(offender.email);\n"
             "}"),
            ("src/worker.ts", "12-25",
             "export default {\n"
             "\tasync fetch(request: Request, env: Env, ctx: ExecutionContext) {\n"
             "\t\tconst state = new FetchState(request);\n"
             "\t\tconst asset = await cf(state, env, ctx);\n"
             "\t\tif (asset) return asset;\n"
             "\t\treturn finalize(state, await astro(state));\n"
             "\t},\n"
             "\tasync scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {\n"
             "\t\tawait runRetention(env.DB, env);\n"
             "\t}\n"
             "};"),
        ],
        porque=(
            "Existe uma função que falha fechado enquanto há credencial de seed "
            "reproduzível, com mensagem de erro explícita — e ela só é chamada de dentro "
            "do próprio script de bootstrap e dos testes (`grep` de consumidores: "
            "`bootstrap-admin.ts:59,87` e `tests/spec-v2/c-settings-secrets.test.ts:135-141`; "
            "nenhuma em `src/server` nem em `worker.ts`). O entrypoint do Worker sobe sem "
            "verificar nada. O mesmo vale para a configuração do webhook: um segredo "
            "ausente ou inválido não produz erro de boot, apenas degradação silenciosa em "
            "runtime (C4-04, C4-05).\n\n"
            "A fechamento do achado de senha de seed do relatório antigo é real — o seed "
            "não grava mais hash reproduzível, `bootstrap-admin.ts:26-32` sorteia a senha "
            "com `crypto.getRandomValues`, e o middleware bloqueia a API enquanto "
            "`mustChangePassword=1` — mas o fail-closed que protects o estado legado não "
            "está ligado ao processo que decide subir."
        ),
        cond="Deploy com credencial de seed legada ou com webhook em modo aberto: o Worker sobe normalmente e o problema só aparece em um request.",
        correcao=(
            "Chamar `assertNoSeedCredential(env.DB)` no boot do Worker (uma vez, com cache "
            "por isolate ou marcado no bundle) e falhar o deploy quando ela lançar. "
            "Adicionar, na mesma função, a validação de configuração do WAHA (chave "
            "presente, `WAHA_HMAC_SECRET` válido se `REQUIRE_SIGNATURE=true`). "
            "Alternativa mais leve: um `npm run preflight` obrigatório no pipeline, com "
            "checagem que rode contra o D1 remoto — desde que o pipeline não seja "
            "opcional."
        ),
    ),

    # ------------------------------------------------------------- CATEGORIA 5
    dict(
        id="C5-01", cat="cat5", sev="baixa",
        titulo="escapeHtml não escapa aspas: helper disponível para o contexto errado (latente, sem sink hoje)",
        arquivos=[
            ("src/domain/format.ts", "33-37",
             "export function escapeHtml(text: string): string {\n"
             "\tconst div = document.createElement('div');\n"
             "\tdiv.textContent = text ?? '';\n"
             "\treturn div.innerHTML;\n"
             "}"),
            ("src/domain/format.ts", "39-43",
             "export function escapeAtrib(text: string): string {\n"
             "\treturn escapeHtml(text)\n"
             "\t\t.replace(/\\\"/g, \"&quot;\")\n"
             "\t\t.replace(/\\'/g, \"&#x27;\")\n"
             "}"),
            ("src/ui/views/crm/crmUi.ts", "57, 69, 77, 83, 93-94, 131",
             "const attrs = ` class=\"input\" name=\"${name}\" value=\"${escapeAtrib(value)}\"`;\n"
             "const valueAttr = escapeAtrib(String(value));\n"
             "`<option value=\"${escapeAtrib(o.value)}\"${sel}>` +\n"
             "`<span class=\"badge${caramel}\">${escapeHtml(label)}</span>`;"),
        ],
        porque=(
            "`escapeHtml` escapa `&`, `<` e `>` via `textContent`→`innerHTML`, mas não "
            "aspas — corretamente, porque é um helper de contexto de texto. O risco é "
            "latente: `escapeAtrib` existe e cobre o caso de atributo (`crmUi.ts:57,69,77,"
            "83,131`), e hoje nenhum sink de atributo usa o helper base, portanto não há "
            "injeção viva. O que fica registrado é a superfície: qualquer novo "
            "`value=\"${escapeHtml(x)}\"` reproduz a quebra de atributo, e o nome do helper "
            "não avisa. Agrava o escopo: com sessão em cookie HttpOnly (C1-02), mesmo um "
            "eventual breakout não vira roubo de token.\n\n"
            "Os sinks reais da rodada anterior estão corrigidos: `Modal.ts:32` escapa "
            "`options.title`, `DashboardView.ts:88` escapa `i.name`/`i.unit`, "
            "`LoginView.ts:46-47` escapa `me.name`/`me.email`, e a CSP do middleware "
            "(`script-src 'self'`, sem `unsafe-inline`) contém o resto."
        ),
        cond="Não explorável no código atual: nenhum atributo é preenchido com escapeHtml. Exige uma futura interpolação em atributo.",
        correcao=(
            "Fechar a classe de falha, não só o helper: renomear `escapeHtml` para "
            "`escapeText` (nome que declara o contexto) e fazer `escapeAtrib` ser o único "
            "aceito em atributo, com um teste que varra os arquivos de `src/ui` e falhe se "
            "encontrar `=\"${escapeText(` ou `escapeHtml` dentro de atributo. Enquanto "
            "isso, documentar no helper que ele NÃO é seguro em atributo."
        ),
    ),
    dict(
        id="C5-02", cat="cat5", sev="informativa",
        titulo="Verificação positiva: CSP restritiva, sinks escapados e anti-SQLi por allowlist de coluna",
        arquivos=[
            ("src/middleware.ts", "31-56",
             "CSP com script-src 'self' (sem unsafe-inline), frame-ancestors 'none',\n"
             "base-uri 'self', mais HSTS, nosniff e X-Frame-Options."),
            ("src/server/mapping.ts", "52-58",
             "function keepAllowed(...): Record<string, unknown> {\n"
             "\tif (!columns) return { ...entity };\n"
             "\tconst allowed = new Set(columns);\n"
             "\tconst out: Record<string, unknown> = {};"),
            ("src/server/crud.ts", "46, 65, 78",
             "await db.prepare(sql).bind(...values).run();  // insert/update/delete parametrizados"),
            ("src/domain/format.ts", "33-43",
             "escapeHtml (texto) e escapeAtrib (atributo) — helpers separados por contexto."),
        ],
        porque=(
            "A camada de escape está coerente onde importa, e a defesa não depende só "
            "disso: a CSP sem `unsafe-inline` impede execução de script injetado mesmo que "
            "um breakout de atributo ocorra, e o allowlist de coluna com `bind()` mantém "
            "SQL fora do alcance do corpo JSON (nome de coluna não pode ser contrabandeado "
            "como chave). Combinadas com o cookie HttpOnly (C1-02), as três camadas "
            "independentes reduzem um erro de escaping futuro a um incidente de conteúdo, "
            "não a comprometimento de sessão."
        ),
        cond="Não explorável: controle verificado, não ausência de controle.",
        correcao="Nenhuma. Preservar a separação dos helpers de escape por contexto.",
    ),
]

# --------------------------------------------------------------- pontos fortes
# (titulo, local, descricao) — controles verificados que merecem permanecer.
PONTOS_FORTES = [
    ("Recorte LGPD em cascata, no módulo, não na rota", "src/domain/lgpdScope.ts:69-92",
     "Contatos por atribuição derivam conversas, mensagens e clientes/pedidos. A rota "
     "consome o recorte, então o vazamento anterior não voltou por duplo caminho."),
    ("SSE escopado na consulta, com escape para manager/admin", "src/pages/api/crm/events.ts:27-38, 201",
     "`visibleConversationIds` devolve `null` só para manager/admin; nos demais papéis o "
     "filtro vai para o SQL. Sem token em query string (único parâmetro lido é `since`)."),
    ("Sessão em cookie HttpOnly; nada legível por script", "src/server/auth.ts:70",
     "`HttpOnly; Secure; SameSite=Strict`, com o cliente guardando apenas perfil não-sensível."),
    ("Escalada de privilégio fechada nos dois verbos de /api/users",
     "src/pages/api/users/index.ts:31-33, 51-58 · [id].ts:62-65",
     "Os papéis aceitos são derivados do corpo antes de qualquer validação; pedir `admin` "
     "exige `ADMINS` tanto no POST quanto no PUT."),
    ("Matriz de papéis por operação na fábrica de rotas",
     "src/server/routeFactory.ts:19-34, 56-60, 204-228",
     "leitura `viewer+`, escrita `agent+`, exclusão `manager+`; `admin` passa em todas. "
     "Escrever deixou de ser synonym de `viewer`."),
    ("ROLE_RANK finalmente decide", "src/server/authz.ts:25-30, 43-50",
     "`hasRank`/`requireRank` comparam `ROLE_RANK`, dando semântica real à hierarquia que "
     "antes era código morto."),
    ("UI espelha o endpoint em vez de inventar permissão",
     "src/ui/views/crm/CrmEquipeView.ts:42-52",
     "O botão de criação é condicionado ao mesmo conjunto de papéis que o POST exige."),
    ("settings: leitura pura na escrita, com allowlist", "src/pages/api/settings.ts:46-62",
     "GET não escreve no banco; PUT exige `admin/manager` e o patch passa por "
     "`sanitizeSettingsPatch` antes do merge."),
    ("WhatsApp: papel E posse da conversa na escrita", "src/pages/api/whatsapp/send.ts:28-33, 50-51",
     "Fecha as duas metades — posse sem papel (viewer donando a própria conversa) e papel "
     "sem posse (agent em qualquer conversa)."),
    ("Webhook WAHA: assinatura presente e errada é sempre recusada, comparação em tempo constante",
     "src/server/wahaWebhook.ts:69-81, 179-184",
     "`constantTimeEqual` evita vazamento por tempo; corpo bruto arquivado antes de qualquer "
     "parse (fail-open deste ponto é C4-05, não daqui)."),
    ("Anti-SQLi por allowlist de coluna + parâmetros vinculados",
     "src/server/mapping.ts:52-58 · src/server/crud.ts:46, 65, 78",
     "`keepAllowed` impede contrabandear nome de coluna via JSON; todo valor vai por `bind()`."),
    ("Senhas: PBKDF2-SHA256 com sal por usuário, e sem seed reproduzível",
     "src/server/auth.ts · scripts/bootstrap-admin.ts:26-32 · src/server/seedCredential.ts:36-43",
     "Sal sorteado por gravação; o bootstrap sorteia a senha com `crypto.getRandomValues`; "
     "existe função de fail-closed para hash legado (C4-07 registra que falta ligar no boot)."),
    ("Backbone de autenticação no middleware", "src/middleware.ts:15-21, 116-136",
     "Todas as rotas `/api/*` exigem sessão, exceto cinco caminhos explícitos em "
     "`PUBLIC_PATHS`; o resto responde 401."),
    ("As cinco rotas públicas se auto-autenticam", "whatsapp/health.ts · whatsapp/webhook-config.ts · crm/events.ts · whatsapp/send.ts",
     "Como o middleware não resolve sessão nelas, cada uma valida o token sozinha — e todas "
     "validam (inclusive `events.ts` e `send.ts`, que re-resolvem o usuário)."),
    ("Rate limit de login em D1, não em memória do isolate", "src/server/rateLimit.ts · src/middleware.ts:58-64",
     "5 tentativas de login e 3 de troca de senha por janela de 15 min, com contador "
     "persistido: resiste a restart de deploy."),
    ("Guarda de mesma-origem nas rotas de sessão", "src/server/origin.ts:10-19",
     "login/logout/me/change-password rejeitam `Origin` divergente; cliente sem header "
     "(o engine WAHA) passa."),
    ("CSP restritiva e anti-clickjacking", "src/middleware.ts:31-56",
     "`script-src 'self'` sem `unsafe-inline`, `frame-ancestors 'none'`, `base-uri 'self'`, "
     "HSTS, `nosniff`, `X-Frame-Options` — o que contém injeção de HTML."),
    ("Auditoria das operações privilegiadas", "src/server/authz.ts · src/server/routeFactory.ts:42-54 · src/server/audit.ts",
     "Negação por papel gera entrada de auditoria com IP; criação de entidade gera "
     "action_log com userId e clientId."),
    ("O transporte WAHA nunca carrega segredo no erro", "src/server/waha.ts:20-21, 40-47",
     "`WahaError` só formata `waha_<op>_<status>`; o corpo da resposta — que pode conter "
     "telefone, HMAC e API key — é descartado. Timeout em toda chamada."),
    ("Compose do WAHA usa sentinela fail-closed", "waha/docker-compose.waha.yml:41",
     "`WAHA_API_KEY: \"${WAHA_API_KEY_SHA512:-sha512:INVALID_CHANGE_ME}\"` — nenhum hash "
     "real casa, então um container recém-criado recusa tudo em vez de abrir com senha padrão."),
    ("Trava de regressão de segredo em texto versionado",
     "tests/spec-v2/c-settings-secrets.test.ts:232-259",
     "AC-334/AC-335 varrem todo arquivo rastreado e falham se a chave real ou uma "
     "atribuição com cara de chave aparecer. Foi exatamente esse teste que reprovou o "
     "relatório antigo (C4-01)."),
]

# ---------------------------------------------------------- recomendações
# (prioridade, achados, acao, porque)
RECOMENDACOES = [
    ("P1", "C4-01 C4-02 C4-03",
     "Rotacionar a WAHA_API_KEY (uma vez, cobre as três), reescrever este arquivo sem "
     "segredo em claro — feito nesta rodada — e purgar `waha/.env` do histórico com "
     "git filter-repo.",
     "Segredo em texto versionado e em histórico é o único achado desta rodada que "
     "compromete fora do perímetro da aplicação: qualquer clone tem a credencial. "
     "Rotacionar invalida o que já vazou; reescrever o arquivo impede a repetição."),
    ("P1", "C3-01",
     "Subir o piso de `update` para `manager` nas tabelas sensíveis sem dono (messages, "
     "orders, calendar-events, conversation-notes, catalog-products) e modelar "
     "`assignedUserId` nas demais tabelas de trabalho do CRM, registrando em "
     "`OWNER_FIELDS`.",
     "15 das 19 rotas de item não têm gate de posse nenhum; o piso `agent` de C2-02 "
     "transformou isso em IDOR(truthy) para o papel mais comum do time."),
    ("P1", "C5-02",
     "Preservar a separação escapeText/escapeAtrib e a CSP sem `unsafe-inline`.",
     "São as duas camadas que mantêm um erro de escaping futuro como incidente de "
     "conteúdo, não como comprometimento de sessão."),
    ("P2", "C3-02",
     "Falhar fechado em `checkOwnership` quando o registro não tem dono (403 para papel "
     "abaixo de manager), ou tornar a atribuição obrigatória no schema com backfill.",
     "`DEFAULT ''` nas migrations garante linhas sem dono, e o código trata \"sem dono\" "
     "como permissão — quanto mais antigo o registro, menos protegido."),
    ("P2", "C3-03",
     "Derivar `assignedUserId`/`assigneeUserId` do `locals.user.id` no servidor e remover "
     "`createdBy`/`authorUserId`/`fromMe` da superfície de escrita, com lista de campos "
     "imutáveis por tabela.",
     "Autoatribuição e falsificação de autoria continuam disponíveis mesmo nas tabelas "
     "com dono, porque o PUT aceita trocar o dono junto com o resto do registro."),
    ("P2", "C4-04 C4-05",
     "Trocar o default do template para `REQUIRE_SIGNATURE=\"true\"` e invertir a lógica "
     "de C4-05 para que o modo estrito recuse quando o segredo não é utilizável — "
     "atualizando o teste que hoje afirma o comportamento fail-open.",
     "Um operador que liga a flag e esquece o segredo acaba com a verificação "
     "inexistente, e o comentário do código promete o contrário do que ele faz."),
    ("P2", "C5-01",
     "Renomear `escapeHtml` para `escapeText` e adicionar teste que falhe se o helper de "
     "texto aparecer dentro de um atributo em `src/ui`.",
     "Fecha a classe de falha por contexto, não só o helper: o nome atual não avisa o "
     "próximo autor, e nenhum sink vivo existe hoje para servir de trava."),
    ("P3", "C4-07",
     "Chamar `assertNoSeedCredential(env.DB)` e a validação de config do WAHA no boot "
     "do Worker (ou em um preflight obrigatório do pipeline).",
     "O fail-closed existe e é correto; só não está ligado ao processo que sobe a "
     "aplicação, então erro de configuração vira degradação silenciosa em runtime."),
    ("P3", "C4-06",
     "Remover `continue-on-error` do `npm audit` ou condicionar a falha em nível critical.",
     "Um controle que não controla é pior que a ausência dele: o relatório de CI mostra "
     "verde onde há vulnerabilidade."),
    ("P3", "C1-01",
     "Registrar como invariante (teste) que o recorte LGPD nunca devolve linha sem "
     "atribuição, e que rota nova não pode assumir `listEntities` restrita.",
     "A listagem global é decisão de projeto legítima; o risco é ela ser tratada como "
     "garantia por quem escreve a próxima rota."),
]

# --------------------------------------------------------- issues github
ISSUES = [
    dict(
        n=1,
        titulo="[Segurança] Segredo real da WAHA em arquivo versionado e no histórico do git",
        labels="security, critical, secrets, git-history",
        problema=(
            "A credencial `WAHA_API_KEY` real está em três lugares.\n\n"
            "**(a) Em arquivo rastreado.** `docs/security-audit/dados_auditoria.py` — o "
            "arquivo de dados do próprio relatório de auditoria — continha o valor em "
            "claro, para provar o achado que descrevia. É texto versionado: está no "
            "histórico do git, em todo clone, em todo backup do repositório.\n\n"
            "**(b) Na árvore de trabalho.** `.dev.vars:9` guarda o mesmo valor. O arquivo "
            "está corretamente ignorado (AC-334 passa), então aqui a exposição é por "
            "leitura de disco, não por repositório.\n\n"
            "**(c) No histórico.** `waha/.env:12` foi versionado em nove commits e contém "
            "o hash SHA-512 da credencial — não a chave, mas um derivado que permite "
            "verificação offline de candidatos.\n\n"
            "O achado é que a auditoria de segurança estava vazando o segredo que ela "
            "audita: o teste de regressão do próprio repositório "
            "(`c-settings-secrets.test.ts`, AC-335) reprovou por causa disso, e está "
            "reprovando até que o arquivo seja corrigido."
        ),
        evidencia=(
            "tests/spec-v2/c-settings-secrets.test.ts (AC-335, em falha)\n"
            "    expect([file, leaked]).toEqual([file, []]);\n"
            "    // file = docs/security-audit/dados_auditoria.py\n\n"
            "waha/.env:12 (em commits antigos; hoje não rastreado)\n"
            "WAHA_API_KEY_SHA512=sha512:<redigido>\n\n"
            ".dev.vars:9 (untracked, .gitignore:5)\n"
            "WAHA_API_KEY=\"<redigido>\"\n\n"
            ".gitignore:5,7\n"
            ".dev.vars\n"
            ".env\n\n"
            "commits que tocaram waha/.env:\n"
            "882b050  59d917b  563bbf2  34829fe  46f03b2\n"
            "588a256  0ce4f2d  8aab53d  484c891  90dfd83"
        ),
        impacto=(
            "Comprometimento da credencial da API WAHA, e portanto do canal de WhatsApp "
            "da operação: quem lê a chave pode chamar a API do engine (listar e manipular "
            "sessões, enviar mensagens em nome da empresa). Não é uma falha explorável "
            "por requisição anônima — é exposição por leitura de repositório, o que "
            "implica qualquer pessoa com acesso ao código, CI, dependência com "
            "persistência de artefato, ou cópia do projeto. Rotacionar é obrigatório "
            "mesmo após remover o arquivo do working tree, porque o histórico preserva o "
            "valor."
        ),
        correcao=(
            "1. Rotacionar a WAHA_API_KEY no engine (invalida tudo que já vazou, "
            "histórico incluído).\n"
            "2. Reescrever qualquer arquivo versionado que cite o segredo, substituindo "
            "por `arquivo:linha` com valor redigido — este relatório já vem corrigido.\n"
            "3. Purgar `waha/.env` do histórico: `git filter-repo --path waha/.env "
            "--invert-paths`, com force-push coordenado. Se reescrever for inviável, "
            "registrar que o hash está comprometido e que a rotação é obrigatória.\n"
            "4. Nunca colar segredo em texto versionado, nem como evidência: `git log -S` "
            "do prefixo basta para provar o achado."
        ),
        aceite=[
            "A WAHA_API_KEY atual é diferente da que aparece em qualquer commit (verificável com git log -S do prefixo antigo).",
            "npm test passa, incluindo AC-335, sem que nenhum arquivo rastreado carregue a chave.",
            "Nenhum arquivo rastreado contém valor de segredo; citações são arquivo:linha com valor redigido.",
            "`git log --all -- waha/.env` não retorna commits (histórico purgado) ou há registro explícito de que o hash foi commitment-rotacionado.",
            ".dev.vars continua não rastreado (AC-334) e a credencial local vem de cofre/wrangler secret, não de arquivo de texto.",
        ],
    ),
    dict(
        n=2,
        titulo="[Segurança] IDOR: agent+ altera registro de terceiro em 15 das 19 rotas de item",
        labels="security, high, idor, broken-access-control, authorization",
        problema=(
            "`routeFactory.ts` tem um gate de posse (`checkOwnership`), mas ele só se "
            "aplica às tabelas listadas em `OWNER_FIELDS` — hoje quatro: `contacts`, "
            "`conversations`, `deals`, `tasks`. Das dezenove rotas de item expostas por "
            "`createItemRoutes`, as outras quinze passam por "
            "`if (!ownerField) return null; // Sem campo de dono, permite`.\n\n"
            "Desde que o piso de escrita passou a ser `agent` (o papel que o time de "
            "vendas realmente usa), a consequência é direta: qualquer `agent` faz PUT em "
            "qualquer registro de `activities`, `appointment-types`, `calendar-events`, "
            "`catalog-products`, `conversation-notes`, `messages`, `pipelines`, "
            "`quick-replies`, `stages`, `tags`, e nas tabelas do ERP "
            "(`components`, `customers`, `ingredients`, `orders`, `products`), bastando "
            "conhecer o id.\n\n"
            "O caso mais grave é `messages`. `MESSAGES_SHAPE` inclui `text`, `fromMe`, "
            "`direction`, `createdBy`, `conversationId`, `externalId`, `remoteJid`. Não é "
            "apenas leitura indevida de registro alheio: é **reescrita de mensagem já "
            "entregue**, com marcação de direção e autoria forjadas."
        ),
        evidencia=(
            "src/server/routeFactory.ts:62-69\n"
            "const OWNER_FIELDS: Record<string, string> = {\n"
            "\tcontacts: 'assignedUserId',\n"
            "\tconversations: 'assignedUserId',\n"
            "\tdeals: 'assignedUserId',\n"
            "\ttasks: 'assigneeUserId',\n"
            "};\n\n"
            "src/server/routeFactory.ts:81-82\n"
            "\tconst ownerField = OWNER_FIELDS[table];\n"
            "\tif (!ownerField) return null; // Sem campo de dono, permite\n\n"
            "src/server/routeFactory.ts:29-34 (piso que torna isso alcançável)\n"
            "const DEFAULT_ROLES: Required<RoleConfig> = {\n"
            "\tlist: 'viewer', create: 'agent', update: 'agent', delete: 'manager',\n"
            "};\n\n"
            "src/pages/api/crm/messages/[id].ts:1-3 (sem RoleConfig, sem dono)\n"
            "import { createItemRoutes } from '../../../../server/routeFactory';\n"
            "import { MESSAGES_TABLE, MESSAGES_SHAPE } from '../../../../server/tables';\n"
            "export const { PUT, DELETE } = createItemRoutes(MESSAGES_TABLE, MESSAGES_SHAPE);\n\n"
            "src/server/tables.ts:169-175 (superfície de escrita)\n"
            "\tcolumns: [\n"
            "\t\t'ack', 'conversationId', 'createdAt', 'createdBy', 'deliveredAt', 'direction',\n"
            "\t\t'editedAt', 'externalId', 'fromMe', 'id', 'mediaMime', 'mediaUrl',\n"
            "\t\t'messageType', 'readAt', 'remoteJid', 'revokedAt', 'text', 'waStatus', ...\n"
            "\t],\n"
            "\tboolFields: ['fromMe'],"
        ),
        impacto=(
            "Um `agent` — o papel mais comum — pode alterar dados de qualquer colega e, em "
            "`messages`, reescrever o histórico de conversa do inbox e forjar autoria/direção. "
            "Como `DELETE` exige `manager`, o dano é de integridade, não de disponibilidade: "
            "o registro some de vista, mas a fraude fica. Para o inbox, whose messages são "
            "a evidência do relacionamento com o cliente, isso ébworse do que ler o que não "
            "deveria."
        ),
        correcao=(
            "1. Curto prazo, sem migration: declarar `RoleConfig` por tabela nas rotas "
            "sensíveis, com `update: 'manager'` para `messages`, `orders`, "
            "`calendar-events`, `conversation-notes` e `catalog-products`.\n"
            "2. Longo prazo: adicionar `assignedUserId` às tabelas de trabalho do CRM "
            "(`activities`, `conversation-notes`, `catalog-products`, `stages`, `tags`) com "
            "migration e entrada em `OWNER_FIELDS`; para `messages`, resolver posse pela "
            "conversa (`conversationId` → `conversations.assignedUserId`) em vez de coluna "
            "própria.\n"
            "3. Escrever o teste que hoje falha: agent + PUT em registro de terceiro = 403, "
            "para todas as tabelas, e não só para as quatro com dono."
        ),
        aceite=[
            "PUT /api/crm/messages/[id] por sessão agent em mensagem de conversa não atribuída retorna 403.",
            "Não existe rota de item reachable por agent que aceite escrita sem gate de papel ou de posse (teste que varre src/pages/api/**/[id].ts falha se alguma aparecer).",
            "messages: texto, direção, fromMe e createdBy não são alteráveis por PUT de agente em nenhuma tabela.",
            "Toda tabela com coluna de dono tem entrada em OWNER_FIELDS, ou não tem coluna de dono.",
            "Teste de tabela que falhe para qualquer tabela nova em createItemRoutes sem RoleConfig explícito quando o piso padrão exigir agente+ em dado sensível.",
        ],
    ),
    dict(
        n=3,
        titulo="[Segurança] checkOwnership falha aberto quando o registro não tem dono, e o schema garante esse caso",
        labels="security, medium, authorization, idor, data-model",
        problema=(
            "Mesmo nas quatro tabelas com dono, a checagem cede quando o campo está "
            "vazio:\n\n"
            "```ts\nconst ownerId = (entity as Record<string, unknown>)[ownerField];\n"
            "if (!ownerId) return null; // Sem dono definido, permite\n```\n\n"
            "O comentário assume que \"sem dono definido\" é estado legítimo. O schema "
            "garante o contrário: `DEFAULT ''` em `contacts` e `deals` "
            "(migration 0018), `tasks.assigneeUserId` (0003) e "
            "`conversations.assignedUserId` (0003). Todo registro criado sem atribuição "
            "explícita nasce sem dono — e nesse estado a proteção existe no código e não "
            "dispara no dado.\n\n"
            "O efeito é invertido ao que se espera de um controle de posse: quanto mais "
            "antigo o registro (ou criado por um caminho que não preenche atribuição), "
            "menos protegido. A condição étrivial de alcançar — um contato importado, uma "
            "conversa criada pelo webhook sem atribuição."
        ),
        evidencia=(
            "src/server/routeFactory.ts:84-89\n"
            "\tconst entity = await getEntity(db, table, shape, id);\n"
            "\tif (!entity) return notFound();\n\n"
            "\tconst ownerId = (entity as Record<string, unknown>)[ownerField] as\n"
            "\t\tstring | undefined;\n"
            "\tif (!ownerId) return null; // Sem dono definido, permite\n\n"
            "migrations/0018_add_assigned_user_to_contact_deal.sql:12,15\n"
            "ALTER TABLE contacts ADD COLUMN assignedUserId TEXT NOT NULL DEFAULT '';\n"
            "ALTER TABLE deals ADD COLUMN assignedUserId TEXT NOT NULL DEFAULT '';\n\n"
            "migrations/0003_crm.sql:66 (tasks)\n"
            "  assigneeUserId TEXT NOT NULL DEFAULT '',\n\n"
            "migrations/0003_crm.sql:99 (conversations)\n"
            "  assignedUserId TEXT NOT NULL DEFAULT '',"
        ),
        impacto=(
            "Escritura por `agent` em qualquer registro sem dono, de forma silenciosa: o "
            "código de autorização decide que pode, o resultado é 200, e não há log "
            "registrando que a checagem foi omitida. Como a linha não tem dono, também não "
            "existe rastro que permita dizer depois quem poderia ter escrito."
        ),
        correcao=(
            "Escolher explicitamente uma das duas semânticas e implementá-la no schema, não "
            "no default.\n\n"
            "**(a) Falhar fechado:** `if (!ownerId) return json({ error: 'nao_autorizado' "
            "}, 403)` para papéis abaixo de manager. Correção de uma linha, sem migration, "
            "e é o que o resto do app já faz para segredo recusado.\n\n"
            "**(b) Atribuição obrigatória:** `NOT NULL` sem default, com backfill "
            "preenchendo `assignedUserId` a partir do primeiro admin, e atribuição "
            "obrigatória na criação. Mais fiel ao modelo, mais caro de migrar.\n\n"
            "Independente da escolha: log quando a checagem de posse for omitida por falta "
            "de dono, para que o dado sem dono apareça."
        ),
        aceite=[
            "Registro com assignedUserId/assigneeUserId vazio não pode ser alterado por agent (403), ou a semântica escolhida está documentada e testada.",
            "Existe teste que cria explicitamente uma linha sem dono e demonstra o comportamento escolhido.",
            "Nenhuma migration nova cria coluna de dono com DEFAULT ''.",
            "A omissão da checagem por falta de dono gera entrada de log/auditoria.",
        ],
    ),
    dict(
        n=4,
        titulo="[Segurança] PUT aceita campos de atribuição e autoria: autoatribuição e falsificação de autoria",
        labels="security, medium, mass-assignment, idor, authorization",
        problema=(
            "O `updateHandler` repassa o corpo do PUT direto ao merge, e a única "
            "restrição é a coluna existir no `shape`. Como os shapes incluem os campos de "
            "atribuição e autoria, três jogadas ficam disponíveis:\n\n"
            "**(a) Autoatribuição.** `PUT` com `assignedUserId: <meu id>` no corpo move o "
            "registro para si — inclusive nas quatro tabelas que *têm* dono, porque o gate "
            "compara o dono persistido, e o dono novo vai na mesma requisição. Um agente "
            "toma o contato de outro em uma chamada, sem nenhum 403.\n\n"
            "**(b) Falsificação de autoria.** `createdBy`/`authorUserId` são colunas "
            "comuns nos shapes e são graváveis: um agente escreve que a mensagem ou a "
            "atividade foi criada por outra pessoa.\n\n"
            "**(c) Reescrita de direção.** Em `messages`, `text` + `fromMe` + `direction` "
            "mudar juntos transforma mensagem recebida em enviada, ou o contrário — "
            "compartilhado com a issue 2, mas com vetor próprio (mass assignment, não "
            "falta de posse)."
        ),
        evidencia=(
            "src/server/routeFactory.ts:176-183\n"
            "\t\tconst patch = (await context.request.json()) as {\n"
            "\t\t\tid?: string;\n"
            "\t\t} & Record<string, unknown>;\n"
            "\t\tconst invalid = refuseInvalid(shape, patch);\n"
            "\t\tif (invalid) return invalid;\n"
            "\t\tconst saved = await updateEntity(\n"
            "\t\t\tgetDb(), table, shape, context.params.id!, patch\n"
            "\t\t);\n\n"
            "src/server/crud.ts:59-65 (merge sem allowlist própria)\n"
            "\tconst merged = { ...existing, ...patch } as T;\n"
            "\tconst row = entityToRow(merged as Record<string, unknown>, shape);\n"
            "\tconst { sql, values } = buildUpdate(table, id, row, shape.columns);\n\n"
            "src/server/tables.ts:169-175 (createdBy, fromMe, direction são colunas do shape)\n"
            "\tcolumns: ['ack', 'conversationId', 'createdAt', 'createdBy', 'deliveredAt',\n"
            "\t\t'direction', ..., 'fromMe', ..., 'text', ...],\n"
            "\tboolFields: ['fromMe'],"
        ),
        impacto=(
            "Autoatribuição contorna a única proteção de posse que existe (issue 3) sem "
            "precisar de nenhuma condição especial — basta o gate de posse ver o dono "
            "antigo. Falsificação de autoria quebra a trilha de auditoria do CRM: "
            "`action_log` registra quem fez a operação, mas o registro aponta outra pessoa "
            "como autora, e as duas informações passam a discordar sem sinal."
        ),
        correcao=(
            "Separar campo de criação de campo de manutenção:\n\n"
            "- `assignedUserId`/`assigneeUserId`: ignorar o valor do corpo e derivar de "
            "`locals.user.id` (com um caso explícito de reatribuição por manager/admin, "
            "que é operação legítima de gestão).\n"
            "- `createdBy`/`authorUserId`: preenchidos na criação, nunca aceitos no PUT. "
            "- `fromMe`/`direction`: mudados apenas por caminho de sistema (ingest do "
            "webhook), não pela API de CRUD.\n\n"
            "A forma mecânica de garantir é uma lista `IMMUTABLE_FIELDS` por tabela "
            "verificada antes do merge, com teste que falhe para PUT tentando mudar "
            "`createdBy` em qualquer tabela."
        ),
        aceite=[
            "PUT com assignedUserId no corpo não altera o dono do registro (o valor vem do locals.user ou é ignorado).",
            "PUT com createdBy/authorUserId no corpo não altera a autoria registrada.",
            "PUT com fromMe/direction em messages retorna 400 ou é ignorado, fora do caminho de ingest.",
            "Existe lista de campos imutáveis por tabela e teste que cobre, no mínimo, createdBy e assignedUserId.",
        ],
    ),
    dict(
        n=5,
        titulo="[Segurança] Webhook WAHA: template nasce com assinatura desligada e o modo estrito falha aberto sem segredo utilizável",
        labels="security, medium, webhook, fail-open, config-default",
        problema=(
            "Duas falhas encostadas, com o mesmo efeito prático: nenhum request é "
            "autenticado por assinatura.\n\n"
            "**(a) Default inseguro no template.** `.dev.vars.example:34-35` traz "
            "`WAHA_HMAC_SECRET=\"\"` e `WAHA_WEBHOOK_REQUIRE_SIGNATURE=\"\"`. Quem copia o "
            "template — o caminho natural, já que o resto vem preenchido — e não edita "
            "esses dois campos sobe o receiver com a verificação desligada. O comentário "
            "do próprio template avisa que vazio desliga.\n\n"
            "**(b) fail-open na combinação flag+segredo.** Em "
            "`authenticateWahaWebhook`, a recusa de payload sem assinatura exige as duas "
            "condições:\n\n"
            "```ts\nif (config.requireSignature && config.hmacSecret) {\n"
            "\treturn { ok: false, reason: 'missing_signature', ... };\n"
            "}\nreturn { ok: true, reason: 'ok', signatureVerified: false };\n```\n\n"
            "Se o operador liga `REQUIRE_SIGNATURE=true` mas o segredo é recusado por "
            "`usableSecret` (placeholder, curto, vazio), `hmacSecret` é `null`, a conjunção "
            "falha e a execução cai no `return { ok: true }` final. A configuração que o "
            "operador entende como \"mais segura\" resulta em nenhuma verificação — e o "
            "comentário nas linhas 33-34 do mesmo arquivo afirma o oposto: \"um segredo "
            "recusado DEIXA A VERIFICACAO DESLIGADA (fail-closed, nunca fail-open)\".\n\n"
            "O caminho de assinatura presente está correto (nega sem segredo, compara em "
            "tempo constante); o defeito é só a combinação."
        ),
        evidencia=(
            ".dev.vars.example:33-35\n"
            "# Um segredo de uso unico por ambiente: `openssl rand -hex 32`.\n"
            "# Vazio DESLIGA a verificacao de assinatura; um segredo curto (<32) tambem e\n"
            "# recusado e o receiver falha fechado. Copie este arquivo e troque o valor.\n"
            "WAHA_HMAC_SECRET=\"\"\n"
            "WAHA_WEBHOOK_REQUIRE_SIGNATURE=\"\"\n\n"
            "src/server/wahaWebhook.ts:33-34 (o que o código promete)\n"
            "// curtas sao recusados, e um segredo recusado DEIXA A VERIFICACAO DESLIGADA\n"
            "// (fail-closed, nunca fail-open).\n\n"
            "src/server/wahaWebhook.ts:44-49 (recusa de segredo inutilizavel)\n"
            "function usableSecret(value: string | null): string | null {\n"
            "\tif (!value) return null;\n"
            "\tif (PLACEHOLDER_SECRETS.has(value.trim().toLowerCase())) return null;\n"
            "\tif (value.length < HMAC_MIN_BYTES) return null;\n"
            "\treturn value;\n"
            "}\n\n"
            "src/server/wahaWebhook.ts:82-85 (o que o código faz)\n"
            "\tif (config.requireSignature && config.hmacSecret) {\n"
            "\t\treturn { ok: false, reason: 'missing_signature', signatureVerified: false };\n"
            "\t}\n"
            "\treturn { ok: true, reason: 'ok', signatureVerified: false };\n\n"
            "tests/server/wahaWebhook.test.ts:102 (a prova viva do fail-open)\n"
            "  const auth = await authenticateWahaWebhook(request(BODY, 'anything'),\n"
            "    { hmacSecret: null, requireSignature: true });\n"
            "  // o teste afirma que o payload é aceito neste caso"
        ),
        impacto=(
            "Qualquer POST em `/api/whatsapp/webhook` é aceito, arquivado e ingerido no "
            "CRM sem autenticação. O que o atacante controla vai para o inbox: mensagens, "
            "ticks de entrega e updates de status, com `externalId` e `remoteJid` "
            "forjáveis. Isso permite forjar conversas e adulterar o histórico de delivery "
            "que o painel mostra. A rota é `PUBLIC_PATHS`, então nenhum middleware a "
            "protege — a assinatura é a única fronteira."
        ),
        correcao=(
            "1. Inverter a condição para que a recusa dependa só da flag:\n"
            "   `if (config.requireSignature && !signature) return { ok: false, reason: "
            "'missing_signature' }`. Modo estrito sem segredo utilizável passa a recusar "
            "todo request, que é o fail-closed prometido.\n"
            "2. Trocar o default do template para `WAHA_WEBHOOK_REQUIRE_SIGNATURE=\"true\"`, "
            "marcando o segredo como obrigatório; se o modo aberto for necessário em dev, "
            "que seja explícito e comentado.\n"
            "3. Falhar no startup (não no request) quando o modo estrito não tiver "
            "segredo — hoje a recusa é por request, então o sintoma é \"a verificação não "
            "existe\" em vez de um erro de configuração.\n"
            "4. Atualizar o teste de `tests/server/wahaWebhook.test.ts:102`, que hoje "
            "consagra o comportamento fail-open."
        ),
        aceite=[
            "authenticateWahaWebhook com requireSignature=true e hmacSecret=null recusa payload sem assinatura (missing_signature).",
            "O teste que hoje afirma o contrário foi alterado, e há teste para assinatura presente + segredo ausente (bad_signature).",
            ".dev.vars.example traz REQUIRE_SIGNATURE=true e o segredo marcado como obrigatório.",
            "UmReceiver com modo estrito e segredo inválido falha no boot com erro de configuração, não apenas em request.",
            "POST sem header x-webhook-hmac no receiver em modo estrito não altera nenhum registro no D1.",
        ],
    ),
    dict(
        n=6,
        titulo="[Segurança] Controles que não controlam: npm audit sem gate e assertNoSeedCredential fora do boot",
        labels="security, low, ci, fail-open, configuration",
        problema=(
            "Dois controles existem, estão escritos corretamente, e não produzem efeito "
            "porque nenhum ponto do sistema os invoca no momento em que decides.\n\n"
            "**(a) `npm audit` não bloqueia.** O step da CI roda "
            "`npm audit --audit-level=high` com `continue-on-error: true`. Vulnerabilidade "
            "high ou critical produz step marcado como sucesso: o job aparece verde no "
            "relatório da CI. Um controle que não controla é pior que a ausência dele, "
            "porque cria confiança falsa.\n\n"
            "**(b) `assertNoSeedCredential` não é chamada no boot.** A função falha "
            "fechado enquanto existe hash de seed reproduzível, com mensagem explícita — e "
            "seus únicos consumidores são o próprio script de bootstrap e os testes. "
            "Nenhuma chamada em `src/server`, nenhuma em `worker.ts`. O entrypoint sobe sem "
            "verificar nada. O mesmo vale para a configuração do webhook: segredo ausente "
            "não gera erro de boot, vira degradação silenciosa em runtime (issue 5).\n\n"
            "O fechamento do achado de senha de seed da auditoria anterior é real — o seed "
            "não grava hash reproduzível e `bootstrap-admin.ts:26-32` sorteia a senha com "
            "`crypto.getRandomValues`. O que falta é o fail-closed que protege o estado "
            "herdado estar ligado ao processo que sobe a aplicação."
        ),
        evidencia=(
            ".github/workflows/ci.yml:142-144\n"
            "      - name: Run npm audit\n"
            "        run: npm audit --audit-level=high\n"
            "        continue-on-error: true\n\n"
            "src/server/seedCredential.ts:36-43\n"
            "// Fail-closed: refuses to continue while a replayable admin credential exists.\n"
            "export async function assertNoSeedCredential(db: Database): Promise<void> {\n"
            "\tconst users = await listEntities<{ email: string; passwordHash: string }>(\n"
            "\t\tdb, USERS_TABLE, USERS_SHAPE\n"
            "\t);\n"
            "\tconst offender = users.find((user) => isLegacySeedHash(user.passwordHash));\n"
            "\tif (offender) throw new SeedCredentialError(offender.email);\n"
            "}\n\n"
            "src/worker.ts:12-25 (o boot não verifica nada)\n"
            "export default {\n"
            "\tasync fetch(request: Request, env: Env, ctx: ExecutionContext) {\n"
            "\t\tconst state = new FetchState(request);\n"
            "\t\tconst asset = await cf(state, env, ctx);\n"
            "\t\tif (asset) return asset;\n"
            "\t\treturn finalize(state, await astro(state));\n"
            "\t},\n"
            "\tasync scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {\n"
            "\t\tawait runRetention(env.DB, env);\n"
            "\t}\n"
            "};\n\n"
            "grep -rn assertNoSeedCredential src/ scripts/ tests/\n"
            "  scripts/bootstrap-admin.ts:59,87\n"
            "  tests/spec-v2/c-settings-secrets.test.ts:135-141\n"
            "  (nenhuma em src/server nem em worker.ts)"
        ),
        impacto=(
            "Indireto, e é por isso que fica em baixa. (a) Um CVE high em dependência "
            "transita sem bloquear merge, e o sinal verde na CI é o oposto do que deveria "
            "comunicar. (b) Um deploy com credencial legada de seed, ou com webhook em "
            "modo aberto, sobe \"normalmente\": o problema só aparece quando alguém usa — e "
            "a defesa que existe para impedi-lo não está no caminho."
        ),
        correcao=(
            "1. Remover `continue-on-error` do step de `npm audit` (ou manter o step "
            "tolerante e adicionar condição de falha separada para `critical`, com o "
            "relatório enviado como artifact).\n"
            "2. Chamar `assertNoSeedCredential(env.DB)` no boot do Worker — uma vez, com "
            "cache por isolate ou verificado no bundle — e falhar o deploy quando ela "
            "lançar. Na mesma passagem, validar a configuração do WAHA: `WAHA_API_KEY` "
            "presente e `WAHA_HMAC_SECRET` utilizável quando `REQUIRE_SIGNATURE=true`.\n"
            "3. Alternativa mais leve e mais garantida: um `npm run preflight` obrigatório "
            "no pipeline, com a checagem rodando contra o D1 remoto — desde que o pipeline "
            "não seja opcional nem esteja commented out."
        ),
        aceite=[
            "npm audit --audit-level=high falha o job quando há vulnerabilidade high (ou critical, conforme a política escolhida).",
            "assertNoSeedCredential é chamada no boot do Worker / em preflight obrigatório, e o deploy falha quando existe hash legado.",
            "Config ausente ou inválida do WAHA produz erro de boot, não apenas resposta 200 silenciosa em runtime.",
            "Existe teste que falha se assertNoSeedCredential perder o único consumidor de produção.",
        ],
    ),
]