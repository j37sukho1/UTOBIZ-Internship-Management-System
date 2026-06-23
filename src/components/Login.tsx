import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { KeyRound, Mail, ArrowRight, Loader2 } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (session: any, userProfile: { user_id: string; name: string; role: 'admin' | 'user' }) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      if (!data.user) throw new Error('로그인 정보를 가져올 수 없습니다.');

      // users 테이블에서 롤 가져오기
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', data.user.id)
        .single();

      if (profileError || !profile) {
        // 만약 Auth에는 있는데 users 테이블에 없는 혹시 모를 경우를 대비해 임시 프로필 생성
        const tempName = data.user.email?.split('@')[0] || '사용자';
        const tempRole = data.user.email?.includes('admin') ? 'admin' : 'user';

        const { error: insertError } = await supabase.from('users').insert({
          user_id: data.user.id,
          name: tempName,
          role: tempRole,
        });

        if (insertError) {
          console.error('기본 프로필 자동 생성 중 에러:', insertError);
        }

        onLoginSuccess(data.session, {
          user_id: data.user.id,
          name: tempName,
          role: tempRole as 'admin' | 'user',
        });
      } else {
        onLoginSuccess(data.session, {
          user_id: profile.user_id,
          name: profile.name,
          role: profile.role,
        });
      }
    } catch (err: any) {
      setErrorMsg(err.message || '로그인 중 오류가 발생했습니다. 이메일과 비밀번호를 다시 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#E4E3E0] p-4 select-none">
      <div className="w-full max-w-md bg-white border-2 border-[#141414] shadow-[8px_8px_0px_0px_#141414] rounded-none transition-all duration-300">
        <div className="p-6 md:p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center h-12 px-4 bg-white rounded-none mb-3 shadow-[3px_3px_0px_0px_#141414] border border-[#141414]">
              <img 
                src="https://lh3.googleusercontent.com/d/18_IA0swom98Q1px8Gh4lhIK9xCncKMI9" 
                alt="UTOBIZ Logo" 
                className="h-8 w-auto object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <h1 className="text-xl font-bold text-[#141414] tracking-tighter uppercase font-sans">
              UTOBIZ Internship Management System
            </h1>
            <p className="text-[#141414]/60 font-mono text-[10px] mt-1 uppercase tracking-wider">
              CONNECTION STATUS : Private Server Live Connecting
            </p>
          </div>

          {/* 에러 및 성공 안내문 */}
          {errorMsg && (
            <div className="mb-4 p-3 bg-red-100 text-red-800 text-xs rounded-none border border-red-400 font-mono font-bold">
              [ERROR] {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="mb-4 p-3 bg-emerald-100 text-emerald-800 text-xs rounded-none border border-emerald-400 font-mono font-bold">
              [SUCCESS] {successMsg}
            </div>
          )}

          <div className="p-1 px-3 bg-[#F2F1EF] border border-[#141414] rounded-none mb-6 text-center">
            <span className="text-xs font-bold uppercase font-mono text-[#141414]">
              Sign In Session Portal
            </span>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[#141414]/70 mb-1">Email Connection</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[#141414]" />
                <input
                  type="email"
                  required
                  placeholder="intern@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-xs bg-white border border-[#141414] rounded-none focus:outline-none focus:bg-amber-50/10 text-[#141414]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[#141414]/70 mb-1 font-sans">Secure Key Access</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-[#141414]" />
                <input
                  type="password"
                  required
                  placeholder="비밀번호"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-xs bg-white border border-[#141414] rounded-none focus:outline-none focus:bg-amber-50/10 text-[#141414]"
                />
              </div>
            </div>

             <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#F7941D] text-white border-2 border-[#141414] hover:bg-white hover:text-[#F7941D] font-bold text-xs py-2.5 px-4 rounded-none transition-all disabled:opacity-50 disabled:pointer-events-none mt-4 flex items-center justify-center gap-2 uppercase tracking-widest font-mono shadow-[4px_4px_0px_0px_#141414]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>COMMITTING AUTH_TRANSACTION...</span>
                </>
              ) : (
                <>
                  <span>Log-In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
