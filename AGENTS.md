항상 한국어로 답하세요.
Raw SQL 사용 금지.

**프로젝트명:** 로그 서버 구축 (Prometheus → PostgreSQL 저장)

**기술스택:** TypeScript, PostgreSQL (TimescaleDB), Prometheus, Docker Compose, pnpm

---

## 1. 🎯 목적

-   Prometheus 서버에서 일정 주기(5초)마다 데이터를 수집
-   수집 대상:
    -   `카메라 상태 값` (정수 값)
-   수집된 데이터를 PostgreSQL (TimescaleDB)에 저장하여, 추후 모니터링/분석 가능하도록 함

## 4. ⏱️ 동작 주기

-   **주기:** 5초 마다

# ⚙️ 기술스택

### 📦 Backend / Agent

-   **언어**: TypeScript
-   **런타임**: Node.js (LTS 버전 권장, 20.x)
-   **ORM**: Drizzle ORM (PostgreSQL adapter) - **Raw SQL 사용 금지**
-   **DB Client**: `pg` (node-postgres)
-   **HTTP 요청**: `axios` (Prometheus API 호출용)
-   **스케줄링**: `setInterval` (단순 주기 실행)
