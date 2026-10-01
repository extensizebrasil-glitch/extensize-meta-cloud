# Extensize Meta Cloud

Backend público da integração oficial com a API do Instagram, destinado à Vercel.

## Endpoints

- `/api/health`: saúde do serviço.
- `/api/meta/config`: diagnóstico sem expor segredos.
- `/api/meta/oauth/start`: inicia a autorização do Instagram.
- `/api/meta/oauth/callback`: troca o código, criptografa e armazena o token.
- `/api/meta/webhook`: validação e recebimento futuro de eventos.

## Segurança

Nunca grave segredos no repositório. Cadastre as credenciais Meta e chaves internas da `.env.example` como Secrets na Vercel. Os Blobs usam autenticação OIDC com credenciais temporárias e rotativas, selecionados por `TOKEN_STORE_ID` e `VIDEO_STORE_ID`; não há token permanente do Blob. O token do Instagram é criptografado com AES-256-GCM antes de ser armazenado no Blob privado. Os vídeos usam o store público separado para que a Meta possa baixá-los diretamente e devem ser removidos após a publicação.

Depois do primeiro deploy, defina `PUBLIC_BASE_URL` com o domínio de produção e cadastre `${PUBLIC_BASE_URL}/api/meta/oauth/callback` como URI de redirecionamento OAuth na Meta.
