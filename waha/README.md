---
title: WAHA via Podman (setup local)
status: canônico
last_review: 2026-09-17
owner: Ateliê ERP
---

# WAHA via Podman — setup local

Setup **autossuficiente** para rodar o WAHA (engine NOWEB) com **Podman** usando
um compose file. É o compose canônico de dev do WAHA deste repo (a antiga variante
`docker compose` da raiz não existe mais); o comportamento — chave, engine, volumes,
QR, health — é o documentado em `docs/whatsapp-waha.md`. Este README é o how-to
operacional específico do Podman; para a spec de referência, arquitetura e
troubleshooting geral, veja `docs/whatsapp-waha.md` (no repo) e
`DeskcommCRM-RecipeCosting/docs/specs/03-spec-whatsapp-waha.md`.

## Conteúdo da pasta

| Arquivo | Papel |
|---|---|
| `docker-compose.waha.yml` | Compose file (engine NOWEB, porta 3000, chave hasheada, volumes `waha-data`/`waha-media`, healthcheck) |
| `.env.example` | Modelo de `waha/.env` para rotacionar a `WAHA_API_KEY` |
| `README.md` | Este documento |

## Pré-requisitos

- **Podman** ≥ 5 (testado com 6.1.1) e **uma** opção de compose:
  - `podman compose` (usa o binário `docker-compose` presente no PATH), **ou**
  - `podman-compose` (implementação Python nativa).
- **Porta `3000` livre** no host — o container publica `3000:3000` e o app aponta
  para `http://127.0.0.1:3000` (no `.dev.vars`).
- **Um número de WhatsApp livre** (não o seu principal) para o pareamento. O app
  espera a sessão `default` (`WAHA_SESSION_NAME`).
- Host `x86_64`: a imagem é a `devlikeapro/waha:noweb` (amd64). Em host arm64,
  instale qemu-user/binfmt e force `--platform linux/amd64` no pull, senão o
  container não roda.

## PROCEDIMENTO 1 — Subir o WAHA

**A chave precisa ser provisionada — não há padrão utilizável.** O `WAHA_API_KEY`
do compose cai num sentinela (`sha512:INVALID_CHANGE_ME`) que nenhuma chave real
casa, então um container recém-criado sem `waha/.env` responde `401` a tudo
(deliberado: o repo não carrega segredo). O passo 1 é obrigatório.

1. **Provisionar a chave** (obrigatório): `cp waha/.env.example waha/.env`, gere um
   novo plaintext (`openssl rand -hex 32`), calcule o hex
   (`echo -n "$KEY" | shasum -a 512 | awk '{print $1}'`), preencha
   `WAHA_API_KEY_SHA512="sha512:..."` no `waha/.env` e atualize o `.dev.vars`
   do app com o mesmo plaintext.

2. **Subir** (cria o container `atelie-erp-waha` e os volumes):
   ```bash
   cd /home/joarell/atelie-erp\(1\)
   podman compose -f waha/docker-compose.waha.yml up -d
   # ou (nativo)
   podman-compose -f waha/docker-compose.waha.yml up -d
   ```

3. **Aguardar saudável** (healthcheck leva até ~30s):
   ```bash
   podman compose -f waha/docker-compose.waha.yml ps
   # → atelie-erp-waha ... (healthy)
   ```

4. **Verificar sem auth** (único endpoint público desta build):
   ```bash
   curl -fsS http://127.0.0.1:3000/ping
   ```

5. **Verificar chave e versão** (exige `X-Api-Key`):
   ```bash
   KEY=<o plaintext do passo 1>
   curl -s -H "X-Api-Key: $KEY" http://127.0.0.1:3000/api/server/version
   # → a versão é a do tag `:noweb` no dia do pull (ex.: 2026.8.2), engine NOWEB
   ```

## PROCEDIMENTO 2 — Parear a sessão `default`

O teste de conexão não exige sessão pareada, mas a rota de saúde só responde `200`
com a sessão `WORKING`:

```bash
KEY=<o plaintext do passo 1>
# 1. Iniciar / retomar a sessão
curl -s -X POST -H "X-Api-Key: $KEY" http://127.0.0.1:3000/api/sessions/default/start
# 2. Ler o QR (data-URI) e decodificar o PNG
curl -s -H "X-Api-Key: $KEY" http://127.0.0.1:3000/api/sessions/default \
  | python3 -c "import sys,base64,json; d=json.load(sys.stdin); open('/tmp/waha-qr.png','wb').write(base64.b64decode(d['qr'].split(',',1)[1]))"
# 3. Escanear: WhatsApp → Aparelhos conectados → Conectar um aparelho
#    (QR expira em ~60s — re-execute o passo 2 se expirar)
# 4. Re-consultar até o status virar WORKING
curl -s -H "X-Api-Key: $KEY" http://127.0.0.1:3000/api/sessions/default
```

Após `WORKING`, o health do app responde `200`:
`GET http://127.0.0.1:4322/api/whatsapp/health` no dev server do app (o `astro dev`
liga em `0.0.0.0:4322` — ver `server` em `astro.config.ts`; o `wrangler dev` da porta
8787 não roda nestes passos) e o smoke da raiz dá exit `0`:
```bash
npm run waha:smoke   # precisa do .dev.vars com o plaintext certo — lê http://127.0.0.1:3000
```

## Operação

| Ação | Comando |
|---|---|
| Subir | `npm run waha:up` |
| Parar (mantém volumes) | `npm run waha:down` |
| Reiniciar | `npm run waha:restart` |
| Logs | `npm run waha:logs` |
| Status | `podman compose -f waha/docker-compose.waha.yml --env-file waha/.env ps` |
| Volumes | `podman volume ls | grep waha` |

- **Iniciar/parar a sessão**: `POST /api/sessions/default/start` · `POST /api/sessions/default/stop`.
- **Volume `waha-data` guarda o pareamento**: perdê-lo = re-scan de QR em todas as
  sessões. Em dev é só chato.
- `WHATSAPP_RESTART_ALL_SESSIONS="True"` faz o container retomar as sessões
  existentes no restart (sem re-scan).

## Notas específicas do Podman

- **Rootless**: não há problema com a porta 3000 (privilegiada é só <1024); volumes
  nomeados funcionam sem root.
- **Healthcheck**: a imagem já traz `curl`; o healthcheck é executado dentro do
  container e funciona com Podman igual ao Docker.
- **SELinux** (Fedora/RHEL): volumes nomeados (`waha-data`, `waha-media`) não
  precisam de rótulo; só se um dia bind-mountar um diretório do host, aí use
  `:Z` no destino do mount.
- **Docker Compose v2 + `podman compose`**: roda junto ao `docker-compose` no PATH.
  `podman-compose` é a alternativa nativa; ambas leem o mesmo compose file.

## Troubleshooting rápido

| Sintoma | Diagnóstico | Fix |
|---|---|---|
| `502 waha_inacessivel` | WAHA fora do ar, porta errada, container parado | `podman compose -f waha/docker-compose.waha.yml ps`; `logs`; `up -d`; conferir `3000` livre |
| `502 credencial_recusada_pelo_transporte` | `waha/.env` e `.dev.vars` dessincronizados (só um lado rotacionado) | Rotacionar nos dois lados e `restart waha` |
| `502 sessao_inexistente` / `SCAN_QR_CODE` | Sessão nunca criada ou volume `waha-data` perdido | PROCEDIMENTO 2 (start + QR) |
| Container não sobe em host arm64 | Imagem amd64 sem emulação | `podman pull --platform linux/amd64 devlikeapro/waha:noweb` + qemu-user/binfmt instalado |
| `502 sessao_sem_conexao: STOPPED` | Sessão parada após restart | `POST /api/sessions/default/start` ou `restart waha` |

A tabela completa (incluindo `detail` → HTTP, exit codes do smoke e limites do
cliente — teto de 15s, erros sem corpo) está em `docs/whatsapp-waha.md` §5–§7.