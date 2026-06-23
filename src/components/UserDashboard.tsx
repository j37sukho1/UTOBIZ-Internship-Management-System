import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { UserProfile, Task } from '../types';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';

const FullCalendarComponent = FullCalendar as any;
import * as XLSX from 'xlsx';
import {
  Calendar as CalendarIcon, FileText, CheckCircle2, Save, Download, 
  Info, Clock, Plus, Trash2, ArrowRight, RefreshCw, Sparkles, LogOut
} from 'lucide-react';

interface UserDashboardProps {
  userProfile: UserProfile;
  onLogout: () => void;
}

export default function UserDashboard({ userProfile, onLogout }: UserDashboardProps) {
  const [activeTab, setActiveTab] = useState<'home' | 'plan' | 'report'>('home');
  const [loading, setLoading] = useState(false);
  
  // 나의 모든 과업 및 일정 리스트
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  
  // 현재 일지 작성 포커스가 맞춰진 날짜 혹은 Task 객체
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // 일일 업무보고 폼 입력 상태
  const [titleInput, setTitleInput] = useState('');
  const [contentInput, setContentInput] = useState('');
  const [statusInput, setStatusInput] = useState<'대기중' | '처리중' | '완료'>('대기중');
  const [taskDateInput, setTaskDateInput] = useState('');
  const [startTimeInput, setStartTimeInput] = useState('09:00');
  const [endTimeInput, setEndTimeInput] = useState('18:00');
  const [resultInput, setResultInput] = useState('');
  const [nextPlanInput, setNextPlanInput] = useState('');
  const [remarksInput, setRemarksInput] = useState('');

  // 일일 업무보고 다중 작업 상태 관리 (동일 날짜 여러 과업의 결과 및 상태 취합용)
  const [reportTasks, setReportTasks] = useState<Task[]>([]);

  // Load/synchronize reportTasks for the combined report on report view
  useEffect(() => {
    if (taskDateInput) {
      const filtered = myTasks.filter(t => t.task_date === taskDateInput);
      if (filtered.length > 0) {
        setReportTasks(filtered.map(t => ({ ...t })));
      } else {
        setReportTasks([{
          title: titleInput || '배정 과제명 없음',
          content: contentInput || '',
          status: statusInput || '대기중',
          task_date: taskDateInput,
          start_time: startTimeInput ? `${startTimeInput}:00` : '09:00:00',
          end_time: endTimeInput ? `${endTimeInput}:00` : '18:00:00',
          result: resultInput || '',
          next_plan: '',
          remarks: ''
        }]);
      }
    } else {
      setReportTasks([]);
    }
  }, [taskDateInput, myTasks]);

  // 1. 나에게 할당된 모든 일정/과업 로드
  const fetchMyData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('assigned_to', userProfile.user_id)
        .order('task_date', { ascending: false });

      if (error) throw error;
      setMyTasks(data || []);

      // 룰: 로그인 완료와 동시에, 해당 유저 세션의 가장 최신 날짜 데이터를 DB에서 자동으로 불러와 화면에 초기 로드(Read)한다.
      if (data && data.length > 0) {
        // 이미 정렬되어 있으므로 첫 번째 항목이 단연 최신 데이터(상위 1개)
        const latest = data[0];
        loadTaskToForm(latest);
      } else {
        // 아예 비어있을 경우 오늘 날짜 기준으로 초기화 시도
        initBlankForm();
      }
    } catch (err: any) {
      alert('나의 일정을 가져오는 중 에러가 발생했습니다: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyData();
  }, []);

  // 폼에 특정 과업 바인딩
  const loadTaskToForm = (task: Task) => {
    setActiveTask(task);
    setTitleInput(task.title || '');
    setContentInput(task.content || '');
    setStatusInput(task.status || '대기중');
    setTaskDateInput(task.task_date || '');
    setStartTimeInput(task.start_time ? task.start_time.slice(0, 5) : '09:00');
    setEndTimeInput(task.end_time ? task.end_time.slice(0, 5) : '18:00');
    setResultInput(task.result || '');
    setNextPlanInput(task.next_plan || '');
    setRemarksInput(task.remarks || '');
  };

  // 빈 일정 양식 생성
  const initBlankForm = () => {
    setActiveTask(null);
    // 가장 최신에 배정된 대과제명이 있으면 프로젝트명에 자동 참조
    const lastProjectName = myTasks.length > 0 ? myTasks[0].title : '신규 인턴 과제';
    const lastProjectContent = myTasks.length > 0 ? myTasks[0].content : '';
    
    setTitleInput(lastProjectName);
    setContentInput(lastProjectContent);
    setStatusInput('대기중');
    setTaskDateInput(new Date().toISOString().split('T')[0]);
    setStartTimeInput('09:00');
    setEndTimeInput('18:00');
    setResultInput('');
    setNextPlanInput('');
    setRemarksInput('');
  };

  // 2. 통합 저장 단일 정책 (Upsert)
  // 일정 관리 및 보고서 작성이 공유하는 저장소
  const handleSaveData = async () => {
    if (!taskDateInput) {
      alert('과제 일정 날짜를 반드시 지정해 주세요.');
      return;
    }

    setLoading(true);
    try {
      if (activeTab === 'report') {
        // Save all tasks in reportTasks
        const payLoads = reportTasks.map(t => {
          const item: Task = {
            ...t,
            task_date: taskDateInput,
            assigned_to: userProfile.user_id,
            next_plan: nextPlanInput.trim() || undefined,
            remarks: remarksInput.trim() || undefined,
          };
          return item;
        });

        const { data, error } = await supabase
          .from('tasks')
          .upsert(payLoads)
          .select();

        if (error) throw error;
      } else {
        if (!titleInput.trim()) {
          alert('프로젝트(과제)명을 입력해 주세요.');
          setLoading(false);
          return;
        }

        // 혹시 해당 날짜로 이미 저장된 과업이 존재하는지 로컬/서버 매칭 체크
        // 동일 assigned_to 및 task_date 기준으로 중복 충돌을 방지하기 위한 lookup 또는 upsert 처리
        let targetId = activeTask?.id;

        if (!targetId) {
          // 동일 날짜에 기 등록된 일정이 있는지 찾아서 병합
          const existing = myTasks.find(t => t.task_date === taskDateInput);
          if (existing) {
            targetId = existing.id;
          }
        }

        const savePayload: Task = {
          title: titleInput.trim(),
          content: contentInput.trim(),
          assigned_to: userProfile.user_id,
          status: statusInput,
          task_date: taskDateInput,
          start_time: startTimeInput ? `${startTimeInput}:00` : undefined,
          end_time: endTimeInput ? `${endTimeInput}:00` : undefined,
          result: resultInput.trim() || undefined,
          next_plan: nextPlanInput.trim() || undefined,
          remarks: remarksInput.trim() || undefined,
        };

        if (targetId) {
          savePayload.id = targetId;
        }

        const { data, error } = await supabase
          .from('tasks')
          .upsert(savePayload)
          .select();

        if (error) throw error;
      }

      alert(`[통합 저장 성공]\n${taskDateInput} 업무 및 보고서 내용이 정상 보관 및 갱신되었습니다.`);
      fetchMyData(); // 갱신 리로드
    } catch (err: any) {
      alert('저장 중 복합 장애가 생겼습니다: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 3. 구글 스프레드시트 양식 파일로 실질적 다운로드 (.xlsx)
  const handleDownloadExcel = () => {
    const todayStr = taskDateInput || '미지정';
    // Base sections
    const headerRows = [
      ['일 일 업 무 보 고 서', '', '', '', '', ''],
      [],
      ['▣ 일반사항', '', '', '', '', ''],
      ['과제명', titleInput || '배정 과제명 없음', '', '구분', '인턴', ''],
      ['날짜', todayStr, '', '작성자', userProfile.name, ''],
      [],
      ['▣ 금일 추진 내용', '', '', '', '', ''],
      ['구분', '과업 내용 (관리자 부여)', '', '처리 내용', '', '처리 상태'],
    ];

    // Dynamic "금일 추진 내용" rows
    const todayRows: any[] = [];
    reportTasks.forEach((rt) => {
      const timeStr = (rt.start_time && rt.end_time)
        ? `${rt.start_time.slice(0, 5)} ~ ${rt.end_time.slice(0, 5)}`
        : '금일';
      const labelText = `${todayStr} (${timeStr})`;
      
      todayRows.push([
        labelText,
        rt.title ? `[${rt.title}] ` + (rt.content || '') : (rt.content || '지정된 과업 없음'),
        '',
        rt.result || '수행 결과 미작성',
        '',
        rt.status || '대기중'
      ]);
    });

    if (todayRows.length === 0) {
      todayRows.push([`${todayStr} (금일)`, '지정된 과업 없음', '', '처리 내용 미작성', '', '대기중']);
    }

    // Now adding "▣ 명일 추진 계획" section
    const middleRows = [
      [],
      ['▣ 명일 추진 계획', '', '', '', '', ''],
      ['구분', '추진 내용', '', '', '시간', ''],
      [
        '명일',
        nextPlanInput || '진행계획 미작성',
        '',
        '',
        `${startTimeInput || '09:00'} ~ ${endTimeInput || '18:00'}`,
        ''
      ],
      [],
      ['▣ 기타 특이사항', '', '', '', '', ''],
      [remarksInput || '특이 및 건의사항이 없습니다.', '', '', '', '', '']
    ];

    // Combine them all
    const reportAOA = [
      ...headerRows,
      ...todayRows,
      ...middleRows
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(reportAOA);

    // 구글 스프레드시트 같은 이쁜 너비 지정 (6열 기준 정교한 칼럼 너비 튜닝)
    worksheet['!cols'] = [
      { wch: 30 }, // A: 구분 (날짜(시간) 포맷 확장에 맞춰 열 너비 증가)
      { wch: 25 }, // B: 본문 1
      { wch: 25 }, // C: 본문 1 연장선
      { wch: 25 }, // D: 본문 2
      { wch: 20 }, // E: 본문 2 연장선 / 시간
      { wch: 15 }  // F: 상태
    ];

    // 병합 처리 (Cell Merges)
    const mergesByRows = [
      // 대타이틀 세션 (A1~F1 병합)
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
      
      // 일반사항 소제목 병합 (A3~F3)
      { s: { r: 2, c: 0 }, e: { r: 2, c: 5 } },
      
      // 일반사항 본문 병합
      // 과제명 값 병합 (B4~C4)
      { s: { r: 3, c: 1 }, e: { r: 3, c: 2 } },
      // 구분 값 병합 (E4~F4)
      { s: { r: 3, c: 4 }, e: { r: 3, c: 5 } },
      // 날짜 값 병합 (B5~C5)
      { s: { r: 4, c: 1 }, e: { r: 4, c: 2 } },
      // 작성자 값 병합 (E5~F5)
      { s: { r: 4, c: 4 }, e: { r: 4, c: 5 } },
      
      // 금일 추진 내용 소제목 병합 (A7~F7)
      { s: { r: 6, c: 0 }, e: { r: 6, c: 5 } },
      // 금일 추진 내용 헤더 병합
      { s: { r: 7, c: 1 }, e: { r: 7, c: 2 } }, // 과업내용 헤더 (B8~C8)
      { s: { r: 7, c: 3 }, e: { r: 7, c: 4 } }, // 처리내용 헤더 (D8~E8)
    ];

    // Dynamic merges for each todayRow
    todayRows.forEach((row, i) => {
      const r = 8 + i;
      mergesByRows.push({ s: { r, c: 1 }, e: { r, c: 2 } }); // B to C merge
      mergesByRows.push({ s: { r, c: 3 }, e: { r, c: 4 } }); // D to E merge
    });

    const nextOffset = 8 + todayRows.length;
    mergesByRows.push(
      { s: { r: nextOffset + 1, c: 0 }, e: { r: nextOffset + 1, c: 5 } }, // 명일 추진 계획 소제목
      { s: { r: nextOffset + 2, c: 1 }, e: { r: nextOffset + 2, c: 3 } }, // 명일 헤더 추진내용
      { s: { r: nextOffset + 2, c: 4 }, e: { r: nextOffset + 2, c: 5 } }, // 명일 헤더 시간
      { s: { r: nextOffset + 3, c: 1 }, e: { r: nextOffset + 3, c: 3 } }, // 명일 값 추진내용
      { s: { r: nextOffset + 3, c: 4 }, e: { r: nextOffset + 3, c: 5 } }, // 명일 값 시간
      { s: { r: nextOffset + 5, c: 0 }, e: { r: nextOffset + 5, c: 5 } }, // 기타 특이사항 소제목
      { s: { r: nextOffset + 6, c: 0 }, e: { r: nextOffset + 6, c: 5 } }  // 기타 특이사항 내용
    );

    worksheet['!merges'] = mergesByRows;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '일일업무보고서');

    // 엑셀 바이너리 파일 다운로드
    XLSX.writeFile(workbook, `[업무보고서]_${userProfile.name}_${taskDateInput}.xlsx`);
  };

  // 달력 클릭 혹은 드래그 일정 매핑
  const calendarEvents = myTasks.map(t => {
    let startStr = t.task_date;
    let endStr = t.task_date;
    if (t.start_time) startStr = `${t.task_date}T${t.start_time}`;
    if (t.end_time) endStr = `${t.task_date}T${t.end_time}`;

    return {
      id: t.id,
      title: t.title,
      start: startStr,
      end: endStr,
      backgroundColor: t.status === '완료' ? '#00cc66' : t.status === '처리중' ? '#3b82f6' : '#f59e0b',
      borderColor: '#141414',
      textColor: '#ffffff',
      extendedProps: { ...t }
    };
  });

  // 날짜 중복 제거 및 내림차순 정렬
  const uniqueTaskDates = Array.from(new Set(myTasks.map(t => t.task_date).filter(Boolean))) as string[];

  // 오늘 날짜 및 요일 계산
  const todayVal = new Date(taskDateInput || new Date());
  const tomorrowVal = new Date(todayVal);
  tomorrowVal.setDate(todayVal.getDate() + 1);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  
  const todayLabel = taskDateInput 
    ? `${taskDateInput} (${weekdays[todayVal.getDay()]}요일) 금일 업무 실시`
    : '오늘의 업무 실시 내역';

  const tomorrowLabel = taskDateInput
    ? `${tomorrowVal.getFullYear()}-${String(tomorrowVal.getMonth() + 1).padStart(2, '0')}-${String(tomorrowVal.getDate()).padStart(2, '0')} (${weekdays[tomorrowVal.getDay()]}요일) 계획 예정 사항`
    : '명일의 업무 예정 사항';

  return (
    <div className="min-h-screen bg-[#E4E3E0] flex flex-col font-sans text-[#141414] select-none">
      
      {/* 최고 헤더 바 */}
      <header className="h-16 border-b border-[#141414] bg-white sticky top-0 z-10 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-[#F7941D] text-white font-bold flex items-center justify-center text-xs rounded-none font-mono shadow-[2px_2px_0px_#141414] border border-[#141414]">U</div>
          <div>
            <h1 className="font-bold uppercase tracking-tighter text-md flex items-center gap-1.5">
              UTOBIZ CRM <span className="font-light italic text-xs ml-2 text-gray-500">Intern Workspace</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-[9px] font-mono uppercase opacity-50">Authorized Staff</span>
            <span className="text-xs font-bold uppercase tracking-tight font-mono">{userProfile.name} [MEMBER]</span>
          </div>
          <button
            onClick={fetchMyData}
            disabled={loading}
            className="p-1.5 border border-[#141414]/50 hover:bg-orange-50 transition-colors"
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
            <div className="text-[10px] font-mono uppercase mb-4 opacity-50 px-2 tracking-wider">Workspace Ctrl</div>
            <button
              onClick={() => setActiveTab('home')}
              className={`w-full text-left p-2.5 flex items-center justify-between transition-colors rounded-none ${
                activeTab === 'home' 
                  ? 'bg-[#F7941D] text-white font-bold' 
                  : 'text-[#141414] hover:bg-white border md:border-none border-[#141414]'
              }`}
            >
              <span className="text-xs font-bold uppercase flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Intern Home
              </span>
              <span className="text-[10px] font-mono font-bold">[01]</span>
            </button>
            <button
              onClick={() => setActiveTab('plan')}
              className={`w-full text-left p-2.5 flex items-center justify-between transition-colors rounded-none ${
                activeTab === 'plan' 
                  ? 'bg-[#F7941D] text-white font-bold' 
                  : 'text-[#141414] hover:bg-white border md:border-none border-[#141414]'
              }`}
            >
              <span className="text-xs font-bold uppercase flex items-center gap-2">
                <CalendarIcon className="w-4 h-4" />
                Schedule Planner
              </span>
              <span className="text-[10px] font-mono font-bold">[02]</span>
            </button>
            <button
              onClick={() => setActiveTab('report')}
              className={`w-full text-left p-2.5 flex items-center justify-between transition-colors rounded-none ${
                activeTab === 'report' 
                  ? 'bg-[#F7941D] text-white font-bold' 
                  : 'text-[#141414] hover:bg-white border md:border-none border-[#141414]'
              }`}
            >
              <span className="text-xs font-bold uppercase flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Daily Document
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

        {/* 메인 작업 스페이스 */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          
          {/* 탭 1: 메인 홈 (과업 공지 및 마일스톤) */}
          {activeTab === 'home' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* 좌측: 과업 공지 공고판 (Notice Board) */}
              <div className="lg:col-span-1 space-y-4 shrink-0">
                <div className="bg-[#141414] text-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,0.15)] rounded-none p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2 py-0.5 bg-white/10 text-white text-[9px] font-mono font-bold tracking-widest uppercase border border-white/20">NOTICE</span>
                    <h2 className="text-[10px] font-mono uppercase text-gray-400">Task Assigned By Administrator</h2>
                  </div>
                  {myTasks.length === 0 ? (
                    <div className="py-6 text-center text-gray-400 text-xs font-mono">
                      [NO_TASK_ASSIGNMENTS_FOUND]<br/>
                      Will update dynamically when deployed.
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-md font-bold text-white mb-2 font-mono uppercase tracking-tight">
                        🎯 {myTasks[0].title}
                      </h3>
                      <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed bg-white/5 p-3 border border-white/10 font-sans">
                        {myTasks[0].content || 'No details provided yet.'}
                      </p>
                      <div className="mt-4 flex justify-between items-center text-[10px] text-gray-400 border-t border-white/10 pt-3 font-mono">
                        <span>START_DATE: {myTasks[0].task_date}</span>
                        <span className="bg-[#00cc66] text-white px-2 py-0.5 font-bold uppercase text-[9px]">{myTasks[0].status}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 일정 요약 보드 */}
                <div className="bg-white border border-[#141414] shadow-[4px_4px_0px_0px_#141414] rounded-none p-4 space-y-3">
                  <h3 className="text-xs font-bold text-[#141414] flex items-center gap-1.5 pb-2 border-b border-[#141414]">
                    <Clock className="w-4 h-4 text-[#141414]" />
                    Assigned Task Logs
                  </h3>
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {myTasks.map(t => (
                      <div 
                        key={t.id} 
                        onClick={() => { loadTaskToForm(t); setActiveTab('report'); }}
                        className="p-2.5 bg-white border border-[#141414]/20 hover:border-[#141414] hover:bg-[#F2F1EF] rounded-none flex justify-between items-center transition-all cursor-pointer"
                      >
                        <div>
                          <div className="text-xs font-bold text-[#141414] font-mono">{t.task_date}</div>
                          <div className="text-[10px] text-gray-500 mt-0.5 max-w-[150px] truncate">{t.title}</div>
                        </div>
                        <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 border uppercase ${
                          t.result ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-rose-400 bg-rose-50 text-rose-800'
                        }`}>
                          {t.result ? 'SUBMITTED' : 'MISSING'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 우측: 내 마일스톤 개인 달력 */}
              <div className="lg:col-span-2 bg-white border border-[#141414] shadow-[4px_4px_0px_0px_#141414] rounded-none p-4 overflow-hidden">
                <h2 className="font-serif italic text-2xl text-[#141414] mb-3 pb-2 border-b border-[#141414] flex items-center gap-1.5">
                  <CalendarIcon className="w-5 h-5 text-[#141414]" />
                  My Activity Calendar
                </h2>
                <div className="user-calendar-wrapper text-[#141414] text-xs">
                  <FullCalendarComponent
                    plugins={[dayGridPlugin, interactionPlugin]}
                    initialView="dayGridMonth"
                    locale="ko"
                    events={calendarEvents}
                    height={380}
                    buttonText={{ today: '오늘' }}
                    eventClick={(info: any) => {
                      const task = info.event.extendedProps as Task;
                      loadTaskToForm(task);
                      setActiveTab('report');
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 탭 2: 과업 및 일정 관리 (캘린더 플래닝) */}
          {activeTab === 'plan' && (
            <div className="bg-white border border-[#141414] shadow-[4px_4px_0px_0px_#141414] rounded-none p-6 space-y-6">
              <div className="border-b border-[#141414] pb-4">
                <h2 className="font-serif italic text-2xl text-[#141414]">Task & Scheduler Planner</h2>
                <p className="text-xs text-slate-500 font-mono mt-1">CLICK A DATE TO ASSIGN DAILY TIME ALLOCATIONS AND CUSTOM WORK TRACKS</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* 왼쪽: 월간/주간 전환 캘린더 */}
                <div className="lg:col-span-2 border border-[#141414] rounded-none p-4 shadow-inner bg-white">
                  <FullCalendarComponent
                    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                    initialView="dayGridMonth"
                    locale="ko"
                    selectable={true}
                    headerToolbar={{
                      left: 'prev,next today',
                      center: 'title',
                      right: 'dayGridMonth,timeGridWeek'
                    }}
                    events={calendarEvents}
                    height={450}
                    select={(selectInfo: any) => {
                      initBlankForm();
                      setTaskDateInput(selectInfo.startStr);
                      alert(`[일정 작성 시스템]\n선택일: ${selectInfo.startStr}\n우측 "입력 제어기"에서 항목 기입 후 저장해주십시오.`);
                    }}
                    eventClick={(info: any) => {
                      const task = info.event.extendedProps as Task;
                      loadTaskToForm(task);
                    }}
                  />
                </div>

                {/* 오른쪽: 일정 및 분할 시간 조종창 */}
                <div className="bg-[#F2F1EF] border border-[#141414] rounded-none p-5 space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#141414] border-b border-[#141414] pb-2 flex items-center gap-1.5 font-mono">
                    <Clock className="w-4 h-4 text-[#141414]" />
                    Scheduler Controls
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-600 mb-1">Target Date</label>
                      <input
                        type="date"
                        value={taskDateInput}
                        onChange={(e) => setTaskDateInput(e.currentTarget.value)}
                        className="w-full px-3 py-1.5 bg-white text-xs border border-[#141414] rounded-none outline-none font-bold"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-600 mb-1">Start Hour</label>
                        <input
                          type="time"
                          value={startTimeInput}
                          onChange={(e) => setStartTimeInput(e.currentTarget.value)}
                          className="w-full px-3 py-1.5 bg-white text-xs border border-[#141414] rounded-none outline-none font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-600 mb-1">End Hour</label>
                        <input
                          type="time"
                          value={endTimeInput}
                          onChange={(e) => setEndTimeInput(e.currentTarget.value)}
                          className="w-full px-3 py-1.5 bg-white text-xs border border-[#141414] rounded-none outline-none font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-600 mb-1">Project Name (Title)</label>
                      <input
                        type="text"
                        value={titleInput}
                        onChange={(e) => setTitleInput(e.currentTarget.value)}
                        placeholder="예) 웹 애플리케이션 화면 설계"
                        className="w-full px-3 py-1.5 bg-white text-xs border border-[#141414] rounded-none outline-none font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-600 mb-1">Assigned Details</label>
                      <textarea
                        rows={2}
                        value={contentInput}
                        onChange={(e) => setContentInput(e.currentTarget.value)}
                        placeholder="관리자가 하달한 업무내역 또는 셀프 기입사항"
                        className="w-full px-3 py-1.5 bg-white text-xs border border-[#141414] rounded-none outline-none resize-none font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-600 mb-1">Duty Status</label>
                      <select
                        value={statusInput}
                        onChange={(e: any) => setStatusInput(e.currentTarget.value)}
                        className="w-full px-3 py-1.5 bg-white text-xs border border-[#141414] rounded-none outline-none font-bold"
                      >
                        <option value="대기중">대기중 [PENDING]</option>
                        <option value="처리중">처리중 [PROCESSING]</option>
                        <option value="완료">완료 [COMPLETED]</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#141414] flex gap-2">
                    <button
                      onClick={initBlankForm}
                      className="flex-1 py-1.5 px-3 bg-white hover:bg-[#F7941D] hover:text-white hover:border-[#F7941D] text-[#141414] text-xs font-bold rounded-none border border-[#141414] transition-all text-center uppercase font-mono"
                    >
                      CLEAR
                    </button>
                    <button
                      onClick={handleSaveData}
                      disabled={loading}
                      className="flex-1 py-1.5 px-3 bg-[#F7941D] hover:bg-white hover:text-[#F7941D] text-white border border-[#141414] text-xs font-bold rounded-none transition-all flex items-center justify-center gap-1 uppercase font-mono shadow-[2px_2px_0px_#141414]"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>SAVE</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 탭 3: 일일 업무보고 작성 (지정 양식) */}
          {activeTab === 'report' && (
            <div className="bg-white border border-[#141414] shadow-[4px_4px_0px_0px_#141414] rounded-none p-6 space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-[#141414]">
                <div>
                  <h2 className="font-serif italic text-2xl text-[#141414]">Daily Performance Report Grid</h2>
                  <p className="text-xs text-slate-500 font-mono mt-1">REAL-TIME GRID CONTROLLER REPLICATING INTERNAL CORPORATE SHEETS</p>
                </div>

                {/* 양식지 조종 컨트롤바 */}
                <div className="flex items-center gap-3 self-start text-xs font-mono">
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-[#141414] uppercase">Date Query:</span>
                    <select
                      value={taskDateInput}
                      onChange={(e) => {
                        const matched = myTasks.find(t => t.task_date === e.currentTarget.value);
                        if (matched) {
                          loadTaskToForm(matched);
                        } else {
                          initBlankForm();
                          setTaskDateInput(e.currentTarget.value);
                        }
                      }}
                      className="px-2.5 py-1 bg-white border border-[#141414] text-[#141414] font-bold rounded-none outline-none cursor-pointer"
                    >
                      {uniqueTaskDates.map(dateStr => (
                        <option key={dateStr} value={dateStr}>{dateStr}</option>
                      ))}
                      {!uniqueTaskDates.includes(new Date().toISOString().split('T')[0]) && (
                        <option value={new Date().toISOString().split('T')[0]}>오늘 ({new Date().toISOString().split('T')[0]}) [새로 추가]</option>
                      )}
                    </select>
                  </div>
                  
                  <button
                    onClick={handleDownloadExcel}
                    className="bg-[#F7941D] border border-[#141414] hover:bg-[#F2F1EF] hover:text-[#F7941D] text-white px-3 py-1 rounded-none font-bold text-[11px] flex items-center gap-1 transition-colors uppercase font-mono shadow-[2px_2px_0px_0px_#141414]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>EXPORT_XLSX</span>
                  </button>
                </div>
              </div>

              {/* 구글 스프레드시트 업무일지 양식 HTML 복제 */}
              <div className="overflow-x-auto border border-[#141414] rounded-none shadow-sm">
                <div className="min-w-[720px] bg-[#E4E3E0] p-4 text-[#141414]">
                  
                  {/* 엑셀 격자 구조 전면 모사 */}
                  <div className="bg-white border-2 border-[#141414] p-6 text-[#141414] font-sans">
                    
                    {/* 대타이틀 격자 */}
                    <div className="text-center mb-6 relative">
                      <h2 className="text-xl font-bold tracking-[0.5em] text-[#141414] border-b-2 border-[#141414] pb-2 inline-block px-12 uppercase font-serif italic">
                        일일 업무 보고서
                      </h2>
                    </div>

                    {/* 1. 기본 사항 테이블 */}
                    <div className="bg-[#F2F1EF] text-xs font-sans font-bold px-3 py-1 border border-[#141414] mb-1 border-b-0 uppercase">
                      일반사항
                    </div>
                    <table className="w-full text-xs border-collapse border border-[#141414] mb-6">
                      <tbody>
                        <tr>
                          <td className="w-1/6 border border-[#141414] bg-[#F2F1EF] px-3 py-2 text-center font-bold text-[#141414] text-[11px] font-sans">과제명</td>
                          <td className="w-2/6 border border-[#141414] px-3 py-2 font-bold text-[#141414] bg-white">
                            <input
                              type="text"
                              disabled
                              value={titleInput || 'No administration assignments targeting this account.'}
                              className="w-full bg-transparent border-none outline-none text-slate-500 font-medium cursor-not-allowed text-[11px]"
                            />
                          </td>
                          <td className="w-1/6 border border-[#141414] bg-[#F2F1EF] px-3 py-2 text-center font-bold text-[#141414] text-[11px] font-sans">구분</td>
                          <td className="w-2/6 border border-[#141414] px-3 py-2 font-bold text-[#141414] bg-white text-[11px] font-sans">인턴</td>
                        </tr>
                        <tr>
                          <td className="border border-[#141414] bg-[#F2F1EF] px-3 py-2 text-center font-bold text-[#141414] text-[11px] font-sans">날짜</td>
                          <td className="border border-[#141414] px-3 py-2 font-bold text-[#141414] bg-white font-mono text-[11px]">
                            {taskDateInput || 'PENDING'}
                          </td>
                          <td className="border border-[#141414] bg-[#F2F1EF] px-3 py-2 text-center font-bold text-[#141414] text-[11px] font-sans">작성자</td>
                          <td className="border border-[#141414] px-3 py-2 font-bold text-[#141414] bg-white font-sans text-[11px]">
                            {userProfile.name}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* 2. 금일 업무 현황 (실시) */}
                    <div className="bg-[#F2F1EF] text-xs font-sans font-bold px-3 py-1 border border-[#141414] mb-1 border-b-0 uppercase">
                      금일 추진 내용
                    </div>
                    <table className="w-full text-xs border-collapse border border-[#141414] mb-6 animate-fade-in">
                      <thead>
                        <tr className="bg-[#F2F1EF] text-[#141414] text-[11px] font-sans">
                          <th className="border border-[#141414] px-3 py-2 font-bold w-1/6 text-center">구분</th>
                          <th className="border border-[#141414] px-4 py-2 font-bold w-2/6 text-left">과업 내용(관리자 부여)</th>
                          <th className="border border-[#141414] px-4 py-2 font-bold w-2/6 text-left">처리 내용</th>
                          <th className="border border-[#141414] px-3 py-2 font-bold w-1/6 text-center">처리 상태</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportTasks.map((rt, idx) => (
                          <tr key={rt.id || idx}>
                            <td className="border border-[#141414] px-3 py-4 text-center font-bold text-[#141414] bg-[#F2F1EF]/30 whitespace-pre-wrap leading-relaxed text-[11px] font-mono">
                              {taskDateInput} ({rt.start_time && rt.end_time 
                                ? `${rt.start_time.slice(0, 5)} ~ ${rt.end_time.slice(0, 5)}`
                                : '금일'})
                            </td>
                            <td className="border border-[#141414] px-4 py-4 text-gray-600 leading-relaxed font-sans whitespace-pre-line vertical-align-top text-[11px]">
                              {rt.title && <div className="font-bold text-[#141414] mb-1">{rt.title}</div>}
                              {rt.content ? (
                                rt.content.split('\n').map((line, i) => (
                                  <div key={i} className="mb-0.5">{line}</div>
                                ))
                              ) : (
                                <span className="text-slate-400 italic">No instructions dispatched.</span>
                              )}
                            </td>
                            <td className="border border-[#141414] p-2 bg-amber-50/10">
                              <textarea
                                rows={3}
                                required
                                placeholder="오늘 수행한 상세 결과를 자유롭게 작성해 주세요..."
                                value={rt.result || ''}
                                onChange={(e) => {
                                  const updated = [...reportTasks];
                                  updated[idx] = { ...rt, result: e.currentTarget.value };
                                  setReportTasks(updated);
                                }}
                                className="w-full h-full p-2 bg-transparent text-[#141414] border border-[#141414]/20 hover:border-[#141414] focus:border-[#141414] rounded-none outline-none leading-relaxed font-mono text-[11px]"
                              />
                            </td>
                            <td className="border border-[#141414] p-3 text-center">
                              <select
                                value={rt.status || '대기중'}
                                onChange={(e: any) => {
                                  const updated = [...reportTasks];
                                  updated[idx] = { ...rt, status: e.currentTarget.value };
                                  setReportTasks(updated);
                                }}
                                className="px-2 py-1 text-xs border border-[#141414] rounded-none outline-none bg-white text-[#141414] font-bold cursor-pointer font-mono text-[11px]"
                              >
                                <option value="대기중">대기중 [PEND]</option>
                                <option value="처리중">처리중 [PROC]</option>
                                <option value="완료">완료 [COMP]</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* 3. 명일 업무 예정 사항 (예정) */}
                    <div className="bg-[#F2F1EF] text-xs font-sans font-bold px-3 py-1 border border-[#141414] mb-1 border-b-0 uppercase">
                      명일 추진 계획
                    </div>
                    <table className="w-full text-xs border-collapse border border-[#141414] mb-1">
                      <thead>
                        <tr className="bg-[#F2F1EF] text-[#141414] text-[11px] font-sans">
                          <th className="border border-[#141414] px-3 py-2 font-bold w-1/6 text-center">구분</th>
                          <th className="border border-[#141414] px-4 py-2 font-bold w-4/6 text-left">추진 내용</th>
                          <th className="border border-[#141414] px-3 py-2 font-bold w-1/6 text-center">시간</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-[#141414] px-3 py-4 text-center font-bold text-[#141414] bg-[#F2F1EF]/30 whitespace-pre-wrap leading-relaxed text-[11px] font-mono">
                            {tomorrowLabel}
                          </td>
                          <td className="border border-[#141414] p-2 bg-slate-50/10">
                            <textarea
                              rows={2}
                              placeholder="내일 진행할 구체적인 예정 및 로드맵 사항을 작성해 주세요..."
                              value={nextPlanInput}
                              onChange={(e) => setNextPlanInput(e.currentTarget.value)}
                              className="w-full h-full p-2 bg-transparent text-[#141414] border border-[#141414]/20 focus:border-[#141414] rounded-none outline-none text-[11px] font-mono"
                            />
                          </td>
                          <td className="border border-[#141414] px-3 py-4 text-center font-mono">
                            <div className="flex flex-col items-center gap-1.5 justify-center">
                              <input
                                type="time"
                                value={startTimeInput}
                                onChange={(e) => setStartTimeInput(e.currentTarget.value)}
                                className="px-1.5 py-0.5 border border-[#141414] rounded-none text-[10px] outline-none font-mono"
                              />
                              <span className="text-gray-400 text-[10px]">-</span>
                              <input
                                type="time"
                                value={endTimeInput}
                                onChange={(e) => setEndTimeInput(e.currentTarget.value)}
                                className="px-1.5 py-0.5 border border-[#141414] rounded-none text-[10px] outline-none font-mono"
                              />
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* 4. 기타 및 특이사항 */}
                    <table className="w-full text-xs border-collapse border border-[#141414]">
                      <tbody>
                        <tr className="bg-white">
                          <td className="w-1/6 border border-[#141414] bg-[#F2F1EF] px-3 py-3 text-center font-bold text-[#141414] text-[11px] font-sans">기타 특이사항</td>
                          <td className="w-5/6 border border-[#141414] p-2">
                            <input
                              type="text"
                              placeholder="업무 건의사항 혹은 보고 및 특이사항을 적는 공간입니다."
                              value={remarksInput}
                              onChange={(e) => setRemarksInput(e.currentTarget.value)}
                              className="w-full px-2 py-1 bg-transparent text-[#141414] border-b border-dashed border-gray-300 focus:border-[#141414] outline-none transition-all text-[11px] font-mono"
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>

                  </div>
                </div>
              </div>

              {/* 통합 저장 저장 버튼 바 */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 border border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,0.15)] rounded-none">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                </div>
                <button
                  onClick={handleSaveData}
                  disabled={loading}
                  className="bg-[#F7941D] border-2 border-[#141414] text-white hover:bg-white hover:text-[#F7941D] font-bold text-xs py-2 px-6 rounded-none transition-all flex items-center gap-1.5 font-mono uppercase shadow-[3px_3px_0px_0px_rgba(20,20,20,0.15)]"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>저장하기</span>
                </button>
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
          <span className="opacity-50">SYS_LATENCY: 14ms</span>
          <span className="opacity-50 font-bold">{new Date().toISOString().split('T')[0]} 19:42:01 KST</span>
        </div>
      </footer>
    </div>
  );
}
