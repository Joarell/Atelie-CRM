# Plano de execução — security-audit-fixes

> gerado por `onp-spec plano` em 2026-10-01 12:17 — NÃO edite à mão;
> mudou tasks.md ou a config? Regenere: `onp-spec plano security-audit-fixes`

## Resumo — o que vai acontecer

- **10 tarefa(s) pendente(s)**: 10 em 10 faixa(s) paralela(s) + 0 sequencial(is)
- **1 faixa = 1 worktree + 1 branch + 1 janela de contexto limpa** — faixas não compartilham nenhum arquivo entre si
- prefere outra seleção ou uma após a outra? Regenere com `onp-spec plano security-audit-fixes --paralelizar T-xxx,T-yyy` ou `--sequencial`
- tudo acontece na branch de trabalho `spec/security-audit-fixes`; levar para a main é decisão sua

## Faixas e ondas

### Onda 1 — faixa-1 ∥ faixa-2 ∥ faixa-3

#### faixa-1 — branch `spec/security-audit-fixes-faixa-1` — worktree `../onp-worktrees/atelie-erp(1)-security-audit-fixes-faixa-1`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-101 | Núcleo de autorização: requireRole | `claude-sonnet-5` | medium | `src/server/authz.ts`, `tests/server/authz.test.ts` |

#### faixa-2 — branch `spec/security-audit-fixes-faixa-2` — worktree `../onp-worktrees/atelie-erp(1)-security-audit-fixes-faixa-2`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-102 | Allowlist de colunas vira a fonte de verdade | `claude-sonnet-5` | high | `src/server/tables.ts`, `src/server/mapping.ts`, `src/server/sql.ts`, `tests/server/tableColumns.test.ts`, `tests/server/mapping.test.ts`, `tests/server/sql.test.ts` |

#### faixa-3 — branch `spec/security-audit-fixes-faixa-3` — worktree `../onp-worktrees/atelie-erp(1)-security-audit-fixes-faixa-3`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-103 | Segredo da WAHA fora do controle de versão | `claude-sonnet-5` | low | `.gitignore`, `waha/docker-compose.waha.yml`, `waha/.env.example`, `tests/server/wahaComposeSecurity.test.ts` |

### Onda 2 — faixa-4 ∥ faixa-5 ∥ faixa-6

#### faixa-4 — branch `spec/security-audit-fixes-faixa-4` — worktree `../onp-worktrees/atelie-erp(1)-security-audit-fixes-faixa-4`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-104 | Escape correto em atributo HTML | `claude-sonnet-5` | medium | `src/domain/format.ts`, `src/ui/views/crm/crmUi.ts`, `src/ui/views/CustomersView.ts`, `src/ui/views/crm/CrmInboxView.ts`, `tests/domain/format.test.ts`, `tests/ui/escapeAtrib.test.ts` |

#### faixa-5 — branch `spec/security-audit-fixes-faixa-5` — worktree `../onp-worktrees/atelie-erp(1)-security-audit-fixes-faixa-5`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-105 | Recorte LGPD sem trabalho duplicado | `claude-sonnet-5` | low | `src/pages/api/me/data.ts`, `src/pages/api/me/export.ts`, `tests/server/lgpdRights.test.ts` |

#### faixa-6 — branch `spec/security-audit-fixes-faixa-6` — worktree `../onp-worktrees/atelie-erp(1)-security-audit-fixes-faixa-6`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-106 | Modelo de acesso documentado | `claude-sonnet-5` | low | `README.md`, `tests/server/accessModelDoc.test.ts` |

### Onda 3 — faixa-7 ∥ faixa-8 ∥ faixa-9

#### faixa-7 — branch `spec/security-audit-fixes-faixa-7` — worktree `../onp-worktrees/atelie-erp(1)-security-audit-fixes-faixa-7`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-107 | Rotas de usuario e settings exigem papel | `claude-sonnet-5` | high | `src/pages/api/users/index.ts`, `src/pages/api/users/[id].ts`, `src/pages/api/settings.ts`, `tests/server/usersAuthz.test.ts`, `tests/server/settings.test.ts` |

#### faixa-8 — branch `spec/security-audit-fixes-faixa-8` — worktree `../onp-worktrees/atelie-erp(1)-security-audit-fixes-faixa-8`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-108 | Middleware: sessao WhatsApp e bloqueio de troca | `claude-sonnet-5` | high | `src/middleware.ts`, `src/pages/api/whatsapp/session.ts`, `tests/server/middleware.test.ts`, `tests/server/whatsappSessionRoute.test.ts` |

#### faixa-9 — branch `spec/security-audit-fixes-faixa-9` — worktree `../onp-worktrees/atelie-erp(1)-security-audit-fixes-faixa-9`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-109 | Troca obrigatoria da senha do seed | `claude-sonnet-5` | high | `migrations/0020_users_must_change_password.sql`, `migrations/0021_seed_admin_flag.sql`, `package.json`, `src/domain/crm.ts`, `src/server/auth.ts`, `src/pages/api/auth/login.ts`, `src/pages/api/auth/change-password.ts`, `scripts/generate-admin-seed.ts`, `tests/server/mustChangePassword.test.ts` |

### Onda 4 — faixa-10

#### faixa-10 — branch `spec/security-audit-fixes-faixa-10` — worktree `../onp-worktrees/atelie-erp(1)-security-audit-fixes-faixa-10`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-110 | Contrato das rotas por id | `claude-sonnet-5` | low | `tests/server/idRoutesContract.test.ts` |

## Gestão de branches e commits

1. branch de trabalho `spec/security-audit-fixes` criada do ponto atual (se ainda não existir)
2. cada faixa nasce dela como branch própria e roda no seu worktree — **1 tarefa = 1 commit** (`T-xxx feature: título`)
3. terminou a onda → merge `--no-ff` de cada faixa de volta, na ordem; conflito interrompe a faixa e pede resolução humana
4. faixa mesclada → worktree removido, branch apagada, tarefa marcada `[concluida]` no tasks.md
5. gate final na branch de trabalho: `onp-spec verify security-audit-fixes` + `onp-spec audit --ci` — **exit 0 ou não está pronto**

## Como executar

### ▶ Execução — Claude Code headless

```bash
bash .spec/features/security-audit-fixes/executar-tarefas.sh
```

Cada faixa roda `claude -p` com **janela de contexto limpa**, no seu worktree, com
`--model` e `--effort` já definidos por tarefa e permissões `acceptEdits`. Os prompts exatos estão
embutidos no script — quer rodar uma faixa na mão, é só copiá-los de lá.
Logs: `../onp-worktrees/atelie-erp(1)-security-audit-fixes-logs/`.

### 📣 Acompanhamento — tabela + resumo no chat (a cada 1 min)

O script roda em **background**: o agente AVISA o usuário antes de iniciar e,
enquanto roda, posta no chat a cada ~1 minuto a **tabela de andamento** (qual
tarefa está rodando, qual não está, o que concluiu/falhou) junto com o
**resumo geral de andamento** (escrito por IA; sem IA, o motor resume). Ao
final, o usuário recebe o resumo completo da execução. A qualquer momento:

```bash
onp-spec resumo security-audit-fixes --tabela   # a tabela de andamento
onp-spec resumo security-audit-fixes            # o resumo em texto
```

