# Plano de execução — lgpd-privacidade

> gerado por `onp-spec plano` em 2026-09-29 03:12 — NÃO edite à mão;
> mudou tasks.md ou a config? Regenere: `onp-spec plano lgpd-privacidade --paralelizar T-002,T-003,T-004,T-005,T-006,T-007`

## Resumo — o que vai acontecer

- **7 tarefa(s) pendente(s)**: 6 em 6 faixa(s) paralela(s) + 1 sequencial(is)
- **seleção do usuário**: paralelizar só T-002, T-003, T-004, T-005, T-006, T-007 — as demais rodam uma após a outra, ao final
- **1 faixa = 1 worktree + 1 branch + 1 janela de contexto limpa** — faixas não compartilham nenhum arquivo entre si
- prefere outra seleção ou uma após a outra? Regenere com `onp-spec plano lgpd-privacidade --paralelizar T-xxx,T-yyy` ou `--sequencial`
- tudo acontece na branch de trabalho `spec/lgpd-privacidade`; levar para a main é decisão sua

## Faixas e ondas

### Onda 1 — faixa-1 ∥ faixa-2 ∥ faixa-3

#### faixa-1 — branch `spec/lgpd-privacidade-faixa-1` — worktree `../onp-worktrees/atelie-erp(1)-lgpd-privacidade-faixa-1`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-002 | Testes de consentimento (AC-001 a AC-004) | `claude-sonnet-5` | medium | `tests/server/consent.test.ts` |

#### faixa-2 — branch `spec/lgpd-privacidade-faixa-2` — worktree `../onp-worktrees/atelie-erp(1)-lgpd-privacidade-faixa-2`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-003 | Anotar testes de rate limit existentes (AC-005 a AC-008) | `claude-sonnet-5` | medium | `tests/server/rateLimitWiring.test.ts` |

#### faixa-3 — branch `spec/lgpd-privacidade-faixa-3` — worktree `../onp-worktrees/atelie-erp(1)-lgpd-privacidade-faixa-3`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-004 | Anotar testes de retenção existentes (AC-009 a AC-015) | `claude-sonnet-5` | medium | `tests/server/retention.test.ts`, `tests/server/retentionCron.test.ts` |

### Onda 2 — faixa-4 ∥ faixa-5 ∥ faixa-6

#### faixa-4 — branch `spec/lgpd-privacidade-faixa-4` — worktree `../onp-worktrees/atelie-erp(1)-lgpd-privacidade-faixa-4`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-005 | Testes de pseudonimização (AC-016 a AC-019) | `claude-sonnet-5` | medium | `tests/domain/pseudonymize.test.ts` |

#### faixa-5 — branch `spec/lgpd-privacidade-faixa-5` — worktree `../onp-worktrees/atelie-erp(1)-lgpd-privacidade-faixa-5`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-006 | Testes de direitos do titular (AC-020 a AC-022) | `claude-sonnet-5` | medium | `tests/server/lgpdRights.test.ts` |

#### faixa-6 — branch `spec/lgpd-privacidade-faixa-6` — worktree `../onp-worktrees/atelie-erp(1)-lgpd-privacidade-faixa-6`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-007 | Testes de princípios LGPD (P-004, P-005, P-006) | `claude-sonnet-5` | medium | `tests/domain/lgpdPrinciples.test.ts` |

## Tarefas sequenciais (após as ondas, na árvore principal)

| tarefa | título | modelo | esforço | por que sequencial |
|---|---|---|---|---|
| T-001 | Fundação: tipos e exports faltantes | `claude-sonnet-5` | medium | fora da seleção do usuário |

## Gestão de branches e commits

1. branch de trabalho `spec/lgpd-privacidade` criada do ponto atual (se ainda não existir)
2. cada faixa nasce dela como branch própria e roda no seu worktree — **1 tarefa = 1 commit** (`T-xxx feature: título`)
3. terminou a onda → merge `--no-ff` de cada faixa de volta, na ordem; conflito interrompe a faixa e pede resolução humana
4. faixa mesclada → worktree removido, branch apagada, tarefa marcada `[concluida]` no tasks.md
5. gate final na branch de trabalho: `onp-spec verify lgpd-privacidade` + `onp-spec audit --ci` — **exit 0 ou não está pronto**

## Como executar

### ▶ Execução — Claude Code headless

```bash
bash .spec/features/lgpd-privacidade/executar-tarefas.sh
```

Cada faixa roda `claude -p` com **janela de contexto limpa**, no seu worktree, com
`--model` e `--effort` já definidos por tarefa e permissões `acceptEdits`. Os prompts exatos estão
embutidos no script — quer rodar uma faixa na mão, é só copiá-los de lá.
Logs: `../onp-worktrees/atelie-erp(1)-lgpd-privacidade-logs/`.

### 📣 Acompanhamento — tabela + resumo no chat (a cada 1 min)

O script roda em **background**: o agente AVISA o usuário antes de iniciar e,
enquanto roda, posta no chat a cada ~1 minuto a **tabela de andamento** (qual
tarefa está rodando, qual não está, o que concluiu/falhou) junto com o
**resumo geral de andamento** (escrito por IA; sem IA, o motor resume). Ao
final, o usuário recebe o resumo completo da execução. A qualquer momento:

```bash
onp-spec resumo lgpd-privacidade --tabela   # a tabela de andamento
onp-spec resumo lgpd-privacidade            # o resumo em texto
```

