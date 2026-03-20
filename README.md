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

## Rodando localmente
1. Configure o banco e as variáveis de ambiente
2. Instale dependências:
   `npm install`
3. Rode as migrations:
   `npx prisma migrate deploy`
4. Inicie:
   `npm run start:dev`

## Produção
- build: `npm run build`
- start: `npm run start:prod`
