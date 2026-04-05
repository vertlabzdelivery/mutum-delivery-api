import { Role } from '@prisma/client';

export interface CurrentUserData {
  userId: string;
  email: string;
  role: Role;
  sessionId: string;
}
