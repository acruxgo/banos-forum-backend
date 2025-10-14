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

// GET /api/businesses - Obtener todas las empresas (solo super admin)
router.get('/', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });
  } catch (error: any) {
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

    // Crear empresa
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .insert([{ 
        name, 
        slug: slug.toLowerCase(),
        email,
        phone: phone || '',
        address: address || '',
        plan: plan || 'basic',
        active: true
      }])
      .select()
      .single();

    if (businessError) throw businessError;

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
    if (plan) updateData.plan = plan;
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

    res.json({
      success: true,
      message: 'Empresa actualizada exitosamente',
      data: data
    });
  } catch (error: any) {
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

export default router;