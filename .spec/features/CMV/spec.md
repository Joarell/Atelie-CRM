# Spec: CMV e CPV

> feature: CMV
> status: rascunho

## Contexto

No menu "Produtos", cada produto deve mostrar o **CMV** (Custo da Mercadoria
Vendida) e o **CPV** (Custo do Produto Vendido), um abaixo do outro, logo
abaixo do campo "Custo total" que já existe — no card do produto e na caixa de
cálculo do formulário de edição. Cada linha mostra **apenas a sigla e o valor
total**, sem texto explicativo.

Os dois valores são **unitários**: o custo de fabricar *uma* unidade do produto,
calculado a partir do preço dos ingredientes do menu "Ingredientes" usados na
receita dele. São números diferentes do "Custo total" de hoje, que é o custo de
formação completo (matéria-prima + mão de obra + despesas fixas + despesas
variáveis) e serve para sugerir o preço de venda.

Além dos campos por produto, a feature entrega a **apuração do período** com a
fórmula clássica **CMV = EI + C − EF** (Estoque Inicial + Compras − Estoque
Final), que exige um registro de compras que hoje não existe: a "entrada" de
estoque atual (`stock_movements`) guarda apenas quantidade, sem preço, sem
fornecedor e sem nota. Também exige um novo relatório no menu Ateliê.

O texto de referência do dono do produto sobre o que é CMV está no fim deste
arquivo, em **Referência**.

## Histórias

### US-401 — Ver o CMV e o CPV unitários no card do produto

Como usuário do Ateliê, quero ver o custo de matéria-prima e o custo total de
fabricar uma unidade de cada produto, para saber quanto custa produzir o que
eu vendo — e não apenas quanto custa formar o preço.

#### AC-401 — Card mostra o CMV da matéria-prima

- **Dado** um produto que rende 4 unidades e cuja receita usa 400g de um
  ingrediente que custa R$ 0,50 por grama
- **Quando** a tela "Produtos" é renderizada
- **Então** o card do produto mostra a linha "CMV" com o valor R$ 50,00
- **E** essa linha aparece logo abaixo da linha "Custo total"

#### AC-402 — Card mostra o CPV com a mão de obra

- **Dado** o mesmo produto de AC-401, com mão de obra que custa R$ 12,00 no
  lote inteiro
- **Quando** a tela "Produtos" é renderizada
- **Então** o card do produto mostra a linha "CPV" com o valor R$ 62,00
- **E** a linha "CPV" aparece logo abaixo da linha "CMV"

#### AC-403 — As linhas mostram apenas a sigla e o valor

- **Dado** um produto qualquer da tela "Produtos"
- **Quando** a tela "Produtos" é renderizada
- **Então** as linhas do CMV e do CPV mostram somente a sigla e o valor em
  reais
- **E** nenhuma das duas linhas traz texto explicativo ao lado

#### AC-404 — Receita que usa componente soma os ingredientes dele

- **Dado** um produto cuja receita usa 2 unidades de um componente "Base de
  bolo", e esse componente usa 300g de um ingrediente que custa R$ 0,50 por grama
- **Quando** a tela "Produtos" é renderizada
- **Então** o CMV do produto inclui R$ 150,00 vindos do ingrediente do componente

#### AC-405 — Produto sem receita mostra CMV e CPV zerados

- **Dado** um produto cuja receita não tem nenhum ingrediente
- **Quando** a tela "Produtos" é renderizada
- **Então** o CMV e o CPV aparecem como R$ 0,00
- **E** nenhum dos dois aparece como "NaN" ou "Infinity"

#### AC-406 — Produto que rende zero não divide por zero

- **Dado** um produto com rendimento igual a zero e custo de matéria-prima de
  R$ 50,00 no lote
- **Quando** a tela "Produtos" é renderizada
- **Então** o CMV mostra R$ 50,00 — o custo do lote inteiro
- **E** nenhum dos dois valores aparece como "NaN" ou "Infinity"

#### AC-407 — O CMV e o CPV mudam quando o preço do ingrediente muda

- **Dado** um produto cujo CMV é R$ 50,00
- **Quando** o preço do ingrediente usado na receita passa a custar o dobro
- **E** a tela "Produtos" é renderizada de novo
- **Então** o CMV do produto passa a ser R$ 100,00

### US-402 — Ver o CMV e o CPV no formulário de edição

Como usuário do Ateliê, quero ver o CMV e o CPV enquanto ajusto a receita no
formulário de edição, para acertar a quantidade de ingrediente já sabendo o
impacto no custo.

#### AC-408 — Formulário mostra CMV e CPV abaixo do Custo total

- **Dado** um produto existente sendo editado
- **Quando** o formulário de edição é aberto
- **Então** a caixa de cálculo mostra a linha "CMV" logo abaixo do "Custo total"
- **E** a linha "CPV" logo abaixo do "CMV"

#### AC-409 — Os valores do formulário acompanham a edição da receita

- **Dado** um produto sendo editado no formulário
- **Quando** o usuário muda a quantidade de um ingrediente da receita
- **Então** o CMV e o CPV da caixa de cálculo são recalculados na hora
- **E** o novo valor corresponde à nova quantidade

### US-403 — Registrar as compras de ingredientes do período

Como usuário do Ateliê, quero registrar as compras de ingredientes que fiz, para
que a apuração do CMV do período saiba quanto entrou de mercadoria no período.

#### AC-410 — Compra registra fornecedor, data e itens

- **Dado** o usuário na tela "Compras"
- **Quando** ele registra uma compra do fornecedor "Fornecedor ABC", em 10/03/2026,
  com 2 unidades do item "Farinha 1000g"
- **Então** a compra fica salva com fornecedor, data e o item com sua quantidade
  e o preço pago

#### AC-411 — O valor total da compra é a soma dos itens

- **Dado** uma compra com dois itens
- **Quando** a compra é registrada
- **Então** o valor total da compra é a soma do valor de cada item

#### AC-412 — Registrar compra dá entrada no estoque

- **Dado** o ingrediente "Farinha 1000g" com saldo 1000g
- **Quando** o usuário registra uma compra de 500g desse ingrediente
- **Então** o saldo do ingrediente passa a 1500g
- **E** a tela "Estoque" mostra a movimentação de entrada

#### AC-413 — Compra com data futura é recusada

- **Dado** o usuário registrando uma compra
- **Quando** ele informa uma data no futuro
- **Então** a compra é recusada e ele vê o aviso de que a data não pode ser futura
- **E** nenhuma entrada de estoque acontece

#### AC-414 — Compra sem quantidade ou sem preço é recusada

- **Dado** o usuário registrando uma compra
- **Quando** ele informa um item com quantidade zero
- **Então** a compra é recusada e ele vê o aviso do item inválido
- **E** o mesmo vale para item sem preço informado

#### AC-415 — Compras do período são listadas em ordem cronológica

- **Dado** três compras registradas em meses diferentes
- **Quando** o usuário escolhe um mês no filtro de compras
- **Então** só as compras daquele mês são listadas
- **E** elas aparecem da mais antiga para a mais recente

### US-404 — Apurar o CMV e o CPV do período

Como usuário do Ateliê, quero apurar quanto custou a mercadoria que eu vendi no
mês, para saber se o negócio está lucrativo.

#### AC-416 — Relatório apura o CMV pela fórmula EI + C − EF

- **Dado** estoque inicial do mês de R$ 300,00, compras de R$ 500,00 e estoque
  final de R$ 200,00
- **Quando** o relatório de CMV do mês é aberto
- **Então** ele mostra o estoque inicial R$ 300,00, as compras R$ 500,00 e o
  estoque final R$ 200,00
- **E** mostra o CMV de R$ 600,00 — o resultado de 300 + 500 − 200

#### AC-417 — Estoque inicial é o estoque do primeiro dia do mês

- **Dado** um ingrediente com saldo 1000g e uma saída de 300g em 15/03/2026
- **E** o mês escolhido é março de 2026
- **Quando** o relatório de CMV é apurado
- **Então** o estoque inicial de março conta os 1000g — antes da saída de 300g

#### AC-418 — Só as compras do mês escolhido entram na conta

- **Dado** compras registradas em fevereiro e em março de 2026
- **Quando** o relatório de CMV de março de 2026 é apurado
- **Então** o valor de compras exibido é apenas o de março

#### AC-419 — Relatório mostra o CPV logo abaixo do CMV

- **Dado** um relatório de CMV apurado
- **Quando** o relatório é exibido
- **Então** a linha "CMV" aparece
- **E** a linha "CPV" aparece logo abaixo dela, com a sigla e o valor total

#### AC-420 — O CMV do período não é maior que o CMV da produção do período

- **Dado** um relatório de CMV apurado para o mês
- **Quando** a soma dos CMV unitários de todos os produtos é comparada com o CMV
  do relatório
- **Então** o CMV do relatório não é maior que essa soma

#### AC-421 — O relatório abre pelo menu Ateliê

- **Dado** o menu "Ateliê" na navegação lateral
- **Quando** o usuário olha os itens do menu
- **Então** existe um item "CMV" que abre o relatório do período

## Fora de escopo

- Métodos de avaliação de estoque PEPS e UEPS — a apuração usa **custo médio**,
  que é o que o app já faz com `packagePrice / packageSize` (decisão ASM-403)
- CMV por saldo de quantidade de mercadoria (a variante "CMV por mercadoria" do
  texto de referência) — só o apuração por saldo monetário
- Rateio das despesas fixas de fábrica dentro do CMV ou do CPV do período — o
  CPV do período é o CMV mais a mão de obra (decisão ASM-405)
- Margem de contribuição, lucro bruto e RCM na tela — o relatório mostra CMV e CPV
  (decisão ASM-406)
- CMV e CPV na tela de "Componentes" — só em "Produtos" (decisão ASM-407)
- Lançamento manual de entrada de estoque continua existindo e **não** conta como
  compra do período
- Compra agrupada em nota com dois fornecedores
- CMV de produto que não produz no período

## Suposições

| ID | Suposição | Status | Resolução |
|---|---|---|---|
| ASM-401 | O CMV unitário é só a matéria-prima da receita (`productDirectCost` dividido pelo rendimento); o "Custo total" que já existe continua sendo o custo de formação completo | aberta | Matéria-prima é a definição contábil de CMV e o texto do dono do produto diz "baseado no preço dos produtos contidos no menu Ingredientes" |
| ASM-402 | O CPV unitário é a matéria-prima mais a mão de obra, dividido pelo rendimento | aberta | CPV é o custo de transformar a mercadoria; despesa fixa não entra no custo do produto |
| ASM-403 | O estoque é avaliado a **custo médio** (`packagePrice / packageSize`), sem camada por camada de compra | aberta | É o que `ingredientUnitCost` já faz em todo o app; PEPS/UEPS exigiriam um livro de custo por camadas |
| ASM-404 | O período de apuração é o mês civil, escolhido pelo usuário no relatório | aberta | O texto de referência fala em "período analisado" sem fixar granularidade |
| ASM-405 | A mão de obra do período, usada no CPV do período, é a soma do custo de mão de obra das linhas de pedido cuja data de entrega cai no mês | aberta | O app não tem marcação de quando o pedido entrou em produção; a data de entrega é o único marco temporal disponível |
| ASM-406 | O relatório mostra apenas CMV e CPV, sem margem, lucro bruto ou RCM | aberta | O dono pediu "apenas a sigla e o valor total de cada um" |
| ASM-407 | O CMV e o CPV aparecem em "Produtos" (card e formulário), não em "Componentes" | aberta | O pedido nomeia o menu "Produtos"; ComponentsView tem "Custo total da ficha" e fica para outra feature |
| ASM-408 | O estoque inicial e o final do período são reconstruídos a partir de `stock_movements`, e não de um snapshot de valor salvo | aberta | Toda mudança de saldo em `StockService.applyMovement` grava movimentação junto, então o histórico é reconstruível |
| ASM-409 | Registrar uma compra também cria a entrada de estoque correspondente, para que saldo e estoque reconstruído continuem coerentes | aberta | Sem isso, o estoque e o CMV do período divergiriam |
| ASM-410 | O preço do ingrediente (`packagePrice`) passa a ser o da última compra registrada, que é como o custo médio se manifesta neste app | aberta | Se o preço não acompanhar a compra, o CMV do período ficaria preso ao preço antigo |

## Perguntas em aberto

| ID | Pergunta | Status | Resposta |
|---|---|---|---|
| Q-401 | O período de apuração é o mês civil, ou o usuário escolhe um intervalo de datas? | aberta | |
| Q-402 | O CMV de cada produto deve aparecer rateado no card (proporcional às unidades vendidas no mês), ou o card mostra sempre o unitário e o rateado fica só no relatório? | aberta | |
| Q-403 | A despesa fixa de fábrica deve entrar no CPV do período como rateio por minuto de produção, como já é feito no custo de formação? | aberta | |
| Q-404 | O relatório de CMV mostra todos os meses do ano numa lista, ou apenas do mês escolhido? | aberta | |

<!-- REFERENCIA-DO-DONO-DO-PRODUTO -->
## Referência — o que é CMV (texto do dono do produto)

Texto de apoio fornecido pelo dono do produto. Fica aqui como base conceitual;
não érequirement auditável e por isso não tem critérios de aceite próprios.

### O que é CMV (Custo da Mercadoria Vendida)?
CMV (Custo da Mercadoria Vendida) é a soma de tudo que a empresa gasta para comprar, produzir e estocar seus produtos e mercadorias até que eles sejam comercializados.

Inclui o pagamento dos fornecedores, custo do frete, incidência de impostos, seguros, dentre outros gastos.

O cálculo do CMV exige uma boa gestão de estoque, que pode ser feita de maneira mais eficiente usando sistemas de gestão integrados (Enterprise Resource Planning – ERP).

No caso das empresas revendedoras, toda atividade comercial gira em torno da compra e venda de mercadorias.

Para obter os melhores lucros, é preciso comprar bem (o mais barato possível) e vender bem (o mais “caro” possível).

Entre a compra e a venda, a empresa deve empreender todos os esforços para que os custos inerentes do processo sejam os menores possíveis.

Se o objetivo é comprar para revender, é natural que haja um estoque de mercadorias que precisa ser controlado e avaliado.

Esse controle, que dará subsídio ao cálculo do CMV, pode ser feito com base em diferentes métodos – dentre eles, o Inventário Permanente e o Inventário Periódico:

Inventário Permanente: o valor do estoque é permanentemente atualizado sempre que uma mercadoria é adicionada ou subtraída. Recebeu nova encomenda do fornecedor? O valor é lançado imediatamente no custo do estoque. Vendeu uma mercadoria? O valor também é atualizado instantaneamente
Inventário Periódico: a atualização do valor do estoque é feita periodicamente, em geral por meio de um levantamento físico (contagem), que pode ser semanal, mensal, trimestral ou em qualquer outra periodicidade.

### Para que serve o CMV?
O CMV (Custo da Mercadoria Vendida) serve principalmente como base de apuração do resultado bruto.

É por meio do indicador que a empresa tem condições de mensurar se sua atividade comercial está sendo ou não lucrativa.

No caso das empresas que atuam no segmento de revendas, o preço pago ao fornecedor pelas mercadorias deve ser sempre inferior ao preço cobrado do cliente final.

O CMV, como vimos, inclui o valor pago pelas mercadorias e outros gastos, como os relacionados à armazenagem.

Logo, ao subtrair do faturamento o Custo das Mercadorias Vendidas, tem-se o lucro bruto.

Nas Demonstrações de Resultado de Exercício, essa informação geralmente aparece logo nas primeiras linhas.

O cálculo do CMV também serve como parâmetro para a precificação do mix de produtos.

Devido a diferentes fatores, o valor desembolsado pela empresa para repor o estoque varia conforme a dinâmica do preço dos fornecedores.

Essas variações, inevitavelmente, influenciam o preço ao consumidor final.

Também pode ser usado na apuração da margem de contribuição dos produtos, a parte do valor das vendas que contribuem para o pagamento das demais despesas do negócio.

### Como Funciona o CMV?
O CMV funciona como um indicador de performance operacional.

Ou seja, mede o quanto a empresa gasta para manter sua atividade principal.

Isso é feito por meio da gestão eficiente do estoque, considerando o quanto é despendido para adquirir e manter as mercadorias até que elas sejam vendidas e transformadas em caixa.

Nesse contexto, é importante distinguir os significados de custo e despesa, dois conceitos que costumam gerar confusão.

Custo é tudo que a empresa gasta com sua atividade-fim. São exemplos: aquisição de mercadorias, matéria-prima, pagamento de mão de obra da fábrica, dentre outros.

Despesas são gastos indiretos à atividade-fim, como água, folha de pagamento do pessoal administrativo, telefone, material de escritório, material de limpeza, dentre outros.

Ao subtrair do total de vendas o Custo das Mercadorias Vendidas, a empresa chega a seu lucro bruto.

Ao subtrair do lucro bruto as despesas, que podem ser fixas e variáveis, encontramos o lucro líquido.

### Quais elementos estão inclusos no cálculo do CMV?
O cálculo do CMV leva em consideração alguns elementos relacionados diretamente à gestão de estoque.

Os principais são:

Valor do Estoque Inicial (EI)
Compras (C)
Valor do Estoque Final (EF).
Conforme a dinâmica do mercado, o preço das mercadorias adquiridas no fornecedor sofre variações devido a fatores diversos.

O preço de uma mesma mercadoria, vendida pelo mesmo fornecedor, pode ser diferente dependendo, inclusive, da quantidade adquirida.

Compras em grandes volumes tendem a ter custos menores.

Para descobrir, portanto, quanto foi gasto na aquisição das mercadorias do estoque é preciso adotar algum critério de avaliação.

Existem diversos métodos, dentre eles, os seguintes:

PEPS (Primeiro que Entra, Primeiro que Sai): na execução de uma venda, o CMV considera o custo das mercadorias mais “antigas” do estoque
UEPS (Último que Entra, Primeiro que Sai): considera o custo das mercadorias mais recentes
Custo Médio: calcula o CMV por meio de uma média dos valores pagos pelas mercadorias.
Depois de selecionado o método de avaliação de estoque, basta multiplicar os itens pelo seu custo para descobrir quanto, em valores monetários, a empresa gastou para comprar as mercadorias.

Há outros elementos que podem integrar o cálculo do CMV (Custo das Mercadorias Vendidas), como devoluções de compra (feitas ao fornecedor) e devoluções de vendas (feitas pelo cliente).
### Como calcular o CMV?
O cálculo do CMV é feito a partir de uma fórmula que usa os dados dos elementos mostrados acima.

A fórmula básica é:

CMV = EI + C – EF
Sendo:

EI = Estoque Inicial
C = Compras realizadas dentro do período analisado
EF = Estoque Final.
Se o objetivo é descobrir quanto custaram as mercadorias vendidas em determinado período, o valor do estoque que já existia deve ser somado às novas compras e subtraído do estoque que ainda resta.

Afinal, as mercadorias que permanecem no estoque não foram vendidas, portanto, não fazem parte do custo de vendas.

A seguir, você vai descobrir que é possível fazer o cálculo do CMV considerando os itens do estoque (por mercadoria) ou o quanto eles representam em termos monetários (saldo monetário).

Cálculo do CMV por mercadoria
Vamos usar como exemplo uma loja de bicicletas.

Nesse caso, o cálculo do CMV por mercadoria leva em consideração o estoque em quantidade de itens.

Se a loja tinha 10 bicicletas no estoque no início do mês (EI), comprou mais 10 (C) e no final do período tinha 5 (EF), o CMV por mercadoria, neste exemplo, é de quanto?

Vamos à fórmula para descobrir:

CMV = EI + C – EF
(Lembrando que EI = Estoque Inicial, C = Compras realizadas dentro do período analisado e EF = Estoque Final)
CMV = 10 + 10 – 5
CMV = 15.
Perceba que o cálculo do CMV por mercadoria basicamente é um balanço de estoque.

Por esse método, o levantamento não mostra quanto custou para a empresa os produtos vendidos e/ou estocados.

Apenas quantos foram comprados, vendidos e quantos ainda estão em estoque.

Por meio das informações fornecidas por esse método, a empresa consegue identificar quais produtos vendem mais, quais vendem menos e fazer, por exemplo, um planejamento de compras.

Com isso, é possível reduzir o risco de perder vendas por falta de estoque ou ter prejuízos por excesso de mercadoria estocada.

Cálculo do CMV por saldo monetário
O cálculo do CMV por saldo monetário segue a mesma lógica.

A diferença é que, por esse método, o indicador considera quanto cada mercadoria custou para a empresa em termos monetários.

Nos tópicos anteriores, vimos que há diferentes critérios para avaliação de um estoque, dentre eles, o custo médio.

Para facilitar o entendimento, vamos usar o mesmo exemplo da loja de bicicletas.

No início do mês, período que estamos analisando, a loja tinha 10 bicicletas no estoque.

Ao longo do mês, comprou mais 10 unidades e, no final do período, tinha 5.

Vamos imaginar que o custo médio de aquisição de cada bicicleta foi de R$ 100,00. Qual o CMV por saldo monetário neste exemplo?

Para descobrir, voltemos à fórmula:

CMV = EI + C – EF
(Lembrando que EI = Estoque Inicial, C = Compras realizadas dentro do período analisado e EF = Estoque Final)
CMV = R$ 1.000,00 + R$ 1.000,00 – R$ 500,00
CMV = R$ 1.500,00.
Ou seja, as 15 bicicletas vendidas, que descobrimos por meio do CMV por mercadoria, custou para a loja R$ 1.500,00, independentemente do preço de venda.

O valor apurado (R$1.500,00) é o preço de custo.

Para verificar se a loja teve lucro ou prejuízo, é preciso saber por quanto ela vendeu as bicicletas.

Para isso, usamos uma outra fórmula:

RCM = V – CMV
Sendo:

RCM = Resultado da Conta Mercadorias
V = Vendas
CMV = Custo das Mercadorias Vendidas.
Sabemos que o Custo das Mercadorias Vendidas da loja foi de R$ 1.500,00.

Vamos imaginar que o total de vendas da loja com as 15 bicicletas foi de R$ 3.000,00. Qual foi, então, o Resultado da Conta Mercadorias (RCM)?

RCM = R$ 3.000,00 – R$ 1.500,00
RCM – R$ 1.500,00.
Nesse caso, a empresa obteve um lucro bruto sobre as vendas de R$ 1.500,00.

Ou seja, vendeu as mercadorias por um preço superior ao custo de aquisição.

As fórmulas apresentadas neste texto são básicas e podem ser complementadas por outros elementos, como devoluções de compra e de venda, impostos, custo de frete, aluguel do galpão de estoque, dentre outros custos.

Apesar de parecer complicado e trabalhoso, o indicador CMV pode ser facilmente calculado por meio de sistemas de gestão.

São soluções tecnológicas que fazem o trabalho automaticamente, inclusive em tempo real, dependendo do segmento da empresa e da necessidade do negócio.

### Qual é a importância do indicador CMV?
Como vimos, o indicador CMV está intimamente ligado a um eficiente controle de estoque.

O estoque pode ser de matéria-prima, de materiais semi acabados ou de mercadorias.

No caso das empresas do ramo de comércio, que ganham dinheiro comprando e revendendo mercadorias, usa-se o CMV.

Mas há outros indicadores semelhantes, como o CPV (Custo do Produto Vendido), usado por indústrias que produzem as próprias mercadorias.

Ou o CSV (Custo do Serviço Vendido), usado para calcular o indicador nas empresas prestadoras de serviço.

Estoque do tamanho certo
De maneira geral, toda empresa do ramo de comércio precisa ter algum nível de estoque.

Mercadorias à disposição garantem eficiência e confiabilidade na entrega, além de evitar perda de venda e de clientes.

Mas é preciso atenção ao tamanho do estoque.

Quando grande demais, engessa o capital de giro e acarreta prejuízos, já que há custos para manter as mercadorias estocadas.

No caso das mercadorias perecíveis, a boa gestão do estoque torna-se ainda mais necessária.

Afinal, nenhuma empresa quer perder dinheiro por causa de produtos com prazo de validade vencido.

Controle e redução de custos
O indicador CMV (Custo das Mercadorias Vendidas) fornece dados que compõem a base de cálculo do lucro operacional.

Medir e acompanhar o CMV dá ao gestor condições de elaborar estratégias de controle e redução de custos.

Isso pode ser feito otimizando os gastos com estoque ou negociando melhores condições de compra junto aos fornecedores.

Reduzir o custo com as mercadorias vendidas significa aumentar o lucro sem precisar mexer no preço ao consumidor final.

### Qual é o CMV ideal?
Essa é uma pergunta para a qual não existe uma resposta única e definitiva.

O melhor CMV é sempre o menor possível.

Quanto menor o Custo da Mercadoria Vendida, maior o lucro bruto da empresa. É uma relação inversamente proporcional.

Algumas empresas conseguem ganhar dinheiro mesmo com margens de lucro baixas. São as empresas de giro.

O lucro é pequeno sobre cada venda feita, mas o volume de vendas é grande, então uma coisa compensa a outra.

Outras empresas giram pouco, mas têm margens altas.

A situação econômico-financeira é diferente para cada tipo de negócio.

Sobre empresas comerciais que revendem mercadorias, há um consenso de que um CMV saudável deve estar entre 30% e 50% do faturamento.

Acima de 50%, pode ficar difícil fechar a conta.

Vale ressaltar que, além do Custo das Mercadorias Vendidas, há outras despesas diretas e indiretas que também precisam ser deduzidas do faturamento total.

### Como utilizar o CMV para otimizar a gestão do estoque?
Além de servir como base para a apuração do lucro operacional, o CMV (Custo da Mercadoria Vendida) também é um ótimo indicador para otimizar a gestão do estoque.

A partir dos registros de tudo que entra e sai do armazém, inclusive os itens devolvidos, é possível compreender a demanda dos clientes por cada tipo de produto.

Vimos que o CMV pode ser feito por saldo monetário e também por quantidade de mercadorias.

Ambos são úteis na elaboração de estratégias de otimização do estoque.

Por meio do CMV, a empresa consegue identificar, por exemplo, se as devoluções de venda estão dentro do esperado.

Caso seja identificado algum aumento, pode haver algum problema que precisa ser investigado e resolvido.

É possível também descobrir se alguma mercadoria está “encalhada” no estoque, ocupando espaço e minando recursos.

Seria o caso de fazer uma liquidação? O CMV ajuda o gestor a decidir se é viável.

O mesmo pode ser feito com produtos perecíveis que estão próximos da data de vencimento.

Vários aspectos do estoque podem ser mensurados e avaliados com a ajuda do CMV, como sazonalidade de mercadorias, obsolescência e índice de perecibilidade.

Com um sistema integrado de gestão (ERP), a empresa consegue manter um fluxo de comunicação permanente entre o setor de compras, estoque e setor de vendas.

Além de contribuir para a elaboração de estratégias eficientes da gestão de estoque, o controle sistemático também evita extravios de itens e reduz o risco de erros e retrabalhos.


