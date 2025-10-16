# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Proxy reverso para Labelary (balanceamento e ofuscação de origem)

Para reduzir rate limiting e evitar origem única, configure 2-3 proxies que fazem forward para `https://api.labelary.com` e use-os via a variável de ambiente `LABELARY_BASE_URLS` (separados por vírgula). O código de servidor em `src/app/actions.ts` já faz rotação entre URLs, com backoff exponencial.

### 1) Vercel Edge (no próprio app)

- Já incluído: rota Edge em `src/app/v1/printers/[...path]/route.ts` que encaminha para Labelary.
- Publique o projeto na Vercel e adicione um domínio dedicado, por exemplo `labelary-edge.quadrosdev.com` (Configurações do Projeto → Domains → Add → `labelary-edge.quadrosdev.com`).
- Crie um registro DNS CNAME: `labelary-edge.quadrosdev.com` → `cname.vercel-dns.com`.

Endpoint resultante:
- `https://labelary-edge.quadrosdev.com/v1/printers/{dpmm}dpmm/labels/{w}x{h}/{orientation}`

### 2) Cloudflare Worker

Arquivos de exemplo criados:
- `edge-proxies/cloudflare-worker/src/index.ts`
- `edge-proxies/cloudflare-worker/wrangler.toml`

Passos:
1. Instale Wrangler: `npm i -g wrangler`
2. Autentique: `wrangler login`
3. No Cloudflare, aponte um subdomínio, p. ex. `labelary-cf.quadrosdev.com`, para o Worker (Routes → Add Route: `labelary-cf.quadrosdev.com/*`).
4. Deploy: dentro de `edge-proxies/cloudflare-worker/`, execute `wrangler deploy`.

Endpoint resultante:
- `https://labelary-cf.quadrosdev.com/v1/printers/{dpmm}dpmm/labels/{w}x{h}/{orientation}`

### 3) Nginx (VM/Servidor ou Fly.io)

Arquivo de exemplo:
- `edge-proxies/nginx/labelary-proxy.conf`

Passos comuns (VM/Servidor):
1. Copie a configuração para `/etc/nginx/sites-available/labelary-proxy.conf`.
2. Crie link simbólico em `sites-enabled` e recarregue Nginx.
3. Configure DNS A/AAAA para `labelary.quadrosdev.com` apontar para o IP do servidor.
4. TLS: use Let’s Encrypt (ex.: `certbot --nginx -d labelary.quadrosdev.com`).

Opcional (Fly.io com Nginx):
- Construa uma imagem Docker com Nginx + este conf, publique e `fly launch` + `fly deploy`, depois aponte `labelary.quadrosdev.com` para o app do Fly (via A/AAAA ou CNAME conforme docs do Fly.io).

Endpoint resultante:
- `https://labelary.quadrosdev.com/v1/printers/{dpmm}dpmm/labels/{w}x{h}/{orientation}`

### Variável de ambiente: LABELARY_BASE_URLS

Defina em produção (e em dev se desejar) a variável `LABELARY_BASE_URLS` com as URLs base dos proxies, separadas por vírgula. Exemplo:

```
LABELARY_BASE_URLS=https://labelary-edge.quadrosdev.com,https://labelary-cf.quadrosdev.com,https://labelary.quadrosdev.com
```

O servidor irá construir o caminho `/v1/printers/...` automaticamente sobre cada base e rotacionar em caso de 429/5xx.

### Domínio da aplicação web

- Para a aplicação Next.js em si, use um subdomínio dedicado, por exemplo `app.quadrosdev.com`.
- Na Vercel, adicione `app.quadrosdev.com` como domínio do projeto principal e crie o CNAME correspondente em seu DNS.

Resumo de DNS sugerido em `quadrosdev.com`:
- `app.quadrosdev.com` → Vercel (CNAME `cname.vercel-dns.com`).
- `labelary-edge.quadrosdev.com` → o mesmo projeto Vercel (CNAME `cname.vercel-dns.com`).
- `labelary-cf.quadrosdev.com` → Cloudflare Worker (Route/Custom domain no painel CF).
- `labelary.quadrosdev.com` → VM/Fly.io com Nginx (A/AAAA ou CNAME conforme hospedagem).

