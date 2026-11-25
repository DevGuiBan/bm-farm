# Trilho

Entrada de clientes na Meta com autorização do titular, e produtividade da equipe.
Next.js 16, Supabase (Postgres, Auth, Storage) e Vercel.

## Como funciona

| Etapa | O que libera o avanço |
|---|---|
| Autorização | Titular assina por link e um administrador, que não seja o responsável, aprova |
| Documentos | Contrato social, comprovante de endereço e documento do signatário, anexados pela equipe e aprovados por outra pessoa |
| Site | Aprovação do cliente registrada, com print da conversa anexado |
| Meta | Checklist: portfólio do cliente, agência como parceira, 2FA, domínio verificado |
| Verificação | Checklist: dados conferidos, envio pelo cliente, resultado registrado |

As regras ficam em funções SQL (`supabase/migrations`). A equipe lê por RLS e só escreve por essas funções:

- **Operador** vê e move apenas os próprios clientes e vê só os próprios números.
- **Administrador** vê tudo, aprova autorizações, gerencia equipe, prazos e metas.
- **Titular** só assina (ou revoga) a autorização, por link pessoal mais código enviado ao e-mail. Dados e documentos chegam por fora e a equipe anexa.
- Quem anexa um documento não pode aprová-lo.
- Documentos originais, histórico e auditoria não podem ser alterados nem apagados.
- Signatário fora do quadro societário exige procuração aprovada por administrador.
- O site só é gerado para domínio próprio, com o telefone declarado pelo titular.

## Métricas

Por operador e período: etapas avançadas, clientes concluídos, meta mensal, % no prazo, tempo médio, devoluções
(contam para quem avançou a etapa), em andamento, em atraso, dias ativos e última ação. Há exportação em CSV.

## Colocar no ar

### 1. Supabase

1. Crie um projeto na região São Paulo.
2. Rode as migrations: `npx supabase login`, `npx supabase link --project-ref SEU_REF`, `npx supabase db push`.
   Outra opção é colar os três arquivos, em ordem, no SQL Editor.
3. Authentication > Sign In / Providers: **desative** "Allow new users to sign up".
4. Authentication > Emails: configure um SMTP próprio. O padrão tem limite muito baixo e não serve para clientes.
5. No modelo de e-mail **Magic Link**, mostre o código em vez do link:
   `<p>Seu código de acesso: <strong>{{ .Token }}</strong></p>`

### 2. Ambiente

Copie `.env.example` para `.env.local` e preencha. `SUPABASE_SECRET_KEY` e `PORTAL_SECRET` são só do servidor.

### 3. Primeiro administrador

```bash
npm install
npm run criar-admin -- "Seu Nome" voce@empresa.com
npm run dev
```

Abra o link impresso para definir a senha. Os demais entram por **Equipe > Convidar pessoa**.

### 4. Vercel

1. Importe o repositório (detecta Next.js sozinho).
2. Cadastre as mesmas variáveis, com `NEXT_PUBLIC_SITE_URL` no endereço final.
3. Publique.

## Testar na sua máquina

Não precisa de Docker nem de conta no Supabase:

```bash
npm install
npm run local         # app em http://localhost:3000, com usuários e dados fictícios
npm run local:limpar  # apaga os dados locais (rode com o app parado, ou quando as migrations mudarem)
npm test              # regras SQL e RLS, mais testes unitários
npm run e2e           # percorre o sistema no navegador (usa o Chrome ou Edge instalado)
npm run verificar     # tudo: tipos, testes e navegador. Rode antes de publicar
```

`npm run local` mostra os logins no terminal e guarda os dados em `.local/`. O banco é um Postgres real com as mesmas
migrations, funções e RLS. Login, e-mail e arquivos são emulados (`dev/emulador.mjs`), então antes de produção faça
também um teste com um projeto Supabase de homologação.

O texto da autorização fica em `src/lib/terms.ts`. Ao alterar, mude `TERMS_VERSION` e peça revisão jurídica.
