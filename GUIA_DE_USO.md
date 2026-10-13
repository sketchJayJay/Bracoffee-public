# Guia de uso — BRACOFFEE Office 3.1

## Começar pela configuração

Em Configurações, confira razão social, CNPJ/CPF, inscrição estadual, endereço, contatos, prefixos das ordens e condições do contrato de venda. Mantenha os dados reais da empresa. Cadastre os locais de descarga usados na instrução de faturamento; pode haver vários armazéns.

O nome e a marca original permanecem no sistema e nos documentos. Computador e celular utilizam a mesma base do servidor. Aguarde **Tudo salvo** antes de fechar ou trocar de aparelho. Um aviso de conflito pede carregar a base atual para evitar sobrescrever outra alteração.

## Comprar e elaborar documentos

1. Abra Balcão de compras e informe fornecedor, quantidade, preço, bebida e condição de pagamento.
2. Escolha o destino: Para estoque, Compra direta ou Compra futura. Criar uma compra não cria automaticamente café físico.
3. Se houver corretor, informe o nome, a corretagem combinada (percentual livre ou valor fixo) e o responsável. Sem corretor e sem corretagem também são opções.
4. Finalize a compra. A OC reúne contrato, instrução de faturamento, referência fiscal, recebimentos e pagamentos.
5. Emita o contrato com os espaços de assinatura correspondentes. Na instrução de faturamento, selecione um local de descarga cadastrado ou sem local, confira orientações e salve como PDF para o fornecedor.
6. Após receber a nota, registre a referência fiscal pela OC. A instrução não emite NF.

Em A fixar, o preço pode ser informado como referência, mas a obrigação financeira fica a fixar e não permite pagar nem emitir uma instrução com valor indefinido. Edite a OC, fixe o preço e a condição de pagamento para liberar os próximos passos.

## Puxar a OC para o estoque

Abra Receber café na OC ou Puxar OC para o estoque. Selecione uma OC Para estoque com quantidade ainda pendente.

**Informe primeiro o peso líquido efetivamente recebido em kg.** O sistema calcula as sacas por peso ÷ 60. Sacas é um campo de consulta automática, com até quatro casas. Por exemplo: 2.400 kg resultam em 40 sacas.

Informe número do lote, número da NF, qualidade, data, armazém e observações. A qualidade vem preenchida com a bebida da compra e pode ser detalhada. Não é necessário informar umidade nessa rotina. Cada recebimento pode gerar seu próprio lote; uma OC pode ser recebida em partes. Não é permitido ultrapassar o saldo pendente.

Compra direta não entra em estoque. Na compra futura, quando o café for destinado ao armazém, use Receber café e confirme a destinação ao estoque. Vendas futuras vinculadas passam a reservar os lotes efetivamente recebidos; a parte ainda não recebida continua sendo previsão.

## Consultar, editar e excluir um lote

No estoque, as colunas mostram físico, reservado e livre para vender. Use a busca por lote, OC, NF, qualidade, fornecedor ou armazém. Mostrar lotes encerrados inclui os saldos zerados ainda válidos.

**Ver lote → Editar lote** permite corrigir o peso de entrada, número do lote, NF, qualidade, data, armazém e observações. O cálculo conserva o que já saiu e foi reservado. O histórico guarda os dados anteriores; uma troca de armazém registra a movimentação de local. Não permite criar uma entrada acima do comprado na OC.

**Ver lote → Excluir com senha** pede motivo e a senha usada para entrar no sistema. O servidor verifica a senha. Se houver entregas ou reservas, estorne a entrega e cancele/libere a venda antes. A exclusão retira o lote do saldo e da lista física, mas conserva o registro no histórico, evitando apagar a rastreabilidade. A senha não integra a base nem os backups.

Estornar entrada serve para corrigir um recebimento sem saídas e reservas. A quantidade da OC fica novamente disponível para receber. Lotes legados criados automaticamente por versões antigas não contam como café físico.

## Guias para o armazém

Abra Guias de armazém → Nova guia, ou use Emitir guia diretamente no lote. O sistema puxa número do lote, OC, NF, qualidade, armazém e saldo físico.

1. Escolha a finalidade: Retirada, Transferência ou Orientação de depósito.
2. Informe o peso autorizado; as sacas são calculadas. Uma guia não pode instruir quantidade acima do saldo físico do lote.
3. Confira armazém destinatário, quem retira/recebe, documento, destino e referência da OV/autorização.
4. Complete transportador, placa, motorista/contato e instruções, quando aplicáveis.
5. Emita, imprima ou salve como PDF para enviar ao armazém.

A guia recebe código sequencial por ano. A reimpressão utiliza os dados armazenados na emissão; editar o lote depois não modifica a guia anterior. Para corrigir uma instrução já emitida, cancele-a com um motivo e emita outra. Avise o armazém sobre o cancelamento; o sistema não envia mensagens automaticamente.

**Emitir uma guia não reserva nem baixa café.** Confira guias anteriores para evitar instruções duplicadas. Após a saída real, registre a entrega na OV. Mover local ou editar o armazém atualiza a localização no sistema; a guia de transferência apenas comunica a instrução.

## Vender e entregar

Em Vendas → Nova venda, informe comprador, origem, quantidade, preço, condição de recebimento e previsão de entrega. Os dados do comprador podem ser completados para o contrato.

- Do estoque: selecione um ou vários lotes. A quantidade total é a soma das alocações. A OV reserva o café disponível, sem descontar o físico.
- Direta: vincule a OC; acompanha a negociação e entrega sem inventar entrada física.
- Futura: vincule uma OC futura. Enquanto não houver entrada real, acompanha a previsão sem saldo físico fictício.

Emita OV e contrato de venda; corretor e comissão são opcionais. O contrato usa as condições da configuração, editáveis em cada venda. A reimpressão do contrato emitido conserva o documento original. Ao editar a negociação, emita uma nova versão se desejar documentar os novos termos.

Em Registrar entrega, informe sacas realmente entregues, data, NF e transporte. A entrega pode ser parcial e baixa os lotes envolvidos. Um estorno devolve o físico e mantém a reserva da quantidade ainda contratada. Cancele uma venda somente após estornar entregas e recebimentos; o histórico permanece.

## Pagar, receber e acompanhar

Compras geram contas a pagar; vendas geram contas a receber. Em Financeiro, filtre por tipo e registre parcelas com valor, data, forma e observação. O saldo se atualiza sem permitir pagar/receber acima do total.

O botão de estorno preserva o lançamento e reabre o saldo. Não é permitido reduzir o valor de uma ordem abaixo do que já foi pago ou recebido. Vendas antigas ficam a conferir até confirmar seus dados e recebimento; o sistema não inventa contas nem recebimentos históricos.

Para corretagem, frete, armazenagem ou outras despesas/receitas, use + Lançamento. Essas contas são separadas das sacas da OC/OV. Não há aumento automático do preço por margem, nem comissão adicionada automaticamente ao valor do café.

O relatório mensal mostra caixa realizado pelas datas dos pagamentos/recebimentos. Saldo de caixa não representa lucro, e os valores a fixar ficam separados de obrigações exigíveis.

## Estoque inicial e backup

+ Estoque inicial registra café que já estava no armazém antes do uso: peso, bebida, qualidade, referência do lote, NF, local e data. Não cria uma compra nem uma conta a pagar.

Exporte o estoque em CSV para conferência e o backup JSON completo em Configurações. A restauração substitui a base inteira e exige senha de acesso. Faça uma exportação atual antes. Não copie bases de teste para produção.

## Demonstração para Rubens

1. Faça uma compra de 100 sacas Para estoque. O estoque físico continua igual.
2. Receba 3.600 kg, informe lote e NF. O sistema mostra 60 sacas físicas e 40 pendentes na OC.
3. Em Ver lote, confira e edite a qualidade; emita uma guia de 600 kg para o armazém. A guia mostra 10 sacas e o físico continua 60.
4. Crie uma venda de 30 sacas desse lote. O físico fica 60, reservado 30 e livre 30.
5. Confirme uma entrega de 10 sacas. O físico passa a 50, reservado a 20 e livre permanece 30.
6. Registre um recebimento parcial. Confira o saldo financeiro, o histórico do cliente e o relatório do mês.
7. Abra pelo celular e confira a mesma operação depois de Tudo salvo.

Use dados de demonstração em uma base separada. Para entrar em produção, confira a empresa, os locais, o estoque inicial e os documentos combinados com o cliente.
