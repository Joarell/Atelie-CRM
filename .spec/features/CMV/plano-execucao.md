# Plano de execução — CMV

> gerado por `onp-spec plano` em 2026-10-03 12:23 — NÃO edite à mão;
> mudou tasks.md ou a config? Regenere: `onp-spec plano CMV`

## Resumo — o que vai acontecer

- **9 tarefa(s) pendente(s)**: 9 em 9 faixa(s) paralela(s) + 0 sequencial(is)
- **1 faixa = 1 worktree + 1 branch + 1 janela de contexto limpa** — faixas não compartilham nenhum arquivo entre si
- prefere outra seleção ou uma após a outra? Regenere com `onp-spec plano CMV --paralelizar T-xxx,T-yyy` ou `--sequencial`
- tudo acontece na branch de trabalho `spec/CMV`; levar para a main é decisão sua

## Faixas e ondas

### Onda 1 — faixa-1 ∥ faixa-2 ∥ faixa-3

#### faixa-1 — branch `spec/CMV-faixa-1` — worktree `../onp-worktrees/atelie-erp(1)-CMV-faixa-1`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-401 | CMV e CPV unitários no modelo de precificação | `claude-sonnet-5` | low | `src/domain/pricing.ts`, `tests/domain/pricing.test.ts` |

#### faixa-2 — branch `spec/CMV-faixa-2` — worktree `../onp-worktrees/atelie-erp(1)-CMV-faixa-2`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-402 | Matemática do período em src/domain/cmv.ts | `claude-sonnet-5` | medium | `src/domain/cmv.ts`, `tests/domain/cmv.test.ts` |

#### faixa-3 — branch `spec/CMV-faixa-3` — worktree `../onp-worktrees/atelie-erp(1)-CMV-faixa-3`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-403 | Tabela de compras, rota e registro no CRUD | `claude-sonnet-5` | low | `migrations/0024_purchases.sql`, `src/server/tables.ts`, `src/pages/api/purchases/index.ts`, `src/pages/api/purchases/[id].ts` |

### Onda 2 — faixa-4 ∥ faixa-5 ∥ faixa-6

#### faixa-4 — branch `spec/CMV-faixa-4` — worktree `../onp-worktrees/atelie-erp(1)-CMV-faixa-4`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-404 | Serviço de compras com validação e entrada de estoque | `claude-sonnet-5` | medium | `src/domain/types.ts`, `src/services/PurchasesService.ts`, `tests/services/purchasesService.test.ts` |

#### faixa-5 — branch `spec/CMV-faixa-5` — worktree `../onp-worktrees/atelie-erp(1)-CMV-faixa-5`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-405 | Linhas de CMV e CPV nas telas de Produtos | `claude-sonnet-5` | medium | `src/ui/views/ProductsView.ts`, `tests/ui/productsCmv.test.ts` |

#### faixa-6 — branch `spec/CMV-faixa-6` — worktree `../onp-worktrees/atelie-erp(1)-CMV-faixa-6`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-406 | Relatório de CMV e CPV do período | `claude-sonnet-5` | high | `src/services/CmvService.ts`, `src/ui/views/CmvView.ts`, `tests/services/cmvService.test.ts`, `tests/ui/cmvReport.test.ts` |

### Onda 3 — faixa-7 ∥ faixa-8 ∥ faixa-9

#### faixa-7 — branch `spec/CMV-faixa-7` — worktree `../onp-worktrees/atelie-erp(1)-CMV-faixa-7`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-407 | Tela de registro de compras | `claude-sonnet-5` | medium | `src/ui/views/PurchasesView.ts`, `tests/ui/purchasesView.test.ts` |

#### faixa-8 — branch `spec/CMV-faixa-8` — worktree `../onp-worktrees/atelie-erp(1)-CMV-faixa-8`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-408 | Wiring: contexto, navegação e rotas | `claude-sonnet-5` | low | `src/state/AppContext.ts`, `src/ui/Sidebar.ts`, `src/main.ts`, `src/ui/icons.ts`, `tests/ui/sidebar.test.ts` |

#### faixa-9 — branch `spec/CMV-faixa-9` — worktree `../onp-worktrees/atelie-erp(1)-CMV-faixa-9`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-409 | Seed de compras | `claude-sonnet-5` | low | `migrations/0025_purchases_seed.sql` |

## Gestão de branches e commits

1. branch de trabalho `spec/CMV` criada do ponto atual (se ainda não existir)
2. cada faixa nasce dela como branch própria e roda no seu worktree — **1 tarefa = 1 commit** (`T-xxx feature: título`)
3. terminou a onda → merge `--no-ff` de cada faixa de volta, na ordem; conflito interrompe a faixa e pede resolução humana
4. faixa mesclada → worktree removido, branch apagada, tarefa marcada `[concluida]` no tasks.md
5. gate final na branch de trabalho: `onp-spec verify CMV` + `onp-spec audit --ci` — **exit 0 ou não está pronto**

## Como executar

### ▶ Execução — Claude Code headless

```bash
bash .spec/features/CMV/executar-tarefas.sh
```

Cada faixa roda `claude -p` com **janela de contexto limpa**, no seu worktree, com
`--model` e `--effort` já definidos por tarefa e permissões `acceptEdits`. Os prompts exatos estão
embutidos no script — quer rodar uma faixa na mão, é só copiá-los de lá.
Logs: `../onp-worktrees/atelie-erp(1)-CMV-logs/`.

### 📣 Acompanhamento — tabela + resumo no chat (a cada 1 min)

O script roda em **background**: o agente AVISA o usuário antes de iniciar e,
enquanto roda, posta no chat a cada ~1 minuto a **tabela de andamento** (qual
tarefa está rodando, qual não está, o que concluiu/falhou) junto com o
**resumo geral de andamento** (escrito por IA; sem IA, o motor resume). Ao
final, o usuário recebe o resumo completo da execução. A qualquer momento:

```bash
onp-spec resumo CMV --tabela   # a tabela de andamento
onp-spec resumo CMV            # o resumo em texto
```

