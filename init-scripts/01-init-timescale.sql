-- TimescaleDB 확장 설치
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 데이터베이스 기본 설정
\c visionx_ems_log;

-- TimescaleDB 확장이 설치되었는지 확인
SELECT * FROM pg_extension WHERE extname = 'timescaledb';

-- 기본 테이블들이 생성된 후 hypertable 생성을 위한 준비
-- (실제 hypertable 생성은 마이그레이션 이후 별도로 실행)