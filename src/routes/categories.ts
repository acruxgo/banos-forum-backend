import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

// GET /api/categories - Obtener todas las categorías
router.get('/', async (req: Request, res: Response) => {
  try {
    const { 
      search, 
      active, 
      page = '1', 
      limit = '50' 
    } = req.query;

    // Convertir a números
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    // Construir query base
    let query = supabase
      .from('categories')
      .select('*', { count: 'exact' });

    // Filtrar por empresa si no es super admin
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    // Filtro de búsqueda (nombre)
    if (search && search !== '') {
      query = query.ilike('name', `%${search}%`);
    }

    // Filtro por activo/inactivo
    if (active !== undefined && active !== '' && active !== 'all') {
      query = query.eq('active', active === 'true');
    }

    // Aplicar paginación y ordenamiento
    const { data, error, count } = await query
      .order('name', { ascending: true })
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
    console.error('Error al obtener categorías:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener categorías',
      error: error.message
    });
  }
});

// GET /api/categories/:id - Obtener una categoría por ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    let query = supabase
      .from('categories')
      .select('*')
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
      message: 'Categoría no encontrada',
      error: error.message
    });
  }
});

// POST /api/categories - Crear nueva categoría
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;

    // Validaciones
    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El nombre es requerido'
      });
    }

    // Verificar business_id
    if (!req.businessId) {
      return res.status(400).json({
        success: false,
        message: 'Business ID no encontrado'
      });
    }

    // Verificar si el nombre ya existe EN LA MISMA EMPRESA
    const { data: existingCategory } = await supabase
      .from('categories')
      .select('id')
      .eq('name', name.trim())
      .eq('business_id', req.businessId)
      .single();

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una categoría con ese nombre en tu empresa'
      });
    }

    // Crear categoría
    const { data, error } = await supabase
      .from('categories')
      .insert([{ 
        name: name.trim(), 
        description: description?.trim() || null,
        business_id: req.businessId,
        active: true
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Categoría creada exitosamente',
      data: data
    });
  } catch (error: any) {
    console.error('Error al crear categoría:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear categoría',
      error: error.message
    });
  }
});

// PUT /api/categories/:id - Actualizar categoría
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    // Validaciones
    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El nombre es requerido'
      });
    }

    // Verificar si la categoría existe
    let query = supabase
      .from('categories')
      .select('id, name, business_id')
      .eq('id', id);

    // Si no es super admin, filtrar por su empresa
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    const { data: existingCategory, error: fetchError } = await query.single();

    if (fetchError || !existingCategory) {
      return res.status(404).json({
        success: false,
        message: 'Categoría no encontrada'
      });
    }

    // Si el nombre cambió, verificar que no esté en uso EN LA MISMA EMPRESA
    if (name.trim() !== existingCategory.name) {
      const { data: nameExists } = await supabase
        .from('categories')
        .select('id')
        .eq('name', name.trim())
        .eq('business_id', existingCategory.business_id)
        .neq('id', id)
        .single();

      if (nameExists) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe una categoría con ese nombre'
        });
      }
    }

    // Actualizar categoría
    const { data, error } = await supabase
      .from('categories')
      .update({ 
        name: name.trim(), 
        description: description?.trim() || null
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Categoría actualizada exitosamente',
      data: data
    });
  } catch (error: any) {
    console.error('Error al actualizar categoría:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar categoría',
      error: error.message
    });
  }
});

// PATCH /api/categories/:id/toggle-active - Activar/Desactivar categoría
router.patch('/:id/toggle-active', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Obtener estado actual
    let query = supabase
      .from('categories')
      .select('active, business_id')
      .eq('id', id);

    // Si no es super admin, filtrar por su empresa
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    const { data: category, error: fetchError } = await query.single();

    if (fetchError || !category) {
      return res.status(404).json({
        success: false,
        message: 'Categoría no encontrada'
      });
    }

    // Verificar si hay productos usando esta categoría antes de desactivar
    if (category.active) {
      const { count } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', id);

      if (count && count > 0) {
        return res.status(400).json({
          success: false,
          message: `No se puede desactivar. Hay ${count} producto(s) usando esta categoría`
        });
      }
    }

    // Cambiar estado
    const { data, error } = await supabase
      .from('categories')
      .update({ active: !category.active })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: `Categoría ${data.active ? 'activada' : 'desactivada'} exitosamente`,
      data: data
    });
  } catch (error: any) {
    console.error('Error al cambiar estado de la categoría:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cambiar estado de la categoría',
      error: error.message
    });
  }
});

// DELETE /api/categories/:id - Eliminar categoría (solo si no tiene productos)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verificar si la categoría existe
    let query = supabase
      .from('categories')
      .select('id, name')
      .eq('id', id);

    // Si no es super admin, filtrar por su empresa
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    const { data: category, error: fetchError } = await query.single();

    if (fetchError || !category) {
      return res.status(404).json({
        success: false,
        message: 'Categoría no encontrada'
      });
    }

    // Verificar si hay productos usando esta categoría
    const { count } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id);

    if (count && count > 0) {
      return res.status(400).json({
        success: false,
        message: `No se puede eliminar. Hay ${count} producto(s) usando esta categoría`
      });
    }

    // Eliminar categoría
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Categoría eliminada exitosamente'
    });
  } catch (error: any) {
    console.error('Error al eliminar categoría:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar categoría',
      error: error.message
    });
  }
});

export default router;