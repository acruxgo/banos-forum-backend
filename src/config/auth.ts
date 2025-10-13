export const authConfig = {
  jwtSecret: (process.env.JWT_SECRET || 'tu-super-secreto-cambiar-en-produccion-2024') as string,
  jwtExpiresIn: '24h' as string,
  bcryptSaltRounds: 10
};