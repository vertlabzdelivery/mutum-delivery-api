# Mutum Delivery API

API principal do ecossistema Mutum Delivery, construída com NestJS + Prisma.

## Recursos
- autenticação com access token e refresh token
- usuários cliente, restaurante e admin
- restaurantes, horários, endereços e zonas de entrega
- cardápio com categorias, itens e grupos de opções
- pedidos e fluxo de status
- faturamento e fechamento por período
- página inicial amigável em `/`
- healthcheck em `/health`
- cache Redis opcional para rotas públicas de leitura
- upload de imagens com Vercel Blob para logo do restaurante e foto de produto

## Rotas de upload
As imagens agora podem ser enviadas pelo painel do restaurante e a API devolve a URL pública pronta para salvar:
- `POST /uploads/restaurant-logo`
- `POST /uploads/menu-item-image`

As duas aceitam `multipart/form-data` com:
- `restaurantId`
- `file`

As rotas exigem autenticação e só aceitam contas `ADMIN` ou `RESTAURANT` com acesso ao restaurante informado.

## Cache Redis
Estas são as rotas públicas de leitura que mais valem cache:
- `GET /restaurants`
- `GET /restaurants/active`
- `GET /restaurants/:id`
- `GET /menu/restaurant/:restaurantId`
- `GET /menu/restaurant/:restaurantId/catalog`
- `GET /menu/restaurant/:restaurantId/categories`
- `GET /menu/:id`
- `GET /restaurant-delivery-zones/public/restaurant/:restaurantId`
- `GET /locations/states`
- `GET /locations/states/:stateId`
- `GET /locations/states/:stateId/cities`
- `GET /locations/cities/:cityId`
- `GET /locations/cities/:cityId/neighborhoods`
- `GET /locations/neighborhoods/:id`

## Rotas que não devem usar cache agora
- login, refresh token e `/auth/me`
- criação de pedidos e cotação
- `/orders/my`, `/orders/:id` e listas internas do restaurante
- endereços do usuário autenticado

## Variáveis de ambiente
Use a `.env.example` como base.

Exemplo com Redis + Blob:

```env
CACHE_ENABLED=true
REDIS_URL="redis://default:SUA_SENHA@SEU_HOST:PORTA"
CACHE_TTL_RESTAURANTS=60
CACHE_TTL_RESTAURANT_DETAIL=90
CACHE_TTL_MENU=60
CACHE_TTL_MENU_ITEM=120
CACHE_TTL_DELIVERY_ZONES=300
CACHE_TTL_LOCATIONS=86400
BLOB_READ_WRITE_TOKEN="seu_token_do_blob"
BLOB_MAX_RESTAURANT_LOGO_BYTES=716800
BLOB_MAX_MENU_ITEM_IMAGE_BYTES=921600
```

## Como funciona o upload
- o painel comprime e redimensiona a imagem antes do envio
- a API valida tipo e tamanho final
- o arquivo é enviado ao Vercel Blob em modo público
- a resposta já volta com a URL pronta para preencher o campo `logoUrl` ou `imageUrl`

## Rodando localmente
1. Configure o banco e as variáveis de ambiente.
2. Instale dependências:
   ```bash
   npm install
   ```
3. Rode as migrations:
   ```bash
   npx prisma migrate deploy
   ```
4. Inicie:
   ```bash
   npm run start:dev
   ```

## Deploy no Vercel
1. Abra o projeto da API no Vercel.
2. Vá em **Settings > Environment Variables**.
3. Adicione `REDIS_URL` com o valor do seu Redis.
4. Confirme que `BLOB_READ_WRITE_TOKEN` está presente no projeto.
5. Opcionalmente ajuste os limites `BLOB_MAX_RESTAURANT_LOGO_BYTES` e `BLOB_MAX_MENU_ITEM_IMAGE_BYTES`.
6. Faça um novo deploy.
7. Teste `https://SEU-DOMINIO/health` e depois os uploads pelo painel.

Quando o Redis conectar corretamente, o `/health` volta com algo parecido com:

```json
{
  "ok": true,
  "service": "mutum-delivery-api",
  "timestamp": "...",
  "cache": {
    "enabled": true,
    "connected": true,
    "store": "redis"
  }
}
```

## Produção
```bash
npm run build
npm run start:prod
```
