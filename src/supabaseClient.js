import { createClient } from '@supabase/supabase-js';

// Данные Supabase: из env (.env.local), фолбэк — прод-значения.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://djpcftyqkwucbksknsdu.supabase.co';
const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqcGNmdHlxa3d1Y2Jrc2tuc2R1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ2NzE4ODIsImV4cCI6MjA2MDI0Nzg4Mn0.SNI196TucjsepnXIkZDgGwRv7J5chYE9KN6gBx5BszA';

export const supabase = createClient(supabaseUrl, supabaseKey);
