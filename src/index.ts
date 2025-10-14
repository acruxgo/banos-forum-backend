import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Importar middlewares
import { authenticateToken, requireRole } from './middleware/auth';
import { loadBusinessContext } from './middleware/business';

// Importar rutas
import authRoutes from './routes/auth';
import businessesRoutes from './routes/businesses.routes';
import usersRoutes from './routes/users.routes';
import productsRoutes from './routes/products.routes';
import shiftsRoutes from './routes/shifts.routes';
import transactionsRoutes from './routes/transactions.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares globales
app.use(cors());
app.use(express.json());

// Health check (público)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Baños Forum API funcionando',
    timezone: 'America/Cancun',
    multitenant: 'enabled'
  });
});

// ==========================================
// RUTAS PÚBLICAS (sin autenticación)
// ==========================================
app.use('/api/auth', authRoutes);

// ==========================================
// RUTAS PROTEGIDAS (requieren autenticación + business context)
// ==========================================

// Empresas - Solo super_admin
app.use('/api/businesses', authenticateToken, loadBusinessContext, requireRole('super_admin'), businessesRoutes);

// Usuarios - Admin y super_admin
app.use('/api/users', authenticateToken, loadBusinessContext, requireRole('super_admin', 'admin'), usersRoutes);

// Productos - Todos los autenticados pueden ver (cajeros necesitan ver productos para vender)
app.use('/api/products', authenticateToken, loadBusinessContext, productsRoutes);

// Turnos - Todos los autenticados
app.use('/api/shifts', authenticateToken, loadBusinessContext, shiftsRoutes);

// Transacciones - Todos los autenticados
app.use('/api/transactions', authenticateToken, loadBusinessContext, transactionsRoutes);

// Servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`🌴 Zona horaria: America/Cancun`);
  console.log(`🔐 Autenticación JWT habilitada`);
  console.log(`🏢 Multi-tenant habilitado`);
});