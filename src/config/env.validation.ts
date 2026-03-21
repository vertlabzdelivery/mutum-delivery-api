export function validateEnv(config: Record<string, unknown>) {
  const requiredVars = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
  for (const key of requiredVars) {
    if (!config[key]) throw new Error(`Variável de ambiente obrigatória ausente: ${key}`);
  }
  return config;
}
