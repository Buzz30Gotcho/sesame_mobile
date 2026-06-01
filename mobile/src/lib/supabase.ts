import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

// Read keys from process.env (build-time) or from Expo config `extra` (runtime)
const manifest: any = (Constants.expoConfig ?? Constants.manifest) || {};
const supabaseUrl = process.env.SUPABASE_URL ?? manifest.extra?.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY ?? manifest.extra?.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_KEY in environment variables or app config (app.json/app.config.js extra)');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
