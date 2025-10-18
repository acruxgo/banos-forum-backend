import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

// GET /api/reports/daily - Reporte diario (supervisor y admin)
router.get('/daily', async (req: Request, res: Response) => {
  try {
    const { date } = req.query; // Formato: YYYY-MM-DD
    const businessId = req.businessId;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: 'Business ID requerido'
      });
    }

    // Si no se proporciona fecha, usar hoy
    const targetDate = date ? new Date(date as string) : new Date();
    const dateString = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD

    console.log('📅 Filtrando transacciones del día:', dateString);

    // Obtener TODAS las transacciones y filtrar manualmente
    const { data: allTransactions, error } = await supabase
      .from('transactions')
      .select(`
        *,
        products (name),
        users (name)
      `)
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Filtrar manualmente por fecha en JavaScript (ignorando zona horaria)
    const transactions = allTransactions?.filter(t => {
      const transDate = new Date(t.created_at).toISOString().split('T')[0];
      return transDate === dateString;
    }) || [];

    console.log(`✅ Transacciones encontradas: ${transactions.length}`);

    // Calcular resumen CON REDONDEO CORRECTO
    const totalSales = Math.round(
      (transactions.reduce((sum, t) => sum + Number(t.total), 0)) * 100
    ) / 100;
    const totalTransactions = transactions.length;

    // Agrupar por método de pago
    const byPaymentMethod = transactions.reduce((acc: any, t) => {
      if (!acc[t.payment_method]) {
        acc[t.payment_method] = { count: 0, total: 0 };
      }
      acc[t.payment_method].count++;
      acc[t.payment_method].total = Math.round((acc[t.payment_method].total + Number(t.total)) * 100) / 100;
      return acc;
    }, {});

    // Agrupar por empleado
    const byEmployee = transactions.reduce((acc: any, t) => {
      const employeeName = t.users?.name || 'Desconocido';
      if (!acc[employeeName]) {
        acc[employeeName] = { count: 0, total: 0 };
      }
      acc[employeeName].count++;
      acc[employeeName].total = Math.round((acc[employeeName].total + Number(t.total)) * 100) / 100;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        date: dateString,
        summary: {
          totalSales,
          totalTransactions,
          averageTicket: totalTransactions > 0 ? Math.round((totalSales / totalTransactions) * 100) / 100 : 0
        },
        byPaymentMethod,
        byEmployee,
        transactions
      }
    });
  } catch (error: any) {
    console.error('Error al generar reporte diario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al generar reporte diario',
      error: error.message
    });
  }
});

// POST /api/reports/cash-closing - Reporte de quiebre de caja
router.post('/cash-closing', async (req: Request, res: Response) => {
  try {
    const { shift_id } = req.body;
    const businessId = req.businessId;

    if (!shift_id) {
      return res.status(400).json({
        success: false,
        message: 'ID de turno requerido'
      });
    }

    // Obtener información del turno
    const { data: shift, error: shiftError } = await supabase
      .from('shifts')
      .select(`
        *,
        users (name, email)
      `)
      .eq('id', shift_id)
      .eq('business_id', businessId)
      .single();

    if (shiftError || !shift) {
      return res.status(404).json({
        success: false,
        message: 'Turno no encontrado'
      });
    }

    // Obtener transacciones del turno
    const { data: transactions, error: transError } = await supabase
      .from('transactions')
      .select(`
        *,
        products (name)
      `)
      .eq('shift_id', shift_id)
      .eq('status', 'completed')
      .order('created_at', { ascending: true });

    if (transError) throw transError;

    // Calcular totales CON REDONDEO CORRECTO
    const totalSales = Math.round(
      (transactions?.reduce((sum, t) => sum + Number(t.total), 0) || 0) * 100
    ) / 100;
    
    const byPaymentMethod = transactions?.reduce((acc: any, t) => {
      if (!acc[t.payment_method]) {
        acc[t.payment_method] = { count: 0, total: 0 };
      }
      acc[t.payment_method].count++;
      acc[t.payment_method].total = Math.round((acc[t.payment_method].total + Number(t.total)) * 100) / 100;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        shift: {
          id: shift.id,
          employee: shift.users?.name || 'Desconocido',
          start_time: shift.start_time,
          end_time: shift.end_time,
          closing_time: new Date().toISOString()
        },
        summary: {
          totalSales,
          totalTransactions: transactions?.length || 0,
          byPaymentMethod
        },
        transactions
      }
    });
  } catch (error: any) {
    console.error('Error al generar reporte de cierre:', error);
    res.status(500).json({
      success: false,
      message: 'Error al generar reporte de cierre',
      error: error.message
    });
  }
});

export default router;