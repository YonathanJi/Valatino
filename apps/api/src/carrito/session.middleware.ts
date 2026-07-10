import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

export const SESSION_COOKIE = "valatino-session";

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    let sessionId = req.cookies?.[SESSION_COOKIE] as string | undefined;

    if (!sessionId) {
      sessionId = uuidv4();
      res.cookie(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 30, // 30 días
        path: "/",
      });
    }

    // Adjuntar al request para uso posterior en servicios
    (req as Request & { sessionId: string }).sessionId = sessionId;
    next();
  }
}
