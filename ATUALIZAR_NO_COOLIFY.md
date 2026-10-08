# Atualizar para BRACOFFEE Office 2.1

## 1. Guardar os dados atuais

No sistema atual, abra **Configurações → Exportar** e guarde o backup JSON. Faça isso no navegador em que estão os registros do cliente.

## 2. Atualizar o projeto

Substitua os arquivos pelo conteúdo deste ZIP. Mantenha o Dockerfile na raiz e continue usando o mesmo domínio e as variáveis de acesso configuradas no Coolify.

## 3. Configurar o armazenamento persistente

Na configuração de armazenamento do recurso no Coolify, adicione um volume persistente com destino no contêiner:

```
/app/data
```

Use um nome fixo, por exemplo `bracoffee-dados`, e reutilize o mesmo volume nos próximos redeploys. O `DATA_DIR` do Dockerfile já aponta para `/app/data`. O volume declarado no Dockerfile não substitui a configuração de armazenamento persistente do recurso no Coolify.

Esse diretório contém a base e as versões de segurança. Use uma instância do aplicativo por base. O ZIP contém apenas o programa, sem registros de exemplo nem dados reais.

## 4. Fazer o redeploy e trazer os registros

Depois do redeploy, abra o mesmo domínio no navegador utilizado pelo cliente. Na primeira abertura, se o servidor ainda não possuir registros, o sistema traz os dados antigos desse navegador automaticamente. Aguarde **Tudo salvo** e confira as OCs.

Se o navegador antigo não estiver disponível ou o domínio tiver mudado, abra **Configurações → Importar** e selecione o backup JSON. A importação substitui os dados atuais após confirmação.

## 5. Conferir no celular

Abra o mesmo endereço, faça login e confira uma OC existente. Computador e celular agora consultam a mesma base. Confirme também que o volume continua associado ao recurso antes de futuros redeploys.

O pacote está pronto para substituir o projeto no Coolify; ele não foi publicado automaticamente.
