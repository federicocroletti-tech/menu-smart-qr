import { Injectable } from '@angular/core';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

import { RuntimeConfigService } from './runtime-config.service';

@Injectable({
  providedIn: 'root',
})
export class AdminAuthService {
  private readonly client: SupabaseClient | null;

  constructor(runtimeConfig: RuntimeConfigService) {
    this.client = runtimeConfig.isSupabaseAuthConfigured
      ? createClient(
          runtimeConfig.supabaseUrl,
          runtimeConfig.supabasePublishableKey,
          {
            auth: {
              autoRefreshToken: true,
              detectSessionInUrl: true,
              persistSession: true,
            },
          },
        )
      : null;
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  async getSession(): Promise<Session | null> {
    const client = this.getClient();
    const { data, error } = await client.auth.getSession();
    if (error) {
      throw error;
    }
    return data.session;
  }

  async signIn(email: string, password: string): Promise<Session> {
    const client = this.getClient();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      throw error;
    }
    if (!data.session) {
      throw new Error('Supabase Auth returned no session after sign-in');
    }
    return data.session;
  }

  async signOut(): Promise<void> {
    const { error } = await this.getClient().auth.signOut();
    if (error) {
      throw error;
    }
  }

  private getClient(): SupabaseClient {
    if (!this.client) {
      throw new Error('Backoffice authentication is not configured');
    }
    return this.client;
  }
}
