export interface UserProfile {
  user_id: string; // Supabase Auth 고유 UID
  name: string;    // 사용자 실제 이름
  role: 'admin' | 'user'; // 권한 구분
}

export interface Task {
  id?: string;         // UUID (Upsert 시에 있으면 지정 가능, 기본값은 자동생성 권장)
  title: string;       // 배정된 과제명
  content: string;     // 배정된 상세 과업 내용
  assigned_to: string; // 업무를 부여받은 인턴 사용자의 user_id (UID)
  status: '대기중' | '처리중' | '완료'; // 과업 상태
  task_date: string;   // 'YYYY-MM-DD' 형식의 속한 날짜 (달력 맵핑용)
  start_time?: string; // HH:MM 또는 HH:MM:SS
  end_time?: string;   // HH:MM 또는 HH:MM:SS
  result?: string;     // 인턴이 작성한 금일 업무 실시 내용
  next_plan?: string;   // 인턴이 작성한 명일 업무 예정 내용
  remarks?: string;     // 기타 및 특이사항 작성란
}
