# BRACOFFEE Office 2.0

Um escritório para a rotina de compra de café: negociar, gerar documentos, acompanhar pagamentos e receber o café fisicamente.

## Novidades

- Interface renovada para computador e celular, com identidade em café, bronze e verde oliva.
- Visão geral com compras e sacas negociadas por mês, estoque físico, saldo a pagar e próximas ações.
- Balcão em três etapas, com dados opcionais recolhidos e resumo atualizado da negociação.
- Ficha da OC com situação do faturamento, recebimento, pagamentos e saldo.
- Pagamentos parciais com valor, data, forma e observação; estornos preservam o histórico.
- Ficha do fornecedor com compras, valores pagos e saldo, além de iniciar uma nova negociação.
- Busca e filtros de compras por situação, tipo, mês e instrução ainda não emitida.
- Dados centralizados no servidor para acessar a mesma operação no computador e no celular.
- Indicação de salvamento, proteção contra alterações simultâneas e dez versões anteriores de segurança.

## Compra e contrato

- Na compra, selecione se há corretor. Compra direta continua sem campos adicionais.
- Informe nome, documento e telefone do corretor; documento e telefone são opcionais.
- Corretagem: sem comissão, percentual livre sobre o valor do café (por exemplo, 0,5% ou 0,2%) ou valor fixo em reais.
- O valor calculado, o responsável pelo pagamento e as condições combinadas aparecem no contrato.
- Com corretor, o contrato possui três espaços de assinatura: vendedor, comprador e corretor.
- O valor do café e o financeiro da compra mantêm o valor das sacas. A corretagem é registrada separadamente no contrato, sem criar uma conta automática no financeiro.

## Instrução de faturamento

1. Abra a compra em **Compras** e toque em **Instrução de faturamento**.
2. Confira a data, a descrição, as orientações e os contatos.
3. Escolha o local de descarga, cadastre outro local ou use **Sem local de descarga**.
4. Use **Salvar rascunho** para continuar depois ou **Emitir / imprimir** para abrir o documento.
5. Na impressão, escolha **Salvar como PDF** para encaminhar ao fornecedor.

A instrução contém a OC, fornecedor, dados de faturamento da empresa, café, quantidade, peso, preço por saca, valor total, descarga (quando selecionada), orientações e contatos para NF. O fornecedor usa essas informações para emitir a própria nota fiscal.

Os dados iniciais da empresa, da Louis Dreyfus de Varginha, das orientações e dos contatos foram preenchidos conforme o PDF fornecido. Tudo pode ser editado em **Configurações**. Para a emissão, informe razão social, documento, endereço e cidade da empresa.

**Reimprimir última emissão** mantém os dados daquela emissão, mesmo que o cadastro da empresa, do local ou a compra sejam editados depois. Para atualizar a instrução, confira os campos e emita novamente. O rascunho e a última emissão são guardados na respectiva OC e incluídos no backup.

## Atualização no Coolify

Leia **ATUALIZAR_NO_COOLIFY.md** antes do redeploy. A mudança essencial é configurar armazenamento persistente no caminho `/app/data`.

1. Exporte o backup JSON do sistema atual.
2. Substitua os arquivos do projeto pelos arquivos deste ZIP.
3. Mantenha as variáveis de acesso e configure um volume persistente em `/app/data`.
4. Faça o redeploy usando o mesmo domínio.
5. Abra no navegador que contém os registros antigos e aguarde **Tudo salvo**.

O sistema importa automaticamente os registros antigos quando a base do servidor ainda está vazia. Os demais aparelhos passam a consultar essa base. Caso o navegador anterior não esteja disponível ou o domínio mude, importe seu backup em **Configurações**.

O projeto usa Node.js sem dependências de execução. O Dockerfile inicia `node server.js` na porta 80. Para uso local: `node server.js`; os dados ficam em `data` dentro do projeto. `DATA_DIR` permite outro diretório. Use uma instância do servidor por base de dados.

## Pagamentos e fornecedor

Registre parcelas pela ficha da OC ou pelo Financeiro. Cada pagamento tem valor, data, forma e observação. O saldo, a situação da OC e a ficha do fornecedor são atualizados juntos. O indicador **Pago no mês** usa a data de cada pagamento, não a data da compra.

Uma compra marcada como paga na criação registra o pagamento integral com a data da compra. Ao editar uma OC, seus pagamentos são mantidos e o total não pode ficar abaixo do que já foi pago. Um estorno reabre o saldo e conserva o registro original.

Pagamentos antigos sem data conhecida ficam no histórico, sem entrar no indicador de um mês específico. A ficha do fornecedor reúne as OCs e seus saldos, e permite iniciar uma nova negociação com o cadastro preenchido.

## Dados e conexão

A base principal é `/app/data/bracoffee.json`; o navegador mantém uma cópia local. Aguarde **Tudo salvo** para confirmar o registro no servidor. Sem conexão, os registros disponíveis podem ser consultados; novas alterações ficam bloqueadas até reconectar.

Se dois aparelhos alterarem os dados ao mesmo tempo, o segundo precisa carregar a versão atualizada. Sua cópia anterior pode ser baixada pela mensagem ou por **Configurações**. Ela não é mesclada automaticamente.

O servidor guarda as dez versões anteriores em `/app/data/backups`. Exporte também um backup JSON para manter uma cópia independente. Importar um backup substitui a base atual após confirmação.

## Estoque

- Finalizar uma compra cria OC, contrato e financeiro.
- Compra futura e venda direta não entram automaticamente no estoque.
- Somente uma compra marcada como **Para estoque** pode ser puxada manualmente pela tela Estoque.
- O saldo considera apenas entradas físicas feitas pelo botão **Puxar OC para estoque**.
- Lotes automáticos antigos são preservados no histórico, sem contar como estoque físico.
- Recebimentos podem ser parciais, com data e armazém. Uma OC recebida não pode ser reduzida para menos sacas que as já recebidas nem mudar para outro tipo de compra.

## Login padrão

Usuário: admin

Senha: Bracoffee@2026

No Coolify, ajuste `APP_USER`, `APP_PASSWORD` e `SESSION_SECRET` conforme a configuração já usada.

## Contratos de venda

O fluxo atual de saída do estoque foi preservado. Ordem e contrato de venda serão ajustados quando o modelo e o código forem definidos.

## Verificação

Foram verificados migração, sequência de OC, corretagem, pagamentos e estornos, proteção ao editar compras, emissão e reimpressão, recebimentos manuais, filtros, histórico do fornecedor, uso entre aparelhos, conflitos, perda de conexão, reinício do servidor e interface no celular.
