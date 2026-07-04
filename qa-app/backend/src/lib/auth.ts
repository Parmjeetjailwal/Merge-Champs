import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const EXPIRES = process.env.JWT_EXPIRES_IN || '12h';

export interface JwtUser {
  id: string;
  email: string;
  role: string;
}

export function signToken(user: JwtUser): string {
  return jwt.sign(user, SECRET, { expiresIn: EXPIRES } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtUser | null {
  try {
    const decoded = jwt.verify(token, SECRET) as JwtUser & { iat?: number; exp?: number };
    return { id: decoded.id, email: decoded.email, role: decoded.role };
  } catch {
    return null;
  }
}
