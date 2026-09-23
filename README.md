# BRACOFFEE v1.3

Sistema de gestão de café com acesso protegido por login no servidor.

## Acesso inicial
- Usuário: `admin`
- Senha: `Bracoffee@2026`

## Coolify
Use o Build Pack `Dockerfile`, Base Directory `/` e Port `80`.

Variáveis de ambiente recomendadas no Coolify:
- `APP_USER` = usuário desejado
- `APP_PASSWORD` = senha desejada
- `SESSION_SECRET` = uma chave longa e aleatória
- `SESSION_TTL_SECONDS` = `43200` (12 horas, opcional)

O login é validado no servidor. Sem uma sessão válida, o `index.html`, `app.js`, `styles.css` e demais arquivos do aplicativo não são entregues.

## Atualização
Substitua os arquivos do repositório pelos desta pasta e faça Redeploy no Coolify.
Se o navegador já abriu uma versão antiga do sistema, faça um recarregamento forçado (Ctrl+F5) uma vez após o deploy.
