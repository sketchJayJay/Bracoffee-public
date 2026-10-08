# BRACOFFEE v1.6 - Corretor e instrução de faturamento

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

- Substitua os arquivos do projeto pelos arquivos deste ZIP e faça o redeploy usando o mesmo domínio.
- As variáveis de login e a porta continuam iguais. O Dockerfile inicia `node server.js` na porta 80.
- Esta base guarda os dados no navegador (`bracoffee_db_v1`), no mesmo endereço do sistema. A atualização mantém essa chave e os registros existentes; não limpe os dados do navegador.
- Exporte o backup antes de atualizar. Para levar os registros a outro navegador, celular ou domínio, exporte e importe o JSON em **Configurações**.

## Estoque

- Finalizar uma compra cria OC, contrato e financeiro.
- Compra futura e venda direta não entram automaticamente no estoque.
- Somente uma compra marcada como **Para estoque** pode ser puxada manualmente pela tela Estoque.
- O saldo considera apenas entradas físicas feitas pelo botão **Puxar OC para estoque**.
- Lotes automáticos antigos são preservados no histórico, sem contar como estoque físico.

## Login padrão

Usuário: admin

Senha: Bracoffee@2026

No Coolify, ajuste `APP_USER`, `APP_PASSWORD` e `SESSION_SECRET` conforme a configuração já usada.

## Contratos de venda

O fluxo atual de saída do estoque foi preservado. Ordem e contrato de venda serão ajustados quando o modelo e o código forem definidos.
