import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabase';
import { authConfig } from '../config/auth';

const router = Router();

// Middleware para verificar super admin
const requireSuperAdmin = (req: Request, res: Response, next: any) => {
  if (!req.isSuperAdmin) {
    return res.status(403).json({ 
      error: 'Solo super administradores pueden acceder a esta función' 
    });
  }
  next();
};

// ==========================================
// RUTAS ESPECÍFICAS PRIMERO (antes de /:id)
// ==========================================

// GET /api/businesses/stats/global - Estadísticas globales (solo super admin)
router.get('/stats/global', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    // Total de empresas
    const { count: totalBusinesses } = await supabase
      .from('businesses')
      .select('*', { count: 'exact', head: true });

    // Total de usuarios
    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    // Total de productos
    const { count: totalProducts } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });

    // Total de transacciones y ventas
    const { data: transactions } = await supabase
      .from('transactions')
      .select('total');

    const totalSales = transactions?.reduce((sum, t) => sum + Number(t.total), 0) || 0;

    // Empresas con más usuarios
    const { data: businessesWithUsers } = await supabase
      .from('businesses')
      .select(`
        id,
        name,
        slug,
        plan,
        active,
        users (count)
      `);

    // Empresas con más ventas
    const { data: businessesData } = await supabase
      .from('businesses')
      .select('id, name, slug, plan, active');

    const businessesWithSales = await Promise.all(
      (businessesData || []).map(async (business) => {
        const { data: businessTransactions } = await supabase
          .from('transactions')
          .select('total')
          .eq('business_id', business.id);

        const totalSales = businessTransactions?.reduce((sum, t) => sum + Number(t.total), 0) || 0;

        return {
          ...business,
          totalSales,
          transactionCount: businessTransactions?.length || 0
        };
      })
    );

    // Ordenar por ventas
    const topBusinesses = businessesWithSales
      .sort((a, b) => b.totalSales - a.totalSales)
      .slice(0, 5);

    res.json({
      success: true,
      data: {
        overview: {
          totalBusinesses: totalBusinesses || 0,
          totalUsers: totalUsers || 0,
          totalProducts: totalProducts || 0,
          totalSales: totalSales,
          totalTransactions: transactions?.length || 0
        },
        topBusinesses,
        businessesWithUsers: businessesWithUsers || []
      }
    });
  } catch (error: any) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas',
      error: error.message
    });
  }
});

// ==========================================
// RUTAS CON PARÁMETROS DINÁMICOS
// ==========================================

// GET /api/businesses - Con búsqueda, filtros y paginación (solo super admin)
router.get('/', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { 
      search, 
      plan, 
      active, 
      page = '1', 
      limit = '10' 
    } = req.query;

    // Convertir a números
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    // Construir query base
    let query = supabase
      .from('businesses')
      .select('*', { count: 'exact' });

    // Filtro de búsqueda (nombre, email o slug)
    if (search && search !== '') {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,slug.ilike.%${search}%`);
    }

    // Filtro por plan (basic, premium, enterprise)
    if (plan && plan !== '' && plan !== 'all') {
      query = query.eq('plan', plan);
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

    // Obtener contadores y ventas totales para cada empresa
    const businessesWithStats = await Promise.all(
      (data || []).map(async (business) => {
        // Contar usuarios
        const { count: usersCount } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', business.id);

        // Contar productos
        const { count: productsCount } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', business.id);

        // Contar transacciones y sumar ventas
        const { data: transactions } = await supabase
          .from('transactions')
          .select('total')
          .eq('business_id', business.id)
          .eq('status', 'completed');

        const totalSales = transactions?.reduce((sum, t) => sum + Number(t.total), 0) || 0;
        const transactionCount = transactions?.length || 0;

        return {
          ...business,
          _count: {
            users: usersCount || 0,
            products: productsCount || 0,
            transactions: transactionCount
          },
          total_sales: totalSales
        };
      })
    );

    // Respuesta con metadata
    res.json({
      success: true,
      data: businessesWithStats,
      pagination: {
        total: count || 0,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil((count || 0) / limitNum)
      }
    });
  } catch (error: any) {
    console.error('Error al obtener empresas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener empresas',
      error: error.message
    });
  }
});

// GET /api/businesses/:id - Obtener una empresa por ID
router.get('/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('businesses')
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
      message: 'Empresa no encontrada',
      error: error.message
    });
  }
});

// POST /api/businesses - Crear nueva empresa con usuario admin
router.post('/', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { 
      name, 
      slug, 
      email, 
      phone, 
      address,
      plan,
      adminName,
      adminEmail,
      adminPassword 
    } = req.body;

    // Validaciones
    if (!name || !slug || !email || !adminName || !adminEmail || !adminPassword) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos son requeridos'
      });
    }

    if (adminPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres'
      });
    }

    // Validar plan
    const validPlans = ['basic', 'premium', 'enterprise'];
    const selectedPlan = plan && validPlans.includes(plan) ? plan : 'basic';

    // Verificar que el slug no exista
    const { data: existingBusiness } = await supabase
      .from('businesses')
      .select('id')
      .eq('slug', slug)
      .single();

    if (existingBusiness) {
      return res.status(400).json({
        success: false,
        message: 'El slug ya está en uso'
      });
    }

    // Verificar que el email del admin no exista
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', adminEmail)
      .single();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'El email del administrador ya está registrado'
      });
    }

    // Crear empresa con plan específico
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .insert([{ 
        name, 
        slug: slug.toLowerCase(),
        email,
        phone: phone || '',
        address: address || '',
        plan: selectedPlan,
        active: true
      }])
      .select()
      .single();

    if (businessError) throw businessError;

    console.log('✅ Empresa creada con plan:', selectedPlan, business);

    // Hashear contraseña del admin
    const password_hash = await bcrypt.hash(adminPassword, authConfig.bcryptSaltRounds);

    // Crear usuario admin para la empresa
    const { data: adminUser, error: userError } = await supabase
      .from('users')
      .insert([{
        email: adminEmail,
        name: adminName,
        role: 'admin',
        password_hash,
        business_id: business.id,
        active: true
      }])
      .select('id, email, name, role, active')
      .single();

    if (userError) {
      // Si falla la creación del usuario, eliminar la empresa
      await supabase.from('businesses').delete().eq('id', business.id);
      throw userError;
    }

    res.status(201).json({
      success: true,
      message: 'Empresa creada exitosamente',
      data: {
        business,
        adminUser
      }
    });
  } catch (error: any) {
    console.error('❌ Error al crear empresa:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear empresa',
      error: error.message
    });
  }
});

// PUT /api/businesses/:id - Actualizar empresa
router.put('/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, phone, address, plan, primary_color, logo_url } = req.body;

    const updateData: any = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    
    // Validar plan si se proporciona
    if (plan) {
      const validPlans = ['basic', 'premium', 'enterprise'];
      if (validPlans.includes(plan)) {
        updateData.plan = plan;
      }
    }
    
    if (primary_color) updateData.primary_color = primary_color;
    if (logo_url !== undefined) updateData.logo_url = logo_url;
    
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('businesses')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Empresa actualizada:', data);

    res.json({
      success: true,
      message: 'Empresa actualizada exitosamente',
      data: data
    });
  } catch (error: any) {
    console.error('❌ Error al actualizar empresa:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar empresa',
      error: error.message
    });
  }
});

// PATCH /api/businesses/:id/toggle-active - Activar/Desactivar empresa
router.patch('/:id/toggle-active', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: business, error: fetchError } = await supabase
      .from('businesses')
      .select('active')
      .eq('id', id)
      .single();

    if (fetchError || !business) {
      return res.status(404).json({
        success: false,
        message: 'Empresa no encontrada'
      });
    }

    const { data, error } = await supabase
      .from('businesses')
      .update({ 
        active: !business.active,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: `Empresa ${data.active ? 'activada' : 'desactivada'} exitosamente`,
      data: data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al cambiar estado de la empresa',
      error: error.message
    });
  }
});

// DELETE /api/businesses/:id - Eliminar empresa (solo super_admin)
// DELETE /api/businesses/:id - Eliminar empresa y todos sus datos (solo super_admin)
router.delete('/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verificar que la empresa existe
    const { data: business, error: fetchError } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('id', id)
      .single();

    if (fetchError || !business) {
      return res.status(404).json({
        success: false,
        message: 'Empresa no encontrada'
      });
    }

    console.log('🗑️ Eliminando empresa y todos sus datos:', business.name);

    // ELIMINAR EN ORDEN (de dependientes a independientes)
    
    // 1. Eliminar transacciones
    const { error: transError } = await supabase
      .from('transactions')
      .delete()
      .eq('business_id', id);
    
    if (transError) {
      console.error('Error eliminando transacciones:', transError);
    } else {
      console.log('✅ Transacciones eliminadas');
    }

    // 2. Eliminar turnos
    const { error: shiftsError } = await supabase
      .from('shifts')
      .delete()
      .eq('business_id', id);
    
    if (shiftsError) {
      console.error('Error eliminando turnos:', shiftsError);
    } else {
      console.log('✅ Turnos eliminados');
    }

    // 3. Eliminar productos
    const { error: productsError } = await supabase
      .from('products')
      .delete()
      .eq('business_id', id);
    
    if (productsError) {
      console.error('Error eliminando productos:', productsError);
    } else {
      console.log('✅ Productos eliminados');
    }

    // 4. Eliminar categorías
    const { error: categoriesError } = await supabase
      .from('categories')
      .delete()
      .eq('business_id', id);
    
    if (categoriesError) {
      console.error('Error eliminando categorías:', categoriesError);
    } else {
      console.log('✅ Categorías eliminadas');
    }

    // 5. Eliminar usuarios
    const { error: usersError } = await supabase
      .from('users')
      .delete()
      .eq('business_id', id);
    
    if (usersError) {
      console.error('Error eliminando usuarios:', usersError);
      throw usersError;
    } else {
      console.log('✅ Usuarios eliminados');
    }

    // 6. Finalmente, eliminar la empresa
    const { error: businessError } = await supabase
      .from('businesses')
      .delete()
      .eq('id', id);

    if (businessError) throw businessError;

    console.log('✅ Empresa eliminada completamente:', business.name);

    res.json({
      success: true,
      message: 'Empresa y todos sus datos eliminados exitosamente'
    });
  } catch (error: any) {
    console.error('❌ Error al eliminar empresa:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar empresa',
      error: error.message
    });
  }
});

export default router;