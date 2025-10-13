export const authConfig = {
  jwtSecret: process.env.JWT_SECRET || 'tu-super-secreto-cambiar-en-produccion-2024',
  jwtExpiresIn: '24h', // Token expira en 24 horas
  bcryptSaltRounds: 10
};