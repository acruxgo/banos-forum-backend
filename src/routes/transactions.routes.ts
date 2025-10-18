import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

// GET /api/transactions - Con búsqueda, filtros de fecha, método de pago, empleado y paginación
router.get('/', async (req: Request, res: Response) => {
  try {
    const { 
      search,
      payment_method,
      status,
      date_from,
      date_to,
      shift_id,
      created_by,
      page = '1', 
      limit = '50' 
    } = req.query;

    // Convertir a números
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    // Construir query base con joins
    let query = supabase
      .from('transactions')
      .select(`
        *,
        products (
          id,
          name,
          price,
          service_types (
            id,
            name,
            icon
          )
        ),
        shifts (
          id,
          users (
            id,
            name,
            role
          )
        )
      `, { count: 'exact' });

    // Filtrar por empresa si no es super admin
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    // Filtro por empleado (created_by)
    if (created_by && created_by !== '' && created_by !== 'all') {
      query = query.eq('created_by', created_by);
    }

    // Filtro por método de pago
    if (payment_method && payment_method !== '' && payment_method !== 'all') {
      query = query.eq('payment_method', payment_method);
    }

    // Filtro por status
    if (status && status !== '' && status !== 'all') {
      query = query.eq('status', status);
    }

    // Filtro por turno específico
    if (shift_id && shift_id !== '') {
      query = query.eq('shift_id', shift_id);
    }

    // Filtro por rango de fechas
    if (date_from) {
      query = query.gte('created_at', date_from);
    }
    
    if (date_to) {
      // Agregar 23:59:59 al día final para incluir todo el día
      const endDate = new Date(date_to as string);
      endDate.setHours(23, 59, 59, 999);
      query = query.lte('created_at', endDate.toISOString());
    }

    // Aplicar paginación y ordenamiento
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) throw error;

    // Si hay búsqueda por nombre de producto, filtrar en memoria
    let filteredData = data || [];
    if (search && search !== '') {
      filteredData = filteredData.filter((transaction: any) => 
        transaction.products?.name?.toLowerCase().includes((search as string).toLowerCase())
      );
    }

    // Recalcular el total si hay búsqueda
    const total = search && search !== '' ? filteredData.length : (count || 0);

    // Respuesta con metadata
    res.json({
      success: true,
      data: filteredData,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error: any) {
    console.error('❌ Error al obtener transacciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener transacciones',
      error: error.message
    });
  }
});

// GET /api/transactions/shift/:shift_id - Obtener transacciones de un turno
router.get('/shift/:shift_id', async (req: Request, res: Response) => {
  try {
    const { shift_id } = req.params;

    let query = supabase
      .from('transactions')
      .select(`
        *,
        products (
          id,
          name,
          price,
          service_types (
            id,
            name,
            icon
          )
        )
      `)
      .eq('shift_id', shift_id);

    // Filtrar por empresa si no es super admin
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error al obtener transacciones del turno:', error);
      throw error;
    }

    // Calcular totales
    const total = data?.reduce((sum, t) => sum + Number(t.total), 0) || 0;
    const count = data?.length || 0;

    console.log(`✅ Transacciones del turno ${shift_id}: ${count} transacciones, total: $${total}`);

    res.json({
      success: true,
      data: {
        transactions: data,
        summary: {
          total_sales: total,
          transaction_count: count
        }
      }
    });
  } catch (error: any) {
    console.error('❌ Error en /transactions/shift/:shift_id:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener transacciones del turno',
      error: error.message
    });
  }
});

// POST /api/transactions - Crear nueva transacción (venta)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { 
      shift_id, 
      product_id, 
      quantity, 
      unit_price,
      total,
      payment_method,
      status,
      created_by 
    } = req.body;

    // Verificar business_id
    const businessId = req.businessId;
    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: 'No se pudo determinar la empresa'
      });
    }

    // Validar campos requeridos
    if (!shift_id || !product_id || !quantity || !unit_price || !payment_method || !created_by) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos'
      });
    }

    // Validar que el turno esté abierto Y pertenezca a la empresa
    let shiftQuery = supabase
      .from('shifts')
      .select('status, business_id')
      .eq('id', shift_id);

    if (!req.isSuperAdmin) {
      shiftQuery = shiftQuery.eq('business_id', businessId);
    }

    const { data: shift } = await shiftQuery.single();

    if (!shift || shift.status !== 'open') {
      return res.status(400).json({
        success: false,
        message: 'El turno no está activo'
      });
    }

    // Calcular total si no viene
    const calculatedTotal = total || (quantity * unit_price);

    const { data, error } = await supabase
      .from('transactions')
      .insert([{
        shift_id,
        product_id,
        quantity,
        unit_price,
        total: calculatedTotal,
        payment_method,
        status: status || 'completed',
        created_by,
        business_id: businessId
      }])
      .select(`
        *,
        products (
          id,
          name,
          price,
          service_types (
            id,
            name,
            icon
          )
        )
      `)
      .single();

    if (error) throw error;

    console.log('✅ Transacción creada:', data.id);

    res.status(201).json({
      success: true,
      message: 'Venta registrada exitosamente',
      data: data
    });
  } catch (error: any) {
    console.error('❌ Error al registrar venta:', error);
    res.status(500).json({
      success: false,
      message: 'Error al registrar venta',
      error: error.message
    });
  }
});

// GET /api/transactions/stats/today - Estadísticas del día
router.get('/stats/today', async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let query = supabase
      .from('transactions')
      .select('total, payment_method, status')
      .gte('created_at', today.toISOString())
      .eq('status', 'completed');

    // Filtrar por empresa si no es super admin
    if (!req.isSuperAdmin && req.businessId) {
      query = query.eq('business_id', req.businessId);
    }

    const { data, error } = await query;

    if (error) throw error;

    const total = data?.reduce((sum, t) => sum + Number(t.total), 0) || 0;
    const count = data?.length || 0;

    // Agrupar por método de pago
    const byPaymentMethod = data?.reduce((acc: any, t) => {
      const method = t.payment_method;
      if (!acc[method]) {
        acc[method] = { count: 0, total: 0 };
      }
      acc[method].count++;
      acc[method].total += Number(t.total);
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        total_sales: total,
        transaction_count: count,
        by_payment_method: byPaymentMethod
      }
    });
  } catch (error: any) {
    console.error('❌ Error al obtener estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas',
      error: error.message
    });
  }
});

export default router;