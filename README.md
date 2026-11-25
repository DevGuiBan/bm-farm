# Trilho

Criação de BMs (portfólios empresariais na Meta) e produtividade da equipe.
Next.js 16, Supabase (Postgres, Auth, Storage) e Vercel.

## Como funciona

| Etapa | O que libera o avanço |
|---|---|
| Documentos | Contrato social, comprovante de endereço e documento do signatário, anexados pela equipe e aprovados por outra pessoa |
| Site | Domínio (do cliente ou da agência) e telefone da empresa. Aprovação do cliente registrada, com print da conversa anexado |
| Meta | Checklist: portfólio sob controle do cliente, agência como parceira, 2FA, domínio verificado |
| Verificação | Checklist: dados conferidos, envio pelo cliente, verificação aprovada pela Meta |

As regras ficam em funções SQL (`supabase/migrations`). A equipe lê por RLS e só escreve por essas funções:

- **Operador** vê e move apenas as próprias BMs e vê só os próprios números.
- **Administrador** não opera BMs nem entra na produtividade: vê tudo, confere documentos, gerencia equipe e metas.
- **Titular** não acessa o sistema. Contratos ficam em outro provedor; documentos chegam por fora e a equipe anexa.
- Quem anexa um documento não pode aprová-lo.
- Documentos originais, histórico e auditoria não podem ser alterados nem apagados.
- CNPJ repetido é informado e exige confirmação, que fica na auditoria.
- Endereços gratuitos de hospedagem não valem como domínio do site.

## Métricas

Uma BM conta como criada quando o portfólio é novo e conclui todas as etapas. Portfólio que já existia é atendido, mas não conta.
Se a BM for devolvida, deixa de contar até concluir de novo. No banco, cada BM é uma linha da tabela `clients`.

Por operador e período: etapas avançadas, BMs criadas, meta mensal, % da meta, tempo médio, devoluções
(contam para quem avançou a etapa), em andamento, dias ativos e última ação. Há exportação em CSV.

## Colocar no ar

### 1. Supabase

1. Crie um projeto na região São Paulo.
2. Rode as migrations: `npx supabase login`, `npx supabase link --project-ref SEU_REF`, `npx supabase db push`.
   Outra opção é colar os arquivos, em ordem, no SQL Editor.
3. Authentication > Sign In / Providers: **desative** "Allow new users to sign up".

O sistema não envia e-mails: convites e troca de senha saem como link para a administração repassar. Não é preciso SMTP.

### 2. Ambiente

Copie `.env.example` para `.env.local` e preencha. `SUPABASE_SECRET_KEY` é só do servidor.

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
migrations, funções e RLS. Login e arquivos são emulados (`dev/emulador.mjs`), então antes de produção faça
também um teste com um projeto Supabase de homologação.
