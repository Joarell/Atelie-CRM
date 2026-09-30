# Plano de execução — stock

> gerado por `onp-spec plano` em 2026-09-30 01:52 — NÃO edite à mão;
> mudou tasks.md ou a config? Regenere: `onp-spec plano stock`

## Resumo — o que vai acontecer

- **4 tarefa(s) pendente(s)**: 4 em 4 faixa(s) paralela(s) + 0 sequencial(is)
- **1 faixa = 1 worktree + 1 branch + 1 janela de contexto limpa** — faixas não compartilham nenhum arquivo entre si
- prefere outra seleção ou uma após a outra? Regenere com `onp-spec plano stock --paralelizar T-xxx,T-yyy` ou `--sequencial`
- tudo acontece na branch de trabalho `spec/stock`; levar para a main é decisão sua

## Faixas e ondas

### Onda 1 — faixa-1 ∥ faixa-2 ∥ faixa-3

#### faixa-1 — branch `spec/stock-faixa-1` — worktree `../onp-worktrees/atelie-erp(1)-stock-faixa-1`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-010 | Baixa automática no setStatus do OrderService | `claude-sonnet-5` | medium | `src/services/OrderService.ts`, `tests/services/orderService.test.ts` |

#### faixa-2 — branch `spec/stock-faixa-2` — worktree `../onp-worktrees/atelie-erp(1)-stock-faixa-2`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-011 | Testes de movimentação e saldo negativo | `claude-sonnet-5` | medium | `tests/services/stockService.test.ts` |

#### faixa-3 — branch `spec/stock-faixa-3` — worktree `../onp-worktrees/atelie-erp(1)-stock-faixa-3`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-012 | Testes de UI da baixa nos pedidos | `claude-sonnet-5` | medium | `tests/ui/ordersStockDeduct.test.ts` |

### Onda 2 — faixa-4

#### faixa-4 — branch `spec/stock-faixa-4` — worktree `../onp-worktrees/atelie-erp(1)-stock-faixa-4`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-013 | Anotar teste do Estoque com AC-042 | `claude-sonnet-5` | medium | `tests/ui/stockTable.test.ts` |

## Gestão de branches e commits

1. branch de trabalho `spec/stock` criada do ponto atual (se ainda não existir)
2. cada faixa nasce dela como branch própria e roda no seu worktree — **1 tarefa = 1 commit** (`T-xxx feature: título`)
3. terminou a onda → merge `--no-ff` de cada faixa de volta, na ordem; conflito interrompe a faixa e pede resolução humana
4. faixa mesclada → worktree removido, branch apagada, tarefa marcada `[concluida]` no tasks.md
5. gate final na branch de trabalho: `onp-spec verify stock` + `onp-spec audit --ci` — **exit 0 ou não está pronto**

## Como executar

### ▶ Execução — Claude Code headless

```bash
bash .spec/features/stock/executar-tarefas.sh
```

Cada faixa roda `claude -p` com **janela de contexto limpa**, no seu worktree, com
`--model` e `--effort` já definidos por tarefa e permissões `acceptEdits`. Os prompts exatos estão
embutidos no script — quer rodar uma faixa na mão, é só copiá-los de lá.
Logs: `../onp-worktrees/atelie-erp(1)-stock-logs/`.

### 📣 Acompanhamento — tabela + resumo no chat (a cada 1 min)

O script roda em **background**: o agente AVISA o usuário antes de iniciar e,
enquanto roda, posta no chat a cada ~1 minuto a **tabela de andamento** (qual
tarefa está rodando, qual não está, o que concluiu/falhou) junto com o
**resumo geral de andamento** (escrito por IA; sem IA, o motor resume). Ao
final, o usuário recebe o resumo completo da execução. A qualquer momento:

```bash
onp-spec resumo stock --tabela   # a tabela de andamento
onp-spec resumo stock            # o resumo em texto
```

