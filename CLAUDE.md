항상 한국어로 답하세요.

**프로젝트명:** 로그 서버 구축 (Prometheus → PostgreSQL 저장)

**기술스택:** TypeScript, PostgreSQL (TimescaleDB), Prometheus, Docker Compose, pnpm

---

## 1. 🎯 목적

- Prometheus 서버에서 일정 주기(5초)마다 데이터를 수집
- 수집 대상:
    - `app_status` (정수 값)
    - `ocr_value` (타임스탬프 값)
- 수집된 데이터를 PostgreSQL (TimescaleDB)에 저장하여, 추후 모니터링/분석 가능하도록 함

## 4. ⏱️ 동작 주기

- **주기:** 5초 마다

# ⚙️ 기술스택

### 📦 Backend / Agent

- **언어**: TypeScript
- **런타임**: Node.js (LTS 버전 권장, 20.x)
- **ORM**: Drizzle ORM (PostgreSQL adapter)
- **DB Client**: `pg` (node-postgres)
- **HTTP 요청**: `axios` (Prometheus API 호출용)
- **스케줄링**: `setInterval` (단순 주기 실행) or `node-cron`

### 🗄️ Database

- **PostgreSQL (TimescaleDB 확장 포함)**
- `error_codes` + `app_logs` 테이블 구조

# 📂 폴더 구조

```bash
visionix_ems_agent/
 ├─ src/
 │   ├─ db/                     # DB 관련 코드
 │   │   ├─ schema.ts           # Drizzle ORM 테이블 정의
 │   │   ├─ index.ts            # DB 연결 (drizzle + pg pool)
 │   │   └─ migrations/         # Drizzle migration 파일
 │   │
 │   ├─ services/               # 외부 API 서비스
 │   │   └─ prometheus.ts       # Prometheus 호출 로직
 │   │
 │   ├─ utils/                  # 공용 유틸리티 함수 (에러처리 등)
 │   │
 │   ├─ jobs/                   # 주기 실행 작업
 │   │   └─ collector.ts        # 5초마다 메트릭 수집 & DB 저장
 │   │
 │   └─ main.ts                 # 엔트리포인트 (앱 시작부)
 │
 ├─ drizzle.config.ts           # Drizzle 설정 파일
 ├─ package.json                # npm 패키지 관리
 ├─ tsconfig.json               # TypeScript 설정
 ├─ Dockerfile                  # Agent 컨테이너 빌드 정의
 └─ .env                        # DB 연결 정보, 환경변수

```---

## 🗄️ 새로운 DB 설계

### 1. 에러코드 정의 테이블

```sql
CREATE TABLE error_codes (
    code INT PRIMARY KEY,              -- 에러코드 (0=정상, 그 외=사용자 정의 코드)
    name TEXT NOT NULL,                -- 에러명 (예: "DB Error")
    description TEXT,                  -- 상세 설명 (옵션)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

```

- **기본 데이터 예시**
    
    ```sql
    INSERT INTO error_codes (code, name, description) VALUES
      (0, 'OK', '정상 상태'),
      (1, 'DB_ERROR', '데이터베이스 연결 오류'),
      (2, 'NETWORK_ERROR', '네트워크 장애'),
      (99, 'UNKNOWN_ERROR', '정의되지 않은 오류');
    
    ```
    

---

### 2. 로그 테이블

```sql
CREATE TABLE app_logs (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    app_status INT NOT NULL REFERENCES error_codes(code) ON UPDATE CASCADE, -- 에러코드 참조
    ocr_value TIMESTAMPTZ NOT NULL
);

```

- `app_status`는 **error_codes.code**를 외래키로 참조
- 만약 사용자가 새로운 에러코드를 정의하고 싶으면, `error_codes` 테이블에 insert만 하면 됨

---

## 📊 데이터 조회 예시

### 최근 10개의 로그와 에러명 표시

```sql
SELECT l.id, l.created_at, l.ocr_value, e.name AS error_name, e.description
FROM app_logs l
JOIN error_codes e ON l.app_status = e.code
ORDER BY l.created_at DESC
LIMIT 10;

```

👉 이렇게 하면 `app_logs`에는 코드값만 저장되어도, 조회 시 사람이 읽을 수 있는 이름과 설명이 자동으로 붙습니다.

---

## 🛠️ Drizzle ORM 스키마 예시

```tsx
// db/schema.ts
import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const errorCodes = pgTable("error_codes", {
  code: integer("code").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const appLogs = pgTable("app_logs", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  appStatus: integer("app_status")
    .notNull()
    .references(() => errorCodes.code, { onUpdate: "cascade" }),
  ocrValue: timestamp("ocr_value", { withTimezone: true }).notNull(),
});

```

---

## ✅ 장점

- 확장성: 사용자가 직접 새로운 에러코드 정의 가능
- 가독성: 숫자 코드 대신 이름/설명으로 쉽게 해석 가능
- 안정성: 외래키 참조로 데이터 무결성 보장

---

👉 이렇게 **에러코드 테이블 분리**로 설계하는 게 앞으로 유지보수/확장에 훨씬 유리합니다.

혹시 제가 `error_codes` 테이블의 **기본 데이터 마이그레이션 SQL**도 만들어드릴까요? (Drizzle migration 파일 형태로)