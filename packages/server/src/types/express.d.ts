import type { JwtPayload } from '../utils/auth.js';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      auditContext?: {
        action: string;
        module: string;
        target?: string;
        detail?: string;
      };
    }
  }
}

export {};
