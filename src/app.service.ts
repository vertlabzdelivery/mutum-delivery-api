import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mutum Delivery API</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #fff7f1;
      --card: #ffffff;
      --text: #241d1c;
      --muted: #6d5d59;
      --red: #dd1c1a;
      --line: #f1d7d2;
      --shadow: 0 24px 64px rgba(90, 36, 31, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      font-family: Inter, Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top right, rgba(221, 28, 26, 0.10), transparent 28%),
        linear-gradient(180deg, #fff7f1 0%, #fffdfb 100%);
    }
    .card {
      width: min(100%, 760px);
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 28px;
      padding: 32px;
      box-shadow: var(--shadow);
    }
    .brand {
      display: inline-grid;
      place-items: center;
      width: 60px;
      height: 60px;
      border-radius: 18px;
      background: linear-gradient(135deg, #f33b39, var(--red));
      color: #fff;
      font-weight: 800;
      margin-bottom: 18px;
    }
    h1 { margin: 0 0 10px; font-size: 2rem; }
    p { margin: 0; color: var(--muted); line-height: 1.55; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
      margin-top: 24px;
    }
    .item {
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 16px;
      background: #fffdfa;
    }
    .item strong {
      display: block;
      margin-bottom: 6px;
    }
    code {
      background: #fff2f1;
      color: var(--red);
      padding: 2px 8px;
      border-radius: 999px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: .92rem;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="brand">MD</div>
    <h1>Mutum Delivery API</h1>
    <p>A API está online. Esta é uma página inicial temporária para a hospedagem não ficar vazia enquanto o visual definitivo não é publicado.</p>

    <section class="grid">
      <article class="item">
        <strong>Status</strong>
        <p>Use <code>/health</code> para uma resposta rápida em JSON.</p>
      </article>
      <article class="item">
        <strong>Autenticação</strong>
        <p>Os fluxos principais começam em <code>/auth/login</code>, <code>/auth/register</code> e <code>/auth/me</code>.</p>
      </article>
      <article class="item">
        <strong>Módulos</strong>
        <p>Restaurantes, endereços, cardápio, pedidos, zonas de entrega e faturamento já estão disponíveis.</p>
      </article>
    </section>
  </main>
</body>
</html>`;
  }

  getHealth() {
    return {
      ok: true,
      service: 'mutum-delivery-api',
      timestamp: new Date().toISOString(),
    };
  }
}
