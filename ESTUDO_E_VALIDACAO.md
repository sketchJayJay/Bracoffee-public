# Estudo e validação — BRACOFFEE Office 4.1

## Objetivo e contexto

Rubens compra e vende café, negocia com ou sem corretor, orienta o fornecedor sobre faturamento, recebe café em armazéns, trabalha por lotes e acompanha pagamentos/recebimentos. Os pedidos da reunião acrescentaram peso como ponto de partida, lote, NF, qualidade, edição/exclusão protegidas e guias. A versão 3.1 já cobria esses módulos; esta revisão melhora os caminhos entre eles e a proteção operacional.

O usuário confirmou que os cadastros que haviam sumido já foram recuperados. A nova versão conserva o formato existente; o pacote não contém uma base para substituir os registros reais. O estudo foi feito sobre o código e os exemplos fornecidos, com testes sintéticos. Não houve acompanhamento presencial da operação do cliente nem implantação no servidor nesta entrega.

## Diagnóstico e mudanças

| Dificuldade encontrada | Mudança entregue | Efeito na rotina |
| --- | --- | --- |
| Funções espalhadas | Painel de pendências com ação direta | O próximo passo abre a operação correta |
| Formulário longo | Compra em três passos, com modo completo opcional | Menos campos de cada vez, validação por etapa |
| Interrupção no cadastro | Rascunho de nova compra neste aparelho | Retoma antes de finalizar a OC |
| Busca limitada à tela/mês | Busca global por entidades, lote e NF | Localiza registros no histórico completo |
| OC, lote, OV e guia consultados separadamente | Vínculos recíprocos na ficha | Conferência sem copiar números entre telas |
| Valores e eventos confundidos | Mantém negociação, reserva, entrega e recebimento separados | Não baixa físico/caixa antes da confirmação real |
| Guia duplicada pouco visível | Aviso de autorizações existentes | Usuário confere antes de emitir outra instrução |
| Digitação repetida na guia | Destinatário/destino preenchidos pela OV | Menos repetição e inconsistências |
| Listas vazias por filtros | Limpar filtros e histórico completo nas vendas | Diferencia ausência de resultado de perda de registros |
| Correções por prompts soltos | Formulários de motivo e destino | A ação e seus efeitos ficam explícitos |
| Backups ocultos no servidor | Tela de cópias com consulta e download | Arquivos podem ser conferidos antes de restaurar |
| Dez versões expiram rápido durante uso intenso | Cópias diárias e manuais separadas | Mais pontos de recuperação no mesmo armazenamento |
| Troca de base pode substituir a cópia do aparelho | Conferência da identidade e de base vazia | Preserva a cópia local e bloqueia alteração silenciosa |
| Base principal ausente com backups presentes | Inicialização interrompida | Evita criar uma base nova sobre um diretório recuperável |

## Referências e aplicação

**Operação de café.** CCCMG, Código de Ética / Usos Comerciais e Manual de Classificação: foram usados para compreender a relação comercial entre comprador, vendedor e corretor, a referência de saca líquida de 60 kg e a identificação da qualidade/amostra. O texto comercial é histórico e não foi tratado como legislação atual. Qualidade, condições e corretagem continuam editáveis conforme a negociação. O sistema não emite nota fiscal nem faz uma certificação oficial de classificação.

- https://cccmg.com.br/codigo-de-etica/
- https://cccmg.com.br/manual-de-classificacao/

**Usabilidade.** As orientações da Nielsen Norman Group sobre estado do sistema, erros e estados vazios embasaram a apresentação de pendências, status de salvamento, mensagens com próximo passo e limpeza de filtros. A escolha de compra guiada e vínculos entre fichas é uma decisão de projeto aplicada ao fluxo descrito pelo cliente.

- https://www.nngroup.com/articles/visibility-system-status/
- https://www.nngroup.com/articles/error-message-guidelines/
- https://www.nngroup.com/articles/empty-state-interface-design/

**Persistência.** Documentação oficial do Docker e do Coolify diferencia os dados no contêiner dos dados em armazenamento persistente. A implantação precisa reutilizar o armazenamento correto; arquivos de backup no mesmo volume não substituem uma cópia exportada para fora dele. As proteções novas detectam inconsistências conhecidas, mas não recuperam um volume apagado sem uma cópia disponível.

- https://docs.docker.com/engine/storage/volumes/
- https://coolify.io/docs/applications/configuration/persistent-storage

## Verificações realizadas

1. Regras comerciais: reserva sem baixa física, venda acima do saldo rejeitada, múltiplos lotes, entregas parciais, estornos, cancelamento, pagamentos e 40 cenários de quantidade fracionária.
2. Fluxo de compra → entrada → venda → entrega → recebimento, com contratos, instrução, corretagem e reimpressão estável.
3. Direta/futura sem estoque fictício; recebimento de compra futura convertida para estoque e entrega a partir de lote real.
4. A fixar em compra/venda, bloqueio de pagamento/faturamento indefinido e liberação após fixação.
5. Pedidos da reunião: peso primeiro, lote/NF/qualidade, edição protegida, exclusão com senha verificada pelo servidor, guia sem baixa e histórico preservado.
6. Compra guiada: validação de campo obrigatório, rascunho após recarregar, retomada e limpeza depois de finalizar.
7. Pendência abrindo o recebimento da OC correta; busca sem acentos e por NF; links OC ↔ lote ↔ OV ↔ guia.
8. Guia preenchida pela OV, aviso de autorização anterior, ajuda contextual e filtros limpos explicitamente.
9. Cópia manual/diária/versionada, exportação íntegra; downloads de backup recusados sem sessão e caminhos indevidos recusados.
10. Servidor reiniciado preservando identidade/base; base vazia rejeitada sem autorização; base principal ausente ou corrompida não sobrescrita; limites de retenção verificados.
11. Sincronização simulada com mudança de identidade, base inesperadamente vazia, configurações sem cadastros, migração inicial válida, cópias locais e bloqueio de gravação inválida.
12. Recuperação no navegador: após o servidor apresentar base vazia, registros e empresa locais permaneceram; senha errada não restaurou; restauração autorizada recuperou OC, lote, financeiro e configuração e persistiu após recarregar.
13. Migração de versão antiga preservando empresa, condições, pagamentos e saídas anteriores, sem dupla baixa nem recebimentos presumidos.
14. Base sintética com 500 compras/lotes/vendas/contas: validação, paginação, busca no histórico e layout móvel.
15. Interface e novas rotinas conferidas em 1.440, 1.024, 851, 768, 390 e 320 px. Logo original comparada por bytes.

Os testes dos cenários descritos passaram. Dados, senhas e capturas de teste não integram a entrega. As funções novas têm testes incluídos em tests/ e os passos de implantação em ATUALIZAR_NO_COOLIFY.md.

## Escopo prático

Os próximos ajustes devem vir de exemplos concretos de operação ou de um modelo de documento exigido pelo cliente: uma guia real, uma cláusula específica ou uma regra de arredondamento, por exemplo. A interface entrega caminhos claros e validações; a conferência da base real, dos dados da empresa e das condições negociadas é parte da entrada em produção. Essa distinção evita chamar uma personalização ainda não especificada de defeito do que já está entregue.

## Validação adicional 4.1

Botões Editar/Excluir conferidos na tabela e nos cartões móveis. Senha errada e cancelamento não alteraram a OC; senha correta permitiu editar e excluir uma OC sem movimentações. A ficha também pediu senha. Uma autorização vencida pediu senha novamente antes de gravar sem perder o preenchimento.

Requisições diretas sem autorização, com autorização de outra ação, alterada, vencida ou de outra base foram recusadas. O servidor também bloqueou exclusão de OC com histórico. Pagamentos continuaram funcionando sem a senha de edição de compras. O fluxo comercial completo e seis larguras de tela foram conferidos novamente. A marca e o formato da base foram preservados.
