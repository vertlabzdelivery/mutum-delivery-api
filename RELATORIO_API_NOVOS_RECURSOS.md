# Alterações implementadas

## 1. Desativação forçada de restaurante pelo admin
- Admin pode usar o endpoint já existente `PATCH /restaurants/:id/status`.
- Quando um admin desativa, o restaurante recebe:
  - `isActive = false`
  - `adminDisabledAt`
  - `adminDisabledByUserId`
- Dono do restaurante não consegue reativar e recebe erro:
  - `Administrador desativou este restaurante.`
- Admin pode reativar usando o mesmo endpoint com `isActive = true`.

## 2. Favoritar restaurante
Novos endpoints:
- `GET /restaurants/my/favorites`
- `POST /restaurants/:id/favorite`
- `DELETE /restaurants/:id/favorite`

Incluído no restaurante serializado:
- `favoritesCount`
- `isFavorite` (nas listagens autenticadas por endereço e favoritos)

## 3. Avaliações de restaurante
Novo suporte para nota de 1 a 5.

Novos endpoints:
- `GET /restaurants/:id/reviews`
- `GET /restaurants/:id/reviews/me`
- `POST /restaurants/:id/reviews`

Regras:
- avaliação de 1 a 5
- um usuário por restaurante tem uma única avaliação, atualizável via mesmo endpoint
- só pode avaliar após ter ao menos um pedido entregue no restaurante

Incluído no restaurante serializado:
- `averageRating`
- `ratingCount`

## 4. Notificação para todos os usuários quando houver cupom novo
Ao criar cupom promocional em `POST /admin/coupons`:
- continua publicando via Ably no canal público
- agora também tenta enviar push para todos os usuários móveis com `expoPushToken`

## 5. Banco / Prisma
- nova migration adicionada para:
  - bloqueio administrativo de restaurante
  - favoritos
  - avaliações
  - contadores e média no restaurante
