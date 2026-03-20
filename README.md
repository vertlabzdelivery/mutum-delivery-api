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

## Rotas que passaram a usar cache
Estas são as que mais valem a pena porque são lidas o tempo todo e mudam pouco:
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

## Rotas que **não** devem usar cache agora
- login, refresh token e `/auth/me`
- criação de pedidos e cotação
- `/orders/my`, `/orders/:id` e listas internas do restaurante
- endereços do usuário autenticado

## Variáveis de ambiente
Use a `.env.example` como base.

Exemplo com Redis:

```env
CACHE_ENABLED=true
REDIS_URL="redis://default:SUA_SENHA@SEU_HOST:PORTA"
CACHE_TTL_RESTAURANTS=60
CACHE_TTL_RESTAURANT_DETAIL=90
CACHE_TTL_MENU=60
CACHE_TTL_MENU_ITEM=120
CACHE_TTL_DELIVERY_ZONES=300
CACHE_TTL_LOCATIONS=86400
```

## Sua configuração do Redis
No Vercel, adicione a variável `REDIS_URL` com a URL do Redis Cloud que você já gerou. Evite salvar a senha real no repositório.

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
4. Opcionalmente adicione os TTLs de cache.
5. Faça um novo deploy.
6. Teste `https://SEU-DOMINIO/health`.

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

## Como o cache é invalidado
Quando você altera restaurante, cardápio, horários ou zonas de entrega, a API apaga as chaves relacionadas automaticamente. Então não precisa limpar o Redis manualmente a cada edição.

## Produção
```bash
npm run build
npm run start:prod
```
