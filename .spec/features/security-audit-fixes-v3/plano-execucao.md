# Plano de execução — security-audit-fixes-v3

> gerado por `onp-spec plano` em 2026-10-02 15:50 — NÃO edite à mão;
> mudou tasks.md ou a config? Regenere: `onp-spec plano security-audit-fixes-v3 --paralelizar T-323,T-324,T-325,T-326,T-327,T-328,T-329`

## Resumo — o que vai acontecer

- **7 tarefa(s) pendente(s)**: 7 em 6 faixa(s) paralela(s) + 0 sequencial(is)
- **seleção do usuário**: paralelizar só T-323, T-324, T-325, T-326, T-327, T-328, T-329 — as demais rodam uma após a outra, ao final
- **1 faixa = 1 worktree + 1 branch + 1 janela de contexto limpa** — faixas não compartilham nenhum arquivo entre si
- prefere outra seleção ou uma após a outra? Regenere com `onp-spec plano security-audit-fixes-v3 --paralelizar T-xxx,T-yyy` ou `--sequencial`
- tudo acontece na branch de trabalho `spec/security-audit-fixes-v3`; levar para a main é decisão sua

## Faixas e ondas

### Onda 1 — faixa-1 ∥ faixa-2 ∥ faixa-3

#### faixa-1 — branch `spec/security-audit-fixes-v3-faixa-1` — worktree `../onp-worktrees/atelie-erp(1)-security-audit-fixes-v3-faixa-1`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-323 | Migration: coluna de dono nas tabelas de trabalho + backfill | `claude-sonnet-5` | medium | `migrations/0023_owner_columns.sql`, `package.json` |

#### faixa-2 — branch `spec/security-audit-fixes-v3-faixa-2` — worktree `../onp-worktrees/atelie-erp(1)-security-audit-fixes-v3-faixa-2`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-324 | Fábrica de rotas: posse por coluna e por herança, falha fechada | `claude-sonnet-5` | high | `src/server/routeFactory.ts`, `src/server/tables.ts`, `src/pages/api/crm/tags/[id].ts`, `src/pages/api/crm/stages/[id].ts`, `src/pages/api/crm/pipelines/[id].ts`, `src/pages/api/crm/quick-replies/[id].ts`, `src/pages/api/crm/appointment-types/[id].ts`, `src/pages/api/orders/[id].ts`, `src/pages/api/products/[id].ts`, `src/pages/api/components/[id].ts`, `src/pages/api/ingredients/[id].ts`, `src/pages/api/customers/[id].ts`, `tests/server/ownership.test.ts` |
| T-325 | Superfície de escrita: campos imutáveis e dono não esvaziável | `claude-sonnet-5` | high | `src/server/routeFactory.ts`, `src/server/crud.ts`, `tests/server/routeFactory.test.ts` |

#### faixa-3 — branch `spec/security-audit-fixes-v3-faixa-3` — worktree `../onp-worktrees/atelie-erp(1)-security-audit-fixes-v3-faixa-3`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-326 | Webhook WAHA: seguro por padrão e fail-closed | `claude-sonnet-5` | medium | `src/server/wahaWebhook.ts`, `.dev.vars.example`, `tests/server/wahaWebhook.test.ts` |

### Onda 2 — faixa-4 ∥ faixa-5 ∥ faixa-6

#### faixa-4 — branch `spec/security-audit-fixes-v3-faixa-4` — worktree `../onp-worktrees/atelie-erp(1)-security-audit-fixes-v3-faixa-4`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-327 | Guardas de segredo: check-ignore, hash no versionado e runbook | `claude-sonnet-5` | medium | `tests/spec-v2/c-settings-secrets.test.ts`, `docs/security-audit/ROTAÇÃO-CREDENCIAIS.md` |

#### faixa-5 — branch `spec/security-audit-fixes-v3-faixa-5` — worktree `../onp-worktrees/atelie-erp(1)-security-audit-fixes-v3-faixa-5`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-328 | Boot valida configuração e CI ganha gate de auditoria | `claude-sonnet-5` | medium | `src/worker.ts`, `src/server/boot.ts`, `.github/workflows/ci.yml`, `docs/security-audit/EXCECOES-AUDIT-DEPENDENCIAS.md`, `tests/server/boot.test.ts` |

#### faixa-6 — branch `spec/security-audit-fixes-v3-faixa-6` — worktree `../onp-worktrees/atelie-erp(1)-security-audit-fixes-v3-faixa-6`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-329 | Escape com nome que declara o contexto | `claude-sonnet-5` | medium | `src/domain/format.ts`, `tests/domain/format.test.ts`, `tests/ui/escapeContext.test.ts` |

## Gestão de branches e commits

1. branch de trabalho `spec/security-audit-fixes-v3` criada do ponto atual (se ainda não existir)
2. cada faixa nasce dela como branch própria e roda no seu worktree — **1 tarefa = 1 commit** (`T-xxx feature: título`)
3. terminou a onda → merge `--no-ff` de cada faixa de volta, na ordem; conflito interrompe a faixa e pede resolução humana
4. faixa mesclada → worktree removido, branch apagada, tarefa marcada `[concluida]` no tasks.md
5. gate final na branch de trabalho: `onp-spec verify security-audit-fixes-v3` + `onp-spec audit --ci` — **exit 0 ou não está pronto**

## Como executar

### ▶ Execução — Claude Code headless

```bash
bash .spec/features/security-audit-fixes-v3/executar-tarefas.sh
```

Cada faixa roda `claude -p` com **janela de contexto limpa**, no seu worktree, com
`--model` e `--effort` já definidos por tarefa e permissões `acceptEdits`. Os prompts exatos estão
embutidos no script — quer rodar uma faixa na mão, é só copiá-los de lá.
Logs: `../onp-worktrees/atelie-erp(1)-security-audit-fixes-v3-logs/`.

### 📣 Acompanhamento — tabela + resumo no chat (a cada 1 min)

O script roda em **background**: o agente AVISA o usuário antes de iniciar e,
enquanto roda, posta no chat a cada ~1 minuto a **tabela de andamento** (qual
tarefa está rodando, qual não está, o que concluiu/falhou) junto com o
**resumo geral de andamento** (escrito por IA; sem IA, o motor resume). Ao
final, o usuário recebe o resumo completo da execução. A qualquer momento:

```bash
onp-spec resumo security-audit-fixes-v3 --tabela   # a tabela de andamento
onp-spec resumo security-audit-fixes-v3            # o resumo em texto
```

