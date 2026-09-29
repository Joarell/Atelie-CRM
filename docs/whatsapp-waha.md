---
title: Runbook — WAHA local (teste de conexão)
status: canônico
last_review: 2026-09-17
owner: Ateliê ERP
---

# Runbook — WAHA local (teste de conexão)

> Procedimento manual pra subir, parear, verificar e operar o **WAHA** (engine NOWEB)
> em desenvolvimento e rodar o teste de conexão do Ateliê ERP localmente. A instância
> de prod do Ateliê roda sobre Cloudflare Workers/D1: o health check e o runtime
> (webhooks/ingest/envio/sessão) usam o mesmo WAHA — ver Escopo. Este documento é o
> "how to" operacional; a spec de
> referência (multi-tenant Vercel/Supabase) está no checkout irmão
> (`DeskcommCRM-RecipeCosting/docs/specs/03-spec-whatsapp-waha.md`) e vale aqui só
> nos fatos de versão/config marcados abaixo.

**Legenda de proveniência:** `CONFIRMADO` = provado por código deste repo ou pelos
documentos de referência do checkout irmão; `INFERIDO` = extrapolação (comportamento
não confirmado num destes dois lugares).

---

## 1. Escopo

Este runbook cobre o **WAHA local e o teste de conexão** (seu conteúdo operacional
original). O **runtime em tempo real** — receiver de webhooks (HMAC SHA-512),
ingestão inbound em D1 (dedup/ack/edit/revoke), envio de mensagem pelo app
(inclusive reply-to) e start/stop de sessão via `/api/whatsapp/session` — também
está portado e usa o mesmo WAHA; ele vive em `src/server/wahaWebhook.ts`,
`src/server/wahaIngest.ts`, `src/domain/wahaWebhook.ts` e
`src/pages/api/whatsapp/{webhook,session,send}.ts`, é de propriedade do agente
`waha-runtime`. A **inscrição do webhook** (o que o engine deve entregar e para
onde, registrada pelo app ao criar a sessão) vive em
`src/domain/wahaWebhookConfig.ts` + `src/pages/api/whatsapp/webhook-config.ts`,
é de propriedade do agente `waha-webhook` e segue uma regra única: **um caminho
de entrega por mensagem nova** (aqui você **não** habilita gancho global no
container). O `WahaClient` (compartilhado) possui `sendText`, usado pelo envio
real do app — não existe mais caminho de "só teste" para a sessão além da rota
de health.

### 1.1 Arquitetura — quem implementa o quê

| Peça | Caminho | Responsabilidade |
|---|---|---|
| Cliente REST | `src/server/waha.ts` | `WahaClient` (chamadas HTTP com teto de relógio), `readWahaConfig` (env → config ou `null`), `WahaError` (`waha_<op>_<status>`, corpo da resposta descartado), `WahaTimeoutError`, `checkConnection()` — o teste de conexão em si |
| Classificação pura | `src/domain/whatsapp.ts` | Constantes (`WAHA_DEFAULT_TIMEOUT_MS=15_000`, `WAHA_DEFAULT_SESSION='default'`, `WAHA_DEV_PLACEHOLDER_KEY='dev_plaintext_change_me'`, `WAHA_HEALTHY_STATUS='WORKING'`, códigos de `detail`), `describeWahaServer` (versão `2026.7.2` + engine `NOWEB` → `multipleSessions: 'supported'`), `parseWahaSession`, `toWahaHealth` |
| Rota de saúde | `src/pages/api/whatsapp/health.ts` | `GET /api/whatsapp/health`: guarda de sessão (401) → `readWahaConfig(env)` (503 se sem config) → `checkConnection()` (200 se `healthy`, senão 502) |
| Smoke CLI | `scripts/waha-smoke.ts` | Teste de conexão ao vivo no terminal (fora da suíte — determinismo) |
| Puro / registro do webhook | `src/domain/wahaWebhookConfig.ts` | Evento único por mensagem nova (`message.any`; nunca `message` + `message.any`), default curado, retries limitados (constante/5s/3), `sessionWebhookFor`, e a guarda idempotente `wahaWebhookNeedsRegistration` |
| Rota de inscrição | `src/pages/api/whatsapp/webhook-config.ts` | `GET`/`PUT /api/whatsapp/webhook-config`: guarda de sessão (401) → `readWahaConfig` (503) → reporta `{configured,url,events,registered}` e registra/ressincroniza com `PUT /api/sessions/:name` (idempotente; `webhook_nao_configurado` 400) |
| Config | `.dev.vars` (cópia de `.dev.vars.example`) | `WAHA_API_BASE_URL`, `WAHA_API_KEY`, `WAHA_SESSION_NAME` (+ runtime/registro: `WHATSAPP_HOOK_URL`, `WHATSAPP_HOOK_EVENTS`, `WAHA_HMAC_SECRET`, `WAHA_WEBHOOK_REQUIRE_SIGNATURE`) — o APP é o dono do registro; o container dev NÃO tem gancho global |
| Container dev | `waha/docker-compose.waha.yml` | WAHA `devlikeapro/waha:noweb` local via Podman, DEV ONLY (não existe mais variante `docker compose` na raiz) |

Fluxo do teste: `GET /api/whatsapp/health` → define config a partir do env → se
ausente/placeholder responde `503 waha_nao_configurado`; senão `WahaClient.checkConnection()`
chama `GET /api/server/version` e `GET /api/sessions/:name` com `X-Api-Key`, e o
`toWahaHealth` classifica `healthy` (= `WORKING`) ou um `detail` de falha → `200` ou `502`.

---

## 2. Pré-requisitos (dev)

- **Podman** instalado (≥ 5; testado com 6.x) com **um** provider de compose
  (`podman compose` — usa o binário `docker-compose` no PATH — ou `podman-compose`)
  **e o daemon podman rodando** — sem o container, `npm run waha:smoke` (live engine
  health) falha e a saúde reporta `waha_inacessivel`.
- **Porta `3000` livre** no host: o container publica `3000:3000` e este app aponta
  `WAHA_API_BASE_URL=http://127.0.0.1:3000`.
- **Um número de WhatsApp livre** (não o seu principal, idealmente) para o pareamento
  do PROCEDIMENTO 2. O app espera uma sessão chamada `default` (`WAHA_SESSION_NAME`).
- Nenhuma instalação extra: as dependências são as do `package.json` (nenhuma nova).

---

## 3. PROCEDIMENTO 1 — Subir o WAHA local

O compose já vem pré-configurado com a chave de dev `local-test-key` (o SHA-512 hex
dela no `WAHA_API_KEY` do container; o plaintext no `.dev.vars`). Se você **rotacionar
a chave**, aplique os passos 1–3; senão pule direto pro passo 4.

1. **Gerar a chave plaintext** (64 hex chars) e anotar em local seguro (1Password):

   ```bash
   KEY=$(openssl rand -hex 32)
   echo "$KEY"
   ```

2. **Calcular o SHA-512 hex dela** — é este valor que o WAHA aceita na env, com o
   prefixo `sha512:`:

   ```bash
   echo -n "$KEY" | shasum -a 512 | awk '{print $1}'
   ```

3. **Configurar os dois lados da chave**:
   - No `waha/docker-compose.waha.yml`, `WAHA_API_KEY: "sha512:<hex_do_passo_2>"`
     (ou no `waha/.env` → `WAHA_API_KEY_SHA512="sha512:<hex_do_passo_2>"`, que
     sobrescreve o padrão do compose).
   - No `.dev.vars`, `WAHA_API_KEY="<plaintext_do_passo_1>"` (mesmo valor, em claro).

   > Por que dois valores? O WAHA guarda **só o hash**: recebe o plaintext no header
   > `X-Api-Key`, computa o SHA-512 e compara. O app manda o plaintext; o compose
   > declara a forma hasheada. (CONFIRMADO — spec de referência §2.2/§4.3 e
   > `src/server/waha.ts:136`.)

   Não rotacionou? Nos comandos abaixo, `KEY=local-test-key` (o plaintext do padrão).

4. **Subir o container** (o compose de dev vive em `waha/docker-compose.waha.yml`):

   ```bash
   podman compose -f waha/docker-compose.waha.yml up -d
   # ou (nativo)
   podman-compose -f waha/docker-compose.waha.yml up -d
   ```

   > `npm run waha:smoke` NÃO sobe o container — ele só testa o engine já rodando.

5. **Aguardar ficar saudável**: o healthcheck tem `start_period` de 30s.

   ```bash
   podman compose -f waha/docker-compose.waha.yml ps
   # → atelie-erp-waha ... (healthy)
   ```

6. **Verificar o serviço sem auth** — `GET /ping` é o único endpoint público desta
   build (QUALQUER auth do WAHA responde 401/404 sem chave):

   ```bash
   curl -fsS http://127.0.0.1:3000/ping
   ```

7. **Verificar a chave e a versão** (exige `X-Api-Key`):

   ```bash
   curl -s -H "X-Api-Key: $KEY" http://127.0.0.1:3000/api/server/version
   ```

   A versão reportada é a que o tag `:noweb` resolve no dia do pull (ex.: `2026.8.2`
   nesta revisão), sempre com `engine: NOWEB`. O `describeWahaServer` marca
   `multipleSessions: 'supported'` apenas para o par exatamente provado em QA
   (`version 2026.7.2` + `engine NOWEB`); qualquer outro par (como `2026.8.2`) vira
   `'unknown'` — cap medido, por design, e que **não** afeta a saúde nem o teste de
   conexão (CONFIRMADO — `src/domain/whatsapp.ts:90-95`).

---

## 4. PROCEDIMENTO 2 — Parear a sessão `default`

O teste de conexão **não exige sessão pareada** — mas a rota de saúde só responde `200`
quando a sessão está `WORKING`. Para chegar lá:

1. **Iniciar a sessão `default`** (se o build não criar/retomar sozinho; em builds
   que respeitam `WHATSAPP_RESTART_ALL_SESSIONS` a sessão já volta `WORKING` depois
   de pareada):

   ```bash
   curl -s -X POST -H "X-Api-Key: $KEY" http://127.0.0.1:3000/api/sessions/default/start
   ```

2. **Ler o QR**: `GET /api/sessions/default` devolve `status` + campo `qr` (data-URI
   `data:image/png;base64,...` — o cliente o capa em 8192 chars, CONFIRMADO em
   `src/domain/whatsapp.ts:99`):

   ```bash
   curl -s -H "X-Api-Key: $KEY" http://127.0.0.1:3000/api/sessions/default
   ```

   Para renderizar o PNG localmente (decodifica só a parte base64) e abrir:

   ```bash
   curl -s -H "X-Api-Key: $KEY" http://127.0.0.1:3000/api/sessions/default \
     | python3 -c "import sys,base64,json; d=json.load(sys.stdin); open('/tmp/waha-qr.png','wb').write(base64.b64decode(d['qr'].split(',',1)[1]))"
   ```

3. **Escanear** com o WhatsApp → **Aparelhos conectados** → **Conectar um aparelho**
   → apontar a câmera pro `/tmp/waha-qr.png`. (Fluxo do app de referência,
   CONFIRMADO na spec §5.4.)

4. **Aguardar `WORKING`**: re-consulte a sessão até o `status` mudar de
   `SCAN_QR_CODE` para `WORKING` — normalmente segundos após o scan:

   ```bash
   curl -s -H "X-Api-Key: $KEY" http://127.0.0.1:3000/api/sessions/default
   ```

   O QR **expira em ~60s** e não se regenera sozinho nesta build; se expirar,
   re-execute o passo 2/3 para obter um novo. (Refresh forçado a cada 30s no front
   da referência — CONFIRMADO na spec §5.2; a cadência exata deste repo é
   INFERIDO, pois não há UI de pareamento aqui.)

Após `WORKING`, `GET /api/whatsapp/health` responde `200` e o `npm run waha:smoke`
dá exit `0`.

---

## 5. PROCEDIMENTO 3 — Verificação (testes)

### 5.1 Suite offline (determinística, sem daemon de Docker)

```bash
npm run check               # tsc --noEmit (src)
npm run check:tests         # tsc --noEmit -p tsconfig.tests.json (tests/**)
npx vitest run tests/server/waha.test.ts tests/server/whatsappHealth.test.ts tests/domain/whatsapp.test.ts
npx vitest run              # suíte completa
```

O teste do cliente injeta um `fetch` falso (o transport é testável sem rede —
CONFIRMADO em `src/server/waha.ts:20-21`), então a suite inteira roda offline.

### 5.2 Smoke ao vivo (precisa do PROCEDIMENTO 1)

```bash
npm run waha:smoke
```

Exige WAHA alcançável em `http://127.0.0.1:3000` (sobrescrevível por env). Sessão
pareada **não** é exigida: uma sessão não pareada reporta `sessao_sem_conexao: SCAN_QR_CODE`
e ainda assim prova a conexão.

### 5.3 Tabelas de referência

**`detail` da rota → HTTP status** (CONFIRMADO — `src/pages/api/whatsapp/health.ts` +
`src/domain/whatsapp.ts`):

| `detail` | Significado | HTTP |
|---|---|---|
| *(nenhum — `healthy: true`)* | servidor responde, chave aceita, sessão `WORKING` | `200` |
| `sessao_invalida` *(resp. de auth da rota, não é `detail` do domínio)* | Bearer ausente/inválido — o guard do app, não o WAHA | `401` |
| `waha_nao_configurado` | env ausente ou `WAHA_API_KEY` = placeholder `dev_plaintext_change_me` | `503` |
| `waha_inacessivel` | WAHA fora do ar / porta errada / container não iniciado | `502` |
| `credencial_recusada_pelo_transporte` | WAHA respondeu `401`/`403` para a `X-Api-Key` | `502` |
| `sessao_inexistente` | WAHA respondeu `404` para a sessão | `502` |
| `sessao_sem_conexao: <status>` | sessão existe mas `status ≠ WORKING` | `502` |

**Exit codes do `waha:smoke`** (CONFIRMADO — `scripts/waha-smoke.ts`):

| Exit | Condição |
|---|---|
| `0` | alcançável **e** autenticado (sessão pareada não é exigida) |
| `1` | inalcançável **ou** chave recusada (401/403) |
| `2` | não configurado: env ausente ou chave placeholder |

---

## 6. PROCEDIMENTO 4 — Operação

### 6.1 Ciclo de vida da sessão

- **Iniciar**: `curl -s -X POST -H "X-Api-Key: $KEY" http://127.0.0.1:3000/api/sessions/default/start`
- **Parar**: `curl -s -X POST -H "X-Api-Key: $KEY" http://127.0.0.1:3000/api/sessions/default/stop`
- **Reiniciar o container** (retoma as sessões existentes graças a
  `WHATSAPP_RESTART_ALL_SESSIONS="True"`, em vez de deixá-las `STOPPED`):

  ```bash
  podman compose -f waha/docker-compose.waha.yml restart waha
  ```

- **Logs**: `podman compose -f waha/docker-compose.waha.yml logs -f waha` ·
  **Parar dev** (mantém volumes): `podman compose -f waha/docker-compose.waha.yml down`
- **Verificar após QUALQUER operação de container**: `npm run waha:smoke` (live engine health)

### 6.2 Rotacionar a `WAHA_API_KEY`

Fazer nos **dois lados** e reiniciar:

```bash
KEY=$(openssl rand -hex 32)
echo -n "$KEY" | shasum -a 512 | awk '{print $1}'   # → novo hex
```

1. `waha/docker-compose.waha.yml` → `WAHA_API_KEY: "sha512:<novo_hex>"` (ou `waha/.env` → `WAHA_API_KEY_SHA512="sha512:<novo_hex>"`, que sobrescreve o padrão do compose).
2. `.dev.vars` → `WAHA_API_KEY="<plaintext>"` (mesma string do passo acima).
3. Recriar o container com a nova env (`podman compose -f waha/docker-compose.waha.yml up -d`)
   e verificar com `npm run waha:smoke` (live engine health).

Se só um dos lados mudar, o WAHA passa a recusar a chave → `credencial_recusada_pelo_transporte`.

### 6.3 O volume `waha-data`

`waha-data:/app/.sessions` guarda o estado de pareamento (`waha-media:/app/.media` é
só cache). **Perder o volume = deslogar todos os números** e re-scan de QR do
PROCEDIMENTO 2 em cada sessão. Em dev isso é só chato; é por isso que este runbook
individualiza o pareamento e mantém o restart sem `down`.

### 6.4 Regras que o cliente impõe (não mexer)

- **Teto de relógio de 15s**: toda chamada do `WahaClient` usa
  `AbortSignal.timeout(15000)` (CONFIRMADO — `src/server/waha.ts:135`). O pior caso é
  o socket que **aceita e nunca responde**; o cliente desiste sozinho em vez de pendurar
  a requisição. Esperar mais que isso numa operação manual é sintoma, não regra.
- **Erros jamais carregam o corpo da resposta**: `WahaError` guarda só o status HTTP
  (`waha_<operacao>_<status>`), porque o corpo pode conter números de telefone, HMACs de
  webhook e chaves de API (CONFIRMADO — `src/server/waha.ts:34-43` e cabeçalho do arquivo).
  Nunca vaze o corpo de uma resposta do WAHA num log ou erro de aplicação.

---

## 7. Troubleshooting

| Sintoma | Diagnóstico | Fix |
|---|---|---|
| `GET /api/whatsapp/health` → `502 credencial_recusada_pelo_transporte` | WAHA respondeu 401/403: `WAHA_API_KEY` desalinhada (compose tem hash velho, `.dev.vars` outro plaintext, ou só um lado foi trocado) | Rotacionar nos dois lados (PROCEDIMENTO 4 §6.2), recriar o container e verificar com `npm run waha:smoke` (live engine health) |
| `502 waha_inacessivel` | WAHA fora do ar, porta errada, container não iniciado, ou **daemon do podman parado** | `podman compose -f waha/docker-compose.waha.yml ps`; daemon rodando?; `... up -d`; conferir `3000` livre; verificar com `npm run waha:smoke` (live engine health) |
| `502 sessao_inexistente` | Sessão nunca criada, ou volume `waha-data` foi perdido (re-parear tudo) | PROCEDIMENTO 2 (start + QR) |
| `502 sessao_sem_conexao: STARTING` | Sessão subindo — estado transitório | Aguardar e re-consultar (≤ ~30s) |
| `502 sessao_sem_conexao: SCAN_QR_CODE` | Tudo certo exceto o pareamento | Escanear o QR (PROCEDIMENTO 2) |
| `502 sessao_sem_conexao: STOPPED` | Sessão parada (container reiniciou sem `WHATSAPP_RESTART_ALL_SESSIONS`, ou stop manual) | `POST /api/sessions/default/start`, ou `podman compose -f waha/docker-compose.waha.yml restart waha`; verificar com `npm run waha:smoke` |
| `502 sessao_sem_conexao: FAILED` | Pareamento quebrado (aparelho removido no telefone, ou scan falhou) | Recriar a sessão e re-parear (PROCEDIMENTO 2); verificar com `npm run waha:smoke` (live engine health) |
| QR não atualiza / expira antes do scan | QR expira em ~60s e não pinga sozinho nesta build | Re-executar o `GET /api/sessions/default` e re-scanear; conferir relógio do host (clock drift degrada o QR) |
| `waha_timeout: o WAHA nao respondeu em 15000ms` | Socket que aceita e nunca responde (regra do §6.4) — WAHA travado/sobrecarregado | `podman compose -f waha/docker-compose.waha.yml ps` (healthy?); `... restart waha`; verificar com `npm run waha:smoke` (live engine health) |
| Container `OOMKilled` / devagar com várias sessões | NOWEB usa ~150 MB por sessão + overhead Node (~300 MB) (CONFIRMADO — runbook irmão §1) | Reduzir o nº de sessões ativas; dar mais RAM ao podman no host |
| Chave "stale": troquei o plaintext e nada mudou | `sha512` no compose não foi regenerado — o WAHA compara contra o hash antigo | Regenerar o hex com `shasum -a 512` do novo plaintext, atualizar os dois lados, recriar o container (`podman compose ... up -d`) e `npm run waha:smoke` (live engine health) |
| Webhook → `401` do app (ou `{accepted:false,reason:"bad_signature"}`) | `hmac.key` registrado na sessão (`WAHA_HMAC_SECRET` do app, em `config.webhooks`) ≠ chave que o receiver verifica com `WAHA_HMAC_SECRET` do mesmo `.dev.vars` | Usar o MESMO plaintext nos dois lados (é a mesma variável) e re-registrar via `PUT /api/whatsapp/webhook-config`; verificar com `npm run waha:smoke` |
| Mensagem nova entregue **duas vezes** ao app | Gancho global `WHATSAPP_HOOK_*` do container re-habilitado apontando pro mesmo URL do gancho da sessão — o WAHA dispara os dois | Comentar de novo as linhas do compose (regra: um caminho de entrega por mensagem nova); o registro do app é o caminho único |
| `GET/PUT /api/whatsapp/webhook-config` → `configured:false` | `WHATSAPP_HOOK_URL` ausente/em branco no `.dev.vars` | Definir o URL do receiver do app em `WHATSAPP_HOOK_URL` (eventos opcionais em `WHATSAPP_HOOK_EVENTS`; não pareie `message` com `message.any`) |
| Sessão **WORKING** mas nenhuma mensagem chega (nem de número novo) | `WHATSAPP_HOOK_URL` ausente → sessão criada sem `config.webhooks` → engine com 0 webhooks (0 = dropa toda entrega) | `GET /api/whatsapp/session` retorna `webhook:{configured:false,registered:false}`; definir `WHATSAPP_HOOK_URL` no `.dev.vars` (dev: `http://host.containers.internal:4322/api/whatsapp/webhook`) e re-registrar (`PUT /api/whatsapp/webhook-config` ou recriar a sessão); a aba WhatsApp mostra o banner "Webhook não registrado/não configurado" |

---

## 8. Índice de referências

- **Runbook completo de produção do checkout irmão** (VPS/self-host além do Cloudflare,
  webhooks, backup, Nginx): `DeskcommCRM-RecipeCosting/docs/runbooks/waha-hostgator.md`.
  O Ateliê ERP roda em Cloudflare Workers/D1 — a parte de VPS/produção do runbook
  irmão (webhooks, Nginx, backup) só se aplica aqui se o WAHA for auto-hospedado
  para prod; os fatos de chave/engine/volume/QR valem para dev igualmente.
- **Spec técnica de referência** (contrato do cliente, fluxo de QR, tabelas):
  `DeskcommCRM-RecipeCosting/docs/specs/03-spec-whatsapp-waha.md`.
- **Docs oficiais do WAHA**: https://waha.devlike.pro/