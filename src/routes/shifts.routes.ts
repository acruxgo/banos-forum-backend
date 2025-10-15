import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

// GET /api/shifts - Obtener todos los turnos
router.get('/', async (req: Request, res: Response) => {
  try {
    let query = supabase
      .from('shifts')
      .select(`
        *,
        users (
          id,
          name,
          email,
          role
        )
      `);

    // Filtrar por empresa si no es super admin
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    const { data, error } = await query.order('start_time', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener turnos',
      error: error.message
    });
  }
});

// GET /api/shifts/active - Obtener turnos activos (abiertos)
router.get('/active', async (req: Request, res: Response) => {
  try {
    let query = supabase
      .from('shifts')
      .select(`
        *,
        users (
          id,
          name,
          email,
          role
        )
      `)
      .eq('status', 'open');

    // Filtrar por empresa si no es super admin
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    const { data, error } = await query.order('start_time', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener turnos activos',
      error: error.message
    });
  }
});

// POST /api/shifts/start - Iniciar un nuevo turno CON ARQUEO
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { user_id, initial_cash = 0 } = req.body;

    // Validar initial_cash
    if (initial_cash < 0) {
      return res.status(400).json({
        success: false,
        message: 'El efectivo inicial no puede ser negativo'
      });
    }

    // Verificar business_id
    const businessId = req.businessId;
    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: 'No se pudo determinar la empresa'
      });
    }

    // Verificar si el usuario ya tiene un turno abierto EN ESTA EMPRESA
    const { data: existingShift } = await supabase
      .from('shifts')
      .select('*')
      .eq('user_id', user_id)
      .eq('business_id', businessId)
      .eq('status', 'open')
      .single();

    if (existingShift) {
      return res.status(400).json({
        success: false,
        message: 'El usuario ya tiene un turno abierto'
      });
    }

    // Crear nuevo turno
    const { data, error } = await supabase
      .from('shifts')
      .insert([{ 
        user_id, 
        initial_cash: parseFloat(initial_cash), 
        business_id: businessId,
        status: 'open' 
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Turno iniciado exitosamente',
      data: data
    });
  } catch (error: any) {
    console.error('Error al iniciar turno:', error);
    res.status(500).json({
      success: false,
      message: 'Error al iniciar turno',
      error: error.message
    });
  }
});

// PUT /api/shifts/:id/close - Cerrar un turno CON ARQUEO
router.put('/:id/close', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { final_cash } = req.body;

    // Validar final_cash
    if (final_cash === undefined || final_cash === null) {
      return res.status(400).json({
        success: false,
        message: 'El efectivo final es requerido'
      });
    }

    if (final_cash < 0) {
      return res.status(400).json({
        success: false,
        message: 'El efectivo final no puede ser negativo'
      });
    }

    // Verificar que el turno pertenezca a la empresa
    let query = supabase
      .from('shifts')
      .select('*, initial_cash')
      .eq('id', id)
      .eq('status', 'open');

    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    const { data: shift, error: fetchError } = await query.single();

    if (fetchError || !shift) {
      return res.status(404).json({
        success: false,
        message: 'Turno no encontrado o ya está cerrado'
      });
    }

    // Calcular ventas en efectivo del turno
    const { data: cashTransactions } = await supabase
      .from('transactions')
      .select('total')
      .eq('shift_id', id)
      .eq('payment_method', 'cash')
      .eq('status', 'completed');

    const cashSales = cashTransactions?.reduce((sum, t) => sum + parseFloat(t.total), 0) || 0;

    // Calcular efectivo esperado: inicial + ventas en efectivo
    const expectedCash = parseFloat(shift.initial_cash) + cashSales;

    // Calcular diferencia: final - esperado
    const cashDifference = parseFloat(final_cash) - expectedCash;

    // Cerrar turno con arqueo
    const { data, error } = await supabase
      .from('shifts')
      .update({ 
        status: 'closed', 
        end_time: new Date().toISOString(),
        final_cash: parseFloat(final_cash),
        cash_difference: cashDifference
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Turno cerrado exitosamente',
      data: {
        ...data,
        arqueo: {
          initial_cash: parseFloat(shift.initial_cash),
          cash_sales: cashSales,
          expected_cash: expectedCash,
          final_cash: parseFloat(final_cash),
          difference: cashDifference,
          status: cashDifference === 0 ? 'exacto' : cashDifference > 0 ? 'sobrante' : 'faltante'
        }
      }
    });
  } catch (error: any) {
    console.error('Error al cerrar turno:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cerrar turno',
      error: error.message
    });
  }
});

export default router;