import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { UserProfile } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import UserDashboard from './components/UserDashboard';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [initializing, setInitializing] = useState(true);

  // 세션 복구 및 정보 조회
  useEffect(() => {
    const initSession = async () => {
      try {
        const { data: { session: activeSession } } = await supabase.auth.getSession();
        setSession(activeSession);

        if (activeSession?.user) {
          // 사용자 롤 및 실명 룩업
          const { data: profile, error } = await supabase
            .from('users')
            .select('*')
            .eq('user_id', activeSession.user.id)
            .single();

          if (!error && profile) {
            setUserProfile({
              user_id: profile.user_id,
              name: profile.name,
              role: profile.role,
            });
          } else {
            // Profile 정보가 일시적으로 DB에 없을 경우 예외 복구
            setUserProfile({
              user_id: activeSession.user.id,
              name: activeSession.user.email?.split('@')[0] || '사용자',
              role: activeSession.user.email?.includes('admin') ? 'admin' : 'user',
            });
          }
        }
      } catch (err) {
        console.error('세션 복구 중 장애 발생:', err);
      } finally {
        setInitializing(false);
      }
    };

    initSession();

    // 실시간 세션 변화 구독 리스너 설치
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession);
        if (currentSession?.user) {
          try {
            const { data: profile } = await supabase
              .from('users')
              .select('*')
              .eq('user_id', currentSession.user.id)
              .single();

            if (profile) {
              setUserProfile({
                user_id: profile.user_id,
                name: profile.name,
                role: profile.role,
              });
            } else {
              // RLS 혹은 데이터 부재 문제 시 실시간 세션에서도 복구용 폴백 수립
              setUserProfile({
                user_id: currentSession.user.id,
                name: currentSession.user.email?.split('@')[0] || '사용자',
                role: currentSession.user.email?.includes('admin') ? 'admin' : 'user',
              });
            }
          } catch (err) {
            console.error('실시간 프로필 조회 중 폴백 가동:', err);
            setUserProfile({
              user_id: currentSession.user.id,
              name: currentSession.user.email?.split('@')[0] || '사용자',
              role: currentSession.user.email?.includes('admin') ? 'admin' : 'user',
            });
          }
        } else {
          setUserProfile(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLoginSuccess = (activeSession: any, profile: UserProfile) => {
    setSession(activeSession);
    setUserProfile(profile);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUserProfile(null);
  };

  if (initializing) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-[#E4E3E0] text-[#141414] font-sans">
        <div className="border border-[#141414] bg-white p-8 shadow-[4px_4px_0px_0px_#141414] text-center max-w-sm w-full">
          <Loader2 className="w-8 h-8 text-[#141414] animate-spin mx-auto mb-4" />
          <span className="text-xs font-bold uppercase tracking-wider font-mono">SYS_BOOTING_SEQUENCE</span>
          <p className="text-[10px] text-gray-500 uppercase tracking-tighter mt-1">Re-routing security session channels...</p>
        </div>
      </div>
    );
  }

  // 비로그인 상태는 무조건 로그인 화면
  if (!session || !userProfile) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // 관리자 vs 인턴(사용자) 권한 세션 분기 렌더링
  if (userProfile.role === 'admin') {
    return <AdminDashboard userProfile={userProfile} onLogout={handleLogout} />;
  }

  return <UserDashboard userProfile={userProfile} onLogout={handleLogout} />;
}
