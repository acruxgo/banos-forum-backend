import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import productsRoutes from './routes/products.routes';
import usersRoutes from './routes/users.routes';
import shiftsRoutes from './routes/shifts.routes';
import transactionsRoutes from './routes/transactions.routes';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Ruta de prueba
app.get('/', (req: Request, res: Response) => {
  res.json({ 
    message: 'API Baños Forum - Sistema POS',
    status: 'online',
    version: '1.0.0'
  });
});

// Rutas de API
app.use('/api/products', productsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/shifts', shiftsRoutes);
app.use('/api/transactions', transactionsRoutes);

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});