
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const supabaseUrl = 'https://apilsmolimcnqylmkcib.supabase.co';
const supabaseAnonKey = 'sb_publishable_ik9CAuqhJp1pNE642cIIDA_uLW3EKbI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
