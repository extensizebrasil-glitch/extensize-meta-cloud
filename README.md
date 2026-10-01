# Extensize Meta Cloud

Backend público da integração oficial com a API do Instagram, destinado à Vercel.

## Endpoints

- `/api/health`: saúde do serviço.
- `/api/meta/config`: diagnóstico sem expor segredos.
- `/api/meta/oauth/start`: inicia a autorização do Instagram.
- `/api/meta/oauth/callback`: troca o código, criptografa e armazena o token.
- `/api/meta/webhook`: validação e recebimento futuro de eventos.

## Segurança

Nunca grave segredos no repositório. Cadastre todas as variáveis da `.env.example` como Secrets na Vercel. O token do Instagram é criptografado com AES-256-GCM antes de ser armazenado em um Vercel Blob privado (`TOKEN_BLOB_READ_WRITE_TOKEN`). Os vídeos usam um store público separado (`VIDEO_BLOB_READ_WRITE_TOKEN`) para que a Meta possa baixá-los diretamente; eles devem ser removidos após a publicação.

Depois do primeiro deploy, defina `PUBLIC_BASE_URL` com o domínio de produção e cadastre `${PUBLIC_BASE_URL}/api/meta/oauth/callback` como URI de redirecionamento OAuth na Meta.
