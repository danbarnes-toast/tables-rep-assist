import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        passphrase: { label: 'Passphrase', type: 'password' },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string ?? '').toLowerCase().trim();
        const passphrase = credentials?.passphrase as string ?? '';
        const correct = process.env.AUTH_PASSPHRASE ?? '';

        if (!email.endsWith('@toasttab.com')) return null;
        if (!correct || passphrase !== correct) return null;

        return { id: email, email, name: email.split('@')[0].replace('.', ' ') };
      },
    }),
  ],
  callbacks: {
    session({ session }) {
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: { strategy: 'jwt' },
});