# BRACOFFEE v1.4

Sistema de gestão de café com acesso protegido por login no servidor.

## Acesso inicial
- Usuário: `admin`
- Senha: `Bracoffee@2026`

## Mudanças da v1.4
- Compra e estoque agora são operações separadas.
- Finalizar uma compra cria OC/contrato e financeiro, mas não lança o café no estoque.
- Compras podem ser classificadas como `Para estoque`, `Venda direta` ou `Compra futura`.
- Estoque possui `Entrada por OC`, inclusive com recebimento parcial.
- Cadastro do vendedor ganhou Inscrição Estadual e endereço.
- Negociação ganhou NY, USD/câmbio e diferencial automático.
- Fórmula do diferencial: `(Preço por saca / USD / 132,277357) * 100 - NY`.
- Exemplo conferido: R$ 2.000/saca, NY 277,95 e USD 5,2035 = diferencial +12,6.
- Qualidade separada dentro da negociação: bebida, catação, umidade, classificação e observação.
- Condições comerciais: à vista, a prazo e a fixar.
- Logística: retirar ou posto, com local/armazém.
- Contrato atualizado com os novos campos.

## Coolify
Use o Build Pack `Dockerfile`, Base Directory `/` e Port `80`.

Variáveis de ambiente recomendadas no Coolify:
- `APP_USER` = usuário desejado
- `APP_PASSWORD` = senha desejada
- `SESSION_SECRET` = uma chave longa e aleatória
- `SESSION_TTL_SECONDS` = `43200` (12 horas, opcional)

O login é validado no servidor. Sem uma sessão válida, o aplicativo não é entregue.

## Atualização
Substitua os arquivos do repositório pelos desta pasta e faça Redeploy no Coolify.
Os dados atuais ficam no armazenamento local do navegador. Compras criadas em versões anteriores podem manter lotes já gerados automaticamente.
