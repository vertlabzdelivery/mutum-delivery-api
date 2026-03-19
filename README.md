# Mutum Delivery API

API NestJS + Prisma para um app de delivery com foco em:
- autenticação com roles
- endereços do cliente
- restaurantes por área atendida
- cardápio avançado com categorias, grupos de escolha e adicionais
- pedidos com snapshot, troco e histórico de status

## Principais melhorias desta versão

### Catálogo avançado
- categorias reais por restaurante (`MenuCategory`)
- itens com descrição, imagem, destaque, ordem de exibição e promo
- grupos de escolha por item (`MenuItemOption`)
- tipos de grupo para tamanho, frutas, toppings, complementos etc.
- regras de mínimo/máximo por grupo
- escolhas ativas/inativas e ordenação visual
- observações por item

### Pedidos mais sólidos
- snapshot do item pedido (nome, descrição, imagem, preço base e final)
- resumo antes de criar o pedido (`POST /orders/quote`)
- troco para pagamento em dinheiro (`cashChangeFor`)
- observações do pedido
- histórico de mudança de status (`OrderStatusHistory`)
- endereço salvo no próprio pedido

## Instalação

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run build
npm run start:dev
```

## Variáveis de ambiente

Veja `.env.example`.

## Endpoints principais

### Auth
- `POST /auth/register`
- `POST /auth/register-restaurant`
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/me`

### Endereços
- `GET /addresses/my`
- `GET /addresses/my/default`
- `POST /addresses`
- `PATCH /addresses/:id`
- `PATCH /addresses/:id/default`
- `DELETE /addresses/:id`

### Restaurantes
- `GET /restaurants/active`
- `GET /restaurants/available/by-address/:addressId`
- `GET /restaurants/:id`
- `PATCH /restaurants/:id`

### Cardápio
- `GET /menu/restaurant/:restaurantId/catalog`
- `GET /menu/restaurant/:restaurantId/categories`
- `POST /menu/categories`
- `PATCH /menu/categories/:id`
- `PATCH /menu/categories/:id/status`
- `DELETE /menu/categories/:id`
- `POST /menu`
- `PATCH /menu/:id`
- `PATCH /menu/:id/status`
- `DELETE /menu/:id`

### Pedidos
- `POST /orders/quote`
- `POST /orders`
- `GET /orders/my`
- `GET /orders/:id`
- `GET /orders/restaurant/:restaurantId`
- `PATCH /orders/:id/status`

## Exemplo de item com grupos avançados

```json
{
  "restaurantId": "uuid-restaurante",
  "categoryId": "uuid-categoria",
  "name": "Monte seu açaí 300ml",
  "description": "Base de açaí com escolha de frutas, complementos e coberturas",
  "price": 10,
  "imageUrl": "https://...",
  "isFeatured": true,
  "promotionalText": "Mais pedido",
  "options": [
    {
      "name": "Tamanho",
      "optionType": "SIZE",
      "required": true,
      "minSelect": 1,
      "maxSelect": 1,
      "choices": [
        { "name": "300 ml", "price": 0 },
        { "name": "500 ml", "price": 4 }
      ]
    },
    {
      "name": "Frutas",
      "optionType": "FRUIT",
      "required": true,
      "minSelect": 2,
      "maxSelect": 4,
      "choices": [
        { "name": "Banana" },
        { "name": "Morango" },
        { "name": "Kiwi", "price": 2 }
      ]
    },
    {
      "name": "Coberturas",
      "optionType": "SYRUP",
      "minSelect": 0,
      "maxSelect": 2,
      "choices": [
        { "name": "Leite condensado", "price": 1.5 },
        { "name": "Calda de chocolate", "price": 1 }
      ]
    }
  ]
}
```

## Exemplo de prévia e criação do pedido

```json
{
  "restaurantId": "uuid-restaurante",
  "userAddressId": "uuid-endereco",
  "paymentMethod": "CASH",
  "cashChangeFor": 50,
  "notes": "Sem talher",
  "deliveryName": "Beatriz",
  "deliveryPhone": "27999999999",
  "items": [
    {
      "menuItemId": "uuid-item",
      "quantity": 1,
      "notes": "Caprichar no morango",
      "selectedChoices": [
        { "optionId": "uuid-grupo-tamanho", "choiceId": "uuid-300ml" },
        { "optionId": "uuid-grupo-frutas", "choiceId": "uuid-banana" },
        { "optionId": "uuid-grupo-frutas", "choiceId": "uuid-morango" },
        { "optionId": "uuid-grupo-cobertura", "choiceId": "uuid-leite-condensado" }
      ]
    }
  ]
}
```
