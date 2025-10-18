import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabase';
import { authConfig } from '../config/auth';

const router = Router();

// GET /api/users - Con búsqueda, filtros y paginación
router.get('/', async (req: Request, res: Response) => {
  try {
    const { 
      search, 
      role, 
      active,
      show_deleted = 'false', // Nuevo parámetro
      page = '1', 
      limit = '10' 
    } = req.query;

    // Convertir a números
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    // Construir query base
    let query = supabase
      .from('users')
      .select('id, email, name, role, active, created_at, business_id, deleted_at', { count: 'exact' });

    // Filtrar por empresa si no es super admin
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
      // NUNCA mostrar super_admin en el listado
    query = query.neq('role', 'super_admin');
    }

    // Filtrar eliminados (por defecto no mostrar)
    if (show_deleted === 'false') {
      query = query.is('deleted_at', null);
    } else if (show_deleted === 'only') {
      query = query.not('deleted_at', 'is', null);
    }
    // Si show_deleted === 'true', mostrar todos (incluyendo eliminados)

    // Filtro de búsqueda (nombre o email)
    if (search && search !== '') {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    // Filtro por rol
    if (role && role !== '' && role !== 'all') {
      query = query.eq('role', role);
    }

    // Filtro por activo/inactivo
    if (active !== undefined && active !== '' && active !== 'all') {
      query = query.eq('active', active === 'true');
    }

    // Aplicar paginación y ordenamiento
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) throw error;

    // Respuesta con metadata
    res.json({
      success: true,
      data: data || [],
      pagination: {
        total: count || 0,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil((count || 0) / limitNum)
      }
    });
  } catch (error: any) {
    console.error('Error al obtener usuarios:', error);
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
    
    let query = supabase
      .from('users')
      .select('id, email, name, role, active, created_at, business_id, deleted_at')
      .eq('id', id);

    // Si no es super admin, filtrar por su empresa
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    const { data, error } = await query.single();

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

    // Verificar business_id
    if (!req.businessId) {
      return res.status(400).json({
        success: false,
        message: 'Business ID no encontrado'
      });
    }

    // Verificar si el email ya existe EN LA MISMA EMPRESA (incluyendo eliminados)
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, deleted_at')
      .eq('email', email)
      .eq('business_id', req.businessId)
      .single();

    if (existingUser) {
      if (existingUser.deleted_at) {
        return res.status(400).json({
          success: false,
          message: 'El email ya está registrado (usuario eliminado). Puede restaurarlo en lugar de crear uno nuevo.'
        });
      }
      return res.status(400).json({
        success: false,
        message: 'El email ya está registrado en esta empresa'
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
        business_id: req.businessId,
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
    console.error('Error al crear usuario:', error);
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
    let query = supabase
      .from('users')
      .select('id, email, business_id, deleted_at')
      .eq('id', id);

    // Si no es super admin, filtrar por su empresa
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    const { data: existingUser, error: fetchError } = await query.single();

    if (fetchError || !existingUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // No permitir editar usuarios eliminados
    if (existingUser.deleted_at) {
      return res.status(400).json({
        success: false,
        message: 'No se puede editar un usuario eliminado. Debe restaurarlo primero.'
      });
    }

    // Si el email cambió, verificar que no esté en uso EN LA MISMA EMPRESA
    if (email !== existingUser.email) {
      const { data: emailExists } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .eq('business_id', existingUser.business_id)
        .is('deleted_at', null)
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
    console.error('Error al actualizar usuario:', error);
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
    let query = supabase
      .from('users')
      .select('active, business_id, deleted_at')
      .eq('id', id);

    // Si no es super admin, filtrar por su empresa
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    const { data: user, error: fetchError } = await query.single();

    if (fetchError || !user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // No permitir activar/desactivar usuarios eliminados
    if (user.deleted_at) {
      return res.status(400).json({
        success: false,
        message: 'No se puede modificar un usuario eliminado. Debe restaurarlo primero.'
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
    console.error('Error al cambiar estado del usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cambiar estado del usuario',
      error: error.message
    });
  }
});

// DELETE /api/users/:id - Soft delete (marcar como eliminado)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verificar si el usuario existe
    let query = supabase
      .from('users')
      .select('id, email, business_id, deleted_at')
      .eq('id', id);

    // Si no es super admin, filtrar por su empresa
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    const { data: user, error: fetchError } = await query.single();

    if (fetchError || !user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Verificar si ya está eliminado
    if (user.deleted_at) {
      return res.status(400).json({
        success: false,
        message: 'El usuario ya está eliminado'
      });
    }

    // Marcar como eliminado (soft delete)
    const { data, error } = await supabase
      .from('users')
      .update({ 
        deleted_at: new Date().toISOString(),
        active: false // También desactivar
      })
      .eq('id', id)
      .select('id, email, name, role, deleted_at')
      .single();

    if (error) throw error;

    console.log('✅ Usuario eliminado (soft delete):', user.email);

    res.json({
      success: true,
      message: 'Usuario eliminado exitosamente',
      data: data
    });
  } catch (error: any) {
    console.error('❌ Error al eliminar usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar usuario',
      error: error.message
    });
  }
});

// PATCH /api/users/:id/restore - Restaurar usuario eliminado
router.patch('/:id/restore', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verificar si el usuario existe
    let query = supabase
      .from('users')
      .select('id, email, business_id, deleted_at')
      .eq('id', id);

    // Si no es super admin, filtrar por su empresa
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    const { data: user, error: fetchError } = await query.single();

    if (fetchError || !user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Verificar si está eliminado
    if (!user.deleted_at) {
      return res.status(400).json({
        success: false,
        message: 'El usuario no está eliminado'
      });
    }

    // Restaurar usuario
    const { data, error } = await supabase
      .from('users')
      .update({ 
        deleted_at: null,
        active: true // Reactivar al restaurar
      })
      .eq('id', id)
      .select('id, email, name, role, active, created_at')
      .single();

    if (error) throw error;

    console.log('✅ Usuario restaurado:', user.email);

    res.json({
      success: true,
      message: 'Usuario restaurado exitosamente',
      data: data
    });
  } catch (error: any) {
    console.error('❌ Error al restaurar usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al restaurar usuario',
      error: error.message
    });
  }
});

export default router;