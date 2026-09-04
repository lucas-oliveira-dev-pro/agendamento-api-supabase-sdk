import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export const hashPassword = (password) => bcrypt.hash(password, 12);
export const comparePassword = (password, hash) => bcrypt.compare(password, hash);

export function createToken(user) {
  return jwt.sign({ sub: String(user.id), email: user.email }, JWT_SECRET, { expiresIn: "7d" });
}

export function auth(req, res, next) {
  const [type, token] = (req.headers.authorization || "").split(" ");
  if (type !== "Bearer" || !token) return res.status(401).json({ error: "Token não informado." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado." });
  }
}
