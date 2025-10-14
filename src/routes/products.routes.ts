import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

// GET /api/products - Obtener TODOS los productos (activos e inactivos)
router.get('/', async (req: Request, res: Response) => {
  try {
    let query = supabase.from('products').select('*');
    
    // Si no es super admin, filtrar por su empresa
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }
    
    const { data, error } = await query.order('type', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });
  } catch (error: any) {
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
    
    const { data, error } = await supabase
      .from('products')
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
      message: 'Producto no encontrado',
      error: error.message
    });
  }
});

// POST /api/products - Crear nuevo producto
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, price, type } = req.body;

    // Validaciones
    if (!name || !price || !type) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, precio y tipo son requeridos'
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

    // Verificar si el nombre ya existe
    const { data: existingProduct } = await supabase
      .from('products')
      .select('id')
      .eq('name', name)
      .single();

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un producto con ese nombre'
      });
    }

    // Crear producto
    const { data, error } = await supabase
      .from('products')
      .insert([{ 
        name, 
        price: parseFloat(price),
        type,
        active: true
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Producto creado exitosamente',
      data: data
    });
  } catch (error: any) {
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
    const { name, price, type } = req.body;

    // Validaciones
    if (!name || !price || !type) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, precio y tipo son requeridos'
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
    const { data: existingProduct, error: fetchError } = await supabase
      .from('products')
      .select('id, name')
      .eq('id', id)
      .single();

    if (fetchError || !existingProduct) {
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado'
      });
    }

    // Si el nombre cambió, verificar que no esté en uso
    if (name !== existingProduct.name) {
      const { data: nameExists } = await supabase
        .from('products')
        .select('id')
        .eq('name', name)
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
        type
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Producto actualizado exitosamente',
      data: data
    });
  } catch (error: any) {
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
    const { data: product, error: fetchError } = await supabase
      .from('products')
      .select('active')
      .eq('id', id)
      .single();

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
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: `Producto ${data.active ? 'activado' : 'desactivado'} exitosamente`,
      data: data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al cambiar estado del producto',
      error: error.message
    });
  }
});

export default router;