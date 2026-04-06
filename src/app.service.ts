import { Injectable } from '@nestjs/common';
import { RedisCacheService } from './cache/cache.service';
import { PrismaService } from './prisma/prisma.service';

/** Escapa caracteres HTML para evitar XSS na status page. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

@Injectable()
export class AppService {
  constructor(
    private readonly cache: RedisCacheService,
    private readonly prisma: PrismaService,
  ) {}

  private getIntegrationStatus() {
    const redisEnabled = Boolean(process.env.REDIS_URL) && process.env.CACHE_ENABLED !== 'false';
    const blobEnabled = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
    const smsEnabled = Boolean(process.env.APIBRASIL_BEARER_TOKEN);
    const pushEnabled = process.env.EXPO_PUSH_ENABLED !== 'false';
    return { redis: redisEnabled, blob: blobEnabled, sms: smsEnabled, push: pushEnabled };
  }

  async getHello(): Promise<string> {
    const cache = await this.cache.getStatus();
    const db = await this.getDatabaseStatus();
    const integrations = this.getIntegrationStatus();

    const items = [
      { label: 'API', ok: true, detail: 'Operando normalmente' },
      {
        label: 'Banco',
        ok: db.ok,
        detail: db.ok
          ? `Conectado • ${db.latencyMs}ms`
          : `Falha • ${db.error ?? 'sem detalhe'}`,
      },
      {
        label: 'Redis / Cache',
        ok: cache.enabled && cache.connected,
        detail: cache.enabled
          ? cache.connected
            ? 'Conectado e pronto'
            : 'Configurado, mas sem conexão'
          : 'Desativado',
      },
      {
        label: 'Blob',
        ok: integrations.blob,
        detail: integrations.blob ? 'Upload de imagens habilitado' : 'Token ausente',
      },
      {
        label: 'SMS / APIBrasil',
        ok: integrations.sms,
        detail: integrations.sms ? 'Verificação por SMS disponível' : 'Bearer token ausente',
      },
      {
        label: 'Expo Push',
        ok: integrations.push,
        detail: integrations.push ? 'Envio de push habilitado' : 'Desativado por ambiente',
      },
    ];

    // SEGURANÇA CORRIGIDA: escapa o HTML de todos os campos dinâmicos
    // para evitar XSS caso algum valor venha de variável de ambiente maliciosa
    const cards = items
      .map(
        (item) => `
      <article class="item ${item.ok ? 'ok' : 'warn'}">
        <div class="dot"></div>
        <div>
          <strong>${escapeHtml(item.label)}: ${item.ok ? 'OK' : 'Pendente'}</strong>
          <p>${escapeHtml(item.detail)}</p>
        </div>
      </article>
    `,
      )
      .join('');

    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>UaiPede API</title>
  <style>
    :root { color-scheme: light; --bg:#fff8f4; --card:#fff; --text:#241d1c; --muted:#6d5d59; --red:#dd1c1a; --line:#f1d7d2; --ok:#1f8f55; --warn:#c07418; }
    * { box-sizing: border-box; } body { margin:0; min-height:100vh; padding:24px; display:grid; place-items:center; font-family:Inter,Arial,sans-serif; color:var(--text); background:radial-gradient(circle at top right, rgba(221,28,26,.10), transparent 28%), linear-gradient(180deg,#fff7f1 0%,#fffdfb 100%);}
    .card{width:min(100%,860px);background:var(--card);border:1px solid var(--line);border-radius:30px;padding:32px;box-shadow:0 24px 64px rgba(90,36,31,.12)}
    .hero{display:flex;gap:16px;align-items:center;margin-bottom:18px}.mark{width:64px;height:64px;border-radius:20px;display:grid;place-items:center;background:linear-gradient(135deg,#f33b39,var(--red));color:#fff;font-weight:900;font-size:22px}
    h1{margin:0 0 6px;font-size:2rem} p{margin:0;color:var(--muted);line-height:1.55}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:24px}
    .item{display:flex;gap:12px;border:1px solid var(--line);border-radius:18px;padding:16px;background:#fffdfa}.item strong{display:block;margin-bottom:6px}.item p{font-size:.95rem}
    .dot{width:12px;height:12px;border-radius:999px;margin-top:5px;background:var(--warn)} .item.ok .dot{background:var(--ok)}
    code{background:#fff2f1;color:var(--red);padding:2px 8px;border-radius:999px;font-family:ui-monospace,monospace;font-size:.92rem}
    .links{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}.chip{padding:10px 12px;border-radius:999px;background:#fff4f3;border:1px solid #efcfcc;color:var(--red);font-weight:700;text-decoration:none}
  </style>
</head>
<body>
  <main class="card">
    <section class="hero">
      <div class="mark">UP</div>
      <div>
        <h1>UaiPede API</h1>
        <p>Base operacional do app, web e painéis. Esta página resume rapidamente o estado da aplicação, banco e integrações.</p>
      </div>
    </section>
    <div class="links">
      <a class="chip" href="/health">/health</a>
      <span class="chip">Auth: <code>/auth/login</code></span>
      <span class="chip">Pedidos: <code>/orders</code></span>
    </div>
    <section class="grid">${cards}</section>
  </main>
</body>
</html>`;
  }

  private async getDatabaseStatus(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, latencyMs: Date.now() - start };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'erro desconhecido',
      };
    }
  }
}
