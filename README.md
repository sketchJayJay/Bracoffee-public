# BRACOFFEE - Gestão de Café

MVP web responsivo e instalável (PWA), criado para um fluxo objetivo de balcão.

## O que já funciona

- Dashboard com compras, estoque e contas a pagar.
- Balcão: uma única entrada gera Ordem de Compra (OC), contrato, lote de estoque e financeiro.
- Numeração automática de OC por ano, com prefixo configurável.
- Provas de café: nome, sacas, bebida, cata, umidade, observação, status e conversão direta em compra.
- Compras: busca, filtros, detalhes, edição, exclusão, baixa de pagamento e impressão/Salvar como PDF do contrato.
- Estoque por lote e bebida, ligado à OC de origem.
- Saída/venda parcial de lote com histórico e prevenção de saldo negativo.
- Financeiro de contas a pagar com baixa/reabertura.
- Cadastro de produtores/vendedores com preenchimento automático no balcão.
- Backup completo em JSON e restauração do backup.
- Layout responsivo para computador e celular.
- PWA para instalar no celular.

## Importante sobre os dados

Esta versão salva os dados no navegador (localStorage). Ela é ótima para protótipo, validação com o cliente e uso local em um único dispositivo/perfil de navegador.

Para produção multiusuário, acesso em vários aparelhos, login, permissões e backup centralizado, o próximo passo é ligar esta interface a uma API e banco de dados (ex.: PostgreSQL).

## Abrir localmente

Use um servidor HTTP simples, por exemplo:

```bash
python3 -m http.server 8080
```

Depois abra `http://localhost:8080`.

## Deploy no Coolify

O projeto já inclui `Dockerfile` e `nginx.conf`. Crie um serviço a partir do repositório/arquivos e deixe o Coolify fazer o build do Dockerfile.

## Contrato

Abra uma compra e clique em **Imprimir contrato**. No navegador, escolha **Salvar como PDF** para gerar o arquivo.

## Identidade

A logo usada no sistema foi extraída do manual visual BRACOFFEE fornecido para o projeto.
