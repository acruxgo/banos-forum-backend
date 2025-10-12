import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

// GET /api/users - Obtener todos los usuarios activos
router.get('/', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, role, active, created_at')
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener usuarios',
      error: error.message
    });
  }
});

// GET /api/users/:id - Obtener un usuario por ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      message: 'Usuario no encontrado',
      error: error.message
    });
  }
});

// POST /api/users - Crear nuevo usuario
router.post('/', async (req: Request, res: Response) => {
  try {
    const { email, name, role } = req.body;

    const { data, error } = await supabase
      .from('users')
      .insert([{ email, name, role }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Usuario creado exitosamente',
      data: data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al crear usuario',
      error: error.message
    });
  }
});

export default router;