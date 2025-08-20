import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { UserRole, UserStatus } from '@prisma/client';
import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

export interface UserWithPermissions {
  id: string;
  username: string;
  email: string;
  name?: string;
  role: UserRole;
  status: UserStatus;
  permissions: string[];
}

export class AuthService {
  static async hashPassword(password: string): Promise<string> {
    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
    return bcrypt.hash(password, rounds);
  }

  static async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  static async createUser(userData: {
    username: string;
    email: string;
    password: string;
    name?: string;
    role?: UserRole;
  }): Promise<UserWithPermissions> {
    const hashedPassword = await this.hashPassword(userData.password);

    const user = await db.user.create({
      data: {
        username: userData.username,
        email: userData.email,
        password: hashedPassword,
        name: userData.name,
        role: userData.role || UserRole.VIEWER,
      },
    });

    const created = await this.getUserWithPermissions(user.id);
    if (!created) {
      throw new Error('Failed to create user');
    }
    return created;
  }

  static async authenticateUser(username: string, password: string): Promise<UserWithPermissions | null> {
    const user = await db.user.findUnique({
      where: { username },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      return null;
    }

    const isValid = await this.verifyPassword(password, user.password);
    if (!isValid) {
      return null;
    }

    // Update last login
    await db.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    return this.getUserWithPermissions(user.id);
  }

  static async getUserWithPermissions(userId: string): Promise<UserWithPermissions | null> {
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return null;
    }

    const permissions = this.getPermissionsForRole(user.role);

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name ?? undefined,
      role: user.role,
      status: user.status,
      permissions,
    };
  }

  static getPermissionsForRole(role: UserRole): string[] {
    const permissions = {
      [UserRole.ADMIN]: [
        'ca:manage',
        'certificate:issue',
        'certificate:revoke',
        'certificate:renew',
        'certificate:view',
        'certificate:export',
        'crl:manage',
        'user:manage',
        'audit:view',
        'audit:export',
        'config:manage',
      ],
      [UserRole.OPERATOR]: [
        'certificate:issue',
        'certificate:revoke',
        'certificate:renew',
        'certificate:view',
        'certificate:export',
        'crl:manage',
        'audit:view',
      ],
      [UserRole.VIEWER]: [
        'certificate:view',
        'audit:view',
      ],
    };

    return permissions[role] || [];
  }

  static async createDefaultAdmin(): Promise<void> {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) {
      console.warn('ADMIN_USERNAME or ADMIN_PASSWORD not set; skipping default admin creation');
      return;
    }

    const existingAdmin = await db.user.findUnique({
      where: { username: adminUsername },
    });

    if (!existingAdmin) {
      await this.createUser({
        username: adminUsername,
        email: 'admin@localhost',
        password: adminPassword,
        name: 'Default Administrator',
        role: UserRole.ADMIN,
      });
    }
  }

  static async updateUserPassword(userId: string, newPassword: string): Promise<void> {
    const hashedPassword = await this.hashPassword(newPassword);
    await db.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  }

  static async updateUserRole(userId: string, role: UserRole): Promise<void> {
    await db.user.update({
      where: { id: userId },
      data: { role },
    });
  }

  static async deactivateUser(userId: string): Promise<void> {
    await db.user.update({
      where: { id: userId },
      data: { status: UserStatus.INACTIVE },
    });
  }

  static async activateUser(userId: string): Promise<void> {
    await db.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE },
    });
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const user = await AuthService.authenticateUser(credentials.username, credentials.password);
        if (!user) {
          return null;
        }

        return {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.name,
          role: user.role,
          permissions: user.permissions,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400'), // 24 hours
  },
  jwt: {
    maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400'), // 24 hours
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
        token.permissions = user.permissions;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        (session.user as any).id = token.id as string;
        (session.user as any).username = token.username as string;
        (session.user as any).role = token.role as UserRole;
        (session.user as any).permissions = token.permissions as string[];
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  debug: process.env.NEXTAUTH_DEBUG === 'true' || (process.env.NODE_ENV === 'development' && process.env.NEXTAUTH_DEBUG !== 'false'),
};

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username: string;
      email: string;
      name?: string;
      role: UserRole;
      permissions: string[];
    };
  }

  interface User {
    id: string;
    username: string;
    email: string;
    name?: string;
    role: UserRole;
    permissions: string[];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    username: string;
    role: UserRole;
    permissions: string[];
  }
}