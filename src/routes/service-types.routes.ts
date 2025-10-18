import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

// GET /api/service-types - Obtener todos los tipos de servicio
router.get('/', async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: 'Business ID requerido'
      });
    }

    const { data, error } = await supabase
      .from('service_types')
      .select('*')
      .eq('business_id', businessId)
      .order('name', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      data
    });
  } catch (error: any) {
    console.error('Error al obtener tipos de servicio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener tipos de servicio',
      error: error.message
    });
  }
});

// GET /api/service-types/:id - Obtener un tipo por ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const businessId = req.businessId;

    const { data, error } = await supabase
      .from('service_types')
      .select('*')
      .eq('id', id)
      .eq('business_id', businessId)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Tipo de servicio no encontrado'
      });
    }

    res.json({
      success: true,
      data
    });
  } catch (error: any) {
    console.error('Error al obtener tipo de servicio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener tipo de servicio',
      error: error.message
    });
  }
});

// POST /api/service-types - Crear tipo de servicio
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, icon } = req.body;
    const businessId = req.businessId;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: 'Business ID requerido'
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'El nombre es obligatorio'
      });
    }

    // Verificar si ya existe un tipo con ese nombre
    const { data: existing } = await supabase
      .from('service_types')
      .select('id')
      .eq('business_id', businessId)
      .eq('name', name.trim())
      .single();

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un tipo de servicio con ese nombre'
      });
    }

    const { data, error } = await supabase
      .from('service_types')
      .insert({
        business_id: businessId,
        name: name.trim(),
        description: description?.trim() || null,
        icon: icon?.trim() || null,
        active: true
      })
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Tipo de servicio creado:', data.name);

    res.status(201).json({
      success: true,
      data,
      message: 'Tipo de servicio creado exitosamente'
    });
  } catch (error: any) {
    console.error('Error al crear tipo de servicio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear tipo de servicio',
      error: error.message
    });
  }
});

// PUT /api/service-types/:id - Actualizar tipo de servicio
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, icon } = req.body;
    const businessId = req.businessId;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'El nombre es obligatorio'
      });
    }

    // Verificar que el tipo existe y pertenece a la empresa
    const { data: existing } = await supabase
      .from('service_types')
      .select('id')
      .eq('id', id)
      .eq('business_id', businessId)
      .single();

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Tipo de servicio no encontrado'
      });
    }

    // Verificar que no haya otro tipo con el mismo nombre
    const { data: duplicate } = await supabase
      .from('service_types')
      .select('id')
      .eq('business_id', businessId)
      .eq('name', name.trim())
      .neq('id', id)
      .single();

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe otro tipo de servicio con ese nombre'
      });
    }

    const { data, error } = await supabase
      .from('service_types')
      .update({
        name: name.trim(),
        description: description?.trim() || null,
        icon: icon?.trim() || null
      })
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Tipo de servicio actualizado:', data.name);

    res.json({
      success: true,
      data,
      message: 'Tipo de servicio actualizado exitosamente'
    });
  } catch (error: any) {
    console.error('Error al actualizar tipo de servicio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar tipo de servicio',
      error: error.message
    });
  }
});

// PATCH /api/service-types/:id/toggle-active - Activar/Desactivar tipo
router.patch('/:id/toggle-active', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const businessId = req.businessId;

    // Obtener estado actual
    const { data: current } = await supabase
      .from('service_types')
      .select('active')
      .eq('id', id)
      .eq('business_id', businessId)
      .single();

    if (!current) {
      return res.status(404).json({
        success: false,
        message: 'Tipo de servicio no encontrado'
      });
    }

    const { data, error } = await supabase
      .from('service_types')
      .update({ active: !current.active })
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Tipo de servicio ${data.active ? 'activado' : 'desactivado'}:`, data.name);

    res.json({
      success: true,
      data,
      message: `Tipo de servicio ${data.active ? 'activado' : 'desactivado'} exitosamente`
    });
  } catch (error: any) {
    console.error('Error al cambiar estado del tipo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cambiar estado del tipo de servicio',
      error: error.message
    });
  }
});

// DELETE /api/service-types/:id - Eliminar tipo de servicio
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const businessId = req.businessId;

    // Verificar si hay productos usando este tipo
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id')
      .eq('service_type_id', id)
      .limit(1);

    if (productsError) throw productsError;

    if (products && products.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar. Hay productos usando este tipo de servicio.'
      });
    }

    const { error } = await supabase
      .from('service_types')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId);

    if (error) throw error;

    console.log('✅ Tipo de servicio eliminado');

    res.json({
      success: true,
      message: 'Tipo de servicio eliminado exitosamente'
    });
  } catch (error: any) {
    console.error('Error al eliminar tipo de servicio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar tipo de servicio',
      error: error.message
    });
  }
});

export default router;