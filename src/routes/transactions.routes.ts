import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

// GET /api/transactions - Obtener todas las transacciones
router.get('/', async (req: Request, res: Response) => {
  try {
    let query = supabase
      .from('transactions')
      .select(`
        *,
        products (
          id,
          name,
          type
        ),
        shifts (
          id,
          users (
            id,
            name,
            role
          )
        )
      `);

    // Filtrar por empresa si no es super admin
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener transacciones',
      error: error.message
    });
  }
});

// GET /api/transactions/shift/:shift_id - Obtener transacciones de un turno
router.get('/shift/:shift_id', async (req: Request, res: Response) => {
  try {
    const { shift_id } = req.params;

    let query = supabase
      .from('transactions')
      .select(`
        *,
        products (
          id,
          name,
          type
        )
      `)
      .eq('shift_id', shift_id);

    // Filtrar por empresa si no es super admin
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    // Calcular totales
    const total = data?.reduce((sum, t) => sum + Number(t.total), 0) || 0;
    const count = data?.length || 0;

    res.json({
      success: true,
      data: {
        transactions: data,
        summary: {
          total_sales: total,
          transaction_count: count
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener transacciones del turno',
      error: error.message
    });
  }
});

// POST /api/transactions - Crear nueva transacción (venta)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { 
      shift_id, 
      product_id, 
      quantity, 
      unit_price, 
      payment_method,
      created_by 
    } = req.body;

    // Verificar business_id
    const businessId = req.businessId;
    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: 'No se pudo determinar la empresa'
      });
    }

    // Validar que el turno esté abierto Y pertenezca a la empresa
    let shiftQuery = supabase
      .from('shifts')
      .select('status, business_id')
      .eq('id', shift_id);

    if (!req.isSuperAdmin) {
      shiftQuery = shiftQuery.eq('business_id', businessId);
    }

    const { data: shift } = await shiftQuery.single();

    if (!shift || shift.status !== 'open') {
      return res.status(400).json({
        success: false,
        message: 'El turno no está activo'
      });
    }

    const total = quantity * unit_price;

    const { data, error } = await supabase
      .from('transactions')
      .insert([{
        shift_id,
        product_id,
        quantity,
        unit_price,
        total,
        payment_method,
        status: 'completed',
        created_by,
        business_id: businessId
      }])
      .select(`
        *,
        products (
          id,
          name,
          type
        )
      `)
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Venta registrada exitosamente',
      data: data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al registrar venta',
      error: error.message
    });
  }
});

// GET /api/transactions/stats/today - Estadísticas del día
router.get('/stats/today', async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let query = supabase
      .from('transactions')
      .select('total, payment_method, status')
      .gte('created_at', today.toISOString())
      .eq('status', 'completed');

    // Filtrar por empresa si no es super admin
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    const { data, error } = await query;

    if (error) throw error;

    const total = data?.reduce((sum, t) => sum + Number(t.total), 0) || 0;
    const count = data?.length || 0;

    // Agrupar por método de pago
    const byPaymentMethod = data?.reduce((acc: any, t) => {
      const method = t.payment_method;
      if (!acc[method]) {
        acc[method] = { count: 0, total: 0 };
      }
      acc[method].count++;
      acc[method].total += Number(t.total);
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        total_sales: total,
        transaction_count: count,
        by_payment_method: byPaymentMethod
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas',
      error: error.message
    });
  }
});

export default router;