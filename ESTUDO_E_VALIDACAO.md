# Estudo e validação — BRACOFFEE Office 3.1

## Rotina atendida

O cliente compra e vende café, com ou sem corretor, precisa formalizar negociações, orientar o fornecedor sobre faturamento, receber fisicamente em armazéns, identificar lotes, autorizar movimentações e acompanhar os valores pagos/recebidos.

A versão anterior tinha compras, pagamentos e recebimento, mas vendas simples ainda não cobriam toda a sequência comercial. Esta versão liga OC, lotes, reservas, OV, entregas e financeiro. Os pedidos da reunião foram incorporados ao recebimento, à consulta do lote e às guias.

| Necessidade | Comportamento implementado |
| --- | --- |
| Digitar peso primeiro | Sacas calculadas por kg ÷ 60 no recebimento e estoque inicial |
| Número do lote, NF e qualidade | Recebimento, consulta/edição, busca, CSV e guia |
| Dispensar umidade | Sem preenchimento de umidade no recebimento, edição e guia |
| Editar ao ver lote | Correção com histórico e proteção contra quantidades incompatíveis |
| Excluir com senha | Validação no servidor, motivo obrigatório e histórico conservado |
| Guias pelo estoque | Lote e dados puxados automaticamente, impressão/PDF, sequência, cancelamento e reimpressão estável |
| Vender do estoque | Alocações em múltiplos lotes, reserva e saída somente na entrega |
| Vender direto/futuro | OC vinculada e controle comercial sem inventar estoque |
| Contas a receber | Parcelas, estornos e proteção contra valores já recebidos |
| A fixar | Não trata referência de preço como obrigação já exigível |
| Despesas operacionais | Lançamentos separados para corretagem, frete e armazenagem |
| Base existente | Conserva pagamentos, configurações e saídas antigas sem repetir baixa |
| Uso no celular | Navegação e formulários responsivos, busca e paginação |

## Referências comerciais consultadas

- Centro do Comércio de Café do Estado de Minas Gerais, Código de Ética / Usos Comerciais: https://cccmg.com.br/codigo-de-etica/
- CCCMG, Manual de Classificação: https://cccmg.com.br/manual-de-classificacao/

As referências ajudam a entender a saca líquida de 60 kg, qualidade negociada, relação entre comprador/vendedor/corretor e rastreabilidade de amostras e lotes. O documento de usos comerciais é histórico; não foi tratado como certificação jurídica ou tributária atual. Classificação completa pode envolver bebida, tipo, espécie, safra, peneira e outros atributos. A interface mantém a qualidade editável conforme a operação do cliente.

As instruções fiscais do fornecedor preservam as orientações já configuradas na base; não foram criados cálculos tributários automáticos. A NF continua sendo emitida pelo responsável. Os textos de contrato e a guia comercial são configuráveis/ajustáveis à negociação; não houve fornecimento de um modelo oficial de guia pelo cliente.

## Verificações realizadas

- Regras comerciais compartilhadas entre navegador e servidor: reservas, entregas parciais, estornos, cancelamento, múltiplos lotes, recebimentos e 40 cenários de quantidade fracionária.
- Fluxo completo no navegador: comprar 100 → receber 60 → vender 30 → entregar 10 → receber parcialmente; correção de preço sem perder parcelas; reimpressão estável de contrato.
- Compra direta sem entrada; compra futura destinada ao estoque, recebimento parcial e entrega por lote real.
- A fixar em compra/venda, liberação após fixação de preço e bloqueio de faturamento indefinido.
- Migração de base antiga mantendo pagamentos e configurações, sem dupla saída nem recebimentos presumidos; persistência após recarregar.
- Lançamentos avulsos, parcelas, bloqueio de edição abaixo do pago, estorno e cancelamento.
- Pedidos da reunião: peso calculando sacas, lote/NF/qualidade, ausência de umidade no recebimento, edição com reserva protegida, guia sem baixa, snapshot inalterado após edição, senha errada sem exclusão e senha validada no servidor.
- Requisição direta sem senha recusada; tentativa de excluir lote reservado recusada mesmo com senha; tentativa de apagar fisicamente o registro recusada; senha não presente no backup.
- Restauração de backup com senha: senha incorreta mantém a base e senha correta restaura dados no servidor.
- Base com 500 compras, lotes, vendas e contas: validação, paginação e busca no histórico completo.
- Computador e celular em larguras 1.440, 1.024, 851, 768, 390 e 320 px, além das telas de guias e modais de lote.
- Rejeição pelo servidor de estoque negativo e conflitos entre revisões; CSV, backup completo e marca original preservada.

Os dados utilizados foram sintéticos e não integram o ZIP. Os testes comprovam os cenários descritos; a instalação do pacote no Coolify e a conferência da base real continuam sendo etapas de implantação.
