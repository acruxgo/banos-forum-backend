import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

// POST /api/tickets - Crear nuevo ticket
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      transaction_id,
      customer_name,
      customer_phone,
      items,
      subtotal,
      discount,
      total,
      payment_method,
      notes
    } = req.body;

    // Validaciones
    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debe incluir al menos un producto'
      });
    }

    if (!total || total <= 0) {
      return res.status(400).json({
        success: false,
        message: 'El total debe ser mayor a 0'
      });
    }

    if (!payment_method) {
      return res.status(400).json({
        success: false,
        message: 'El método de pago es requerido'
      });
    }

    if (!req.businessId) {
      return res.status(400).json({
        success: false,
        message: 'Business ID no encontrado'
      });
    }

    // Generar folio automático usando la función de BD
    const { data: folioData, error: folioError } = await supabase
      .rpc('generate_ticket_folio', { p_business_id: req.businessId });

    if (folioError) throw folioError;

    const folio = folioData;

    // Crear ticket
    const { data: ticket, error } = await supabase
      .from('tickets')
      .insert([{
        business_id: req.businessId,
        transaction_id: transaction_id || null,
        folio,
        customer_name: customer_name || null,
        customer_phone: customer_phone || null,
        items: JSON.stringify(items),
        subtotal: parseFloat(subtotal),
        discount: discount ? parseFloat(discount) : 0,
        total: parseFloat(total),
        payment_method,
        notes: notes || null,
        created_by: req.user?.id
      }])
      .select(`
        *,
        users:created_by (
          name,
          email
        )
      `)
      .single();

    if (error) throw error;

    console.log('✅ Ticket creado:', folio);

    res.status(201).json({
      success: true,
      message: 'Ticket creado exitosamente',
      data: ticket
    });
  } catch (error: any) {
    console.error('❌ Error al crear ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear ticket',
      error: error.message
    });
  }
});

// GET /api/tickets - Obtener tickets con filtros y paginación
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      search,
      payment_method,
      start_date,
      end_date,
      page = '1',
      limit = '20'
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from('tickets')
      .select(`
        *,
        users:created_by (
          name,
          email
        )
      `, { count: 'exact' });

    // Filtrar por empresa
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    // Filtro de búsqueda (folio o nombre de cliente)
    if (search && search !== '') {
      query = query.or(`folio.ilike.%${search}%,customer_name.ilike.%${search}%`);
    }

    // Filtro por método de pago
    if (payment_method && payment_method !== '' && payment_method !== 'all') {
      query = query.eq('payment_method', payment_method);
    }

    // Filtro por rango de fechas
    if (start_date) {
      query = query.gte('created_at', start_date);
    }
    if (end_date) {
      query = query.lte('created_at', end_date);
    }

    // Aplicar paginación y ordenamiento
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) throw error;

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
    console.error('Error al obtener tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener tickets',
      error: error.message
    });
  }
});

// GET /api/tickets/:id - Obtener un ticket por ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    let query = supabase
      .from('tickets')
      .select(`
        *,
        users:created_by (
          name,
          email
        ),
        businesses (
          name,
          email,
          phone,
          address,
          logo_url
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
      message: 'Ticket no encontrado',
      error: error.message
    });
  }
});

// PATCH /api/tickets/:id/mark-printed - Marcar ticket como impreso
router.patch('/:id/mark-printed', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    let query = supabase
      .from('tickets')
      .select('id, business_id')
      .eq('id', id);

    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    const { data: ticket, error: fetchError } = await query.single();

    if (fetchError || !ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket no encontrado'
      });
    }

    const { data, error } = await supabase
      .from('tickets')
      .update({ printed: true })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Ticket marcado como impreso',
      data: data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al marcar ticket',
      error: error.message
    });
  }
});

// PATCH /api/tickets/:id/mark-sent - Marcar ticket como enviado por WhatsApp
router.patch('/:id/mark-sent', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    let query = supabase
      .from('tickets')
      .select('id, business_id')
      .eq('id', id);

    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    const { data: ticket, error: fetchError } = await query.single();

    if (fetchError || !ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket no encontrado'
      });
    }

    const { data, error } = await supabase
      .from('tickets')
      .update({ sent_whatsapp: true })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Ticket marcado como enviado',
      data: data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al marcar ticket',
      error: error.message
    });
  }
});

export default router;