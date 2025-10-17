import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

// GET /api/products - Con búsqueda, filtros y paginación
router.get('/', async (req: Request, res: Response) => {
  try {
    const { 
      search, 
      type, 
      category_id,
      active, 
      page = '1', 
      limit = '10' 
    } = req.query;

    // Convertir a números
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    // Construir query base con JOIN a categories
    let query = supabase
      .from('products')
      .select(`
        *,
        categories (
          id,
          name
        )
      `, { count: 'exact' });

    // Filtrar por empresa si no es super admin
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    // Filtro de búsqueda (nombre)
    if (search && search !== '') {
      query = query.ilike('name', `%${search}%`);
    }

    // Filtro por tipo (baño, ducha, locker)
    if (type && type !== '' && type !== 'all') {
      query = query.eq('type', type);
    }

    // Filtro por categoría
    if (category_id && category_id !== '' && category_id !== 'all') {
      query = query.eq('category_id', category_id);
    }

    // Filtro por activo/inactivo
    if (active !== undefined && active !== '' && active !== 'all') {
      query = query.eq('active', active === 'true');
    }

    // Aplicar paginación y ordenamiento
    const { data, error, count } = await query
      .order('type', { ascending: true })
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
    console.error('Error al obtener productos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener productos',
      error: error.message
    });
  }
});

// GET /api/products/:id - Obtener un producto por ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    let query = supabase
      .from('products')
      .select(`
        *,
        categories (
          id,
          name
        )
      `)
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
      message: 'Producto no encontrado',
      error: error.message
    });
  }
});

// POST /api/products - Crear nuevo producto
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, price, type, category_id } = req.body;

    // Validaciones
    if (!name || !price || !type) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, precio y tipo son requeridos'
      });
    }

    if (!category_id) {
      return res.status(400).json({
        success: false,
        message: 'La categoría es requerida'
      });
    }

    if (price <= 0) {
      return res.status(400).json({
        success: false,
        message: 'El precio debe ser mayor a 0'
      });
    }

    if (!['bano', 'ducha', 'locker'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Tipo inválido. Debe ser: bano, ducha o locker'
      });
    }

    // Verificar business_id
    if (!req.businessId) {
      return res.status(400).json({
        success: false,
        message: 'Business ID no encontrado'
      });
    }

    // Verificar que la categoría existe y pertenece a la empresa
    const { data: category, error: categoryError } = await supabase
      .from('categories')
      .select('id')
      .eq('id', category_id)
      .eq('business_id', req.businessId)
      .eq('active', true)
      .single();

    if (categoryError || !category) {
      return res.status(400).json({
        success: false,
        message: 'Categoría no encontrada o inactiva'
      });
    }

    // Verificar si el nombre ya existe EN LA MISMA EMPRESA
    const { data: existingProduct } = await supabase
      .from('products')
      .select('id')
      .eq('name', name)
      .eq('business_id', req.businessId)
      .single();

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un producto con ese nombre en tu empresa'
      });
    }

    // Crear producto
    const { data, error } = await supabase
      .from('products')
      .insert([{ 
        name, 
        price: parseFloat(price),
        type,
        category_id,
        business_id: req.businessId,
        active: true
      }])
      .select(`
        *,
        categories (
          id,
          name
        )
      `)
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Producto creado exitosamente',
      data: data
    });
  } catch (error: any) {
    console.error('Error al crear producto:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear producto',
      error: error.message
    });
  }
});

// PUT /api/products/:id - Actualizar producto
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, price, type, category_id } = req.body;

    // Validaciones
    if (!name || !price || !type) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, precio y tipo son requeridos'
      });
    }

    if (!category_id) {
      return res.status(400).json({
        success: false,
        message: 'La categoría es requerida'
      });
    }

    if (price <= 0) {
      return res.status(400).json({
        success: false,
        message: 'El precio debe ser mayor a 0'
      });
    }

    if (!['bano', 'ducha', 'locker'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Tipo inválido. Debe ser: bano, ducha o locker'
      });
    }

    // Verificar si el producto existe
    let query = supabase
      .from('products')
      .select('id, name, business_id')
      .eq('id', id);

    // Si no es super admin, filtrar por su empresa
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    const { data: existingProduct, error: fetchError } = await query.single();

    if (fetchError || !existingProduct) {
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado'
      });
    }

    // Verificar que la categoría existe y pertenece a la empresa
    const { data: category, error: categoryError } = await supabase
      .from('categories')
      .select('id')
      .eq('id', category_id)
      .eq('business_id', existingProduct.business_id)
      .eq('active', true)
      .single();

    if (categoryError || !category) {
      return res.status(400).json({
        success: false,
        message: 'Categoría no encontrada o inactiva'
      });
    }

    // Si el nombre cambió, verificar que no esté en uso EN LA MISMA EMPRESA
    if (name !== existingProduct.name) {
      const { data: nameExists } = await supabase
        .from('products')
        .select('id')
        .eq('name', name)
        .eq('business_id', existingProduct.business_id)
        .neq('id', id)
        .single();

      if (nameExists) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe un producto con ese nombre'
        });
      }
    }

    // Actualizar producto
    const { data, error } = await supabase
      .from('products')
      .update({ 
        name, 
        price: parseFloat(price),
        type,
        category_id
      })
      .eq('id', id)
      .select(`
        *,
        categories (
          id,
          name
        )
      `)
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Producto actualizado exitosamente',
      data: data
    });
  } catch (error: any) {
    console.error('Error al actualizar producto:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar producto',
      error: error.message
    });
  }
});

// PATCH /api/products/:id/toggle-active - Activar/Desactivar producto
router.patch('/:id/toggle-active', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Obtener estado actual
    let query = supabase
      .from('products')
      .select('active, business_id')
      .eq('id', id);

    // Si no es super admin, filtrar por su empresa
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    const { data: product, error: fetchError } = await query.single();

    if (fetchError || !product) {
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado'
      });
    }

    // Cambiar estado
    const { data, error } = await supabase
      .from('products')
      .update({ active: !product.active })
      .eq('id', id)
      .select(`
        *,
        categories (
          id,
          name
        )
      `)
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: `Producto ${data.active ? 'activado' : 'desactivado'} exitosamente`,
      data: data
    });
  } catch (error: any) {
    console.error('Error al cambiar estado del producto:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cambiar estado del producto',
      error: error.message
    });
  }
});

export default router;