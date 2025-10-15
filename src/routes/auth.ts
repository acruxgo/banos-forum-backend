import express from 'express';
import bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase';
import { authConfig } from '../config/auth';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }

    // Buscar usuario por email CON datos de su empresa
    const { data: user, error } = await supabase
      .from('users')
      .select(`
        *,
        businesses (
          id,
          name,
          slug,
          logo_url,
          primary_color
        )
      `)
      .eq('email', email)
      .eq('active', true)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Verificar contraseña
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Generar JWT
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role
    };
    
    // @ts-ignore
    const token = jwt.sign(
      payload,
      String(authConfig.jwtSecret),
      { expiresIn: String(authConfig.jwtExpiresIn) }
    ) as string;

    // Retornar token, datos del usuario Y datos de la empresa
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        business_id: user.business_id
      },
      business: user.businesses || null // Datos de la empresa (logo, color)
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// VERIFICAR TOKEN (útil para validar sesión)
router.get('/verify', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// CAMBIAR CONTRASEÑA
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user?.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    // Obtener usuario actual
    const { data: user, error } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Verificar contraseña actual
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    // Hashear nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, authConfig.bcryptSaltRounds);

    // Actualizar en BD
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: hashedPassword })
      .eq('id', userId);

    if (updateError) {
      throw updateError;
    }

    res.json({ message: 'Contraseña actualizada exitosamente' });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

export default router;