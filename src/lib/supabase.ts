import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = "https://ouswoklyibpnvfzukejm.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_RKoKhpwhXYqA9gwRzws1oA_VOslZk8h";

// 기본 supabase 클라이언트 (메인 세션 관리 및 데이터 쿼리용)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 어드민이 새 사용자를 등록 시 세션 파괴를 방지하기 위해 생성하는 보조 클라이언트
export const getAdminCreationClient = () => {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
};
