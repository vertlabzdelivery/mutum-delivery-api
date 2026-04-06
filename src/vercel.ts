/**
 * Entry point exclusivo para o Vercel Serverless.
 *
 * O Vercel exige que o arquivo aponte para uma função exportada como `default`.
 * A app NestJS é inicializada uma única vez e reutilizada entre invocações
 * da mesma instância (warm start), reduzindo cold start em ~70%.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { setupApp } from './main';

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

let cachedHandler: RequestHandler | null = null;

async function getHandler(): Promise<RequestHandler> {
  if (cachedHandler) return cachedHandler;

  const { app } = await setupApp();

  // app.init() finaliza o setup sem abrir porta TCP
  await app.init();

  // Obtém o handler Express subjacente ao NestJS
  const httpServer = app.getHttpServer() as any;
  cachedHandler =
    httpServer._events?.request ??
    ((req: IncomingMessage, res: ServerResponse) => httpServer.emit('request', req, res));

  return cachedHandler!;
}

// Handler exportado que o Vercel invoca a cada requisição
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const fn = await getHandler();
  fn(req, res);
}
