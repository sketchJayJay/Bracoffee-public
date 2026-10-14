# BRACOFFEE Office 4.1

Sistema de gestão comercial de café para acompanhar a compra, o recebimento físico por lote, a venda, a entrega e o financeiro. Mantém a marca original e a identidade visual em carvão, creme e bronze, com telas para computador e celular.

## Ações de compras 4.1

Editar e Excluir aparecem diretamente na lista de compras e nos cartões do celular. Essas ações e a edição pela ficha da OC exigem a senha de edição/exclusão, validada no servidor. A senha inicial é **4317**; a senha de login permanece a atual.

Para alterar a senha dessas ações no Coolify, configure `PURCHASE_ACTION_PASSWORD` e faça o redeploy. Se não for definida, o padrão é 4317. Senha errada, cancelamento ou autorização inválida não alteram a compra. A autorização de edição vale por até 30 minutos durante o preenchimento; ao reabrir a edição ou excluir, a senha é solicitada novamente. A senha não integra os registros nem os backups.

Compras com entradas, vendas ou pagamentos não podem ser excluídas; use a edição para corrigi-las. Pagamentos, recebimentos, faturamento e registro da NF continuam com seus fluxos próprios. A restauração completa de backup mantém a senha de login existente.

## Rotina de trabalho 4.0

- Tela inicial com pendências acionáveis: vencimentos de hoje/atrasados, faturamento, recebimentos, entregas, preço a fixar e conferência de histórico.
- Atalhos para comprar, receber, vender, emitir guias e acertar valores.
- Compra guiada em três passos, com validação por etapa, formulário completo opcional e rascunho recuperável neste aparelho.
- Busca global por OC, OV, lote, NF, guia, fornecedor, cliente e conta, em qualquer período; atalho Ctrl+K / Cmd+K.
- Ficha do lote ligando compra de origem, vendas, guias e histórico de correções; navegação recíproca nas OCs, OVs e guias.
- Ajuda por rotina, limpeza clara dos filtros e formulários de correção com motivo.
- Guia com destinatário preenchido pela OV, aviso de autorizações anteriores e acesso à venda/lote relacionados.
- Tela de cópias de segurança com download das versões do servidor e deste aparelho. Até 30 cópias diárias em dias com alterações, dez versões recentes e dez cópias manuais no mesmo armazenamento.
- Proteção contra mudança inesperada de base e substituição vazia, com conferência das quantidades e restauração autorizada por senha.

Consulte **ESTUDO_E_VALIDACAO.md** para as decisões e verificações; **GUIA_DA_ROTINA_4.md** apresenta o uso da nova interface.

## O que está incluído

- Compra com OC, contrato, corretor opcional, corretagem percentual livre ou valor fixo, e assinaturas das partes.
- Instrução de faturamento para o fornecedor, com local de descarga selecionável ou sem local, orientações editáveis e referência da nota fiscal recebida.
- Entrada de estoque pela OC: informar primeiro o peso líquido em kg e calcular as sacas automaticamente, com 60 kg por saca. Recebimentos parciais permitidos.
- Número do lote, número da NF, qualidade e armazém. Sem campo de umidade na rotina de recebimento/edição do estoque.
- Ver lote e editar peso, identificação, NF, qualidade, data, armazém e observações. Não permite reduzir o lote abaixo das saídas e reservas nem receber acima do comprado.
- Exclusão do lote com senha de acesso validada no servidor. Exige estornar saídas e liberar reservas antes; preserva o registro no histórico.
- Guias de armazém a partir do estoque: retirada, transferência ou orientação de depósito, com identificação do café, peso, destinatário, transporte e instruções. Impressão/PDF e reimpressão conservam os dados da emissão.
- Venda com OV, contrato, comprador, corretor opcional, múltiplos lotes, venda direta e venda futura vinculadas a uma OC.
- Reservas ao negociar e saída física somente ao confirmar a entrega. Entregas parciais e estornos.
- Contas a pagar e receber com parcelas, datas, formas e estornos. Preço A fixar sem dívida exigível fictícia.
- Lançamentos financeiros avulsos para corretagem, frete, armazenagem e outras despesas/receitas.
- Fichas e histórico de fornecedores e clientes; identificação das amostras por espécie, safra, peneira e referência.
- Estoque inicial, movimentações, exportação CSV, relatório financeiro e backup JSON.
- Busca em toda a base, listas paginadas, sincronização entre aparelhos, bloqueio de conflitos e cópias diárias, manuais e versões anteriores no servidor.

Corretagem não é adicionada automaticamente ao preço do café. Use lançamento financeiro avulso quando houver uma obrigação de comissão a registrar.

## Executar

Requer Node.js 20 ou posterior, sem instalação de pacotes.

```bash
node server.js
```

Variáveis: PORT, DATA_DIR, APP_USER, APP_PASSWORD e SESSION_SECRET. No Coolify, mantenha as variáveis atuais e o mesmo volume persistente em `/app/data`. O Dockerfile está incluído.

## Atualizar e usar

Leia **ATUALIZAR_NO_COOLIFY.md** para preservar a base atual e **GUIA_DE_USO.md** para a rotina e uma demonstração completa. **ESTUDO_E_VALIDACAO.md** registra o estudo, as decisões operacionais e os testes realizados.

O programa prepara documentos comerciais; a nota fiscal continua sendo emitida pelo responsável fiscal. A guia não baixa nem reserva estoque. Depois da movimentação real, confirme a entrega na OV.

## Testes das regras comerciais

```bash
node tests/commercial.test.js
node tests/workspace.test.js
node tests/persistence.test.js
node tests/sync.test.js
node tests/purchase-access.test.js
```

O ZIP contém o programa, documentação e testes; não contém base real, dados de demonstração nem senhas de teste. Esta entrega não faz o redeploy automaticamente.
