# Auditoria de segurança — atelie-erp

Relatório gerado: **`relatorio-auditoria-seguranca.pdf`** (A4, 20 páginas, pt-BR).

Esta é a **reauditoria (2ª rodada)**: o conteúdo reflete o código *depois* da
rodada de correções. Achados marcados como **verificação positiva** registram
cobertura de auditoria (controle verificado), não falha.

> **Invariante:** nenhum valor de segredo real pode aparecer em nenhum arquivo
> versionado. `tests/spec-v2/c-settings-secrets.test.ts` (AC-334/AC-335) falha se
> isso acontecer — foi exatamente esse teste que reprovou a rodada anterior,
> porque o próprio arquivo de dados do relatório carregava a chave. Cite sempre
> `arquivo:linha` com o valor redigido.

## Como regerar

O gerador usa **apenas ambiente isolado** — nada é instalado globalmente.

```bash
# 1. venv com as duas únicas dependências
python3 -m venv /tmp/venv-audit
/tmp/venv-audit/bin/pip install reportlab pypdf

# 2. gerar o PDF
/tmp/venv-audit/bin/python docs/security-audit/gerar-relatorio.py
```

Requisitos de sistema: **chromium** (ou `google-chrome`) e as fontes DejaVu.
Se o Chromium estiver em outro caminho: `export CHROME_BIN=/caminho/do/chrome`.

Sem `reportlab`/`pypdf` o script ainda gera o PDF, porém **sem cabeçalho, rodapé e
numeração de página** (aviso no console).

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `relatorio-auditoria-seguranca.pdf` | O relatório (entregável) |
| `gerar-relatorio.py` | Gerador: HTML → Chromium → PDF → carimbo de páginas |
| `dados_auditoria.py` | Base dos achados, pontos fortes, recomendações e issues |

Para **corrigir ou reclassificar um achado**, edite `dados_auditoria.py` e regere.
Não edite o PDF diretamente.

## Como o PDF é montado

1. `gerar-relatorio.py` monta um HTML completo com os gráficos **SVG embutidos**
   (rosca de severidades e barras por categoria — vetoriais, então escalam sem
   borrar).
2. `chromium --headless --print-to-pdf` converte honoring `@page { size: A4 }`.
3. `reportlab` gera uma camada transparente por página (cabeçalho, rodapé e
   `Página X de Y`) e `pypdf` mescla essa camada em cada página.

Os 19 achados estão em `ACHADOS` (1 crítica, 2 altas, 5 médias, 3 baixas,
8 informativas/verificações positivas); os 21 pontos fortes em `PONTOS_FORTES`;
as 10 recomendações em `RECOMENDACOES`; os 6 textos de issue em `ISSUES`.
