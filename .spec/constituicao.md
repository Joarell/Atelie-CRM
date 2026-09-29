# Constituição — v1.1.0

<!--
  Princípios inegociáveis do projeto. Não são estilo: são restrições.
  P-xxx = princípio (código de rastreio, como US/AC/T).
  Níveis: [DEVE] obrigatório · [RECOMENDADO] forte · [PODE] permitido/explícito.
  Todo [DEVE] precisa de verificação executável — senão o audit acusa
  "princípio sem verificação" (PRINCIPIO_SEM_VERIFICACAO). Formatos:
    - verificação(gate): satisfeita pelo próprio audit (só p/ princípios "meta")
    - verificação(teste): @principle:P-xxx
    - verificação(proibido): `regex` em `glob`
    - verificação(obrigatório): `regex` em `glob`
-->

## P-001 [DEVE] Todo requisito tem prova executável

Nenhuma feature é declarada pronta sem o audit em modo CI sair limpo (exit 0).
Este princípio é verificado pelo próprio mecanismo do audit (AC_SEM_TESTE,
AC_SEM_PROVA, TASK_CONCLUIDA_SEM_PROVA) — não precisa de teste extra seu.

- verificação(gate): intrínseca ao audit

## P-002 [RECOMENDADO] Segredos nunca em código

Chaves e senhas vêm de variáveis de ambiente, nunca hard-coded.

- verificação(proibido): `(api[_-]?key|senha|password)\s*[:=]\s*['"][^'"]{8,}` em `src/**/*.ts`

## P-003 [DEVE] Dados pessoais nunca em logs em texto puro

Telefone, nome, email e CPF de clientes/titulares nunca vão para
console/log sem pseudonimização (LGPD art. 46).

- verificação(proibido): `console\.(log|error|warn)\(.*(phone|nome|email|cpf)` em `src/**/*.ts`

## P-004 [DEVE] Consentimento granular por finalidade

Todo tratamento de dados pessoais tem consentimento registrado por
finalidade, com revogação e expiração (LGPD art. 7-9).

- verificação(teste): @principle:P-004

## P-005 [DEVE] Retenção com prazo definido e configurável

Nenhum dado pessoal é retido além da janela configurada por tipo de
dado; a janela é ajustável sem redeploy (LGPD art. 7, 15-16).

- verificação(teste): @principle:P-005

## P-006 [DEVE] Direitos do titular: acesso, portabilidade e exclusão

O titular pode acessar, exportar e solicitar exclusão dos seus dados
(LGPD art. 18).

- verificação(teste): @principle:P-006
