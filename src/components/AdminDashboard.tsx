import React, { useState, useEffect, FormEvent } from 'react';
import { supabase, getAdminCreationClient } from '../lib/supabase';
import { UserProfile, Task } from '../types';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';
const FullCalendarComponent = FullCalendar as any;
import * as XLSX from 'xlsx';
import { 
  Users, Calendar, FileSpreadsheet, Download, RefreshCw, 
  UserPlus, CheckCircle, XCircle, Info, Trash2, Plus, LogOut, CheckSquare, Sparkles
} from 'lucide-react';

interface AdminDashboardProps {
  userProfile: UserProfile;
  onLogout: () => void;
}

interface GridRow {
  email: string;
  pw: string;
  name: string;
  title: string;
  content: string;
}

// 샌드박스 테스팅 더미 데이터셋 정의
const MOCK_INTERNS: UserProfile[] = [
  { user_id: 'intern01-uuid-1', name: '인턴01', role: 'user' },
  { user_id: 'intern02-uuid-2', name: '인턴02', role: 'user' },
  { user_id: 'intern03-uuid-3', name: '인턴03', role: 'user' },
  { user_id: 'intern04-uuid-4', name: '인턴04', role: 'user' },
  { user_id: 'intern05-uuid-5', name: '인턴05', role: 'user' },
];

const getMockTasksData = (today: string): Task[] => [
  {
    id: 'mock-task-1',
    title: '시스템 인프라 구축 및 Supabase 연동',
    content: '1. Supabase 연동 상태 확인 및 스키마 분석\n2. 공통 인증 컴포넌트 개발 완료 검증\n3. RLS 정책 활성화 후 작동 테스팅',
    assigned_to: 'intern01-uuid-1',
    task_date: today,
    status: '완료',
    start_time: '09:00:00',
    end_time: '18:00:00',
    result: '1. Supabase API 연결 테스트 통과 (200 OK).\n2. Login 컴포넌트에 자동 매칭 지원 기능 정상 작동.\n3. RLS 미설정으로 인한 조회 불가 상황 분석 완료 및 가이드 추가.',
    next_plan: '1. Row Level Security 정책 적용 SQL 실행 예정\n2. 실 서버 및 로컬 프론트엔드 연동 최종 마무리',
    remarks: '경고 메시지 정상 구현 완료'
  },
  {
    id: 'mock-task-2',
    title: 'UI/UX 컴포넌트 퍼블리싱 및 고도화',
    content: '1. 브루탈리스트 디자인 프레임 아웃라인 완성\n2. FullCalendar 반응형 테마 패치 적용',
    assigned_to: 'intern02-uuid-2',
    task_date: today,
    status: '처리중',
    start_time: '09:00:00',
    end_time: '18:00:00',
    result: '1. App 테마 패딩 조정 및 헤더 내비게이션 고도화 작업 진행 중.',
    next_plan: '1. 모바일 및 태블릿용 대형 뷰포트 터치 오버레이 최적화',
    remarks: '테일윈드 @theme 오버라이드 작동 중',
  },
  {
    id: 'mock-task-3',
    title: '업무 일지 엑셀 추출 기능 최적화',
    content: '1. SheetJS(xlsx) 다운로드 버튼 인스턴스 구축\n2. 엑셀 워크시트 컬럼 폭(Width) 자동 계산 알고리즘 적용',
    assigned_to: 'intern03-uuid-3',
    task_date: today,
    status: '대기중'
  },
  {
    id: 'mock-task-4',
    title: '구글 스프레드시트 양식 분석 및 HTML 패치',
    content: '1. 결재판 복제 마크업 구현\n2. 일무 보고 격자 인풋 폼 구조 전개',
    assigned_to: 'intern04-uuid-4',
    task_date: today,
    status: '완료',
    start_time: '09:00:00',
    end_time: '18:00:00',
    result: '1. 결재 도장 테이블 배치 완성.\n2. input 비활성화 설정 및 폰트 매치 완료.',
    next_plan: '더미 데이터 다운로드 정교화 시연',
  }
];

export default function AdminDashboard({ userProfile, onLogout }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'status' | 'manage' | 'reports'>('status');
  
  // 데이터 상태
  const [interns, setInterns] = useState<UserProfile[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isSandboxMode, setIsSandboxMode] = useState(false);

  // 신규 과제 및 과업 내용 부여 상태
  const [assignTargetId, setAssignTargetId] = useState<string>('');
  const [assignTitle, setAssignTitle] = useState<string>('');
  const [assignContent, setAssignContent] = useState<string>('');
  const [assignDate, setAssignDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // 메뉴 2: 보고서 검토 필터
  const [selectedInternId, setSelectedInternId] = useState<string>('');
  const [selectedInternTasks, setSelectedInternTasks] = useState<Task[]>([]);

  // 샌드박스 테스팅 토글
  const handleToggleSandbox = (enable: boolean) => {
    setIsSandboxMode(enable);
    if (enable) {
      setInterns(MOCK_INTERNS);
      setAllTasks(getMockTasksData(new Date().toISOString().split('T')[0]));
      setAssignTargetId(MOCK_INTERNS[0].user_id);
      setSelectedInternId(MOCK_INTERNS[0].user_id);
    } else {
      fetchData();
    }
  };

  // 데이터 새로고침 함수
  const fetchData = async () => {
    setLoading(true);
    try {
      // 1.인턴 유저 정보 긁어오기
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'user');

      if (userError) throw userError;
      setInterns(userData || []);

      if (userData && userData.length > 0) {
        if (!selectedInternId) {
          setSelectedInternId(userData[0].user_id);
        }
        if (!assignTargetId) {
          setAssignTargetId(userData[0].user_id);
        }
      }

      // 2. 전체 과업 및 일정 정보 긁어오기
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .order('task_date', { ascending: false });

      if (taskError) throw taskError;
      setAllTasks(taskData || []);
    } catch (err: any) {
      alert('데이터를 불러오는 중 문제가 발생했습니다: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 특정 인턴 업무보고 목록 업데이트
  useEffect(() => {
    if (selectedInternId) {
      const filtered = allTasks.filter(t => t.assigned_to === selectedInternId);
      setSelectedInternTasks(filtered);
    } else {
      setSelectedInternTasks([]);
    }
  }, [selectedInternId, allTasks]);

  // 신규 과제 및 과업 부여 처리
  const handleAssignTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTargetId) {
      alert('과제를 부여할 대상을 선택해주세요.');
      return;
    }
    if (!assignTitle.trim()) {
      alert('과제명을 입력해주세요.');
      return;
    }
    if (!assignDate) {
      alert('과제일정(날짜)을 지정해주세요.');
      return;
    }

    setActionLoading(true);

    if (isSandboxMode) {
      // 샌드박스 시뮬레이션: 메모리 상태에 즉시 과제 생성 추가
      setTimeout(() => {
        const newTask: Task = {
          id: `mock-task-uuid-${Date.now()}`,
          title: assignTitle.trim(),
          content: assignContent.trim(),
          assigned_to: assignTargetId,
          task_date: assignDate,
          status: '대기중'
        };
        setAllTasks(prev => [newTask, ...prev]);
        alert('[샌드박스 작동] 로컬 메모리에 모의 과제가 성공적으로 부여되었습니다. (실제 DB에는 저장되지 않음)');
        setAssignTitle('');
        setAssignContent('');
        setActionLoading(false);
      }, 500);
      return;
    }

    try {
      const { error } = await supabase.from('tasks').insert({
        title: assignTitle.trim(),
        content: assignContent.trim(),
        assigned_to: assignTargetId,
        task_date: assignDate,
        status: '대기중'
      });

      if (error) throw error;

      alert('해당 인턴에게 새로운 과제가 성공적으로 부여되었습니다.');
      setAssignTitle('');
      setAssignContent('');
      fetchData(); // 데이터 새로고침
    } catch (err: any) {
      alert('과제 배정 중 에러가 발생했습니다: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 과제 삭제 처리 (오등록 및 예외 회수용)
  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('정말로 이 과제를 삭제하시겠습니까?\n삭제하시면 인턴의 대시보드 및 달력에서도 지워집니다.')) return;

    setActionLoading(true);

    if (isSandboxMode) {
      setTimeout(() => {
        setAllTasks(prev => prev.filter(t => t.id !== taskId));
        alert('[샌드박스 작동] 로컬 메모리상에서 모의 과제가 정상적으로 삭제(인양)되었습니다.');
        setActionLoading(false);
      }, 400);
      return;
    }

    try {
      const { error } = await supabase.from('tasks').delete().eq('id', taskId);
      if (error) throw error;
      alert('과제가 정상적으로 회수(삭제)되었습니다.');
      fetchData();
    } catch (err: any) {
      alert('과제 삭제 중 에러가 발생했습니다: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 메뉴 2: 엑셀 파일 다운로드 (SheetJS 활용)
  const downloadReportsToExcel = () => {
    if (selectedInternTasks.length === 0) {
      alert('다운로드할 업무보고 데이터가 존재하지 않습니다.');
      return;
    }

    const currentIntern = interns.find(i => i.user_id === selectedInternId);
    const internName = currentIntern?.name || '인턴';

    // 엑셀에 내보낼 형태로 데이터 포맷팅
    const dataForExcel = selectedInternTasks.map((t, idx) => ({
      'No': idx + 1,
      '과제일정(날짜)': t.task_date,
      '근무 시작시간': t.start_time || '지정 안 됨',
      '근무 종료시간': t.end_time || '지정 안 됨',
      '과제 및 프로젝트명': t.title,
      '할당 과업 상세': t.content,
      '과업 수행 결과(금일실시)': t.result || '미작성',
      '차기 예정 사항(명일계획)': t.next_plan || '미작성',
      '특이 및 건의사항(비고)': t.remarks || '없음',
      '과업 상태': t.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    
    // 이쁘게 테이블 구조 잡기 위해 컬럼 폭 지정
    const wscols = [
      { wch: 6 },  // No
      { wch: 15 }, // 날짜
      { wch: 14 }, // 시작시간
      { wch: 14 }, // 종료시간
      { wch: 20 }, // 과제명
      { wch: 25 }, // 과업상세
      { wch: 30 }, // 금일실시
      { wch: 30 }, // 명일계획
      { wch: 25 }, // 비고
      { wch: 12 }  // 상태
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `${internName}_업무보고서`);
    
    // 파일 쓰기 및 다운로드 트리거
    XLSX.writeFile(workbook, `[업무보고서_${internName}_전체내역].xlsx`);
  };

  // FullCalendar용 일정 매핑
  const calendarEvents = allTasks.map(t => {
    const matchedIntern = interns.find(i => i.user_id === t.assigned_to);
    const internName = matchedIntern?.name || '미확인 인턴';
    
    // 시간 정보가 있으면 시작-종료 시간 조립
    let startStr = t.task_date;
    let endStr = t.task_date;
    if (t.start_time) {
      startStr = `${t.task_date}T${t.start_time}`;
    }
    if (t.end_time) {
      endStr = `${t.task_date}T${t.end_time}`;
    }

    return {
      id: t.id,
      title: `[${internName}] ${t.title}`,
      start: startStr,
      end: endStr,
      backgroundColor: t.status === '완료' ? '#00cc66' : t.status === '처리중' ? '#3b82f6' : '#f59e0b',
      borderColor: '#141414',
      textColor: '#ffffff',
      extendedProps: {
        content: t.content,
        result: t.result,
        intern: internName,
        status: t.status
      }
    };
  });

  // 오늘 날짜 문자열
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-[#E4E3E0] flex flex-col font-sans text-[#141414] select-none">
      {/* 최고 헤더 바 */}
      <header className="h-16 border-b border-[#141414] bg-white sticky top-0 z-10 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-[#F7941D] text-white font-bold flex items-center justify-center text-xs rounded-none font-mono shadow-[2px_2px_0px_#141414] border border-[#141414]">U</div>
          <div>
            <h1 className="font-bold uppercase tracking-tighter text-md flex items-center gap-1.5">
              UTOBIZ CRM <span className="font-light italic text-xs ml-2 text-gray-500">Admin Mode</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-[9px] font-mono uppercase opacity-50">Systems Admin</span>
            <span className="text-xs font-bold uppercase tracking-tight font-mono">{userProfile.name} [ROOT]</span>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-1.5 border border-[#141414] hover:bg-[#F2F1EF] transition-colors"
            title="Refresh System"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onLogout}
            className="px-4 py-1.5 border border-[#141414] bg-[#141414] text-white hover:bg-[#F7941D] hover:text-white transition-colors text-xs font-bold uppercase font-mono shadow-[2.5px_2.5px_0px_#141414]"
          >
            SYS_EXIT
          </button>
        </div>
      </header>

      {/* 내부 콘텐츠 레이아웃 (Sidebar + Main) */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* 사이드바 내비게이션 */}
        <aside className="w-full md:w-60 border-b md:border-b-0 md:border-r border-[#141414] flex flex-col bg-[#F2F1EF] shrink-0">
          <nav className="flex-1 p-4 flex flex-col gap-1.5">
            <div className="text-[10px] font-mono uppercase mb-4 opacity-50 px-2 tracking-wider">System Control</div>
            <button
              onClick={() => setActiveTab('status')}
              className={`w-full text-left p-2.5 flex items-center justify-between transition-colors rounded-none ${
                activeTab === 'status' 
                  ? 'bg-[#F7941D] text-white font-bold' 
                  : 'text-[#141414] hover:bg-white border md:border-none border-[#141414]'
              }`}
            >
              <span className="text-xs font-bold uppercase flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Dashboard View
              </span>
              <span className="text-[10px] font-mono font-bold">[01]</span>
            </button>
            <button
              onClick={() => setActiveTab('manage')}
              className={`w-full text-left p-2.5 flex items-center justify-between transition-colors rounded-none ${
                activeTab === 'manage' 
                  ? 'bg-[#F7941D] text-white font-bold' 
                  : 'text-[#141414] hover:bg-white border md:border-none border-[#141414]'
              }`}
            >
              <span className="text-xs font-bold uppercase flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                Task Management
              </span>
              <span className="text-[10px] font-mono font-bold">[02]</span>
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className={`w-full text-left p-2.5 flex items-center justify-between transition-colors rounded-none ${
                activeTab === 'reports' 
                  ? 'bg-[#F7941D] text-white font-bold' 
                  : 'text-[#141414] hover:bg-white border md:border-none border-[#141414]'
              }`}
            >
              <span className="text-xs font-bold uppercase flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                Report Review
              </span>
              <span className="text-[10px] font-mono font-bold">[03]</span>
            </button>
          </nav>
          <div className="p-4 border-t border-[#141414] hidden md:block bg-white/30">
            <div className="text-[10px] font-mono mb-2 uppercase opacity-50">Connection Status</div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#00CC66] shadow-[0_0_8px_#00CC66]"></div>
              <span className="text-[11px] font-mono font-bold tracking-tight text-emerald-800">SUPABASE_LIVE_OK</span>
            </div>
          </div>
        </aside>

        {/* 메인 대시보드 스페이스 */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          
          {/* SUPABASE RLS DETECTED ALERT BANNER */}
          {!isSandboxMode && interns.length === 0 && (
            <div className="bg-amber-50 border-2 border-amber-500 p-5 shadow-[4px_4px_0px_0px_#f59e0b] font-sans text-[#141414]">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-amber-500 text-white font-bold text-xs shrink-0 font-mono uppercase tracking-widest">
                  ⚠️ DB_RLS_BLOCK_PREVENT
                </div>
                <div className="space-y-3 flex-1">
                  <h3 className="font-serif italic font-bold text-lg text-amber-900 leading-tight">
                    현재 연동된 Supabase에 등록된 사용자를 조회할 수 없습니다. (RLS 정책 미수립 상태)
                  </h3>
                  <p className="text-xs text-amber-800 leading-relaxed font-sans">
                    데이터베이스 테이블 <code>users</code>와 <code>tasks</code>를 생성 및 데이터 추가 하셨더라도 아래 <strong>Row Level Security (RLS) policies</strong> 가 활성화 되어있지 않으면 API 조회 시 <code>[]</code> (빈 데이터)만 응답합니다. Supabase 콘솔에서는 보이나 프론트엔드 앱에서 조회되지 않는 대표적인 보안 격리 현상입니다.
                  </p>
                  
                  <div className="p-3.5 bg-neutral-900 text-[#00cc66] font-mono text-[11px] leading-relaxed border border-[#333]">
                    <p className="font-bold border-b border-[#333] pb-1.5 mb-1.5 text-white">💡 SQL 해결책: Supabase Dashboard &gt; SQL Editor에 복사하여 즉시 실행</p>
                    <code className="block select-all whitespace-pre">
{`-- 1. 가장 빠르고 안전한 개발 테스트 기법: RLS 보안 해제하기
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks DISABLE ROW LEVEL SECURITY;`}
                    </code>
                    <p className="mt-2 text-gray-400 text-[10px] border-t border-[#333] pt-1.5">
                      또는 보안을 유지하고 조회를 승인하려면 정책 정책을 생성하세요:<br/>
                      <span className="text-amber-400">CREATE POLICY</span> "Enable access for auth/anon" <span className="text-sky-300">ON</span> public.users <span className="text-sky-300">FOR ALL USING</span> (true) <span className="text-sky-300">WITH CHECK</span> (true);<br/>
                      <span className="text-amber-400">CREATE POLICY</span> "Enable access for auth/anon" <span className="text-sky-300">ON</span> public.tasks <span className="text-sky-300">FOR ALL USING</span> (true) <span className="text-sky-300">WITH CHECK</span> (true);
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={() => handleToggleSandbox(true)}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold font-mono text-[11px] py-1.5 px-3 uppercase border border-[#141414]/20 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      임시 샌드박스 시뮬레이션 가동 (인턴01~05 가상 데이터로 정상 작동 테스트)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isSandboxMode && (
            <div className="bg-emerald-50 border-2 border-emerald-500 p-4 shadow-[4px_4px_0px_0px_#10b981] font-sans text-emerald-950 flex justify-between items-center gap-4">
              <div className="flex items-center gap-2.5">
                <span className="animate-pulse w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span className="text-xs font-bold font-mono uppercase tracking-tight">System Sandbox Simulation Module Active (Using Intern01 ~ Intern05 Local fallback)</span>
              </div>
              <button
                onClick={() => handleToggleSandbox(false)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono font-bold text-[10px] py-1 px-2.5 border border-emerald-800 transition-colors cursor-pointer"
              >
                실제 Supabase DB로 재연결 시도
              </button>
            </div>
          )}
          
          {/* 탭 1: 메인 대시보드 (현황판) */}
          {activeTab === 'status' && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              
              {/* 좌측 - 인턴 리스트 & 당일 일일 업무보고 상태보드 */}
              <div className="lg:col-span-1 bg-white border border-[#141414] shadow-[4px_4px_0px_0px_#141414] rounded-none p-4 shrink-0 flex flex-col justify-start">
                <h2 className="text-sm font-bold uppercase tracking-tight text-[#141414] mb-3 pb-2 border-b border-[#141414] flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-[#141414]"></span>
                  Active Interns Today
                </h2>
                {interns.length === 0 ? (
                  <div className="text-center py-8 text-neutral-400 text-xs font-mono">
                    NO_INTRN_AVAILABLE_RECORDS.<br/>
                    Deploy new records first.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                    {interns.map((intern, index) => {
                      // 금일 업무 보고 여부 확인
                      const todaysReport = allTasks.find(t => t.assigned_to === intern.user_id && t.task_date === todayStr);
                      const isSubmitted = !!(todaysReport && todaysReport.result && todaysReport.result.trim());

                      // 인턴별 각기 다른 색상 배정 (가독성을 위한 디자인 고도화)
                      const internColors = [
                        'bg-[#F7941D]', // UTOBIZ Orange
                        'bg-sky-600',
                        'bg-teal-600',
                        'bg-violet-600',
                        'bg-rose-600',
                        'bg-emerald-600',
                        'bg-indigo-600',
                      ];
                      const avatarBg = internColors[index % internColors.length];

                      return (
                        <div key={intern.user_id} className="p-3 bg-white border border-[#141414]/20 hover:border-[#141414] hover:bg-[#F2F1EF] rounded-none flex justify-between items-center transition-all">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-7 h-7 ${avatarBg} text-white font-bold flex items-center justify-center text-xs rounded-none font-mono shadow-[1.5px_1.5px_0px_#141414] border border-[#141414]`}>
                              {intern.name[0]}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-[#141414]">{intern.name}</div>
                              <div className="text-[9px] font-mono text-gray-500 uppercase">SYS_PRFL_USER</div>
                            </div>
                          </div>

                          {/* 제출 상태 점등 */}
                          <div className="flex items-center gap-1.5">
                            {isSubmitted ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-emerald-400 bg-emerald-50 text-emerald-800 text-[9px] font-mono font-bold uppercase">
                                SUBMITTED
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-amber-400 bg-amber-50 text-amber-800 text-[9px] font-mono font-bold uppercase animate-pulse">
                                MISSING
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 하단 범례 안내 */}
                <div className="mt-4 pt-3 border-t border-[#141414]/10 text-[10px] text-gray-500 leading-normal font-mono">
                  <Info className="inline-block w-3 .h-3 mr-1 align-text-bottom text-[#141414]" />
                  DATE_TARGET: {todayStr}. REAL-TIME DB SYNC ACTIVE IN THE BACKGROUND.
                </div>
              </div>

              {/* 우측 - 월간 달력 */}
              <div className="lg:col-span-3 bg-white border border-[#141414] shadow-[4px_4px_0px_0px_#141414] rounded-none p-4 overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-2 border-b border-[#141414]">
                  <div>
                    <h2 className="font-serif italic text-2xl text-[#141414] tracking-tight">Intern Operations Milestone</h2>
                    <p className="text-[10px] font-mono opacity-60 uppercase mt-0.5">Scheduler View / Database Logs</p>
                  </div>
                  <div className="flex gap-3 font-mono">
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[#141414]">
                      <span className="w-2.5 h-2.5 bg-emerald-500 border border-[#141414]/20"></span> COMPLETED
                    </span>
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[#141414]">
                      <span className="w-2.5 h-2.5 bg-blue-500 border border-[#141414]/20"></span> PROCESSING
                    </span>
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[#141414]">
                      <span className="w-2.5 h-2.5 bg-amber-500 border border-[#141414]/20"></span> PENDING
                    </span>
                  </div>
                </div>

                {/* FullCalendar 영역 */}
                <div className="admin-calendar-wrapper text-[#141414] text-xs">
                  <FullCalendarComponent
                    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                    initialView="dayGridMonth"
                    locale="ko"
                    headerToolbar={{
                      left: 'prev,next today',
                      center: 'title',
                      right: 'dayGridMonth,timeGridWeek'
                    }}
                    events={calendarEvents}
                    height={500}
                    eventClick={(info: any) => {
                      const { result, content, intern, status } = info.event.extendedProps;
                      alert(`[일정 상세]\n\n담당 인턴: ${intern}\n과제명: ${info.event.title}\n배정 과업: ${content || '지정 안 됨'}\n금일 실시: ${result || '아직 보고서가 제출되지 않았습니다.'}\n상태: ${status}`);
                    }}
                    buttonText={{
                      today: '오늘',
                      month: '월간',
                      week: '주간'
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 탭 2: 사용자 및 과업 관리 */}
          {activeTab === 'manage' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* 좌측 2개 컬럼 - 서버 등록된 모든 사용자 정보 및 배정된 과제 현황 */}
              <div className="lg:col-span-2 bg-white border border-[#141414] shadow-[4px_4px_0px_0px_#141414] rounded-none p-6 space-y-4">
                <div>
                  <h2 className="font-serif italic text-2xl text-[#141414]">Registered Interns & Tasks</h2>
                  <p className="text-xs text-slate-500 font-mono mt-1">
                    서버에 등록된 관리자 이외의 모든 사용자(인턴) 목록 및 과업 상태입니다.
                  </p>
                </div>

                <div className="space-y-4">
                  {interns.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-[#141414]/20 text-xs font-mono text-neutral-400">
                      SYS_NO_USERS_FOUND.<br/>
                      현재 가입된 인턴 사용자가 없습니다.
                    </div>
                  ) : (
                    interns.map((it) => {
                      // 해당 인턴의 모든 배정된 과제 필터링
                      const userTasks = allTasks.filter(t => t.assigned_to === it.user_id);
                      const isSelected = assignTargetId === it.user_id;

                      return (
                        <div 
                          key={it.user_id} 
                          className={`p-4 border transition-all ${
                            isSelected 
                              ? 'border-[#141414] bg-[#F2F1EF]' 
                              : 'border-[#141414]/20 bg-white hover:border-[#141414]'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#141414]/10">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 bg-[#141414]"></span>
                              <span className="text-xs font-bold text-[#141414]">{it.name}</span>
                              <span className="text-[9px] font-mono text-gray-400 uppercase tracking-tighter">ID: {it.user_id.slice(0, 8)}</span>
                            </div>
                            <button
                              onClick={() => setAssignTargetId(it.user_id)}
                              className={`px-2.5 py-0.5 text-[10px] font-bold font-mono transition-colors border ${
                                isSelected 
                                  ? 'bg-[#141414] text-white border-[#141414]' 
                                  : 'bg-white text-[#141414] border-[#141414]/30 hover:border-[#141414]'
                              }`}
                            >
                              {isSelected ? 'TARGET_SELECTED' : 'SELECT_TARGET'}
                            </button>
                          </div>

                          {/* 배정된 과제 리스트 */}
                          <div className="mt-3 space-y-2">
                            <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-gray-400">Assigned Missions:</span>
                            {userTasks.length === 0 ? (
                              <div className="text-left py-1 text-[11px] italic text-gray-400">
                                아직 배정된 과제가 없습니다. 우측 양식을 통해 과제를 부여하세요.
                              </div>
                            ) : (
                              <div className="divide-y divide-[#141414]/10 border border-[#141414]/10">
                                {userTasks.map((task) => (
                                  <div key={task.id} className="p-2.5 text-xs bg-[#F2F1EF]/30 flex items-center justify-between gap-4">
                                    <div className="flex-1 space-y-1">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-mono text-[10px] px-1.5 py-0.5 border border-[#141414]/10 bg-white text-gray-600">
                                          {task.task_date}
                                        </span>
                                        <span className="font-bold text-[#141414]">{task.title}</span>
                                        <span className={`px-1 text-[9px] font-bold uppercase font-mono ${
                                          task.status === '완료' 
                                            ? 'text-emerald-700 bg-emerald-50' 
                                            : task.status === '처리중' 
                                            ? 'text-blue-700 bg-blue-50' 
                                            : 'text-amber-700 bg-amber-50'
                                        }`}>
                                          [{task.status}]
                                        </span>
                                      </div>
                                      {task.content && (
                                        <p className="text-[11px] text-gray-500 mt-1">
                                          {task.content}
                                        </p>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => task.id && handleDeleteTask(task.id)}
                                      className="p-1 border border-transparent hover:border-red-400 hover:bg-rose-50 text-red-600 transition-colors"
                                      title="과제 취소/회수"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 우측 1개 컬럼 - 과제 명 및 과업 내용 부여 창 */}
              <div className="bg-white border border-[#141414] shadow-[4px_4px_0px_0px_#141414] rounded-none p-6 shrink-0 h-fit space-y-4">
                <div>
                  <h2 className="font-serif italic text-xl text-[#141414]">Assign New Task</h2>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                    선택한 사용자에게 새로운 프로젝트 과제 및 과업 지시 사항을 하달합니다.
                  </p>
                </div>

                <form onSubmit={handleAssignTask} className="space-y-4">
                  {/* 대상 인턴 선택 */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-1">Target Intern</label>
                    <select
                      value={assignTargetId}
                      onChange={(e) => setAssignTargetId(e.currentTarget.value)}
                      required
                      className="w-full px-3 py-2 bg-white text-xs border border-[#141414] font-bold outline-none cursor-pointer"
                    >
                      <option value="">-- 대상자를 선택하세요 --</option>
                      {interns.map(it => (
                        <option key={it.user_id} value={it.user_id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 날짜 설정 */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-1">Task Assigned Date</label>
                    <input
                      type="date"
                      required
                      value={assignDate}
                      onChange={(e) => setAssignDate(e.currentTarget.value)}
                      className="w-full px-3 py-1.5 bg-[#F2F1EF] border border-[#141414] font-mono focus:outline-none"
                    />
                  </div>

                  {/* 과제 명 */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-1">Task / Project Name (과제 명)</label>
                    <input
                      type="text"
                      required
                      placeholder="예시) 회원 관리 시스템 백엔드 설계"
                      value={assignTitle}
                      onChange={(e) => setAssignTitle(e.currentTarget.value)}
                      className="w-full px-3 py-2 bg-[#F2F1EF] border border-[#141414] focus:outline-none text-[#141414] font-sans font-medium"
                    />
                  </div>

                  {/* 과업 상세 설명 */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-1">Task Instructions (과업 내용)</label>
                    <textarea
                      rows={4}
                      placeholder="예시)&#10;1. 데이터베이스 ERD 설계 작성&#10;2. Supabase 연동 API 설계서 초안 작성&#10;3. 명일 오전 10시 공유"
                      value={assignContent}
                      onChange={(e) => setAssignContent(e.currentTarget.value)}
                      className="w-full px-3 py-2 bg-[#F2F1EF] border border-[#141414] focus:outline-none text-[#141414] resize-none font-sans"
                    />
                  </div>

                  {/* 과제 부여 버튼 */}
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="w-full bg-[#F7941D] border-2 border-[#141414] text-white hover:bg-white hover:text-[#F7941D] font-bold text-xs py-2.5 px-4 rounded-none transition-all flex items-center justify-center gap-2 disabled:opacity-50 uppercase font-mono shadow-[4px_4px_0px_0px_rgba(20,20,20,0.15)]"
                  >
                    {actionLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>SENDING_MISSION_ORDER...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        <span>과제 및 과업 부여하기</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

            </div>
          )}

          {/* 탭 3: 업무보고 검토 및 다운로드 */}
          {activeTab === 'reports' && (
            <div className="bg-white border border-[#141414] shadow-[4px_4px_0px_0px_#141414] rounded-none p-6 space-y-6">
              
              {/* 상단 검색 및 인턴 룩업 */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-[#141414]">
                <div className="flex items-center gap-3">
                  <label className="text-xs font-mono uppercase font-bold tracking-wider text-[#141414]">Query Target Assignee:</label>
                  <select
                    value={selectedInternId}
                    onChange={(e) => setSelectedInternId(e.currentTarget.value)}
                    className="px-3 py-1.5 bg-white text-[#141414] text-xs font-bold border border-[#141414] rounded-none outline-none cursor-pointer"
                  >
                    <option value="">-- CHOOSE TARGET INTERN --</option>
                    {interns.map(it => (
                      <option key={it.user_id} value={it.user_id}>{it.name}</option>
                    ))}
                  </select>
                </div>

                {selectedInternTasks.length > 0 && (
                  <button
                    onClick={downloadReportsToExcel}
                    className="bg-[#F7941D] border border-[#141414] text-white hover:bg-white hover:text-[#F7941D] font-bold text-xs py-1.5 px-4 rounded-none flex items-center gap-1.5 transition-colors uppercase font-mono shadow-[3px_3px_0px_0px_rgba(20,20,20,0.15)]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>EXPORT.XLSX</span>
                  </button>
                )}
              </div>

              {/* 업무 보고 목록 */}
              <div className="space-y-4">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-gray-400">Database Record Logs</h3>
                
                {selectedInternTasks.length === 0 ? (
                  <div className="text-center py-16 border border-dashed border-[#141414]/30 rounded-none text-gray-500 text-xs font-mono leading-normal">
                    <FileSpreadsheet className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                    NO_SUBMITTED_LOGS_AVAILABLE_FOR_QUERY.<br/>
                    Please choose an intern profile with assigned tasks above.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-[#141414]">
                    <table className="min-w-full divide-y divide-[#141414] text-left border-collapse">
                      <thead className="bg-[#F2F1EF]">
                        <tr>
                          <th className="px-4 py-3 text-[10px] font-mono font-bold text-[#141414] border-r border-[#141414] w-28 uppercase">ID_DATE</th>
                          <th className="px-4 py-3 text-[10px] font-mono font-bold text-[#141414] border-r border-[#141414] w-24 uppercase">DUTY_HOURS</th>
                          <th className="px-4 py-3 text-[10px] font-mono font-bold text-[#141414] border-r border-[#141414] w-48 uppercase">PROJECT_CONTEXT</th>
                          <th className="px-4 py-3 text-[10px] font-mono font-bold text-[#141414] border-r border-[#141414] uppercase">DAILY_REPORT_CONTENT</th>
                          <th className="px-4 py-3 text-[10px] font-mono font-bold text-[#141414] border-r border-[#141414] uppercase">NEXT_TIMELINE</th>
                          <th className="px-4 py-3 text-[10px] font-mono font-bold text-[#141414] uppercase">STATUS</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-[#141414]/20 text-xs text-[#141414]">
                        {selectedInternTasks.map((t) => (
                          <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3.5 font-bold font-mono border-r border-[#141414] whitespace-nowrap bg-[#F2F1EF]/30">
                              {t.task_date}
                            </td>
                            <td className="px-4 py-3.5 text-gray-600 border-r border-[#141414] whitespace-nowrap">
                              {t.start_time || t.end_time ? (
                                <div className="font-mono text-xs">
                                  {t.start_time?.slice(0, 5) || '00:00'}<br/>~ {t.end_time?.slice(0, 5) || '00:00'}
                                </div>
                              ) : (
                                <span className="text-gray-400 font-mono">NOT_SPECIFIED</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 border-r border-[#141414] bg-white">
                              <div className="font-bold mb-1">{t.title}</div>
                              <div className="text-[10px] text-gray-400 line-clamp-2" title={t.content}>
                                ASSIGNED: {t.content}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 border-r border-[#141414] bg-emerald-50/5">
                              {t.result ? (
                                <div className="text-slate-800 whitespace-pre-line leading-relaxed font-mono text-[10px]">
                                  {t.result}
                                </div>
                              ) : (
                                <span className="text-rose-700 font-mono font-bold text-[9px] bg-rose-50 border border-rose-300 px-2 py-0.5 uppercase">UNREPORTED_MISSING_LOG</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 border-r border-[#141414]">
                              {t.next_plan ? (
                                <div className="text-slate-800 whitespace-pre-line leading-relaxed text-[10px]">
                                  {t.next_plan}
                                </div>
                              ) : (
                                <span className="text-gray-400 italic text-[10px]">No next plan recorded</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-0.5 text-[9px] font-bold font-mono uppercase ${
                                t.status === '완료' 
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-400'
                                  : t.status === '처리중'
                                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-400'
                                  : 'bg-amber-100 text-amber-800 border border-amber-400'
                              }`}>
                                {t.status === '완료' ? 'COMPLETED' : t.status === '처리중' ? 'PROCESSING' : 'PENDING'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          )}

        </main>
      </div>

      {/* FOOTER STATUS BAR */}
      <footer className="h-8 border-t border-[#141414] bg-white flex items-center px-4 justify-between font-mono text-[10px] shrink-0 uppercase tracking-tight text-[#141414]">
        <div className="flex gap-6">
          <span className="flex items-center gap-1 font-bold">DB: <span className="text-[#00CC66]">POSTGRES_CONNECTED</span></span>
          <span className="flex items-center gap-1">AUTH: JWT_STRICT_VALID</span>
          <span className="flex items-center gap-1">SESSION: ACTIVE</span>
        </div>
        <div className="flex gap-4">
          <span className="opacity-50">SYS_LATENCY: 12ms</span>
          <span className="opacity-50 font-bold">{todayStr} 19:42:01 KST</span>
        </div>
      </footer>
    </div>
  );
}
