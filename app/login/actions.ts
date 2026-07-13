'use server';

import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

export async function loginAction(email: string, passphrase: string) {
  try {
    await signIn('credentials', { email, passphrase, redirectTo: '/' });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Wrong email or passphrase. @toasttab.com accounts only.' };
    }
    throw error; // redirect throws — rethrow so Next.js handles it
  }
}