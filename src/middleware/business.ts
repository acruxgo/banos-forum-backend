import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';

// Extender Request para incluir business
declare global {
  namespace Express {
    interface Request {
      businessId?: string;
      isSuperAdmin?: boolean;
    }
  }
}

/**
 * Middleware que carga el business_id del usuario autenticado
 * Debe ir después de authenticateToken
 */
export const loadBusinessContext = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Si no hay usuario autenticado, continuar (authenticateToken se encargará)
    if (!req.user) {
      return next();
    }

    // Verificar si es super admin
    if (req.user.role === 'super_admin') {
      req.isSuperAdmin = true;
      // Super admin puede acceder a todas las empresas
      // No establecemos businessId para que pueda filtrar manualmente
      return next();
    }

    // Obtener business_id del usuario
    const { data: user, error } = await supabase
      .from('users')
      .select('business_id')
      .eq('id', req.user.id)
      .single();

    if (error || !user || !user.business_id) {
      return res.status(403).json({ 
        error: 'Usuario no asociado a ninguna empresa' 
      });
    }

    // Verificar que la empresa esté activa
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('active')
      .eq('id', user.business_id)
      .single();

    if (businessError || !business) {
      return res.status(403).json({ 
        error: 'Empresa no encontrada' 
      });
    }

    if (!business.active) {
      return res.status(403).json({ 
        error: 'Empresa desactivada. Contacte a soporte.' 
      });
    }

    req.businessId = user.business_id;
    next();
  } catch (error) {
    console.error('Error en loadBusinessContext:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Helper para agregar filtro de business en queries
 */
export const withBusinessFilter = (query: any, businessId?: string) => {
  if (businessId) {
    return query.eq('business_id', businessId);
  }
  return query;
};