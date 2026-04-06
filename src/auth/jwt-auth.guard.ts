import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  /**
   * Override para garantir mensagens de erro claras e consistentes.
   *
   * Sem isso, quando o Passport rejeita o token (expirado, inválido ou ausente),
   * ele pode lançar um erro genérico sem estrutura de HttpException — o que
   * causava "error":"Internal Server Error" nos logs mesmo com status 401.
   */
  handleRequest<TUser = any>(
    err: any,
    user: TUser,
    info: any,
    _context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      // info é o objeto de erro do Passport (ex: JsonWebTokenError, TokenExpiredError)
      const reason = info?.name === 'TokenExpiredError'
        ? 'Token expirado. Faça login novamente.'
        : info?.name === 'JsonWebTokenError'
          ? 'Token inválido.'
          : 'Autenticação necessária.';

      throw new UnauthorizedException(reason);
    }

    return user;
  }
}
