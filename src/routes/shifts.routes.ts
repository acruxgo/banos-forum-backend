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

// POST /api/shifts/start - Iniciar un nuevo turno
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { user_id, initial_cash = 0 } = req.body;

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
        initial_cash, 
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
    res.status(500).json({
      success: false,
      message: 'Error al iniciar turno',
      error: error.message
    });
  }
});

// PUT /api/shifts/:id/close - Cerrar un turno
router.put('/:id/close', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verificar que el turno pertenezca a la empresa
    let query = supabase
      .from('shifts')
      .select('*')
      .eq('id', id);

    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    const { data: shift, error: fetchError } = await query.single();

    if (fetchError || !shift) {
      return res.status(404).json({
        success: false,
        message: 'Turno no encontrado'
      });
    }

    const { data, error } = await supabase
      .from('shifts')
      .update({ 
        status: 'closed', 
        end_time: new Date().toISOString() 
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Turno cerrado exitosamente',
      data: data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al cerrar turno',
      error: error.message
    });
  }
});

export default router;