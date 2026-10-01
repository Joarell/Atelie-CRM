# Spec: Security audit fixes

> feature: security-audit-fixes
> status: rascunho

## Contexto

A auditoria de segurança registrada em `docs/security-audit/relatorio-auditoria-seguranca.pdf`
verificou 11 achados no código real (2 críticos, 3 altos, 3 médios, 1 baixo,
2 informativos) e 8 controles corretos. Esta feature fecha os 9 achados que
exigem mudança de código e documenta o único que é decisão de
projeto (informativo), e cobre a lacuna de testes apontada nas issues 9 e 10.

Os dois achados críticos são a mesma classe de falha: o servidor confia no
cliente. `buildInsert`/`buildUpdate` interpolam `Object.keys(row)` no texto
SQL, e nenhuma das rotas de equipe compara `user.role`. Juntos, um único
`viewer` autenticado criava conta admin, redefinia a senha de um
administrador e ainda tinha SQL injection em qualquer rota de escrita.

O app é Astro 7 SSR sobre Cloudflare Workers + D1 (SQLite) com SQL cru,
sessão própria em tabela `sessions`, PBKDF2-SHA256 e frontend SPA imperativo
com `innerHTML`. Não há ORM, RLS nem multi-tenant — `assignedUserId` é
metadado de atribuição comercial, usado só para delimitar o escopo LGPD do
titular, e nunca como autorização.

Estado atual que a feature consome como pré-condição: `src/server/authz.ts`
existe com 0 bytes; `migrations/0020_users_must_change_password.sql` e
`migrations/0021_seed_admin_flag.sql` existem com 0 bytes e não estão nos
scripts `db:migrate:*`; `src/server/tables.ts` declara apenas `jsonFields` e
`boolFields`, sem lista de colunas.

## Histórias

### US-100 — Autorização por papel nas rotas privilegiadas

Como responsável pela segurança do ERP, quero que cada rota privilegiada
verifique o papel de quem chama, para que um usuário autenticado sem
privilégio não administre contas nem configuração.

Matriz decidida com o dono do produto: listar, criar e editar usuário exige
`admin` ou `manager`; alterar papel, redefinir senha e excluir usuário exige
`admin`; `/api/settings` exige `admin` ou `manager`.

#### AC-100 — Criar usuário é negado a viewer e agent

- **Dado** uma sessão autenticada com papel `viewer`
- **Quando** faço `POST /api/users` com corpo válido
- **Então** a resposta é `403`
- **Dado** uma sessão autenticada com papel `agent`
- **Quando** faço `POST /api/users` com corpo válido
- **Então** a resposta é `403`

#### AC-101 — Criar usuário é permitido a manager e admin

- **Dado** uma sessão autenticada com papel `manager`
- **Quando** faço `POST /api/users` com corpo válido
- **Então** a resposta é `201` e a linha é gravada em `users`

#### AC-102 — Listar usuários exige manager ou admin

- **Dado** uma sessão autenticada com papel `viewer`
- **Quando** faço `GET /api/users`
- **Então** a resposta é `403`
- **Dado** uma sessão autenticada com papel `manager`
- **Quando** faço `GET /api/users`
- **Então** a resposta é `200` e o corpo não contém `passwordHash` nem
  `passwordSalt`

#### AC-103 — Alterar papel exige admin

- **Dado** uma sessão autenticada com papel `manager`
- **Quando** faço `PUT /api/users/<id>` com `role` no corpo
- **Então** a resposta é `403` e o papel do usuário alvo não muda
- **Dado** uma sessão autenticada com papel `admin`
- **Quando** faço `PUT /api/users/<id>` com `role` no corpo
- **Então** a resposta é `200` e o papel do usuário alvo muda

#### AC-104 — Redefinir senha exige admin

- **Dado** uma sessão autenticada com papel `manager`
- **Quando** faço `PUT /api/users/<id>` com `password` no corpo
- **Então** a resposta é `403` e `passwordHash` do alvo não muda
- **Dado** uma sessão autenticada com papel `admin`
- **Quando** faço `PUT /api/users/<id>` com `password` no corpo
- **Então** a resposta é `200` e o hash do alvo muda

#### AC-105 — Editar nome e e-mail exige manager ou admin

- **Dado** uma sessão autenticada com papel `manager`
- **Quando** faço `PUT /api/users/<id>` com `name` e `email` no corpo
- **Então** a resposta é `200` e os dois campos mudam

#### AC-106 — Excluir usuário exige admin

- **Dado** uma sessão autenticada com papel `manager`
- **Quando** faço `DELETE /api/users/<id>`
- **Então** a resposta é `403` e a linha continua em `users`
- **Dado** uma sessão autenticada com papel `admin`
- **Quando** faço `DELETE /api/users/<id>`
- **Então** a resposta é `200` e a linha não existe mais em `users`

#### AC-107 — Configurações do negócio exigem manager ou admin

- **Dado** uma sessão autenticada com papel `viewer`
- **Quando** faço `PUT /api/settings`
- **Então** a resposta é `403` e o registro de settings não muda
- **Dado** uma sessão autenticada com papel `manager`
- **Quando** faço `PUT /api/settings`
- **Então** a resposta é `200`

#### AC-108 — requireRole nega com 403 e corpo de erro

- **Dado** um papel que não está na lista de permitidos
- **Quando** `requireRole` é avaliado
- **Então** devolve `403` com corpo `{"error":"papel_insuficiente"}` e
  registra em `auth_audit` o papel exigido e o papel de quem chamou

### US-101 — Identificadores de coluna vindos de allowlist

Como responsável pela segurança do ERP, quero que o SQL só aceite colunas
declaradas no schema, para que nenhuma chave enviada no corpo vire
identificador executável.

A allowlist vive em `src/server/tables.ts`, ao lado do shape que já é a
fonte de verdade por entidade, e é filtrada em `entityToRow` — ponto único por
onde passam `insertEntity` e `updateEntity`.

#### AC-109 — entityToRow descarta chave fora da allowlist

- **Dado** o shape da tabela `users` com colunas `id`, `name`, `email`
- **Quando** `entityToRow` recebe `{name: 'Ana', 'nome = (SELECT 1)': 'x'}`
- **Então** a linha devolvida tem `name` e não tem a chave desconhecida

#### AC-110 — buildInsert não interpola coluna desconhecida

- **Dado** uma linha já filtrada pela allowlist
- **Quando** `buildInsert` monta o INSERT
- **Então** o texto SQL contém apenas colunas permitidas e uma quantidade de
  `?` igual à de valores

#### AC-111 — buildUpdate não interpola coluna desconhecida

- **Dado** uma linha já filtrada pela allowlist
- **Quando** `buildUpdate` monta o UPDATE
- **Então** a cláusula `SET` contém apenas colunas permitidas e uma
  quantidade de `?` igual à de valores

#### AC-112 — Payload de subquery não executa nem altera o schema

- **Dado** um `PUT /api/contacts/<id>` cujo corpo traz a chave
  `name = (SELECT passwordHash FROM users) WHERE 1=1 --`
- **Quando** a requisição é processada
- **Então** a resposta é `200`, nenhuma linha de `users` é alterada e o
  registro de `contacts` não recebe a chave desconhecida

#### AC-113 — A allowlist de cada shape bate com o schema das migrations

- **Dado** o schema derivado de todos os arquivos em `migrations/`
- **Quando** comparo com a lista `columns` de cada `*_SHAPE` em `tables.ts`
- **Então** toda coluna declarada na allowlist existe no schema e toda coluna
  do schema exigida pela aplicação está na allowlist

#### AC-114 — Escrita legítima preserva as colunas reais

- **Dado** uma entidade válida com todos os campos normais
- **Quando** `insertEntity` e depois `updateEntity` são executados
- **Então** todas as colunas reais da tabela são gravadas com os valores
  enviados

### US-102 — Sessão WhatsApp restrita a admin

Como responsável pela segurança do ERP, quero que o pareamento e o reset da
sessão do WhatsApp exijam admin autenticado, para que um anônimo não fotografe
o QR nem derrube o atendimento.

Decidido com o dono do produto: o pareamento passa a ser feito já logado
como admin; o token de uso único para pareamento pré-login não será
implementado.

#### AC-115 — GET sem token responde 401

- **Dado** uma requisição sem header `Authorization`
- **Quando** faço `GET /api/whatsapp/session`
- **Então** a resposta é `401` e o corpo não contém QR nem base64 de imagem

#### AC-116 — DELETE sem token responde 401

- **Dado** uma requisição sem header `Authorization`
- **Quando** faço `DELETE /api/whatsapp/session`
- **Então** a resposta é `401` e a sessão do engine não é destruída

#### AC-117 — viewer e agent não acessam a sessão

- **Dado** uma sessão autenticada com papel `viewer`
- **Quando** faço `GET /api/whatsapp/session`
- **Então** a resposta é `403`
- **Dado** uma sessão autenticada com papel `agent`
- **Quando** faço `DELETE /api/whatsapp/session`
- **Então** a resposta é `403` e a sessão do engine não é destruída

#### AC-118 — admin recebe o QR

- **Dado** uma sessão autenticada com papel `admin`
- **Quando** faço `GET /api/whatsapp/session`
- **Então** a resposta é `200` e o corpo traz o estado da sessão

#### AC-119 — A rota sai do conjunto público

- **Dado** o conjunto `PUBLIC_PATHS` do middleware
- **Quando** ele é inspecionado
- **Então** não contém `/api/whatsapp/session` e o comentário que justificava
  a exposição pública foi removido

### US-103 — Segredo da WAHA fora do controle de versão

Como responsável pela segurança do ERP, quero que o verificador da credencial
do motor de WhatsApp não esteja versionado, para que nenhum clone do projeto
receba material de autenticação.

Decidido com o dono do produto: rotacionar a chave e remover o arquivo do
índice; o histórico git **não** será reescrito.

#### AC-120 — waha/.env não é rastreado

- **Dado** a saída de `git ls-files waha/.env`
- **Quando** consulto o resultado
- **Então** a saída é vazia

#### AC-121 — .gitignore protege .env

- **Dado** o arquivo `.gitignore`
- **Quando** inspeciono suas regras
- **Então** contém uma regra que cobre `.env`

#### AC-122 — O compose não embute a credencial

- **Dado** `waha/docker-compose.waha.yml`
- **Quando** inspeciono o serviço do engine
- **Então** a credencial vem de variável de ambiente e não há hash SHA-512
  literal no arquivo

#### AC-123 — O exemplo não carrega verificador real

- **Dado** `waha/.env.example`
- **Quando** inspeciono o arquivo
- **Então** não contém nenhum valor `sha512:` com dígitos hexadecimais

### US-104 — Troca obrigatória da senha do seed

Como responsável pela segurança do ERP, quero que a senha padrão do admin
criado pelo seed não sirva para nada até ser trocada, para que a credencial
documentada no README deixe de ser uma porta de entrada.

Decidido com o dono do produto: a exigência vale em **todos** os ambientes,
inclusive o banco local de desenvolvimento.

#### AC-124 — A coluna existe e a migration está nos scripts

- **Dado** o schema derivado de `migrations/0020_users_must_change_password.sql`
- **Quando** consulto as colunas de `users`
- **Então** existe `mustChangePassword`, e o arquivo é referenciado por
  `db:migrate:local` e `db:migrate:remote` em ordem crescente

#### AC-125 — O admin do seed nasce com a flag ligada

- **Dado** `migrations/0021_seed_admin_flag.sql`
- **Quando** ele é aplicado sobre um banco onde `seed-user-admin` tem a senha
  padrão
- **Então** `mustChangePassword` do `seed-user-admin` passa a `1`

#### AC-126 — Login com senha padrão exige troca

- **Dado** o admin do seed com `mustChangePassword` igual a `1`
- **Quando** faço `POST /api/auth/login` com a senha padrão
- **Então** a resposta é `200`, a sessão é criada e o corpo traz
  `mustChangePassword: true`

#### AC-127 — A API fica bloqueada até a troca

- **Dado** uma sessão de usuário com `mustChangePassword` igual a `1`
- **Quando** faço qualquer requisição `/api/*` fora da allowlist de troca
- **Então** a resposta é `403` com `troca_de_senha_obrigatoria`
- **Dado** a mesma sessão
- **Quando** faço `GET /api/auth/me`, `POST /api/auth/change-password` ou
  `POST /api/auth/logout`
- **Então** a requisição é processada normalmente

#### AC-128 — A troca limpa a flag

- **Dado** uma sessão de usuário com `mustChangePassword` igual a `1`
- **Quando** concluo `POST /api/auth/change-password` com senha válida
- **Então** a resposta é `200`, `mustChangePassword` passa a `0` e uma
  requisição `/api/*` comum volta a responder sem 403

#### AC-129 — O README não documenta a senha do seed

- **Dado** o arquivo `README.md`
- **Quando** procuro `admin123` e o par `admin@deskcomm.local` seguido de
  senha
- **Então** `admin123` não aparece e o README afirma que o primeiro acesso
  exige troca de senha

#### AC-130 — Seed remoto exige flag explícita

- **Dado** o script `db:seed:remote` no `package.json`
- **Quando** inspeciono o comando
- **Então** ele passa por um script de guarda que aborta sem
  `--allow-seed-admin`

### US-105 — Escape correto em atributo HTML

Como responsável pela segurança do ERP, quero que dado de usuário interpolado
em atributo HTML seja escapado também para aspas, para que o dado não feche o
atributo e injete marcação.

#### AC-131 — escapeAtrib escapa aspas

- **Dado** o texto `a"b'c&d<e>`
- **Quando** passo por `escapeAtrib`
- **Então** a saída contém `&quot;` e `&#39;`, e não contém aspas cruas

#### AC-132 — Aspa em atributo não cria elemento no DOM

- **Dado** um valor de atributo `x"><img src=x>` interpolado com
  `escapeAtrib` dentro de `value="..."`
- **Quando** o HTML resultante é montado em um DOM
- **Então** o atributo `value` é lido como o texto literal e a imagem não é
  criada

#### AC-133 — escapeHtml continua correto para texto

- **Dado** o texto `<b>a & b</b>`
- **Quando** passo por `escapeHtml`
- **Então** a saída é `&lt;b&gt;a &amp; b&lt;/b&gt;`

#### AC-134 — Sinks de atributo migrados

- **Dado** os sinks de atributo citados na auditoria
  (`crmUi.ts`, `CustomersView.ts`, `CrmInboxView.ts`)
- **Quando** inspeciono as linhas
- **Então** nenhuma interpola dado de usuário direto em atributo com
  `escapeHtml`; todas usam `escapeAtrib`

### US-106 — Sem trabalho duplicado no recorte LGPD

Como titular dos dados, quero que o recorte LGPD seja montado sem filtrar a
mesma coleção duas vezes, para que a resposta continue igual e mais barata.

#### AC-135 — contacts é filtrado uma vez

- **Dado** a montagem do recorte LGPD de `me/data.ts`
- **Quando** inspeciono a função
- **Então** `contacts` é filtrado uma única vez e o resultado é reaproveitado

#### AC-136 — O recorte LGPD permanece idêntico

- **Dado** o mesmo banco e o mesmo usuário antes e depois da mudança
- **Quando** peço o recorte LGPD
- **Então** o resultado é o mesmo

### US-107 — Modelo de acesso documentado

Como quem opera este ERP, quero que o README diga que o acesso é global por
papel e que `assignedUserId` não é autorização, para que ninguém trate um
rótulo comercial como fronteira de segurança.

#### AC-137 — README declara a ausência de isolamento por linha

- **Dado** o arquivo `README.md`
- **Quando** inspeciono a seção de acesso
- **Então** afirma que as listagens devolvem a base inteira e que não existe
  filtro por dono

#### AC-138 — README qualifica assignedUserId

- **Dado** o arquivo `README.md`
- **Quando** inspeciono a seção de acesso
- **Então** afirma que `assignedUserId`/`assigneeUserId` são metadados de
  atribuição, usados só para o escopo LGPD, e não autorização

#### AC-139 — Nenhum código trata assignedUserId como autorização

- **Dado** o código de `src/`
- **Quando** inspeciono os usos de `assignedUserId` e `assigneeUserId`
- **Então** todos estão sob escopo LGPD (`me/data.ts`, `me/export.ts`,
  `me/erase.ts`) e nenhum decide acesso

### US-108 — Cobertura das rotas por id

Como responsável pela segurança do ERP, quero um teste que trave o contrato das
rotas por id, para que uma correção de autorização não seja revertida sem o
teste acusar.

#### AC-140 — O inventário das 20 rotas por id é testado

- **Dado** os arquivos `src/pages/api/**/[[]id[]].ts`
- **Quando** o teste compara o inventário com a lista esperada
- **Então** toda rota por id presente no código está na lista esperada e não há
  rota listada que não exista

#### AC-141 — As rotas por id exigem sessão

- **Dado** as 20 rotas por id
- **Quando** inspeciono a configuração do middleware
- **Então** nenhuma delas está em `PUBLIC_PATHS`, e a única que cruza
  fronteira de privilégio — `users/[id]` — tem cobertura de papel em teste

## Suposições

#### ASM-100 — O app segue single-tenant, sem isolamento por linha [confirmada]

O acesso é global por papel desde a origem; `assignedUserId` é metadado de
atribuição e não fronteira. Confirmado pelo README ("sem multi-tenant") e
registrado como achado informativo na auditoria. Por isso a correção de IDOR
se limita a `users/[id]`; as outras 19 rotas atacam recursos compartilhados.

#### ASM-101 — O middleware é o único que resolve o usuário [confirmada]

`locals.user` é preenchido por `src/middleware.ts` para toda rota `/api/*`
fora de `PUBLIC_PATHS`. `/api/users` e `/api/settings` não estão em
`PUBLIC_PATHS`, então basta um `requireRole` na rota lendo `locals.user` — não
é preciso mudar o middleware para a matriz de papéis.

#### ASM-102 — O pareamento do WhatsApp passa a exigir admin logado [confirmada]

Decidido com o dono do produto. A rota `/api/whatsapp/session` sai de
`PUBLIC_PATHS` e passa a exigir `admin`; não haverá token de uso único para
pareamento pré-login.

#### ASM-103 — O histórico git não será reescrito [confirmada]

Decidido com o dono do produto. A exposição futura é fechada por
`git rm --cached`, regra no `.gitignore` e rotação de `WAHA_API_KEY`; o valor
antigo permanece nos commits passados.

#### ASM-104 — A troca de senha vale também no banco local [confirmada]

Decidido com o dono do produto: `mustChangePassword` é `1` para o admin do
seed em qualquer ambiente, inclusive no banco local de desenvolvimento. O
README deixa de documentar a senha do seed.

#### ASM-105 — A allowlist de colunas é a fonte de verdade em tables.ts [confirmada]

A lista de colunas passa a morar em `TableShape.columns`, ao lado do
`jsonFields`/`boolFields` que já é a fonte de verdade por entidade. Um teste
de paridade contra o schema derivado das migrations impede a lista de
divergir do banco.

## Perguntas em aberto

Nenhuma. As seis decisões que dependiam do dono do produto (pareamento do
WhatsApp, reescrita de histórico, força do bloqueio de troca, matriz de
papéis, flag no seed local e destino dos testes vazios de UI) foram respondidas
e estão registradas como suposições confirmadas ASM-100 a ASM-105.