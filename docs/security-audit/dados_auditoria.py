# -*- coding: utf-8 -*-
"""
Base de dados da auditoria de seguranca do atelie-erp.

Cada achado e' um dict verificado no codigo real (arquivo:linha + trecho).
NAO edite este arquivo para "corrigir" severidade sem reverificar o codigo.
"""

PROJETO = "atelie-erp"
DATA_AUDITORIA = "02 de outubro de 2026"

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
        id="C1-01", cat="cat1", sev="alta",
        titulo="Exportação LGPD devolve mensagens, clientes e pedidos de TODO o sistema",
        arquivos=[
            ("src/pages/api/me/data.ts", "73", "messages: all.messages,"),
            ("src/pages/api/me/data.ts", "76-77",
             "customers: all.customers,\n\t\torders: all.orders,"),
            ("src/pages/api/me/export.ts", "68", "messages: all.messages,"),
            ("src/pages/api/me/export.ts", "71-72",
             "customers: all.customers,\n\t\torders: all.orders,"),
        ],
        porque=(
            "O recorte LGPD filtra contatos, conversas, negócios, tarefas e consents por "
            "`assignedUserId`/`assigneeUserId` (selectUserRows), mas os campos `messages`, "
            "`customers` e `orders` são devolvidos SEM nenhum filtro — vêm de `all.*`, que é "
            "a base inteira carregada por `loadLgpdData`. O módulo existe justamente para "
            "devolver apenas os dados do titular, então a rota entrega mais do que promete: "
            "qualquer sessão autenticada, de qualquer papel, recebe a lista completa de "
            "clientes (nome/telefone/e-mail) e de pedidos do D1. É um vazamento de dados "
            "pessoais entre usuários, exposto por uma rota de privacidade."
        ),
        cond="Qualquer usuário autenticado (inclusive `viewer`) chama GET /api/me/export ou GET /api/me/data. Não exige feature flag.",
        correcao=(
            "Filtrar `messages` pelo conjunto de conversas do titular e derivar "
            "`customers`/`orders` dos contatos filtrados, ou remover esses três campos do "
            "recorte. Adicionar teste que falhe se um usuário sem atribuição receber "
            "qualquer linha de customers/orders/messages."
        ),
    ),
    dict(
        id="C1-02", cat="cat1", sev="media",
        titulo="SSE faz broadcast de todas as mensagens e do contato (telefone/nome) para qualquer sessão",
        arquivos=[
            ("src/pages/api/crm/events.ts", "31-38",
             "`SELECT m.*, c.name as contact_name, c.phone as contact_phone\n"
             " FROM messages m\n"
             " LEFT JOIN contacts c ON m.conversationId = c.id\n"
             " WHERE m.createdAt > ?\n"
             " ORDER BY m.createdAt ASC`"),
            ("src/pages/api/crm/events.ts", "172", "'Access-Control-Allow-Origin': '*'"),
            ("src/pages/api/crm/events.ts", "137",
             "const queryToken = url.searchParams.get('token');"),
        ],
        porque=(
            "O stream de eventos não tem recorte: ele emite `m.*` (todas as mensagens do "
            "sistema) junto com `contact_name`/`contact_phone` de todos os contatos, para "
            "qualquer sessão autenticada. Some-se a isso `Access-Control-Allow-Origin: *` e "
            "ao token transportado por query string (`?token=`), que é o único jeito de o "
            "EventSource autenticar. O token em URL vaza para log de acesso, header "
            "Referer e histórico do navegador — exatamente o risco que o comentário do "
            "próprio middleware reconhece ao justificar a exceção."
        ),
        cond="Sessão autenticada + EventSource aberto. ACAO:* significa que qualquer origem que consiga o token lê o stream.",
        correcao=(
            "Trocar a exceção de token-em-URL por um cookie `HttpOnly; Secure; SameSite=Strict` "
            "de sessão (o EventSource envia cookies), removendo o `?token=` e o ACAO:*."
        ),
    ),
    dict(
        id="C1-03", cat="cat1", sev="baixa",
        titulo="Mecanismo de isolamento é a ausência de isolamento: listEntities devolve a tabela inteira",
        arquivos=[
            ("src/server/crud.ts", "16",
             "const stmt = db.prepare(`SELECT * FROM ${table}`);"),
            ("migrations/0003_crm.sql", "2",
             "-- Single-tenant: no organization_id; lightweight sessions in D1; money in"),
        ],
        porque=(
            "Não existe RLS (o projeto não usa Supabase), nem middleware de tenant, nem "
            "coluna owner/org — o schema declara single-tenant e todas as listagens são um "
            "`SELECT *` sem filtro. Isto é uma DECISÃO DE PROJETO documentada no README "
            "(\"As listagens devolvem a base inteira\"), não um descuido. O risco é que essa "
            "premissa é silenciosa: qualquer rota nova herdada de createCollectionRoutes "
            "nasce global, e `assignedUserId`/`assigneeUserId` parecem fronteira de "
            "segurança mas são só metadado de atribuição."
        ),
        cond="Qualquer sessão válida vê a base inteira. Aceito por desenho; registrado para que não seja tratado como garantia.",
        correcao=(
            "Manter, mas registrar a decisão como invariante: documente que qualquer rota "
            "nova precisa de um gate explícito de papel, e considere um teste que falhe se "
            "um `viewer` conseguir escrever."
        ),
    ),

    # ------------------------------------------------------------- CATEGORIA 2
    dict(
        id="C2-01", cat="cat2", sev="critica",
        titulo="Escalada de privilégio: `manager` cria conta `admin` em POST /api/users (o PUT equivalente exige admin)",
        arquivos=[
            ("src/pages/api/users/index.ts", "13",
             "const USER_MANAGERS: Role[] = ['admin', 'manager'];"),
            ("src/pages/api/users/index.ts", "31",
             "const denied = await requireRole(context, USER_MANAGERS);"),
            ("src/pages/api/users/index.ts", "12",
             "const ROLES: Role[] = ['viewer', 'agent', 'manager', 'admin'];"),
            ("src/pages/api/users/index.ts", "39-41",
             "if (!ROLES.includes(body.role as Role)) {\n"
             "\t\treturn json({ error: 'papel_invalido' }, 400);\n\t}"),
            ("src/pages/api/users/[id].ts", "62-65",
             "function allowedRoles(body: PutBody): Role[] {\n"
             "\tconst adminOnly = ADMIN_ONLY_FIELDS.some(f => body[f] !== undefined);\n"
             "\treturn adminOnly ? ADMINS : USER_MANAGERS;\n}"),
        ],
        porque=(
            "A rota de criação aceita `['admin','manager']` e valida o papel pedido apenas "
            "contra a lista de papéis válidos — que inclui `admin`. Um `manager` (papel "
            "intermediário, não-administrador) envia POST com `role:'admin'` e uma senha "
            "escolhida por ele, criando um administrador full. O próprio projeto já "
            "corrigiu isso na rota irmã: `PUT /api/users/[id]` usa `allowedRoles()`, que "
            "exige `['admin']` quando o corpo traz `role` ou `password`. O POST ficou de "
            "fora dessa regra — a validação existe no código e simplesmente não foi "
            "aplicada aqui. A UI não é a fronteira: `CrmEquipeView` oferece os quatro "
            "papéis no select (roleOptions(), linhas 237-242) e não limita a escolha por "
            "papel do operador."
        ),
        cond="Qualquer sessão com papel `manager`. Sem feature flag: o gate real é só a lista USER_MANAGERS.",
        correcao=(
            "Reusar `allowedRoles(body)` no POST (ou exigir `ADMINS` quando `body.role` "
            "for `admin`), e adicionar teste que falhe para POST com role=admin por manager."
        ),
    ),
    dict(
        id="C2-02", cat="cat2", sev="alta",
        titulo="Papel `viewer` (“Visualização”) tem poder de escrita e exclusão em todas as entidades",
        arquivos=[
            ("src/server/routeFactory.ts", "39-57",
             "export function createCollectionRoutes(table: string, shape: TableShape) {\n"
             "\tconst GET: APIRoute = async () => { /* ... */ };\n"
             "\tconst POST: APIRoute = async (context) => { /* ... */ };"),
            ("src/server/routeFactory.ts", "59-80",
             "export function createItemRoutes(table: string, shape: TableShape) {\n"
             "\tconst PUT: APIRoute = async (context) => { /* ... */ };\n"
             "\tconst DELETE: APIRoute = async (context) => { /* ... */ };"),
            ("src/ui/views/crm/CrmEquipeView.ts", "12", "viewer: 'Visualização',"),
            ("src/domain/crm.ts", "5",
             "export type Role = 'viewer' | 'agent' | 'manager' | 'admin';"),
        ],
        porque=(
            "As fábricas que geram TODAS as rotas de entidade (contatos, conversas, "
            "mensagens, negócios, tarefas, pipelines, etapas, etiquetas, agenda, catálogo, "
            "atividades, notas, clientes, pedidos, produtos, ingredientes, componentes, "
            "movimentos de estoque) não chamam `requireRole`. Verificado por busca: "
            "`requireRole` aparece apenas em users/index.ts, users/[id].ts, settings.ts e "
            "whatsapp/session.ts. Logo o único controle é o middleware, que exige uma sessão "
            "válida — e um papel chamado “Visualização” pode `DELETE /api/crm/contacts/<id>`, "
            "`POST /api/crm/pipelines` e apagar pedidos. O rótulo comercial diz o que o "
            "papel não cumpre."
        ),
        cond="Qualquer sessão válida, de qualquer papel. Não há feature flag: a ausência de gate é total nas rotas geradas.",
        correcao=(
            "Dar a createCollectionRoutes/createItemRoutes uma lista de papéis permitidos por "
            "operação (leitura: todos; escrita: agent+; exclusão: manager+) e validar com "
            "`requireRole` antes de tocar o D1."
        ),
    ),
    dict(
        id="C2-03", cat="cat2", sev="media",
        titulo="Gate de papel do frontend mais permissivo que o endpoint em excluir usuário",
        arquivos=[
            ("src/ui/views/crm/CrmEquipeView.ts", "102-104",
             "const canRemove =\n"
             "\t\t(me?.role === 'admin' || me?.role === 'manager') &&\n"
             "\t\t(me?.id !== user.id || others.length === 0);"),
            ("src/pages/api/users/[id].ts", "50",
             "const denied = await requireRole(context, ADMINS);"),
            ("src/pages/api/users/[id].ts", "17", "const ADMINS: Role[] = ['admin'];"),
        ],
        porque=(
            "A tela de Equipe mostra o botão Excluir para `manager`, mas o endpoint exige "
            "`['admin']`. O servidor está certo e a UI mente sobre a capacidade — o "
            "operador clica e leva 403. É o espelho do C2-01: aqui o frontend é mais "
            "permissivo, lá o frontend é permissivo e o backend também. Nos dois casos a "
            "verdade está no servidor, mas a inconsistência mostra que o gate de papel não "
            "é uma fonte única."
        ),
        cond="Qualquer sessão `manager` na tela /equipe.",
        correcao="Derivar a lista de papéis de uma constante compartilhada (ex.: um `can(user, action)` no servidor consumido pela UI), em vez de repetir literais nos dois lados.",
    ),
    dict(
        id="C2-04", cat="cat2", sev="media",
        titulo="Botão “+ Novo usuário” é renderizado sem nenhum gate de papel",
        arquivos=[
            ("src/ui/views/crm/CrmEquipeView.ts", "42-47",
             "function pageHead(): string {\n"
             "\tconst btn =\n"
             "\t\t'<button class=\"btn btn-primary\" id=\"new-user\">' +\n"
             "\t\t'+ Novo usuário</button>';\n"
             "\treturn section('Equipe', 'Usuários e papéis do sistema', btn);\n}"),
            ("src/ui/views/crm/CrmEquipeView.ts", "139",
             "qs('#new-user', root).addEventListener('click', () => openUserForm(ctx));"),
        ],
        porque=(
            "`pageHead()` não recebe o contexto nem o usuário, e monta o botão sempre. "
            "Um `viewer` vê e clica em “+ Novo usuário”; só o 403 do servidor impede a "
            "criação. Nenhuma UI de papel está escondendo a ação privilegiada — a "
            "autorização é inteiramente tardia e invisível para o operador."
        ),
        cond="Qualquer sessão autenticada na rota /equipe.",
        correcao="Condicionar o botão ao papel do usuário atual e desabilitar o submit quando o POST voltar 403.",
    ),
    dict(
        id="C2-05", cat="cat2", sev="baixa",
        titulo="`ROLE_RANK` existe mas nunca é usada — a hierarquia de papéis não é aplicada",
        arquivos=[
            ("src/domain/crm.ts", "166-171",
             "export const ROLE_RANK: Record<Role, number> = {\n"
             "\tviewer: 0,\n\tagent: 1,\n\tmanager: 2,\n\tadmin: 3\n};"),
        ],
        porque=(
            "Busca em `src/` e `tests/` retorna apenas a definição: nenhum consumidor. O "
            "rank foi feito para decisões de autorização do tipo “manager ⊇ agent”, mas os "
            "gates comparam listas explícitas (`['admin','manager']`), então a hierarquia é "
            "código morto. Isso enfraquece o argumento de que “o papel é a fronteira de "
            "segurança”: o modelo de papéis é informal e só vale o que cada lista escrita "
            "à mão disser."
        ),
        cond="N/A — código morto.",
        correcao="Usar `ROLE_RANK[user.role] >= ROLE_RANK[required]` em `requireRole`, ou remover ROLE_RANK e a menção a hierarquia.",
    ),

    # ------------------------------------------------------------- CATEGORIA 3
    dict(
        id="C3-01", cat="cat3", sev="alta",
        titulo="createItemRoutes faz PUT/DELETE por id sem checar posse nem papel (24 rotas [id])",
        arquivos=[
            ("src/server/routeFactory.ts", "60-72",
             "const PUT: APIRoute = async (context) => {\n"
             "\t\tconst patch = (await context.request.json()) as { id?: string; } & Record<string, unknown>;\n"
             "\t\tconst saved = await updateEntity(\n"
             "\t\t\tgetDb(), table, shape, context.params.id!, patch\n"
             "\t\t);\n"
             "\t\treturn saved ? json(saved) : notFound();\n\t};"),
            ("src/server/routeFactory.ts", "74-77",
             "const DELETE: APIRoute = async (context) => {\n"
             "\t\tawait deleteEntity(getDb(), table, context.params.id!);\n"
             "\t\treturn json({ ok: true });\n\t};"),
            ("src/pages/api/crm/contacts/[id].ts", "3",
             "export const { PUT, DELETE } = createItemRoutes(CONTACTS_TABLE, CONTACTS_SHAPE);"),
            ("src/pages/api/orders/[id].ts", "3",
             "export const { PUT, DELETE } = createItemRoutes(ORDERS_TABLE, ORDERS_SHAPE);"),
        ],
        porque=(
            "O `id` vem de `context.params` e vai direto para o UPDATE/DELETE, sem nenhuma "
            "comparação de `assignedUserId`/`assigneeUserId` nem gate de papel. Todos os "
            "handlers `[id].ts` são um alias de duas linhas para essa fábrica — foram "
            "percorridos todos: contatos, conversas, mensagens, negócios, tarefas, "
            "pipelines, etapas, respostas-rápidas, agenda, catálogo, atividades, notas, "
            "etiquetas, tipos de agenda, clientes, pedidos, produtos, ingredientes, "
            "componentes, usuários. Efeito concreto: um `viewer` apaga qualquer contato, "
            "qualquer pedido ou qualquer negócio pelo id. Também não há checagem de "
            "propriedade para registros que TEM dono declarado (`contacts.assignedUserId`, "
            "`tasks.assigneeUserId`, `deals.assignedUserId`)."
        ),
        cond="Qualquer sessão válida + conhecimento do id (os ids são devolvidos pelas listagens, que não filtram).",
        correcao=(
            "Antes do write, resolver o registro e exigir (a) papel mínimo para a operação e "
            "(b) quando a tabela tiver coluna de dono, `registro.<dono> === user.id || "
            "user.role em ('manager','admin')`. Centralizar na fábrica para não depender de "
            "cada rota."
        ),
    ),
    dict(
        id="C3-02", cat="cat3", sev="alta",
        titulo="IDOR no envio de WhatsApp: qualquer usuário envia mensagem em qualquer conversa",
        arquivos=[
            ("src/pages/api/whatsapp/send.ts", "26-31",
             "const message = await sendWahaText(db, client, {\n"
             "\t\t\tconversationId: parsed.value.conversationId,\n"
             "\t\t\ttext: parsed.value.text,\n"
             "\t\t\tuserId: user.id,\n"
             "\t\t\treplyTo: parsed.value.replyTo\n"
             "\t\t});"),
            ("src/server/wahaSend.ts", "62-79",
             "async function loadWahaConversation(\n"
             "\tdb: Database, conversationId: string\n"
             "): Promise<Conversation> {\n"
             "\tconst conversation = await getEntity<Conversation>(\n"
             "\t\tdb, CONVERSATIONS_TABLE, CONVERSATIONS_SHAPE, conversationId\n"
             "\t);\n"
             "\tif (!conversation) { throw new WahaSendError('conversation_not_found', ...); }\n"
             "\tif (conversation.channel !== 'whatsapp') { throw new WahaSendError('wrong_channel', ...); }\n"
             "\treturn conversation;\n}"),
            ("src/pages/api/whatsapp/send.ts", "15-16",
             "const user = await userFromToken(db, context.request);\n\tif (!user) return json({ error: 'sessao_invalida' }, 401);"),
        ],
        porque=(
            "`conversationId` vem do corpo e é resolvido por id. `loadWahaConversation` "
            "valida apenas existência e `channel === 'whatsapp'` — nunca compara "
            "`conversation.assignedUserId` com o chamador (confirmado: a string "
            "`assignedUserId` não aparece no arquivo). A rota também não tem "
            "`requireRole` (só sessão). Combinado com o C1-02/C1-03 (listagens devolvem a "
            "base inteira), qualquer `viewer` pode listar as conversas e então disparar "
            "WhatsApp para qualquer cliente do negócio — um canal comercial externo, com "
            "custo e repercussão."
        ),
        cond="Sessão autenticada de qualquer papel. Sem feature flag.",
        correcao=(
            "Exigir `assignedUserId === user.id || role em ('manager','admin')` em "
            "`loadWahaConversation` e aplicar `requireRole(['agent','manager','admin'])` na rota."
        ),
    ),
    dict(
        id="C3-03", cat="cat3", sev="media",
        titulo="GET /api/settings escreve no banco e faz merge cego do patch",
        arquivos=[
            ("src/pages/api/settings.ts", "13-19",
             "export const GET: APIRoute = async () => {\n"
             "\tconst db = getDb();\n"
             "\tconst existing = await readSettings(db);\n"
             "\tif (existing) return json(existing);\n"
             "\tawait writeSettings(db, DEFAULT_SETTINGS);\n"
             "\treturn json(DEFAULT_SETTINGS);\n};"),
            ("src/pages/api/settings.ts", "25-28",
             "const patch: Partial<Settings> = await context.request.json();\n"
             "\tconst current = (await readSettings(db)) ?? DEFAULT_SETTINGS;\n"
             "\tconst merged = { ...current, ...patch };\n"
             "\tawait writeSettings(db, merged);"),
            ("src/server/mapping.ts", "9-10",
             "// Omitting `columns` stays permissive; only `settings` does that, because\n"
             "\t// its route has no shape of its own."),
        ],
        porque=(
            "Duas coisas numa rota só de leitura: o GET grava (INSERT OR REPLACE) quando a "
            "configuração ainda não existe — estado que muda em resposta a um GET, sem "
            "gate de papel nenhum (o GET não tem requireRole). E o PUT faz merge de "
            "qualquer chave do corpo sobre o registro, porque `settings` é a única tabela "
            "sem `columns` no shape: `keepAllowed` retorna `{ ...entity }` quando não há "
            "allowlist. O PUT tem gate de manager/admin, mas o objeto gravado aceita "
            "colunas arbitrárias — o atacante escolhe o que sobrescrever dentro da linha."
        ),
        cond="Leitura por qualquer sessão; escrita por `manager`/`admin`.",
        correcao="Mover a criação do registro default para uma migration/seed; dar a `settings` uma lista explícita de colunas; validar o patch contra um schema.",
    ),
    dict(
        id="C3-04", cat="cat3", sev="baixa",
        titulo="Cobertura de auth verificada item a item — 5 rotas públicas se auto-autenticam",
        arquivos=[
            ("src/middleware.ts", "15-21",
             "const PUBLIC_PATHS = new Set([\n"
             "\t'/api/auth/login',\n\t'/api/auth/me',\n\t'/api/whatsapp/webhook',\n"
             "\t'/api/whatsapp/health',\n\t'/api/whatsapp/webhook-config',\n]);"),
            ("src/pages/api/whatsapp/health.ts", "15-16",
             "const user = await userFromToken(getDb(), context.request);\n"
             "\tif (!user) return json({ error: 'sessao_invalida' }, 401);"),
            ("src/pages/api/whatsapp/webhook-config.ts", "26-27",
             "const user = await userFromToken(getDb(), context.request);\n"
             "\tif (!user) return json({ error: 'sessao_invalida' }, 401);"),
        ],
        porque=(
            "Rotas fora de PUBLIC_PATHS recebem `locals.user` do middleware e não precisam "
            "se autenticar. As 5 de PUBLIC_PATHS pulam essa resolução, então cada uma tem "
            "que validar o token por conta própria — e todas as quatro que precisam, "
            "fazem. `webhook` (POST) não usa sessão: é autenticado por HMAC. Este achado "
            "registra a verificação positivamente, e o ponto de atenção é o inverso: como o "
            "middleware não roda a checagem de `mustChangePassword` nessas rotas, elas "
            "dependem da própria rota — uma rota nova adicionada a PUBLIC_PATHS sem "
            "`userFromToken` ficaria aberta sem erro de compilação."
        ),
        cond="N/A — verificação positiva.",
        correcao="Converter a lista em negativa: em vez de PUBLIC_PATHS, exigir sessão por padrão (já é o caso) e teste que falhe se uma rota pública não chamar userFromToken.",
    ),

    # ------------------------------------------------------------- CATEGORIA 4
    dict(
        id="C4-01", cat="cat4", sev="alta",
        titulo="Credencial de administrador padrão documentada no repositório, com salt fixo publicado no código",
        arquivos=[
            ("migrations/0004_crm_seed.sql", "5-9",
             "-- Admin user — senha padrão \"admin123\" (PBKDF2-SHA256, 100k iterações, sal\n"
             "-- \"deskcomm-seed-v1\"). Troque na primeira sessão pela tela de Equipe.\n"
             "INSERT OR IGNORE INTO users (id, name, email, passwordHash, role, createdAt) VALUES\n"
             "  ('seed-user-admin', 'Administrador', 'admin@deskcomm.local',\n"
             "   '022d504d3b3433f2cde7ac9185a4e1d340e67ed70a943dbc4ef14bf8c3174a00', 'admin', '2026-01-01T00:00:00.000Z');"),
            ("src/server/auth.ts", "26", "const SALT = 'deskcomm-seed-v1';"),
            ("src/server/auth.ts", "48-52",
             "export async function verifyPassword(\n"
             "\tpassword: string,\n\tstoredHash: string,\n\tsalt: string = SALT\n"
             "): Promise<boolean> {"),
        ],
        porque=(
            "O seed grava um admin com senha `admin123` e sal FIXO `deskcomm-seed-v1` — e "
            "esse mesmo sal está no código-fonte, num default de função. `verifyPassword` "
            "cai de volta nesse sal padrão quando a linha não tem `passwordSalt`, então o "
            "credencial é reproduzível por qualquer pessoa com o repositório. A mitigação "
            "existe e é boa: `mustChangePassword=1` (0020/0021) + middleware respondendo 403 "
            "`troca_de_senha_obrigatoria` fora da allowlist. O que não existe é "
            "validação de startup que rejeite o credencial de seed: o login retorna "
            "200 e um token de sessão válido — só a API fica fechada."
        ),
        cond="Explorável quando `npm run db:seed:remote` roda em ambiente novo sem o operador trocar a senha. O comentário de 0019 deixa o hash exposto de propósito para o UPDATE idempotente.",
        correcao=(
            "Não semear senha: gerar o admin no primeiro boot com senha aleatória exibida "
            "uma vez, ou exigir `ADMIN_INITIAL_PASSWORD` no env. Adicionar asserção de "
            "startup que aborta se `users.passwordHash` do seed ainda estiver lá."
        ),
    ),
    dict(
        id="C4-02", cat="cat4", sev="media",
        titulo="Chave WAHA real (64 hex) presente no arquivo de trabalho `.dev.vars`",
        arquivos=[
            (".dev.vars", "9",
             "WAHA_API_KEY=\"7ff62014c4d63e715d9efeffc400964dff94299ed806165134b2744dff2ec818\""),
            (".gitignore", "5", ".dev.vars"),
        ],
        porque=(
            "O arquivo contém uma credencial de formato real, não o placeholder "
            "`dev_plaintext_change_me` do `.dev.vars.example`. Verificado: `.dev.vars` NÃO é "
            "rastreado por git (`git ls-files --error-unmatch` → erro) e NÃO aparece em "
            "nenhum commit (`git log --all -S'7ff62014c4d63e71'` vazio). O controle de "
            "versionamento está correto; o risco é operacional — a chave de desenvolvimento "
            "fica em texto plano na árvore de trabalho e em qualquer backup/cópia da pasta."
        ),
        cond="Qualquer pessoa/leitor com acesso ao disco ou a um backup do diretório. Não é exposto por git.",
        correcao="Mover a chave de desenvolvimento para `wrangler secret put`/gerenciador de senhas e rodar o WAHA de dev com um `.env` fora do repositório.",
    ),
    dict(
        id="C4-03", cat="cat4", sev="media",
        titulo="App Next.js/Supabase inteiro vendorizado dentro do mesmo repositório git (4807 arquivos)",
        arquivos=[
            ("DeskcommCRM-RecipeCosting/.env.example", "1",
             "(arquivo de 25.097 bytes versionado)"),
            ("DeskcommCRM-RecipeCosting/.env.hostgator.example", "1",
             "(arquivo de 17.002 bytes versionado)"),
            ("DeskcommCRM-RecipeCosting/docker-compose.prod.yml", "1",
             "(compose de produção de outra aplicação, versionado)"),
        ],
        porque=(
            "O repositório do atelie-erp carrega uma cópia completa de um segundo produto "
            "(DeskcommCRM: Next.js + Supabase + Sentry), com 4807 arquivos rastreados "
            "(verificado): `.env.example`, `.env.hostgator.example`, "
            "`supabase/migrations/`, `Dockerfile*`, `docker-compose.prod.yml` e o histórico "
            "de CHANGELOG/HANDOFF. Os JWTs encontrados são fixtures públicos do Supabase "
            "(chave de dev documentada) e placeholders (`chave-de-mentira`), não "
            "credenciais reais — mas isso é sorte, não controle: o diretório é superfície "
            "de segredo e de ataque sem nenhuma revisão, e qualquer scanner de "
            "segredo/DAST passa a produzir ruído de um produto que nem está no escopo deste "
            "deploy."
        ),
        cond="Qualquer pessoa com acesso ao repositório recebe também o histórico desse segundo app.",
        correcao=(
            "Remover `DeskcommCRM-RecipeCosting/` do repositório do atelie-erp (git rm -r "
            "--cached e adicionar ao .gitignore), ou movê-lo para um repositório próprio e "
            "consumi-lo como submódulo/subtree explícito."
        ),
    ),
    dict(
        id="C4-04", cat="cat4", sev="baixa",
        titulo="Placeholder de `WAHA_HMAC_SECRET` é aceito como segredo válido",
        arquivos=[
            (".dev.vars", "31",
             "WAHA_HMAC_SECRET=\"gere-um-segredo-por-ambiente-openssl-rand-hex-32\""),
            ("src/server/wahaWebhook.ts", "29-35",
             "export function readWahaWebhookConfig(source: unknown): WahaWebhookConfig {\n"
             "\tconst record = source as Record<string, unknown> | null | undefined;\n"
             "\tconst secret = text(record?.WAHA_HMAC_SECRET);\n"
             "\tconst flag = record?.WAHA_WEBHOOK_REQUIRE_SIGNATURE ?? '';\n"
             "\tconst requireSignature = String(flag) === 'true';\n"
             "\treturn { hmacSecret: secret, requireSignature };\n}"),
        ],
        porque=(
            "`text()` só checa string não-vazia, então o texto de instrução "
            "`gere-um-segredo-...` passa a valer como segredo. Neste ambiente específico "
            "o efeito é fail-closed (bom): com `WAHA_WEBHOOK_REQUIRE_SIGNATURE=\"true\"` e "
            "segredo presente, todo payload sem assinatura válida é recusado com 401. O "
            "padrão é que frágil: \"não vazio\" é o único critério de validade, e se "
            "alguém trocar o placeholder por um segredo fraco (ou colar a mesma string em "
            "vários ambientes) nada reclama — e o `.dev.vars.example` deixa o campo vazio, "
            "o que DESLIGA a verificação."
        ),
        cond="Requer um valor não-vazio e errado. Com o valor atual o efeito é negação de serviço, não entrada forjada.",
        correcao="Rejeitar valores conhecidos de placeholder e segredos com menos de 32 bytes, como `readWahaConfig` já faz para a API key (`WAHA_DEV_PLACEHOLDER_KEY`).",
    ),

    # ------------------------------------------------------------- CATEGORIA 5
    dict(
        id="C5-01", cat="cat5", sev="alta",
        titulo="openModal interpola `title` sem escape; dois callers passam nome vindo do banco",
        arquivos=[
            ("src/ui/Modal.ts", "28-31",
             "backdrop.innerHTML = `\n"
             "\t<div class=\"modal\" role=\"dialog\" aria-modal=\"true\">\n"
             "\t\t<div class=\"modal-head\">\n"
             "\t\t\t<h3>${options.title}</h3>"),
            ("src/ui/views/crm/CrmContatosView.ts", "302",
             "openModal({ title: `Histórico de ${contact?.name ?? 'contato'}`, bodyHtml });"),
            ("src/ui/views/StockView.ts", "169-170",
             "const title = `Movimentar: ${ingredient.name}`;\n"
             "\tconst modal = openModal({ title, bodyHtml: formHtml(ingredient) });"),
        ],
        porque=(
            "`options.title` cai direto no innerHTML do backdrop. Os dois callers que "
            "passam dado do banco — o nome do contato e o nome do ingrediente — não "
            "escapam nada. Como qualquer sessão autenticada (mesmo `viewer`) escreve "
            "qualquer `name` via `POST/PUT /api/ingredients/:id` e "
            "`POST/PUT /api/crm/contacts/:id` (nenhum dos dois exige papel), o nome "
            "atacante fica armazenado e é renderizado em HTML para todo usuário que abrir "
            "aquele formulário — injeção de HTML armazenada. `CrmEquipeView` mostra o "
            "contraste: a linha 65-66 escapa `me.name`/`me.email` antes de usar."
        ),
        cond="Requer CSP relaxada para virar XSS de script: `script-src 'self'` (middleware.ts:31-34) bloqueia handlers inline. A injeção de HTML/atributo funciona sempre.",
        correcao="Escapar `options.title` dentro de Modal.ts (`<h3>${escapeHtml(options.title)}</h3>`), e escapar `ingredient.name`/`contact.name` nos callers.",
    ),
    dict(
        id="C5-02", cat="cat5", sev="alta",
        titulo="DashboardView renderiza `i.name` (ingrediente) cru no innerHTML",
        arquivos=[
            ("src/ui/views/DashboardView.ts", "86-88",
             "function lowStockRow(i: Ingredient): string {\n"
             "\treturn `<div class=\"calc-row\"><span>${i.name}</span>\n"
             "\t\t<span class=\"num soft\">${i.stock} / ${i.minStock} ${i.unit}</span></div>`;\n}"),
        ],
        porque=(
            "O painel do Ateliê lista os ingredientes em estoque baixo interpolando o nome "
            "sem escape algum — nem local, nem direto. `i.name` e `i.unit` são graváveis "
            "por qualquer sessão autenticada via `/api/ingredients/:id`, sem gate de papel. "
            "O vetor é o mesmo do C5-01 e o impacto é maior, porque o Dashboard é a "
            "primeira tela que qualquer usuário vê ao entrar."
        ),
        cond="Qualquer sessão válida planta o payload; a vítima precisa abrir o Dashboard do Ateliê.",
        correcao="`escapeHtml(i.name)` e `escapeHtml(i.unit)` — o mesmo padrão já usado em `CustomersView` e `CrmInboxView`.",
    ),
    dict(
        id="C5-03", cat="cat5", sev="media",
        titulo="LoginView renderiza `me.name` e `me.email` crus (injeção cross-user via PUT /api/users)",
        arquivos=[
            ("src/ui/views/LoginView.ts", "44-45",
             "`\\n    <p class=\"soft\">Sessão ativa de <strong>${me.name}</strong>` +\n"
             "`\\n      (${me.email}).</p>` +"),
            ("src/pages/api/users/[id].ts", "18",
             "const USER_MANAGERS: Role[] = ['admin', 'manager'];"),
            ("src/pages/api/users/[id].ts", "88-94",
             "function editablePatch(body: PutBody): Partial<User> {\n"
             "\tconst patch: Partial<User> = {};\n"
             "\tif (body.name !== undefined) patch.name = body.name;\n"
             "\tif (body.email !== undefined) patch.email = body.email;\n"
             "\tif (body.role !== undefined) patch.role = body.role as User['role'];\n"
             "\treturn patch;\n}"),
        ],
        porque=(
            "O `me` é o próprio usuário logado, o que sugeriria self-XSS inofensivo. Não é: "
            "`editablePatch` permite que `manager`/`admin` reescreva o `name` e o `email` de "
            "**qualquer** usuário via `PUT /api/users/[id]` (só `role`/`password` exigem "
            "admin). Um manager planta o payload no registro de um colega; quando esse "
            "colega entra e a LoginView renderiza o perfil, o HTML é injetado. A "
            "CrmEquipeView (65-66) escapa o mesmo dado — a LoginView é a cópia esquecida."
        ),
        cond="Requer um `manager`/`admin`-planted payload e a vítima entrando por LoginView.",
        correcao="`escapeHtml(me.name)` / `escapeHtml(me.email)`, ou deletar LoginView se CrmEquipeView é a tela de sessão canônica.",
    ),
    dict(
        id="C5-04", cat="cat5", sev="media",
        titulo="`escapeHtml` não escapa aspas e é usado dentro de atributos → quebra de atributo",
        arquivos=[
            ("src/domain/format.ts", "33-37",
             "export function escapeHtml(text: string): string {\n"
             "\tconst div = document.createElement('div');\n"
             "\tdiv.textContent = text ?? '';\n"
             "\treturn div.innerHTML;\n}"),
            ("src/ui/views/crm/CrmEtiquetasView.ts", "91",
             "`<span class=\"chip chip-${escapeHtml(tag.color)}\">` +"),
            ("src/ui/views/ProductsView.ts", "508-510",
             "return `<div class=\"field\"><label class=\"field-label\">${label}</label>\n"
             "\t\t\t<input class=\"input\" name=\"${name}\" value=\"${\n"
             "\t\t\t\tescapeHtml(value)\n"
             "\t\t\t}\" required></div>`;"),
            ("src/ui/views/crm/CrmWhatsAppView.ts", "308-310",
             "const safe = escapeHtml(qr);\n"
             "\tconst tag = qr.startsWith('data:')\n"
             "\t\t? `<img src=\"${safe}\" alt=\"QR do WhatsApp\" class=\"waha-qr\">`"),
        ],
        porque=(
            "`escapeHtml` escapa via textContent→innerHTML, que trata `&`, `<` e `>` mas "
            "NÃO `\"` nem `'` — porque aspas só importam em contexto de atributo. Por isso o "
            "projeto tem `escapeAtrib` (format.ts:39) e `escapeAttr` (dom.ts:65). Nos três "
            "pontos acima o valor vai para dentro de aspas de atributo usando o helper "
            "errado: `tag.color` num `class=` (gravável por qualquer autenticado em "
            "`PUT /api/crm/tags/:id`), `value=` de input de produto, e o `src=` do QR do "
            "WhatsApp (controlado pelo engine WAHA, alcançado por HTTP simples em dev). "
            "Um `\"` no payload fecha o atributo e abre Markup."
        ),
        cond="tag.color e os valores de produto são graváveis por qualquer sessão; o QR exige controlar a resposta do engine (ou MITM em dev, onde a base URL é http://localhost:3000).",
        correcao="Trocar por `escapeAtrib`/`escapeAttr` nos três pontos e unificar os dois helpers de atributo em um só.",
    ),
    dict(
        id="C5-05", cat="cat5", sev="baixa",
        titulo="numberField interpola `value` sem escape em cinco views",
        arquivos=[
            ("src/ui/views/crm/crmUi.ts", "69",
             "const attrsB = ` name=\"${name}\" value=\"${value}\" required`;"),
            ("src/ui/views/ProductsView.ts", "521",
             "`value=\"${value}\" ${required ? 'required' : ''}></div>`;"),
            ("src/ui/views/IngredientsView.ts", "195", "value=\"${value}\" required></div>`;"),
            ("src/ui/views/ComponentsView.ts", "316", "`\" value=\"${value}\" required></div>`;"),
            ("src/ui/views/SettingsView.ts", "97", "`\" value=\"${value}\" required></div>`;"),
        ],
        porque=(
            "O campo `value` de todo `<input type=\"number\">` é interpolado cru. Os "
            "parâmetros são tipados `number`, mas isso é só TypeScript: o servidor não "
            "valida tipo nenhum — `entityToRow` só restringe NOMES de coluna "
            "(mapping.ts:38, 48-58), o valor passa intacto. Um PUT com "
            "`{\"yieldUnits\": \"\\\"><img src=x onerror=...>\"}` grava a string e ela volta "
            "no formulário. `textField`, no mesmo arquivo, usa escapeHtml e "
            "`crmUi.textField` usa escapeAtrib — a lacuna é só no numberField."
        ),
        cond="Escrita por qualquer sessão autenticada (sem gate de papel nas rotas de entidade).",
        correcao="`value=\"${escapeAtrib(String(value))}\"` nas cinco implementações, e validação de tipo no servidor para os campos numéricos.",
    ),
    dict(
        id="C5-06", cat="cat5", sev="baixa",
        titulo="rowButton interpola o valor do atributo `data-*` sem escape",
        arquivos=[
            ("src/ui/views/crm/crmUi.ts", "128-131",
             "return (\n"
             "\t\t`<button class=\"btn btn-ghost btn-sm${cls}\" data-${dataset}=\"${value}\">` +\n"
             "\t\tlabel +\n"
             "\t\t'</button>'\n"
             "\t);"),
        ],
        porque=(
            "O helper compartilhado de botão de linha coloca `value` dentro de aspas de "
            "atributo sem escapar. Os valores atuais são ids de entidade gerados por "
            "`uid()`, então não há caminho praticável hoje — registrado porque o helper é "
            "usado por várias views e o contrato não documenta essa exigência."
        ),
        cond="Não explorável com os ids atuais; passaria a ser se algum caller passar texto.",
        correcao="`data-${dataset}=\"${escapeAtrib(value)}\"` e um comentário exigindo id/texto já escapado.",
    ),
    dict(
        id="C5-07", cat="cat5", sev="media",
        titulo="Token de sessão em localStorage — qualquer injeção de HTML na origem vira sequestro de sessão",
        arquivos=[
            ("src/repositories/ApiAuthRepository.ts", "20",
             "return localStorage.getItem(this.tokenKey);"),
            ("src/repositories/ApiAuthRepository.ts", "56",
             "localStorage.setItem(this.tokenKey, token);"),
        ],
        porque=(
            "O token Bearer vive em `localStorage`, legível por qualquer script que rode na "
            "origem. Os sinks de innerHTML verificados injetam HTML mas a CSP atual "
            "(`script-src 'self'`) barra a execução de script, então hoje o pior caso é "
            "injeção de HTML/form. O ponto é que o nível de dano é alto: se a CSP relaxar, "
            "ou se um sink passar a permitir `javascript:`, o mesmo bug vira account "
            "takeover completo em vez de simples deformação de HTML. `crypto.randomUUID()` "
            "para o token não muda isso."
        ),
        cond="N/A — é um amplificador dos achados C5-01..C5-04.",
        correcao="Migrar a sessão para cookie `HttpOnly; Secure; SameSite=Strict` (o que também resolve o token-em-URL do SSE, C1-02).",
    ),
]

# ------------------------------------------------------- pontos fortes (ok)
PONTOS_FORTES = [
    ("Backbone de autenticação no middleware", "src/middleware.ts:116-136",
     "Todas as rotas `/api/*` exigem sessão válida, exceto 5 caminhos explicitamente "
     "listados em PUBLIC_PATHS; o resto responde 401 `nao_autenticado`. O usuário é "
     "injetado em `locals` para os handlers."),
    ("Rotas públicas se auto-autenticam (cobertura item a item)", "health.ts:15, webhook-config.ts:26 e :58",
     "Como o middleware não resolve sessão nessas rotas, cada uma valida o token "
     "sozinha — e todas as que precisam, validam. A rota de webhook não usa sessão: "
     "autentica por HMAC."),
    ("Webhook WAHA falha fechado e compara em tempo constante", "src/server/wahaWebhook.ts:47-64 e :157-162",
     "Assinatura presente e errada é sempre recusada; `requireSignature` recusa payload "
     "sem header; `constantTimeEqual` evita vazamento por tempo. O corpo bruto é arquivado "
     "antes de qualquer parse."),
    ("Anti-SQLi: allowlist de colunas e parâmetros vinculados", "src/server/mapping.ts:38,48-58 · crud.ts:31,46,65,78",
     "`keepAllowed` descarta qualquer chave fora de `shape.columns`, o que impede "
     "contrabandear nome de coluna (e portanto SQL) via JSON. Todo valor vai por "
     "`bind()` com placeholder `?`."),
    ("Senhas: PBKDF2-SHA256 100k com salt aleatório por usuário", "src/server/auth.ts:41-46, 218-221",
     "Cada gravação de senha sorteia 16 bytes de sal (`crypto.getRandomValues`) e grava "
     "hash+salt; o sal fixo do seed é só fallback de compatibilidade."),
    ("Ciclo de vida de sessão previsível", "src/server/auth.ts:27, 120-147",
     "TTL de 30 dias, `revokeOtherSessions` na troca de senha e `deleteSessionsForUser` "
     "no login — uma sessão ativa por usuário."),
    ("Rate limit de login em D1, não em memória do isolate", "src/server/rateLimit.ts · src/middleware.ts:58-64",
     "5 tentativas de login e 3 de troca de senha por janela de 15 min, com contador "
     "persistido — resiste ao restart de deploy e à dispersão por colo."),
    ("Bloqueio da API enquanto a senha do seed não é trocada", "src/middleware.ts:25-29, 138-144",
     "`mustChangePassword=1` produz 403 `troca_de_senha_obrigatoria` fora de uma "
     "allowlist de três rotas — é o que de fato inutiliza a credencial padrão (C4-01)."),
    ("Guarda de mesma-origem nas rotas de sessão", "src/server/origin.ts:10-19",
     "`login`, `logout`, `me` e `change-password` rejeitam `Origin` divergente; clientes "
     "sem header (o engine WAHA) passam."),
    ("Cabeçalhos de segurança e CSP restritiva", "src/middleware.ts:31-56",
     "CSP com `script-src 'self'` (sem `unsafe-inline`), `frame-ancestors 'none'`, "
     "`base-uri 'self'`, mais HSTS, `nosniff` e `X-Frame-Options`. É o que contém "
     "C5-01/C5-02/C5-04 a injeção de script."),
    ("Mensagens de WhatsApp — o campo de maior risco — são escapadas", "CrmInboxView.ts:711 e :602, :781 e :794",
     "O texto chega de pessoas externas via webhook WAHA e é renderizado com "
     "`escapeHtml(m.text)`; preview da caixa de entrada e corpo das notas também."),
    ("Views do CRM escapam antes de interpolar", "CrmPainelView.ts:91-92, CrmFunilView.ts:101/113/128-130, CrmAgendaView.ts:84/91-92, CrmAtividadesView.ts:94-98, CrmCatalogoView.ts:58-60, CrmContatosView.ts:186-187",
     "O padrão “escapar para uma local, depois interpolar” é consistente nessas telas: "
     "nome de contato, título de negócio, etapa, evidência de atividade e descrição de "
     "produto saem escapados."),
    ("Auditoria das operações privilegiadas", "src/server/authz.ts:35-45 · routeFactory.ts:22-34",
     "Negação por papel gera entrada `role_denied` com IP; criação de entidade gera "
     "action_log com userId e clientId."),
    ("O transporte WAHA nunca carrega segredo no erro", "src/server/waha.ts:20-21, 40-47",
     "`WahaError` só formata `waha_<op>_<status>`; o corpo da resposta — que pode conter "
     "telefone, HMAC e API key — é descartado. Timeout em toda chamada."),
    ("Placeholder de API key rejeitado na leitura de config", "src/server/waha.ts:60-70",
     "`readWahaConfig` devolve null quando a chave é `WAHA_DEV_PLACEHOLDER_KEY`, então uma "
     "clone fresca não tenta credencial falsa. É o padrão de validação que falta no "
     "C4-04."),
    ("Compose do WAHA usa sentinela fail-closed, não chave padrão", "waha/docker-compose.waha.yml:41",
     "`WAHA_API_KEY: \"${WAHA_API_KEY_SHA512:-sha512:INVALID_CHANGE_ME}\"` — nenhum "
     "hash de chave real casa, então o container recém-criado recusa tudo (401) em vez de "
     "abrir com senha padrão."),
    ("`.dev.vars` nunca entrou no git", "verificado: `git ls-files --error-unmatch .dev.vars` → erro; `git log --all -S` do prefixo da chave → vazio",
     "A chave WAHA real (C4-02) está na árvore de trabalho mas não no histórico. A CI "
     "também não injeta segredo em nenhum bloco `run:` — os jobs de deploy estão "
     "comentados (ci.yml:146-209)."),
    ("LGPD: o escopo do titular é filtrado por atribuição", "src/pages/api/me/data.ts:51-65 · erase.ts:115-125",
     "Contatos, conversas, negócios, tarefas e consents são recortados por "
     "`assignedUserId`/`assigneeUserId`, e o erasure apaga sessões/consents/conta além "
     "de anonimizar os registros do titular. O defeito é a exceção, não a regra (C1-01)."),
    ("Helpers de escape de atributo existem e são usados corretamente em parte do código", "src/domain/format.ts:39 · src/ui/dom.ts:65 · crmUi.ts:57,76,82",
     "`escapeAtrib` e `escapeAttr` estão presentes e são usados em `crmUi.textField`, "
     "dateField, datetimeField, optionHtml e no aria-label do gráfico — o problema é "
     "aplicação inconsistente, não ausência (C5-04)."),
]

# ---------------------------------------------------------- recomendações
RECOMENDACOES = [
    ("P1", "C2-01",
     "Fechar a escalada de privilégio em POST /api/users: exigir papel `admin` sempre "
     "que `body.role === 'admin'`, reaproveitando `allowedRoles()` do PUT irmão. "
     "Adicionar teste que falhe para manager→admin.",
     "Evita controle total do app por um papel intermediário."),
    ("P1", "C1-01",
     "Corrigir o recorte de /api/me/data e /api/me/export: derivar `messages` das "
     "conversas do titular e `customers`/`orders` dos contatos filtrados (ou removê-los). "
     "Teste que falhe para usuário sem atribuição.",
     "Fecha o vazamento de PII e a exposição de todos os pedidos."),
    ("P1", "C2-02",
     "Dar papéis permitidos às fábricas `createCollectionRoutes`/`createItemRoutes` e "
     "validar com `requireRole` por operação (leitura todos; escrita agent+; exclusão "
     "manager+).",
     "Faz o papel `viewer` significar “visualização” e fecha a escrita por papel baixo."),
    ("P1", "C3-01",
     "Na fábrica de item routes, resolver o registro e exigir posse "
     "(`<dono> === user.id` ou manager/admin) quando a tabela tiver coluna de dono, além "
     "do gate de papel.",
     "Fecha IDOR em ~24 rotas de uma vez, sem depender de cada arquivo."),
    ("P2", "C3-02",
     "Exigir posse em `loadWahaConversation` e `requireRole(['agent','manager','admin'])` "
     "em POST /api/whatsapp/send.",
     "Impede disparo de WhatsApp para qualquer cliente por qualquer sessão."),
    ("P2", "C5-01, C5-02",
     "Escapar `options.title` dentro de Modal.ts e `i.name`/`i.unit` em DashboardView. "
     "Adicionar lint forbidding interpolação sem escape em innerHTML.",
     "Elimina as duas injeções de HTML armazenado de maior alcance."),
    ("P2", "C5-04, C5-05, C5-06",
     "Trocar `escapeHtml` por `escapeAtrib`/`escapeAttr` nos contextos de atributo, "
     "unificar os dois helpers de atributo e escapar `value` nos `numberField`.",
     "Fecha a quebra de atributo e o vetor de `<input type=number>`."),
    ("P2", "C4-01",
     "Eliminar a senha de seed: gerar o admin no primeiro boot ou exigir "
     "`ADMIN_INITIAL_PASSWORD`; adicionar asserção de startup que rejeite o hash de seed.",
     "Tira um credencial admin reproduzível do repositório."),
    ("P2", "C2-03, C2-04",
     "Unificar o gate de papel numa função compartilhada `can(user, action)` consumida "
     "pela UI e pelo servidor, e condicionar o botão “+ Novo usuário”.",
     "Elimina a divergência UI↔servidor que produziu o C2-01."),
    ("P3", "C1-02, C5-07",
     "Migrar a sessão para cookie `HttpOnly; Secure; SameSite=Strict`, o que elimina o "
     "`?token=` do SSE e o `Access-Control-Allow-Origin: *`.",
     "Reduz drasticamente o impacto de qualquer futura injeção de script."),
    ("P3", "C3-03",
     "Mover o default de settings para migration, dar allowlist de colunas a `settings` "
     "e validar o patch contra um schema.",
     "Retira escrita em rota de leitura e a gravação de colunas arbitrárias."),
    ("P3", "C4-03",
     "Remover `DeskcommCRM-RecipeCosting/` do repositório (ou movê-lo para repo próprio), "
     "eliminando 4807 arquivos de superfície e de ruído de secrets.",
     "Reduz exposição de segredo e ruído de scanner/DAST."),
    ("P3", "C4-04, C2-05",
     "Rejeitar placeholders e segredos curtos em `readWahaWebhookConfig`; usar "
     "`ROLE_RANK` em `requireRole` ou remover a hierarquia morta.",
     "Fecha defaults frouxos e dá semântica real aos papéis."),
    ("P3", "C3-04",
     "Teste que falhe se uma rota adicionada a PUBLIC_PATHS não chamar `userFromToken`, "
     "garantindo a invariante de cobertura.",
     "Protege contra regressão na lista pública."),
]

# --------------------------------------------------------- issues github
ISSUES = [
    dict(
        n=1,
        titulo="[Segurança] Escalada de privilégio: `manager` cria conta `admin` em POST /api/users",
        labels="security, critical, authz, privilege-escalation",
        problema=(
            "A rota de criação de usuário aceita os papéis `['admin','manager']` e valida "
            "o papel pedido apenas contra a lista de papéis **válidos**, que inclui "
            "`admin`. Não há nenhuma verificação de que o papel pedido está dentro do que "
            "o chamador pode conceder. Um usuário com papel `manager` — que não é "
            "administrador — cria uma conta `admin` com senha escolhida por ele e passa a "
            "controlar o aplicativo inteiro.\n\n"
            "A rota irmã `PUT /api/users/[id]` já resolve isso corretamente: `allowedRoles()` "
            "exige `['admin']` quando o corpo traz `role` ou `password`. A POST ficou de fora "
            "dessa regra — a validação existe no próprio código e não foi aplicada ali. "
            "A UI não é fronteira: `CrmEquipeView.roleOptions()` oferece os quatro papéis no "
            "select sem limitar por papel do operador, e o botão “+ Novo usuário” é "
            "renderizado sem gate algum."
        ),
        evidencia=(
            "src/pages/api/users/index.ts:13\n"
            "    const USER_MANAGERS: Role[] = ['admin', 'manager'];\n\n"
            "src/pages/api/users/index.ts:31\n"
            "    const denied = await requireRole(context, USER_MANAGERS);\n\n"
            "src/pages/api/users/index.ts:12\n"
            "    const ROLES: Role[] = ['viewer', 'agent', 'manager', 'admin'];\n\n"
            "src/pages/api/users/index.ts:39-41\n"
            "    if (!ROLES.includes(body.role as Role)) {\n"
            "    \treturn json({ error: 'papel_invalido' }, 400);\n"
            "    }\n\n"
            "Contraste — a rota PUT restringe (src/pages/api/users/[id].ts:62-65):\n"
            "    function allowedRoles(body: PutBody): Role[] {\n"
            "    \tconst adminOnly = ADMIN_ONLY_FIELDS.some(f => body[f] !== undefined);\n"
            "    \treturn adminOnly ? ADMINS : USER_MANAGERS;\n"
            "    }"
        ),
        impacto=(
            "Controle total do aplicativo: um `manager` comprometido ou mal-intencionado "
            "vira administrador, o que dá acesso a gestão de usuários, configurações e à "
            "sessão do WhatsApp (`/api/whatsapp/session` é admin-only, e parar/iniciar a "
            "engine derrubaria o canal comercial). Também permite preparar uma conta "
            "persistente que sobrevive à troca de senha da vítima — o reset de senha do "
            "dono não derruba a sessão de um admin novo."
        ),
        correcao=(
            "Aplicar `allowedRoles(body)` no POST (ou exigir `ADMINS` quando "
            "`body.role === 'admin'`), e derivar o limite de um único lugar."
        ),
        aceite=[
            "POST /api/users com role='admin' por sessão `manager` retorna 403 `papel_insuficiente`.",
            "POST /api/users com role='manager'|'agent'|'viewer' por sessão `manager` continua 201.",
            "Teste automatizado no mesmo estilo de tests/server/authz.test.ts, com uma sessão `manager` no contexto.",
            "O mesmo corpo enviado via PUT com role='admin' por `manager` também retorna 403 (paridade das duas rotas).",
            "A UI esconde a opção `admin` no select quando o operador não é admin.",
        ],
    ),
    dict(
        n=2,
        titulo="[Segurança] Exportação LGPD (`/api/me/data`, `/api/me/export`) devolve mensagens, clientes e pedidos de todo o sistema",
        labels="security, high, lgpd, data-leak, broken-access-control",
        problema=(
            "As duas rotas de privacidade do titular aplicam um recorte por atribuição "
            "(`assignedUserId` / `assigneeUserId`) a contatos, conversas, negócios, "
            "tarefas e consents — mas devolvem `messages`, `customers` e `orders` "
            "**sem nenhum filtro**, direto do conjunto `all.*`, que é a base inteira "
            "carregada por `loadLgpdData`.\n\n"
            "Na prática, qualquer sessão autenticada — inclusive um usuário com papel "
            "`viewer`, que por definição não deveria ver nada — consegue baixar a lista "
            "completa de clientes (nome, telefone, e-mail) e de pedidos do D1 chamando "
            "`GET /api/me/export`. Isso é pior que não filtrar: a rota é justamente o "
            "endpoint que um titular usaria para exercitar seu direito de acesso, e ele "
            "vaza a base de terceiros."
        ),
        evidencia=(
            "src/pages/api/me/data.ts:73\n"
            "    messages: all.messages,\n\n"
            "src/pages/api/me/data.ts:76-77\n"
            "    customers: all.customers,\n"
            "    orders: all.orders,\n\n"
            "src/pages/api/me/export.ts:68\n"
            "    messages: all.messages,\n\n"
            "src/pages/api/me/export.ts:71-72\n"
            "    customers: all.customers,\n"
            "    orders: all.orders,\n\n"
            "O recorte que existe, ao lado (src/pages/api/me/data.ts:51-65), mostra o padrão correto:\n"
            "    const myContacts = all.contacts.filter(c => c.assignedUserId === user.id);\n"
            "    deals: all.deals.filter(d => d.assignedUserId === user.id),\n"
            "    tasks: all.tasks.filter(t => t.assigneeUserId === user.id),"
        ),
        impacto=(
            "Vazamento de dados pessoais entre usuários e exposição de informação "
            "comercial (volume e valores de pedidos). Sob LGPD (art. 18 e art. 6º, VII) "
            "isso é tratamento de dado de terceiro sem base legal e um incidente "
            "notificável; um `viewer` já acessa tudo que a rota devolve."
        ),
        correcao=(
            "Filtrar `messages` pelo conjunto de conversas do titular e derivar "
            "`customers`/`orders` dos contatos filtrados — ou remover esses campos do "
            "recorte, já que o titular não tem relação com pedidos de outros."
        ),
        aceite=[
            "Um usuário sem nenhuma atribuição recebe `customers`, `orders` e `messages` vazios em /api/me/data e /api/me/export.",
            "Um usuário com contatos atribuídos recebe apenas as mensagens das conversas desses contatos.",
            "Nenhum campo de retorno contém linhas cujo `assignedUserId`/dono é de outro usuário.",
            "Teste automatizado que falhe se uma linha de customers/orders/messages de terceiro aparecer no payload.",
        ],
    ),
    dict(
        n=3,
        titulo="[Segurança] Papel `viewer` tem escrita e exclusão em todas as entidades (routeFactory sem requireRole)",
        labels="security, high, authz, missing-authorization",
        problema=(
            "Todas as rotas de entidade do CRM e do ERP são geradas por "
            "`createCollectionRoutes` e `createItemRoutes`, e **nenhuma das duas chama "
            "`requireRole`**. O único controle sobre elas é o middleware, que exige uma "
            "sessão válida — e nada mais.\n\n"
            "O tipo de papel inclui `viewer`, que a própria UI rotula “Visualização” "
            "(`ROLE_LABELS.viewer`). Mas um `viewer` consegue `POST /api/crm/pipelines` "
            "criar um funil, `POST /api/crm/tags` criar etiquetas e, via rota de item, "
            "`DELETE /api/crm/contacts/<id>` apagar qualquer contato e `DELETE "
            "/api/orders/<id>` apagar pedidos. O rótulo comercial diz o que o papel não "
            "cumpre, e nenhum gate de frontend esconde nada: `pageHead()` renderiza o "
            "botão “+ Novo usuário” incondicionalmente.\n\n"
            "Busca por `requireRole` em todo `src/` retorna apenas 4 arquivos: "
            "users/index.ts, users/[id].ts, settings.ts e whatsapp/session.ts."
        ),
        evidencia=(
            "src/server/routeFactory.ts:39-57\n"
            "    export function createCollectionRoutes(table: string, shape: TableShape) {\n"
            "    \tconst GET: APIRoute = async () => {\n"
            "    \t\tconst items = await listEntities(getDb(), table, shape);\n"
            "    \t\treturn json(items);\n"
            "    \t};\n"
            "    \tconst POST: APIRoute = async (context) => {\n"
            "    \t\t/* sem requireRole */\n"
            "    \t};\n\n"
            "src/server/routeFactory.ts:59-80\n"
            "    export function createItemRoutes(table: string, shape: TableShape) {\n"
            "    \tconst PUT: APIRoute = async (context) => { /* ... */ };\n"
            "    \tconst DELETE: APIRoute = async (context) => { /* ... */ };\n\n"
            "src/domain/crm.ts:5\n"
            "    export type Role = 'viewer' | 'agent' | 'manager' | 'admin';\n\n"
            "src/ui/views/crm/CrmEquipeView.ts:12\n"
            "    viewer: 'Visualização',\n\n"
            "src/ui/views/crm/CrmEquipeView.ts:42-47 (botão sem gate)\n"
            "    function pageHead(): string {\n"
            "    \tconst btn = '<button class=\"btn btn-primary\" id=\"new-user\">+ Novo usuário</button>';\n"
            "    \treturn section('Equipe', 'Usuários e papéis do sistema', btn);\n"
            "    }"
        ),
        impacto=(
            "Qualquer conta de menor privilégio — inclusive uma criada para papel "
            "somente-visualização — tem capacidade de escrita e exclusão sobre toda a base "
            "de CRM e ERP: apagar contatos, conversas, mensagens, negócios, pedidos e "
            "modificar a configuração de funil/etiquetas/agenda. Qualquer sessão "
            "vazada ou conta descartada vira destruição em massa."
        ),
        correcao=(
            "Dar a `createCollectionRoutes`/`createItemRoutes` uma lista de papéis "
            "permitidos por operação e chamar `requireRole` antes de tocar o D1. "
            "Sugestão: leitura = todos os papéis; escrita = `agent`, `manager`, `admin`; "
            "exclusão = `manager`, `admin`."
        ),
        aceite=[
            "POST /api/crm/pipelines com sessão `viewer` retorna 403 `papel_insuficiente`.",
            "DELETE /api/crm/contacts/:id com sessão `viewer` retorna 403 e o registro continua no banco.",
            "POST /api/orders com sessão `viewer` retorna 403.",
            "DELETE /api/crm/pipelines/:id com sessão `agent` retorna 403.",
            "Uma entrada `role_denied` é gravada em auth_audit para cada negativa (o authz.ts já faz isso).",
            "A UI de cada tela reflete a mesma matriz de permissões.",
        ],
    ),
    dict(
        n=4,
        titulo="[Segurança] IDOR: createItemRoutes faz PUT/DELETE por id sem checar posse nem papel",
        labels="security, high, idor, broken-access-control",
        problema=(
            "`createItemRoutes` resolve o registro pelo `context.params.id` e vai direto "
            "para `updateEntity`/`deleteEntity`. Não há comparação de "
            "`assignedUserId`/`assigneeUserId` nem gate de papel — a mesma lacuna que a "
            "issue anterior apontou, agora no eixo de posse.\n\n"
            "Todos os arquivos `[id].ts` são aliases de duas linhas dessa fábrica, e foram "
            "percorridos um a um: contatos, conversas, mensagens, negócios, tarefas, "
            "pipelines, etapas, respostas-rápidas, agenda, catálogo, atividades, notas de "
            "conversa, etiquetas, tipos de agenda, clientes, pedidos, produtos, "
            "ingredientes, componentes e usuários. Efeito concreto: um usuário com papel "
            "`viewer` apaga qualquer contato, conversa, negócio ou pedido pelo id.\n\n"
            "E como as listagens devolvem a base inteira (o projeto é single-tenant por "
            "desenho), os ids necessários para o ataque saem eles próprios das respostas "
            "de listagem — não é preciso adivinhar nada."
        ),
        evidencia=(
            "src/server/routeFactory.ts:60-72\n"
            "    const PUT: APIRoute = async (context) => {\n"
            "    \tconst patch = (await context.request.json()) as { id?: string; } & Record<string, unknown>;\n"
            "    \tconst saved = await updateEntity(\n"
            "    \t\tgetDb(), table, shape, context.params.id!, patch\n"
            "    \t);\n"
            "    \treturn saved ? json(saved) : notFound();\n"
            "    };\n\n"
            "src/server/routeFactory.ts:74-77\n"
            "    const DELETE: APIRoute = async (context) => {\n"
            "    \tawait deleteEntity(getDb(), table, context.params.id!);\n"
            "    \treturn json({ ok: true });\n"
            "    };\n\n"
            "Exemplo de alias — src/pages/api/crm/contacts/[id].ts:3\n"
            "    export const { PUT, DELETE } = createItemRoutes(CONTACTS_TABLE, CONTACTS_SHAPE);\n\n"
            "Exemplo de alias — src/pages/api/orders/[id].ts:3\n"
            "    export const { PUT, DELETE } = createItemRoutes(ORDERS_TABLE, ORDERS_SHAPE);"
        ),
        impacto=(
            "Qualquer sessão autenticada pode apagar ou alterar qualquer registro de "
            "qualquer entidade por id — incluindo conversas e mensagens do WhatsApp, "
            "negócios e pedidos. Combinado com a listagem sem filtro, é um "
            "read-write-destroy global para a base do CRM, sem necessidade de privilégio "
            "nenhum além de estar logado."
        ),
        correcao=(
            "Antes do write, resolver o registro existente e exigir: (a) papel mínimo "
            "para a operação e (b) quando a tabela tiver coluna de dono, "
            "`registro.<dono> === user.id` **ou** papel `manager`/`admin`. Fazer isso na "
            "fábrica, para não depender de cada arquivo de rota."
        ),
        aceite=[
            "DELETE /api/crm/contacts/:id de um contato atribuído a outro usuário, por sessão `agent`, retorna 403 e não apaga o registro.",
            "O mesmo DELETE por sessão `manager` ou `admin` funciona.",
            "PUT /api/crm/tasks/:id de tarefa com outro `assigneeUserId`, por sessão `agent`, retorna 403.",
            "As rotas sem coluna de dono (ex.: tags, produtos) exigem papel mínimo para escrita/exclusão.",
            "A verificação está na fábrica (um único lugar), não replicada em 24 arquivos.",
            "Teste automatizado cobrindo ao menos uma entidade com dono (contacts) e uma sem (tags).",
        ],
    ),
    dict(
        n=5,
        titulo="[Segurança] IDOR no envio de WhatsApp: qualquer sessão envia mensagem em qualquer conversa",
        labels="security, high, idor, whatsapp",
        problema=(
            "`POST /api/whatsapp/send` recebe `conversationId` no corpo e resolve a "
            "conversa por id. `loadWahaConversation` valida apenas que a conversa existe e "
            "que `channel === 'whatsapp'` — **nunca** compara "
            "`conversation.assignedUserId` com o usuário chamador. A rota também não tem "
            "`requireRole`, só sessão.\n\n"
            "Resultado: qualquer conta autenticada, de qualquer papel (inclusive "
            "`viewer`), pode listar as conversas — as listagens não filtram nada — e então "
            "disparar WhatsApp para qualquer cliente do negócio, em nome da empresa. O "
            "canal é externo e comercial: a mensagem chega ao celular do cliente final."
        ),
        evidencia=(
            "src/pages/api/whatsapp/send.ts:15-16\n"
            "    const user = await userFromToken(db, context.request);\n"
            "    if (!user) return json({ error: 'sessao_invalida' }, 401);\n\n"
            "src/pages/api/whatsapp/send.ts:26-31\n"
            "    const message = await sendWahaText(db, client, {\n"
            "    \tconversationId: parsed.value.conversationId,\n"
            "    \ttext: parsed.value.text,\n"
            "    \tuserId: user.id,\n"
            "    \treplyTo: parsed.value.replyTo\n"
            "    });\n\n"
            "src/server/wahaSend.ts:62-79 (sem checagem de dono)\n"
            "    async function loadWahaConversation(\n"
            "    \tdb: Database, conversationId: string\n"
            "    ): Promise<Conversation> {\n"
            "    \tconst conversation = await getEntity<Conversation>(\n"
            "    \t\tdb, CONVERSATIONS_TABLE, CONVERSATIONS_SHAPE, conversationId\n"
            "    \t);\n"
            "    \tif (!conversation) {\n"
            "    \t\tthrow new WahaSendError('conversation_not_found', 'Conversa não encontrada');\n"
            "    \t}\n"
            "    \tif (conversation.channel !== 'whatsapp') {\n"
            "    \t\tthrow new WahaSendError('wrong_channel', 'Esta conversa não é do canal WhatsApp');\n"
            "    \t}\n"
            "    \treturn conversation;   // <-- assignedUserId nunca é comparado\n"
            "    }\n\n"
            "    $ grep -c assignedUserId src/server/wahaSend.ts\n"
            "    0"
        ),
        impacto=(
            "Abuso de canal comercial a partir de conta de menor privilégio: envio de "
            "mensagens não autorizadas (golpe, phishing, oferta indevida) para a base de "
            "clientes, com custo por mensagem e sem rasto de autorização além do "
            "`createdBy` na linha enviada."
        ),
        correcao=(
            "Exigir `conversation.assignedUserId === user.id || ['manager','admin'].includes(user.role)` "
            "em `loadWahaConversation`, e aplicar `requireRole(['agent','manager','admin'])` na rota."
        ),
        aceite=[
            "POST /api/whatsapp/send com `conversationId` de conversa atribuída a outro usuário, por sessão `agent`, retorna 403.",
            "O mesmo envio por sessão `manager` ou `admin` funciona.",
            "Uma sessão `viewer` recebe 403 na rota mesmo em conversa própria.",
            "A mensagem de erro não distingue “não existe” de “não é sua” (evita enumeração de conversas).",
            "Teste automatizado em tests/server cobrindo os dois caminhos.",
        ],
    ),
    dict(
        n=6,
        titulo="[Segurança] Injeção de HTML armazenada via nome de ingrediente/contato em openModal e no Dashboard",
        labels="security, high, xss, stored-xss",
        problema=(
            "`openModal` interpola `options.title` diretamente no `innerHTML` do backdrop, "
            "sem escape. Dois callers passam dado vindo do banco sem escapar: o nome do "
            "contato (`Histórico de ${contact.name}`) e o nome do ingrediente "
            "(`Movimentar: ${ingredient.name}`).\n\n"
            "Separadamente, `DashboardView.lowStockRow` interpola `${i.name}` cru no "
            "innerHTML — e o Dashboard é a primeira tela que qualquer usuário vê ao entrar, "
            "o que dá alcance máximo ao payload.\n\n"
            "Como **nenhuma** rota de ingrediente ou contato exige papel mínimo para "
            "escrita, qualquer sessão autenticada (inclusive `viewer`) planta o payload "
            "com um `PUT /api/ingredients/:id` e ele é renderizado depois para todos os "
            "usuários que abrirem aquele formulário ou o Dashboard. A tela de Equipe mostra "
            "o padrão correto logo ao lado (`CrmEquipeView` escapa `me.name`/`me.email` nas "
            "linhas 65-66), então trata-se de views que esqueceram o escape."
        ),
        evidencia=(
            "src/ui/Modal.ts:28-31\n"
            "    backdrop.innerHTML = `\n"
            "    \t<div class=\"modal\" role=\"dialog\" aria-modal=\"true\">\n"
            "    \t\t<div class=\"modal-head\">\n"
            "    \t\t\t<h3>${options.title}</h3>\n\n"
            "src/ui/views/crm/CrmContatosView.ts:302\n"
            "    openModal({ title: `Histórico de ${contact?.name ?? 'contato'}`, bodyHtml });\n\n"
            "src/ui/views/StockView.ts:169-170\n"
            "    const title = `Movimentar: ${ingredient.name}`;\n"
            "    const modal = openModal({ title, bodyHtml: formHtml(ingredient) });\n\n"
            "src/ui/views/DashboardView.ts:86-88\n"
            "    function lowStockRow(i: Ingredient): string {\n"
            "    \treturn `<div class=\"calc-row\"><span>${i.name}</span>\n"
            "    \t\t<span class=\"num soft\">${i.stock} / ${i.minStock} ${i.unit}</span></div>`;\n"
            "    }\n\n"
            "Contraste — o mesmo dado escapado em src/ui/views/crm/CrmEquipeView.ts:65-66\n"
            "    const name = escapeHtml(me.name);\n"
            "    const email = escapeHtml(me.email);"
        ),
        impacto=(
            "Injeção de HTML armazenada, com leitura garantida: o Dashboard é a home de "
            "qualquer sessão. A CSP atual (`script-src 'self'`, sem `unsafe-inline`) bloqueia "
            "handlers inline, então o resultado hoje é injeção de HTML/atributo — "
            "phishing visual, injeção de formulário, sequestro de clique — e não execução "
            "de script. Se a CSP for relaxada, ou se o token em `localStorage` "
            "(ApiAuthRepository.ts:56) for lido por um gadget, o mesmo bug vira "
            "sequestro de conta completo."
        ),
        correcao=(
            "Escapar `options.title` dentro de Modal.ts — ponto único que cobre os dois "
            "callers — e escapar `i.name`/`i.unit` em DashboardView. Idealmente adicionar "
            "uma regra de lint que proíba interpolação em `innerHTML` sem `escapeHtml`/"
            "`escapeAtrib`."
        ),
        aceite=[
            "PUT /api/ingredients/:id com name='<img src=x onerror=alert(1)>' e a abertura do formulário de movimentação mostra o texto literal, sem elemento criado.",
            "O mesmo nome malicioso no Dashboard aparece escapado.",
            "Modal.ts escapa o title (teste de unidade com title contendo '<b>' e '\"').",
            "Existe regra de lint/CI que falha se uma atribuição a innerHTML interpolar variável sem um dos helpers de escape.",
            "Teste de UI (happy-dom) cobrindo Modal.ts com title contendo HTML.",
        ],
    ),
    dict(
        n=7,
        titulo="[Segurança] escapeHtml não escapa aspas e é usado em contexto de atributo (quebra de atributo)",
        labels="security, medium, xss, escaping",
        problema=(
            "`escapeHtml` (src/domain/format.ts:33-37) escapa via "
            "`textContent → innerHTML`, o que trata `&`, `<` e `>` mas **não** `\"` nem "
            "`'` — aspas só importam em contexto de atributo, e o helper não pode saber "
            "onde o resultado será usado. É por isso que o projeto tem `escapeAtrib` "
            "(format.ts:39) e `escapeAttr` (dom.ts:65).\n\n"
            "Em três pontos o valor vai para dentro de aspas de atributo usando o helper "
            "errado:\n"
            "• `CrmEtiquetasView:91` — `class=\"chip chip-${escapeHtml(tag.color)}\"`, e "
            "`tag.color` é gravável por qualquer sessão autenticada via "
            "`PUT /api/crm/tags/:id` (nenhum gate de papel).\n"
            "• `ProductsView:508-510` — `value=\"${escapeHtml(value)}\"`, enquanto o "
            "`crmUi.textField` equivalente usa `escapeAtrib` (crmUi.ts:57).\n"
            "• `CrmWhatsAppView:308-310` — `src=\"${escapeHtml(qr)}\"`, onde `qr` vem do "
            "engine WAHA (alcançável por HTTP simples em dev).\n\n"
            "Um `\"` no payload fecha o atributo e abre Markup. Some-se a isso que existem "
            "**dois** helpers de escape de atributo divergentes no projeto, o que é a "
            "causa raiz do padrão inconsistente.\n\n"
            "A mesma classe de bug aparece nos `numberField` (crmUi.ts:69, "
            "ProductsView:521, IngredientsView:195, ComponentsView:316, SettingsView:97), "
            "que interpolam `value` cru, e no `rowButton` (crmUi.ts:129), que interpola o "
            "atributo `data-*` sem escape. Os valores atuais são numéricos ou ids, mas o "
            "servidor não valida tipo — `entityToRow` só restringe nomes de coluna."
        ),
        evidencia=(
            "src/domain/format.ts:33-37\n"
            "    export function escapeHtml(text: string): string {\n"
            "    \tconst div = document.createElement('div');\n"
            "    \tdiv.textContent = text ?? '';\n"
            "    \treturn div.innerHTML;\n"
            "    }\n"
            "    // -> escapa & < > ; NÃO escapa \" nem '\n\n"
            "src/domain/format.ts:39-42 (o helper correto, que existe)\n"
            "    export function escapeAtrib(text: string): string {\n"
            "    \treturn escapeHtml(text)\n"
            "    \t\t.replace(/\"/g, \"&quot;\")\n"
            "    \t\t.replace(/\\'/g, \"&#x27;\")\n"
            "    }\n\n"
            "src/ui/dom.ts:65-67 (o segundo helper, divergente)\n"
            "    export function escapeAttr(text: string): string {\n"
            "    \treturn String(text).replace(/\"/g, '&quot;');\n"
            "    }\n\n"
            "src/ui/views/crm/CrmEtiquetasView.ts:91\n"
            "    `<span class=\"chip chip-${escapeHtml(tag.color)}\">` +\n\n"
            "src/ui/views/ProductsView.ts:508-510\n"
            "    <input class=\"input\" name=\"${name}\" value=\"${escapeHtml(value)}\" required>\n\n"
            "src/ui/views/crm/CrmWhatsAppView.ts:308-310\n"
            "    const safe = escapeHtml(qr);\n"
            "    const tag = qr.startsWith('data:') ? `<img src=\"${safe}\" ...>`\n\n"
            "src/ui/views/crm/crmUi.ts:69\n"
            "    const attrsB = ` name=\"${name}\" value=\"${value}\" required`;"
        ),
        impacto=(
            "Injeção de atributo/HTML a partir de `tag.color` (controlável por qualquer "
            "sessão) e dos valores de produto gravados via API. Sob a CSP atual o efeito "
            "para em HTML, mas a superfície fica disponível caso a CSP mude."
        ),
        correcao=(
            "Trocar por `escapeAtrib`/`escapeAttr` nos pontos de atributo e unificar os "
            "dois helpers em um único `escapeAttr`, removendo a duplicação. Escapar "
            "também `value` nos `numberField` e o atributo `data-*` do `rowButton`."
        ),
        aceite=[
            "PUT /api/crm/tags/:id com color='x\" onmouseover=\"alert(1)' renderiza o atributo class intacto, sem atributo extra.",
            "ProductsView usa o helper de atributo no value do input.",
            "Existe exatamente um helper de escape de atributo em src/ (grep por 'export function escape' retorna três funções: html, attr e nada mais).",
            "numberField (crmUi.ts:69, ProductsView:521, IngredientsView:195, ComponentsView:316, SettingsView:97) escapa o value.",
            "rowButton (crmUi.ts:129) escapa o valor do atributo data-*.",
            "Teste de unidade que falhe se escapeHtml aplicado em atributo receber aspas sem escapar.",
        ],
    ),
    dict(
        n=8,
        titulo="[Segurança] Credencial de administrador padrão (`admin123`) documentada no repositório, com salt fixo no código",
        labels="security, high, secrets, default-credentials",
        problema=(
            "A migration de seed grava um usuário administrador com a senha `admin123`, "
            "usando o salt FIXO `deskcomm-seed-v1` — e esse mesmo salt está no código-fonte, "
            "como valor default do parâmetro `salt` de `verifyPassword`. O hash também está "
            "versionado (a migration 0019 o usa de propósito, para ser idempotente).\n\n"
            "O resultado é um credencial de administrador **reproduzível por qualquer pessoa "
            "com o repositório**: e-mail `admin@deskcomm.local`, senha `admin123`, sal "
            "conhecido. Além disso, `verifyPassword` cai de volta nesse sal padrão sempre "
            "que a linha não tem `passwordSalt`, o que amplia o alcance do valor fixo.\n\n"
            "Há uma mitigação real e bem feita — `mustChangePassword=1` (migrations "
            "0020/0021) e o middleware respondendo 403 `troca_de_senha_obrigatoria` fora de "
            "uma allowlist de três rotas. O que não existe é validação de startup que "
            "rejeite o credencial de seed: o **login retorna 200 e um token de sessão "
            "válido**; só a API fica fechada depois disso."
        ),
        evidencia=(
            "migrations/0004_crm_seed.sql:5-9\n"
            "    -- Admin user — senha padrão \"admin123\" (PBKDF2-SHA256, 100k iterações, sal\n"
            "    -- \"deskcomm-seed-v1\"). Troque na primeira sessão pela tela de Equipe.\n"
            "    INSERT OR IGNORE INTO users (id, name, email, passwordHash, role, createdAt) VALUES\n"
            "      ('seed-user-admin', 'Administrador', 'admin@deskcomm.local',\n"
            "       '022d504d3b3433f2cde7ac9185a4e1d340e67ed70a943dbc4ef14bf8c3174a00', 'admin', '2026-01-01T00:00:00.000Z');\n\n"
            "src/server/auth.ts:26\n"
            "    const SALT = 'deskcomm-seed-v1';\n\n"
            "src/server/auth.ts:48-52\n"
            "    export async function verifyPassword(\n"
            "    \tpassword: string,\n"
            "    \tstoredHash: string,\n"
            "    \tsalt: string = SALT      // <-- default é o sal publicado\n"
            "    ): Promise<boolean> {\n\n"
            "A mitigação que existe — src/middleware.ts:138-144\n"
            "    async function blockedByPasswordChange(user: User, pathname: string): Promise<boolean> {\n"
            "    \tif (PASSWORD_CHANGE_ALLOWED.has(pathname)) return false;\n"
            "    \treturn Number(user.mustChangePassword ?? 0) === 1;\n"
            "    }"
        ),
        impacto=(
            "Em qualquer ambiente novo onde `npm run db:seed:remote` roda sem o operador "
            "trocar a senha, existe um login de administrador reproduzível a partir do "
            "repositório. O `mustChangePassword` reduz o alcance (a API fica 403), mas o "
            "atacante ainda obtém uma sessão autenticada válida — suficiente para as três "
            "rotas da allowlist (`/api/auth/me`, `/api/auth/logout`, "
            "`/api/auth/change-password`) e para enumerar o estado da instalação."
        ),
        correcao=(
            "Deixar de semear senha. Gerar o admin no primeiro boot com senha aleatória "
            "exibida uma única vez, ou exigir `ADMIN_INITIAL_PASSWORD` no env. Adicionar "
            "asserção de startup que aborta se o `passwordHash` do seed ainda estiver "
            "presente, e remover o sal fixo do default de `verifyPassword`."
        ),
        aceite=[
            "Nenhuma migration versionada contém senha de administrador em texto plano.",
            "Um banco novo semeado não permite login com 'admin123'.",
            "verifyPassword não tem mais o sal fixo como valor default (ou o default é explicitamente rejeitado).",
            "Existe asserção de startup que falha se users.passwordHash do seed-user-admin estiver presente.",
            "O README descreve o fluxo de criação do primeiro admin sem credencial padrão.",
        ],
    ),
    dict(
        n=9,
        titulo="[Segurança] Defaults de segredo e app vendorizado: placeholder de HMAC aceito como segredo e DeskcommCRM inteiro no repositório",
        labels="security, medium, secrets, supply-chain, housekeeping",
        problema=(
            "Duas coisas de higiene de segredo, ambas verificadas:\n\n"
            "**(a) Placeholder aceito como segredo.** `readWahaWebhookConfig` usa um helper "
            "`text()` que só checa \"string não vazia\", então o valor de instrução "
            "`gere-um-segredo-por-ambiente-openssl-rand-hex-32` presente no `.dev.vars` "
            "passa a valer como segredo HMAC válido. Neste ambiente o efeito é fail-closed "
            "(bom, porque `WAHA_WEBHOOK_REQUIRE_SIGNATURE=\"true\"` está ligado), mas o "
            "critério de validade é frouxo: \"não vazio\" é o único teste. O contraste é o "
            "próprio projeto: `readWahaConfig` já rejeita explicitamente "
            "`WAHA_DEV_PLACEHOLDER_KEY` — o padrão certo existe, só não foi aplicado aqui. "
            "E o `.dev.vars.example` deixa o campo **vazio**, o que desliga a verificação "
            "inteira.\n\n"
            "Além disso, o `.dev.vars` da árvore de trabalho contém uma `WAHA_API_KEY` real "
            "de 64 hex (não versionada — confirmado com `git ls-files --error-unmatch` e "
            "`git log --all -S`).\n\n"
            "**(b) Segundo aplicativo inteiro no repositório.** `DeskcommCRM-RecipeCosting/` "
            "é uma cópia completa de outro produto (Next.js + Supabase + Sentry) com 4807 "
            "arquivos rastreados, incluindo `.env.example` (25 KB), "
            "`.env.hostgator.example` (17 KB), `supabase/migrations/`, `Dockerfile*` e "
            "`docker-compose.prod.yml`. Os JWTs que aparecem ali são fixtures públicos do "
            "Supabase e placeholders (`chave-de-mentira`) — nenhum segredo real foi "
            "encontrado. O problema é estrutural: superfície de segredo e de ataque sem "
            "revisão, e ruído para qualquer scanner/DAST."
        ),
        evidencia=(
            ".dev.vars:31\n"
            "    WAHA_HMAC_SECRET=\"gere-um-segredo-por-ambiente-openssl-rand-hex-32\"\n\n"
            "src/server/wahaWebhook.ts:29-35\n"
            "    export function readWahaWebhookConfig(source: unknown): WahaWebhookConfig {\n"
            "    \tconst record = source as Record<string, unknown> | null | undefined;\n"
            "    \tconst secret = text(record?.WAHA_HMAC_SECRET);   // <-- só exige não-vazio\n"
            "    \tconst flag = record?.WAHA_WEBHOOK_REQUIRE_SIGNATURE ?? '';\n"
            "    \tconst requireSignature = String(flag) === 'true';\n"
            "    \treturn { hmacSecret: secret, requireSignature };\n"
            "    }\n\n"
            "O padrão correto que já existe no projeto — src/server/waha.ts:60-70\n"
            "    export function readWahaConfig(source: unknown): WahaConfig | null {\n"
            "    \tconst url = text(record?.WAHA_API_BASE_URL);\n"
            "    \tconst apiKey = text(record?.WAHA_API_KEY);\n"
            "    \tif (!url || !apiKey || apiKey === WAHA_DEV_PLACEHOLDER_KEY) return null;\n"
            "    }\n\n"
            ".dev.vars:9\n"
            "    WAHA_API_KEY=\"7ff62014c4d63e715d9efeffc400964dff94299ed806165134b2744dff2ec818\"\n\n"
            "DeskcommCRM-RecipeCosting/.env.example           (25.097 bytes, versionado)\n"
            "DeskcommCRM-RecipeCosting/.env.hostgator.example (17.002 bytes, versionado)\n"
            "DeskcommCRM-RecipeCosting/docker-compose.prod.yml (produção de outro app, versionado)\n"
            "git ls-files DeskcommCRM-RecipeCosting | wc -l  ->  4807"
        ),
        impacto=(
            "Nenhum segredo real exposto foi encontrado — este achado é sobre fraza de "
            "controle e higiene, não sobre um breach. O risco concreto é (a): uma "
            "configuração com segredo placeholder-but-non-empty não é rejeitada, e o "
            "`.dev.vars.example` ensaia justamente a configuração que DESLIGA a verificação "
            "de assinatura. O risco de (b) é desupply chain: qualquer segredo que entre "
            "nessa árvore no futuro é commitado junto com o app principal, sem revisão."
        ),
        correcao=(
            "(a) Rejeitar valores conhecidos de placeholder e segredos com menos de 32 "
            "bytes em `readWahaWebhookConfig`, e preencher o exemplo com um valor que "
            "force o operador a gerar o seu. (b) Remover `DeskcommCRM-RecipeCosting/` do "
            "repositório (ou movê-lo para repo próprio / submódulo explícito) e adicionar "
            "gitleaks/trufflehog no CI."
        ),
        aceite=[
            "readWahaWebhookConfig devolve null (ou o chamador recusa) quando WAHA_HMAC_SECRET é o placeholder ou tem menos de 32 bytes.",
            ".dev.vars.example traz um valor que não habilita a assinatura por acidente.",
            "git ls-files DeskcommCRM-RecipeCosting retorna vazio, e o caminho está no .gitignore.",
            "O CI roda um scanner de segredo (gitleaks/trufflehog) e falha em alta.",
            "Existe um teste unitário para readWahaWebhookConfig cobrindo placeholder, vazio e tamanho curto.",
        ],
    ),
    dict(
        n=10,
        titulo="[Segurança] Sessão em localStorage e token em query string no SSE amplificam qualquer injeção de HTML",
        labels="security, medium, session, defense-in-depth",
        problema=(
            "O token Bearer vive em `localStorage` "
            "(`ApiAuthRepository.ts:20,56`), legível por qualquer script que rode na "
            "origem. E, porque o `EventSource` não consegue mandar header "
            "`Authorization`, o middleware abre uma exceção e aceita o token por query "
            "string em `/api/crm/events` (`middleware.ts:75-87`, "
            "`crm/events.ts:137`), com `Access-Control-Allow-Origin: *` na resposta.\n\n"
            "Hoje a CSP (`script-src 'self'`, sem `unsafe-inline`) impede que os sinks de "
            "innerHTML verificados executem script, então o pior caso é injeção de HTML. "
            "O ponto do achado é o nível de dano: se a CSP relaxar, ou se um sink passar a "
            "aceitar `javascript:`, o mesmo bug vira sequestro de conta completo em vez de "
            "deformação de HTML. E o token em URL vaza para log de acesso, header `Referer` "
            "e histórico do navegador — risco que o comentário do próprio middleware "
            "reconhece ao justificar a exceção."
        ),
        evidencia=(
            "src/repositories/ApiAuthRepository.ts:20\n"
            "    return localStorage.getItem(this.tokenKey);\n\n"
            "src/repositories/ApiAuthRepository.ts:56\n"
            "    localStorage.setItem(this.tokenKey, token);\n\n"
            "src/middleware.ts:70-75 (o comentário admite o trade-off)\n"
            "    // The SSE endpoint is the one route a browser can only reach with the token in\n"
            "    // the query string: an EventSource cannot set an Authorization header, so the\n"
            "    // client puts `?token=` in the URL (see sseEventUrl in the CRM views). Every\n"
            "    // other route stays Bearer-only — a token in a URL lands in access logs,\n"
            "    // Referer headers and browser history.\n\n"
            "src/pages/api/crm/events.ts:137\n"
            "    const queryToken = url.searchParams.get('token');\n\n"
            "src/pages/api/crm/events.ts:172\n"
            "    'Access-Control-Allow-Origin': '*'"
        ),
        impacto=(
            "Risco de defence-in-depth: não é explorável isoladamente, mas é o que "
            "transformaria as injeções de HTML das outras issues em comprometimento total "
            "de sessão. O token em query string, isoladamente, é exposição de credencial em "
            "log/Referer/histórico — em especial porque o SSE também faz broadcast de todas "
            "as mensagens e telefones do sistema."
        ),
        correcao=(
            "Migrar a sessão para cookie `HttpOnly; Secure; SameSite=Strict`, o que "
            "resolve de uma vez o token-em-URL do SSE, o `Access-Control-Allow-Origin: *` "
            "e a leitura do token por script."
        ),
        aceite=[
            "Nenhuma rota aceita token por query string (grep por searchParams.get('token') não retorna nada em src/).",
            "A sessão é um cookie HttpOnly: o teste frontend não consegue ler o token via document.cookie.",
            "/api/crm/events não envia Access-Control-Allow-Origin.",
            "O middleware não tem mais a exceção SSE_PATH.",
            "Logout invalida o cookie (e a linha em sessions) e a sessão não sobrevive ao cookie-clear.",
        ],
    ),
    dict(
        n=11,
        titulo="[Segurança] GET /api/settings escreve no banco e faz merge cego de colunas arbitrárias",
        labels="security, medium, broken-access-control, hardening",
        problema=(
            "A rota de leitura de configurações também **escreve**: quando o registro "
            "`global` ainda não existe, o GET faz `INSERT OR REPLACE` com "
            "`DEFAULT_SETTINGS`. Estado que muda em resposta a um GET, sem gate de papel "
            "nenhum (o GET não chama `requireRole`).\n\n"
            "O PUT tem gate de `['admin','manager']`, mas faz `{ ...current, ...patch }` "
            "sem validar o patch contra um schema, e `settings` é a **única** tabela sem "
            "lista `columns` no shape — `keepAllowed` não filtra nada (o próprio comentário "
            "em mapping.ts registra isso). O resultado é que quem pode escreve escolhe "
            "quais colunas da linha `settings` sobrescreve, inclusive nomes que a coluna não "
            "tem."
        ),
        evidencia=(
            "src/pages/api/settings.ts:13-19\n"
            "    export const GET: APIRoute = async () => {\n"
            "    \tconst db = getDb();\n"
            "    \tconst existing = await readSettings(db);\n"
            "    \tif (existing) return json(existing);\n"
            "    \tawait writeSettings(db, DEFAULT_SETTINGS);   // <-- GET que escreve\n"
            "    \treturn json(DEFAULT_SETTINGS);\n"
            "    };\n\n"
            "src/pages/api/settings.ts:25-28\n"
            "    const patch: Partial<Settings> = await context.request.json();\n"
            "    \tconst current = (await readSettings(db)) ?? DEFAULT_SETTINGS;\n"
            "    \tconst merged = { ...current, ...patch };   // <-- merge sem validação\n"
            "    \tawait writeSettings(db, merged);\n\n"
            "src/server/mapping.ts:9-10 (a própria ressalva)\n"
            "    // Omitting `columns` stays permissive; only `settings` does that, because\n"
            "    // its route has no shape of its own.\n\n"
            "src/server/mapping.ts:48-53\n"
            "    function keepAllowed(\n"
            "    \tentity: Record<string, unknown>,\n"
            "    \tcolumns: string[] | undefined\n"
            "    ): Record<string, unknown> {\n"
            "    \tif (!columns) return { ...entity };"
        ),
        impacto=(
            "Um `manager` (papel não-administrador) consegue gravar colunas arbitrárias na "
            "configuração global, com efeito direto em cálculo de custos, preços e margens "
            "exibidos no Ateliê. O GET-que-escreve também torna a rota não-idempotente e "
            "cria estado em um read, o que complica cache e auditoria."
        ),
        correcao=(
            "Mover a criação do registro default para uma migration/seed, deixar o GET "
            "puramente de leitura, dar a `settings` uma lista explícita de colunas no "
            "shape, e validar o patch contra um schema antes do merge."
        ),
        aceite=[
            "GET /api/settings não executa nenhuma instrução de escrita (verificável com um D1 fake que conte as calls).",
            "settings tem shape.columns explícito; uma chave fora da lista é descartada no merge.",
            "PUT com chave desconhecida no corpo não altera a linha persistida.",
            "Existe schema de validação (zod ou equivalente) para o patch de settings.",
        ],
    ),
    dict(
        n=12,
        titulo="[Segurança] Gate de papel do frontend divergente do endpoint (e ROLE_RANK morto)",
        labels="security, medium, authz, consistency",
        problema=(
            "O gate de papel não é uma fonte única, e isso já produziu erro nos dois "
            "sentidos.\n\n"
            "**(a) UI mais permissiva que o servidor.** `CrmEquipeView.actionButtons` "
            "libera o botão Excluir para `manager`, mas `DELETE /api/users/[id]` exige "
            "`['admin']`. O servidor está certo e a UI mente — o operador clica e leva 403.\n\n"
            "**(b) UI sem gate nenhum.** `pageHead()` renderiza “+ Novo usuário” "
            "incondicionalmente, sem olhar o papel: um `viewer` vê e clica.\n\n"
            "**(c) Hierarquia de papéis declarada e nunca usada.** `ROLE_RANK` "
            "(`viewer:0 … admin:3`) está definido em crm.ts e não tem nenhum consumidor em "
            "`src/` ou `tests/`. Os gates comparam listas explícitas, então o modelo de "
            "papéis é informal: o que vale é apenas o que cada lista escrita à mão disser — "
            "e é exatamente aí que a escalada de privilégio da issue #1 passou."
        ),
        evidencia=(
            "src/ui/views/crm/CrmEquipeView.ts:102-104\n"
            "    const canRemove =\n"
            "    \t(me?.role === 'admin' || me?.role === 'manager') &&\n"
            "    \t(me?.id !== user.id || others.length === 0);\n\n"
            "src/pages/api/users/[id].ts:50 (servidor mais estrito)\n"
            "    const denied = await requireRole(context, ADMINS);\n\n"
            "src/ui/views/crm/CrmEquipeView.ts:42-47 (sem gate nenhum)\n"
            "    function pageHead(): string {\n"
            "    \tconst btn = '<button class=\"btn btn-primary\" id=\"new-user\">+ Novo usuário</button>';\n"
            "    \treturn section('Equipe', 'Usuários e papéis do sistema', btn);\n"
            "    }\n\n"
            "src/domain/crm.ts:166-171 (hierarquia morta)\n"
            "    export const ROLE_RANK: Record<Role, number> = {\n"
            "    \tviewer: 0,\n"
            "    \tagent: 1,\n"
            "    \tmanager: 2,\n"
            "    \tadmin: 3\n"
            "    };\n"
            "    // grep em src/ e tests/: apenas a definição, nenhum consumidor."
        ),
        impacto=(
            "Não há bypass por si só (o servidor sempre decide), mas a divergência "
            "confunde o operador sobre o que é permitido, e a duplicação da matriz de "
            "papéis em literais é a causa estrutural da escalada de privilégio — o mesmo "
            "arquivo `users/index.ts` valida papel corretamente no PUT e incorretamente "
            "no POST."
        ),
        correcao=(
            "Extrair uma matriz `can(user, action)` em módulo único, consumida pela UI "
            "(para desabilitar/esconder) e pelo servidor (via `requireRole`). Usar "
            "`ROLE_RANK[user.role] >= ROLE_RANK[required]` em `requireRole`, ou remover a "
            "hierarquia e a menção a ranking."
        ),
        aceite=[
            "Existe uma função/matriz única descrevendo (papel, ação) e ela é usada por authz.ts e pelas views.",
            "O botão Excluir só aparece quando o endpoint aceita o papel (manager não vê para usuário).",
            "O botão '+ Novo usuário' é condicionado ao papel na renderização.",
            "ROLE_RANK tem um consumidor, ou deixou de existir.",
            "Teste garante que UI e servidor concordam para (viewer, agent, manager, admin).",
        ],
    ),
]