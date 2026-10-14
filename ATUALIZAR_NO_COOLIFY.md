# Atualizar para BRACOFFEE Office 4.1

## Atualização da base já recuperada

Atualize o MESMO aplicativo. Mantenha o mesmo domínio, as variáveis de acesso e o volume existente. Não crie outro volume para esta atualização. O ZIP contém o programa e não inclui dados para substituir a base.

## 1. Guardar os dados atuais

No sistema atual, abra **Configurações → Exportar** e guarde o backup JSON. Faça isso no navegador em que estão os registros do cliente.

## 2. Atualizar o projeto

Substitua os arquivos pelo conteúdo deste ZIP, incluindo `workspace-core.js`, `workspace-ui.js` e `commercial-core.js` e as atualizações de `app.js`, `sync.js`, `server.js`, `data-store.js`, `index.html` e `styles.css`. Não substitua nem apague o diretório de dados. Mantenha o Dockerfile na raiz e continue usando o mesmo domínio e as variáveis de acesso configuradas no Coolify.

## 3. Configurar o armazenamento persistente

Na configuração de armazenamento do recurso no Coolify, adicione um volume persistente com destino no contêiner:

```
/app/data
```

Se você já usa uma versão 2.0 ou posterior, mantenha o volume existente para conservar a base atual.

Use um nome fixo, por exemplo `bracoffee-dados`, e reutilize o mesmo volume nos próximos redeploys. O `DATA_DIR` do Dockerfile já aponta para `/app/data`. O volume declarado no Dockerfile não substitui a configuração de armazenamento persistente do recurso no Coolify.

Esse diretório contém a base e as versões de segurança. Use uma instância do aplicativo por base. O ZIP contém apenas o programa, sem registros de exemplo nem dados reais.

## 4. Fazer o redeploy e trazer os registros

Depois do redeploy, abra o mesmo domínio no navegador utilizado pelo cliente. Na primeira abertura, se o servidor ainda não possuir registros, o sistema traz os dados antigos desse navegador automaticamente. Aguarde **Tudo salvo** e confira as OCs.

Se o navegador antigo não estiver disponível ou o domínio tiver mudado, abra **Configurações → Importar** e selecione o backup JSON. A restauração substitui a base inteira e exige a senha de acesso. Exporte a base atual antes de restaurar; após concluir, aguarde Tudo salvo. Uma senha incorreta não altera a base.

## 5. Conferir a migração

Configurações, OCs, pagamentos e estoques existentes são preservados. Lotes antigos criados automaticamente pela compra continuam apenas no histórico até um recebimento físico registrado. Vendas antigas cuja saída já havia sido descontada não baixam novamente o estoque e aparecem como Histórico a conferir; edite para confirmar o financeiro, sem presumir que houve recebimento.

Na entrada do estoque, informe peso, lote, qualidade e armazém. A exclusão exige a mesma senha de acesso configurada em APP_PASSWORD. Guias de armazém ficam no menu próprio e podem ser emitidas por Ver lote ou Emitir guia no estoque.

## 6. Conferir no celular

Abra o mesmo endereço, faça login e confira uma OC existente. Computador e celular agora consultam a mesma base. Confirme também que o volume continua associado ao recurso antes de futuros redeploys.

O pacote está pronto para substituir o projeto no Coolify; ele não foi publicado automaticamente.

## 7. Conferência da versão 4.0

Confirme os totais e abra uma OC, um lote, uma venda e um pagamento conhecidos. Teste a busca global por uma NF e use Ver lote para conferir os vínculos. As vendas começam mostrando todo o histórico; os filtros continuam disponíveis.

Abra Configurações → Ver cópias de segurança. Crie uma cópia manual e baixe-a para fora do sistema. Cópias no mesmo volume ajudam a voltar versões, mas não sobrevivem à exclusão desse volume.

Se o servidor apresentar uma base diferente ou inesperadamente vazia, o sistema preserva a cópia deste aparelho e pede conferência. Não cadastre operações nessa situação. Baixe sua cópia, confira o armazenamento e, se necessário, restaure um arquivo confirmado com a senha de acesso. Se a base principal desaparecer e houver backups no diretório, o servidor interrompe a inicialização em vez de criar uma base vazia.

Para diagnóstico no terminal do contêiner, existe um comando somente de leitura:

```bash
node scripts/inspect-data.js /app/data
```

Ele mostra se a base e as cópias são legíveis, suas versões e quantidades. Não altera registros nem imprime nomes, documentos ou valores financeiros. Preserve os arquivos antes de qualquer intervenção manual.

Referências oficiais de armazenamento:
- https://coolify.io/docs/applications/configuration/persistent-storage
- https://docs.docker.com/engine/storage/volumes/

## Senha das ações na versão 4.1

Substitua também `purchase-access.js`, `server.js`, `sync.js`, `app.js`, `index.html` e `styles.css`. Use o pacote completo.

- Editar/excluir compras: senha inicial **4317**.
- Login, exclusão de lote e restauração: continuam usando a senha de acesso atual.
- Para personalizar o PIN de compras, use `PURCHASE_ACTION_PASSWORD` no Coolify. Sem essa variável, o padrão é 4317.
- Os botões estão na lista, no celular e na ficha da OC. Editar uma compra futura para destinar ao estoque também pede a autorização, pois muda o tipo da OC.
- Preserve o mesmo domínio, aplicativo e volume. Exporte a base antes do redeploy.
