# Atualizar para BRACOFFEE Office 3.1

## 1. Guardar os dados atuais

No sistema atual, abra **Configurações → Exportar** e guarde o backup JSON. Faça isso no navegador em que estão os registros do cliente.

## 2. Atualizar o projeto

Substitua os arquivos pelo conteúdo deste ZIP, incluindo o novo `commercial-core.js` e as atualizações de `app.js`, `sync.js`, `server.js`, `data-store.js`, `index.html` e `styles.css`. Não substitua nem apague o diretório de dados. Mantenha o Dockerfile na raiz e continue usando o mesmo domínio e as variáveis de acesso configuradas no Coolify.

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
