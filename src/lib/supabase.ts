import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Next 14 caches every fetch() made in route handlers (Data Cache, persisted in .next/cache) unless told
// otherwise: without this, the API kept serving the ratings from the first request after a new data download.
const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });
const options = { global: { fetch: noStoreFetch } };

export const supabaseClient = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, options)
  : null;

export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, options)
  : supabaseClient;

