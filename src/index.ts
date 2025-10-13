import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Importar middleware de autenticación
import { authenticateToken, requireRole } from './middleware/auth';

// Importar rutas
import authRoutes from './routes/auth';
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
    timezone: 'America/Cancun'
  });
});

// ==========================================
// RUTAS PÚBLICAS (sin autenticación)
// ==========================================
app.use('/api/auth', authRoutes);

// ==========================================
// RUTAS PROTEGIDAS (requieren autenticación)
// ==========================================

// Usuarios - Solo admin puede gestionar usuarios
app.use('/api/users', authenticateToken, requireRole('admin'), usersRoutes);

// Productos - Todos los autenticados pueden ver, solo admin puede crear/editar
app.use('/api/products', authenticateToken, productsRoutes);

// Turnos - Todos los autenticados pueden gestionar turnos
app.use('/api/shifts', authenticateToken, shiftsRoutes);

// Transacciones - Todos los autenticados pueden crear/ver transacciones
app.use('/api/transactions', authenticateToken, transactionsRoutes);

// Reportes - Solo admin y supervisor pueden ver reportes detallados
// TODO: Crear archivo de reportes cuando lo necesites

// Servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`🌴 Zona horaria: America/Cancun`);
  console.log(`🔐 Autenticación JWT habilitada`);
});