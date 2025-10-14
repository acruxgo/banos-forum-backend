import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabase';
import { authConfig } from '../config/auth';

const router = Router();

// GET /api/users - Obtener TODOS los usuarios (activos e inactivos)
router.get('/', async (req: Request, res: Response) => {
  try {
    // Super admin puede ver todas las empresas o filtrar por una específica
    let query = supabase.from('users').select('id, email, name, role, active, created_at, business_id');
    
    // Si no es super admin, filtrar por su empresa
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
      .select('id, email, name, role, active, created_at')
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
    const { email, name, role, password } = req.body;

    // Validaciones
    if (!email || !name || !role || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email, nombre, rol y contraseña son requeridos'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres'
      });
    }

    if (!['admin', 'supervisor', 'cajero'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Rol inválido'
      });
    }

    // Verificar si el email ya existe
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'El email ya está registrado'
      });
    }

    // Hashear contraseña
    const password_hash = await bcrypt.hash(password, authConfig.bcryptSaltRounds);

    // Crear usuario
    const { data, error } = await supabase
      .from('users')
      .insert([{ 
        email, 
        name, 
        role,
        password_hash,
        active: true
      }])
      .select('id, email, name, role, active, created_at')
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

// PUT /api/users/:id - Actualizar usuario
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { email, name, role, password } = req.body;

    // Validaciones
    if (!email || !name || !role) {
      return res.status(400).json({
        success: false,
        message: 'Email, nombre y rol son requeridos'
      });
    }

    if (!['admin', 'supervisor', 'cajero'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Rol inválido'
      });
    }

    // Verificar si el usuario existe
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', id)
      .single();

    if (fetchError || !existingUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Si el email cambió, verificar que no esté en uso
    if (email !== existingUser.email) {
      const { data: emailExists } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .neq('id', id)
        .single();

      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: 'El email ya está registrado'
        });
      }
    }

    // Preparar datos de actualización
    const updateData: any = { email, name, role };

    // Si se proporciona nueva contraseña, hashearla
    if (password && password.trim() !== '') {
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'La contraseña debe tener al menos 6 caracteres'
        });
      }
      updateData.password_hash = await bcrypt.hash(password, authConfig.bcryptSaltRounds);
    }

    // Actualizar usuario
    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select('id, email, name, role, active, created_at')
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Usuario actualizado exitosamente',
      data: data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al actualizar usuario',
      error: error.message
    });
  }
});

// PATCH /api/users/:id/toggle-active - Activar/Desactivar usuario
router.patch('/:id/toggle-active', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Obtener estado actual
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('active')
      .eq('id', id)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Cambiar estado
    const { data, error } = await supabase
      .from('users')
      .update({ active: !user.active })
      .eq('id', id)
      .select('id, email, name, role, active, created_at')
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: `Usuario ${data.active ? 'activado' : 'desactivado'} exitosamente`,
      data: data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al cambiar estado del usuario',
      error: error.message
    });
  }
});

export default router;